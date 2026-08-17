import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDownloadFileStore } from "./file-store";
import {
  MAX_MULTIPART_BYTES,
  MAX_PDF_BYTES,
  PdfUploadError,
  readBoundedPdfUploadMultipart,
  takePdfUploadStage,
} from "./pdf-upload";

const BOUNDARY = "----aap-pdf-boundary";
const PDF = new TextEncoder().encode("%PDF-1.7\nsmall fixture\n%%EOF");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryStore() {
  const root = await mkdtemp(path.join(tmpdir(), "pdf-upload-"));
  temporaryDirectories.push(root);
  return { root, store: createDownloadFileStore(root) };
}

function bytes(...chunks: Uint8Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

const encode = (value: string) => new TextEncoder().encode(value);

function filePart(options: {
  name?: string;
  filename?: string;
  contentType?: string;
  value?: Uint8Array;
}) {
  return bytes(
    encode(`--${BOUNDARY}\r\n`),
    encode(
      `Content-Disposition: form-data; name="${options.name ?? "pdf"}"; filename="${options.filename ?? "manual.pdf"}"\r\nContent-Type: ${options.contentType ?? "application/pdf"}\r\n\r\n`,
    ),
    options.value ?? PDF,
    encode("\r\n"),
  );
}

function fieldPart(name = "note", value = "unexpected") {
  return encode(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  );
}

function multipartBody(...parts: Uint8Array[]) {
  return bytes(...parts, encode(`--${BOUNDARY}--\r\n`));
}

function request(
  body: Uint8Array | ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
) {
  const byteLength = body instanceof Uint8Array ? body.byteLength : undefined;
  return new Request("https://admin.example.test/downloads/upload", {
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
      ...(byteLength === undefined
        ? {}
        : { "content-length": String(byteLength) }),
      ...headers,
    },
    body,
    signal,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

async function stagingEntries(root: string) {
  return await readdir(path.join(root, "staging")).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
}

async function discardSuccessfulStage(
  result: Awaited<ReturnType<typeof readBoundedPdfUploadMultipart>>,
) {
  const stage = takePdfUploadStage(result.stage);
  await stage.writable.close();
  await unlink(stage.path);
  return stage;
}

describe("bounded PDF multipart upload", () => {
  it("streams one PDF to an opaque stage while hashing and sanitizing its display name", async () => {
    const { root, store } = await temporaryStore();
    const current = request(
      multipartBody(
        filePart({ filename: "C:\\fakepath\\Quarterly<Report>.PDF" }),
      ),
    );
    const arrayBuffer = vi.spyOn(current, "arrayBuffer");

    const result = await readBoundedPdfUploadMultipart(current, store);

    expect(result).toMatchObject({
      byteSize: PDF.byteLength,
      sha256: createHash("sha256").update(PDF).digest("hex"),
      originalName: "Quarterly_Report_.PDF",
    });
    expect(Object.keys(result.stage)).toEqual([]);
    expect(result.stage).not.toHaveProperty("path");
    expect(result.stage).not.toHaveProperty("writable");
    expect(arrayBuffer).not.toHaveBeenCalled();

    const stage = takePdfUploadStage(result.stage);
    expect(await readFile(stage.path)).toEqual(Buffer.from(PDF));
    expect(() => takePdfUploadStage(result.stage)).toThrow(
      "Invalid or consumed PDF stage",
    );
    expect(() => takePdfUploadStage({} as typeof result.stage)).toThrow(
      "Invalid or consumed PDF stage",
    );
    await stage.writable.close();
    await unlink(stage.path);
    expect(await stagingEntries(root)).toEqual([]);
  });

  it("keeps a successful upload stage open for the file-store commit", async () => {
    const { root, store } = await temporaryStore();
    const result = await readBoundedPdfUploadMultipart(
      request(multipartBody(filePart({}))),
      store,
    );
    const objectKey = await store.commit(takePdfUploadStage(result.stage), {
      resourceId: "019faaaa-0000-7000-8000-000000000001",
      revisionId: "019faaaa-0000-7000-9000-000000000001",
      kind: "pdf",
    });

    expect(await readFile(path.join(root, objectKey))).toEqual(
      Buffer.from(PDF),
    );
    await store.remove(objectKey);
  });

  it.each([
    ["wrong field", filePart({ name: "document" })],
    ["wrong media", filePart({ contentType: "application/octet-stream" })],
    ["wrong extension", filePart({ filename: "manual.txt" })],
    ["empty stem", filePart({ filename: ".PDF" })],
    ["extra file", bytes(filePart({}), filePart({ filename: "second.pdf" }))],
    ["extra field", bytes(filePart({}), fieldPart())],
    ["empty PDF", filePart({ value: new Uint8Array() })],
  ])("rejects %s and removes partial staging files", async (_name, part) => {
    const { root, store } = await temporaryStore();

    await expect(
      readBoundedPdfUploadMultipart(request(multipartBody(part)), store),
    ).rejects.toBeInstanceOf(PdfUploadError);
    expect(await stagingEntries(root)).toEqual([]);
  });

  it("rejects declared and streamed overruns with injected small limits", async () => {
    const limits = { maxPdfBytes: 8, maxMultipartBytes: 64 };

    const declared = await temporaryStore();
    const declaredRequest = request(multipartBody(filePart({})));
    await expect(
      readBoundedPdfUploadMultipart(declaredRequest, declared.store, limits),
    ).rejects.toMatchObject({ code: "body_too_large" });
    expect(await stagingEntries(declared.root)).toEqual([]);

    const streamed = await temporaryStore();
    const streamedRequest = request(
      multipartBody(filePart({ value: new Uint8Array(9) })),
    );
    streamedRequest.headers.delete("content-length");
    await expect(
      readBoundedPdfUploadMultipart(streamedRequest, streamed.store, {
        maxPdfBytes: 8,
        maxMultipartBytes: 512,
      }),
    ).rejects.toMatchObject({ code: "pdf_too_large" });
    expect(await stagingEntries(streamed.root)).toEqual([]);

    const raw = await temporaryStore();
    const rawRequest = request(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(65));
        },
      }),
    );
    await expect(
      readBoundedPdfUploadMultipart(rawRequest, raw.store, {
        maxPdfBytes: 64,
        maxMultipartBytes: 64,
      }),
    ).rejects.toMatchObject({ code: "body_too_large" });
    expect(await stagingEntries(raw.root)).toEqual([]);
  });

  it("closes the stage handle before deleting a failed partial upload", async () => {
    const { root, store } = await temporaryStore();
    const originalCreateStage = store.createStage.bind(store);
    const close = vi.fn<() => Promise<void>>();
    vi.spyOn(store, "createStage").mockImplementation(async (extension) => {
      const stage = await originalCreateStage(extension);
      const originalClose = stage.writable.close.bind(stage.writable);
      close.mockImplementation(originalClose);
      vi.spyOn(stage.writable, "close").mockImplementation(close);
      return stage;
    });

    await expect(
      readBoundedPdfUploadMultipart(
        request(multipartBody(filePart({ value: new Uint8Array(9) }))),
        store,
        { maxPdfBytes: 8, maxMultipartBytes: 512 },
      ),
    ).rejects.toMatchObject({ code: "pdf_too_large" });
    expect(close).toHaveBeenCalledOnce();
    expect(await stagingEntries(root)).toEqual([]);
  });

  it.each([
    [
      "malformed boundary",
      encode("not multipart"),
      { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    ],
    ["truncated part", bytes(filePart({}), encode(`--${BOUNDARY}`)), {}],
  ])("rejects a %s and cleans the stage", async (_name, body, headers) => {
    const { root, store } = await temporaryStore();

    await expect(
      readBoundedPdfUploadMultipart(request(body, headers), store),
    ).rejects.toBeInstanceOf(PdfUploadError);
    expect(await stagingEntries(root)).toEqual([]);
  });

  it("rejects reused and aborted request bodies", async () => {
    const first = await temporaryStore();
    const reused = request(multipartBody(filePart({})));
    await reused.text();
    await expect(
      readBoundedPdfUploadMultipart(reused, first.store),
    ).rejects.toBeInstanceOf(PdfUploadError);

    const second = await temporaryStore();
    const controller = new AbortController();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(current) {
        streamController = current;
      },
      cancel,
    });
    const aborted = request(body, {}, controller.signal);
    const upload = readBoundedPdfUploadMultipart(aborted, second.store);
    streamController.enqueue(filePart({ value: new Uint8Array(64 * 1024) }));
    controller.abort();

    await expect(upload).rejects.toBeInstanceOf(PdfUploadError);
    expect(cancel).toHaveBeenCalledOnce();
    expect(await stagingEntries(second.root)).toEqual([]);
  });

  it("contains an abort while a stage write is active", async () => {
    const { root, store } = await temporaryStore();
    const requestAbort = new AbortController();
    let bodyController!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        bodyController = controller;
      },
      cancel,
    });
    const originalCreateStage = store.createStage.bind(store);
    const close = vi.fn<() => Promise<void>>();
    let writes = 0;
    let releaseWrite!: () => void;
    const writeBlocked = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    vi.spyOn(store, "createStage").mockImplementation(async (extension) => {
      const stage = await originalCreateStage(extension);
      const originalClose = stage.writable.close.bind(stage.writable);
      close.mockImplementation(originalClose);
      vi.spyOn(stage.writable, "close").mockImplementation(close);
      const originalWrite = stage.writable.write.bind(stage.writable);
      vi.spyOn(stage.writable, "write").mockImplementation(async (buffer) => {
        writes += 1;
        await writeBlocked;
        return originalWrite(buffer);
      });
      return stage;
    });

    const upload = readBoundedPdfUploadMultipart(
      request(body, {}, requestAbort.signal),
      store,
    );
    bodyController.enqueue(
      filePart({ value: new Uint8Array(128 * 1024).fill(0x61) }),
    );
    while (writes === 0) await delay(1);
    requestAbort.abort();
    releaseWrite();

    await expect(upload).rejects.toBeInstanceOf(PdfUploadError);
    expect(cancel).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalled();
    expect(await stagingEntries(root)).toEqual([]);
  });

  it("contains an asynchronous stage-write I/O error", async () => {
    const { root, store } = await temporaryStore();
    const originalCreateStage = store.createStage.bind(store);
    const close = vi.fn<() => Promise<void>>();
    vi.spyOn(store, "createStage").mockImplementation(async (extension) => {
      const stage = await originalCreateStage(extension);
      const originalClose = stage.writable.close.bind(stage.writable);
      close.mockImplementation(originalClose);
      vi.spyOn(stage.writable, "close").mockImplementation(close);
      vi.spyOn(stage.writable, "write").mockRejectedValue(
        new Error("injected stage write failure"),
      );
      return stage;
    });

    await expect(
      readBoundedPdfUploadMultipart(
        request(multipartBody(filePart({}))),
        store,
      ),
    ).rejects.toMatchObject({
      code: "invalid_multipart",
      cause: expect.objectContaining({
        message: "injected stage write failure",
      }),
    });
    expect(close).toHaveBeenCalled();
    expect(await stagingEntries(root)).toEqual([]);
  });

  it("honors stage-write backpressure for a streamed 16 MiB request", async () => {
    const { store } = await temporaryStore();
    const payloadBytes = 16 * 1024 * 1024;
    const chunkBytes = 64 * 1024;
    const prefix = filePart({ value: new Uint8Array() });
    const header = prefix.subarray(0, prefix.byteLength - 2);
    const footer = encode(`\r\n--${BOUNDARY}--\r\n`);
    let sent = 0;
    let phase = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (phase === 0) {
          phase = 1;
          controller.enqueue(header);
          return;
        }
        if (sent < payloadBytes) {
          const length = Math.min(chunkBytes, payloadBytes - sent);
          sent += length;
          controller.enqueue(new Uint8Array(length).fill(0x61));
          return;
        }
        if (phase === 1) {
          phase = 2;
          controller.enqueue(footer);
          return;
        }
        controller.close();
      },
    });

    const originalCreateStage = store.createStage.bind(store);
    let writes = 0;
    let queuedBytes = 0;
    let peakQueuedBytes = 0;
    let releaseFirstWrite!: () => void;
    const firstWriteBlocked = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    vi.spyOn(store, "createStage").mockImplementation(async (extension) => {
      const stage = await originalCreateStage(extension);
      const originalWrite = stage.writable.write.bind(stage.writable);
      vi.spyOn(stage.writable, "write").mockImplementation(async (buffer) => {
        writes += 1;
        queuedBytes += Buffer.byteLength(buffer);
        peakQueuedBytes = Math.max(peakQueuedBytes, queuedBytes);
        if (writes === 1) await firstWriteBlocked;
        const result = await originalWrite(buffer);
        queuedBytes -= Buffer.byteLength(buffer);
        return result;
      });
      return stage;
    });

    const upload = readBoundedPdfUploadMultipart(request(body), store, {
      maxPdfBytes: payloadBytes,
      maxMultipartBytes: payloadBytes + 1024 * 1024,
    });
    while (writes === 0) await delay(1);
    await delay(20);
    expect(writes).toBe(1);
    expect(peakQueuedBytes).toBeLessThanOrEqual(128 * 1024);
    // Allows several 64 KiB queues across Request, Readable.fromWeb, and Busboy.
    expect(sent).toBeLessThanOrEqual(512 * 1024);
    releaseFirstWrite();

    const result = await upload;
    expect(result.byteSize).toBe(payloadBytes);
    expect(sent).toBe(payloadBytes);
    expect(peakQueuedBytes).toBeLessThanOrEqual(128 * 1024);
    await discardSuccessfulStage(result);
  });

  it("uses the production 200 MiB PDF and 201 MiB multipart limits", () => {
    expect(MAX_PDF_BYTES).toBe(200 * 1024 * 1024);
    expect(MAX_MULTIPART_BYTES).toBe(MAX_PDF_BYTES + 1024 * 1024);
  });
});
