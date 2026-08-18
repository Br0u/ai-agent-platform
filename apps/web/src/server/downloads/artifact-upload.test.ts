import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  artifactUploadErrorCode,
  MAX_DOCUMENT_BYTES,
  MAX_INSTALLER_BYTES,
  readBoundedArtifactUploadMultipart,
  takeArtifactUploadStage,
  type ArtifactUploadFileStore,
} from "./artifact-upload";

const BOUNDARY = "----aap-artifact-boundary";
const PDF = Buffer.from("%PDF-1.7\nsmall fixture\n%%EOF");
const EXE = Buffer.from("MZ installer fixture");
const DMG = Buffer.concat([
  Buffer.from("not-a-dmg-header"),
  Buffer.alloc(64),
  Buffer.from("koly"),
  Buffer.alloc(508),
]);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryStore(): Promise<{
  root: string;
  store: ArtifactUploadFileStore;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "artifact-upload-"));
  temporaryDirectories.push(root);
  const staging = path.join(root, "staging");
  return {
    root,
    store: {
      async createStage(extension) {
        await mkdir(staging, { recursive: true });
        const stagePath = path.join(staging, `${randomUUID()}${extension}`);
        return Object.freeze({
          path: stagePath,
          writable: await open(stagePath, "w+"),
        });
      },
    },
  };
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
      `Content-Disposition: form-data; name="${options.name ?? "artifact"}"; filename="${options.filename ?? "manual.pdf"}"\r\nContent-Type: ${options.contentType ?? "application/octet-stream"}\r\n\r\n`,
    ),
    options.value ?? PDF,
    encode("\r\n"),
  );
}

function fieldPart() {
  return encode(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="note"\r\n\r\nunexpected\r\n`,
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
  result: Awaited<ReturnType<typeof readBoundedArtifactUploadMultipart>>,
) {
  const stage = takeArtifactUploadStage(result.stage);
  await stage.writable.close();
  await unlink(stage.path);
  return stage;
}

describe("bounded artifact multipart upload", () => {
  it("streams one document while hashing it and recognizing its server-side type", async () => {
    const { root, store } = await temporaryStore();
    const current = request(
      multipartBody(
        filePart({ filename: "C:\\fakepath\\Quarterly<Report>.PDF" }),
      ),
    );
    const arrayBuffer = vi.spyOn(current, "arrayBuffer");

    const result = await readBoundedArtifactUploadMultipart(
      current,
      store,
      "document",
    );

    expect(result).toMatchObject({
      byteSize: PDF.byteLength,
      sha256: createHash("sha256").update(PDF).digest("hex"),
      originalName: "Quarterly_Report_.PDF",
      extension: ".pdf",
      mediaType: "application/pdf",
    });
    expect(Object.keys(result.stage)).toEqual([]);
    expect(arrayBuffer).not.toHaveBeenCalled();
    const stage = takeArtifactUploadStage(result.stage);
    expect(await readFile(stage.path)).toEqual(PDF);
    expect(() => takeArtifactUploadStage(result.stage)).toThrow(
      "Invalid or consumed artifact stage",
    );
    await stage.writable.close();
    await unlink(stage.path);
    expect(await stagingEntries(root)).toEqual([]);
  });

  it.each([
    [
      "windows",
      "installer.exe",
      EXE,
      ".exe",
      "application/vnd.microsoft.portable-executable",
    ],
    ["macos", "installer.dmg", DMG, ".dmg", "application/x-apple-diskimage"],
  ] as const)(
    "uses the %s slot's accepted installer types and the actual final tail",
    async (slot, filename, value, extension, mediaType) => {
      const { store } = await temporaryStore();
      const result = await readBoundedArtifactUploadMultipart(
        request(multipartBody(filePart({ filename, value }))),
        store,
        slot,
      );

      expect(result).toMatchObject({
        byteSize: value.byteLength,
        sha256: createHash("sha256").update(value).digest("hex"),
        extension,
        mediaType,
      });
      await discardSuccessfulStage(result);
    },
  );

  it.each([
    ["wrong field", filePart({ name: "pdf" })],
    ["wrong slot type", filePart({ filename: "manual.exe", value: EXE })],
    ["unknown extension", filePart({ filename: "manual.txt" })],
    [
      "fake signature",
      filePart({ filename: "manual.exe", value: Buffer.from("no") }),
    ],
    ["extra file", bytes(filePart({}), filePart({ filename: "second.pdf" }))],
    ["extra field", bytes(filePart({}), fieldPart())],
    ["empty artifact", filePart({ value: new Uint8Array() })],
  ])("rejects %s and removes partial staging files", async (_name, part) => {
    const { root, store } = await temporaryStore();

    await expect(
      readBoundedArtifactUploadMultipart(
        request(multipartBody(part)),
        store,
        "document",
      ),
    ).rejects.toMatchObject({ code: "invalid_file" });
    expect(await stagingEntries(root)).toEqual([]);
  });

  it("keeps the primary validation error when stage cleanup also fails", async () => {
    const { root, store } = await temporaryStore();
    const originalCreateStage = store.createStage.bind(store);
    vi.spyOn(store, "createStage").mockImplementation(async (extension) => {
      const stage = await originalCreateStage(extension);
      vi.spyOn(stage.writable, "close").mockRejectedValue(
        new Error("injected cleanup failure"),
      );
      return stage;
    });

    const result = await readBoundedArtifactUploadMultipart(
      request(
        multipartBody(
          filePart({ filename: "manual.pdf", value: Buffer.from("not a PDF") }),
        ),
      ),
      store,
      "document",
    ).catch((error: unknown) => error);

    expect(result).toBeInstanceOf(AggregateError);
    expect(artifactUploadErrorCode(result)).toBe("invalid_file");
    expect(await stagingEntries(root)).toEqual([]);
  });

  it("maps ENOSPC from stage creation and sampling while removing the stage", async () => {
    const createEnospc = Object.assign(new Error("disk full"), {
      code: "ENOSPC",
    });
    const unavailableStore: ArtifactUploadFileStore = {
      createStage: vi.fn().mockRejectedValue(createEnospc),
    };
    const createError = await readBoundedArtifactUploadMultipart(
      request(multipartBody(filePart({}))),
      unavailableStore,
      "document",
    ).catch((error: unknown) => error);
    expect(artifactUploadErrorCode(createError)).toBe("insufficient_storage");

    const samplingFailure = await temporaryStore();
    const originalCreateStage = samplingFailure.store.createStage.bind(
      samplingFailure.store,
    );
    const sampleEnospc = Object.assign(new Error("disk full"), {
      code: "ENOSPC",
    });
    const close = vi.fn<() => Promise<void>>();
    vi.spyOn(samplingFailure.store, "createStage").mockImplementation(
      async (extension) => {
        const stage = await originalCreateStage(extension);
        const originalClose = stage.writable.close.bind(stage.writable);
        close.mockImplementation(originalClose);
        vi.spyOn(stage.writable, "close").mockImplementation(close);
        vi.spyOn(stage.writable, "read").mockRejectedValueOnce(sampleEnospc);
        return stage;
      },
    );
    const sampleError = await readBoundedArtifactUploadMultipart(
      request(multipartBody(filePart({}))),
      samplingFailure.store,
      "document",
    ).catch((error: unknown) => error);
    expect(artifactUploadErrorCode(sampleError)).toBe("insufficient_storage");
    expect(close).toHaveBeenCalledOnce();
    expect(await stagingEntries(samplingFailure.root)).toEqual([]);
  });

  it("maps ENOSPC from cleanup without replacing a signature mismatch", async () => {
    const { root, store } = await temporaryStore();
    const originalCreateStage = store.createStage.bind(store);
    const cleanupEnospc = Object.assign(new Error("disk full"), {
      code: "ENOSPC",
    });
    const close = vi.fn<() => Promise<void>>().mockRejectedValue(cleanupEnospc);
    vi.spyOn(store, "createStage").mockImplementation(async (extension) => {
      const stage = await originalCreateStage(extension);
      vi.spyOn(stage.writable, "close").mockImplementation(close);
      return stage;
    });

    const result = await readBoundedArtifactUploadMultipart(
      request(
        multipartBody(
          filePart({ filename: "manual.pdf", value: Buffer.from("not a PDF") }),
        ),
      ),
      store,
      "document",
    ).catch((error: unknown) => error);

    expect(artifactUploadErrorCode(result)).toBe("insufficient_storage");
    expect(close).toHaveBeenCalledOnce();
    expect(await stagingEntries(root)).toEqual([]);
  });

  it("enforces the document and installer limits without trusting Content-Length", async () => {
    const document = await temporaryStore();
    await expect(
      readBoundedArtifactUploadMultipart(
        request(multipartBody(filePart({}))),
        document.store,
        "document",
        { maxDocumentBytes: 8, maxMultipartBytes: 64 },
      ),
    ).rejects.toMatchObject({ code: "file_too_large" });

    const installer = await temporaryStore();
    const streamed = request(
      multipartBody(
        filePart({ filename: "manual.exe", value: Buffer.alloc(9, 0x61) }),
      ),
    );
    streamed.headers.delete("content-length");
    await expect(
      readBoundedArtifactUploadMultipart(streamed, installer.store, "windows", {
        maxInstallerBytes: 8,
        maxMultipartBytes: 512,
      }),
    ).rejects.toMatchObject({ code: "file_too_large" });
    expect(await stagingEntries(document.root)).toEqual([]);
    expect(await stagingEntries(installer.root)).toEqual([]);
  });

  it.each([
    ["document", "manual.pdf", PDF, "document", "maxDocumentBytes"],
    ["installer", "manual.exe", EXE, "windows", "maxInstallerBytes"],
  ] as const)(
    "accepts %s exactly at its limit and rejects one byte over",
    async (_name, filename, value, slot, limitName) => {
      const exact = await temporaryStore();
      const limits = { [limitName]: value.byteLength };
      const accepted = await readBoundedArtifactUploadMultipart(
        request(multipartBody(filePart({ filename, value }))),
        exact.store,
        slot,
        limits,
      );
      await discardSuccessfulStage(accepted);

      const overflow = await temporaryStore();
      await expect(
        readBoundedArtifactUploadMultipart(
          request(
            multipartBody(
              filePart({
                filename,
                value: Buffer.concat([value, Buffer.from("x")]),
              }),
            ),
          ),
          overflow.store,
          slot,
          limits,
        ),
      ).rejects.toMatchObject({ code: "file_too_large" });
      expect(await stagingEntries(overflow.root)).toEqual([]);
    },
  );

  it("rejects malformed and truncated multipart streams and cancels an aborted upload", async () => {
    const malformed = await temporaryStore();
    await expect(
      readBoundedArtifactUploadMultipart(
        request(encode("not multipart")),
        malformed.store,
        "document",
      ),
    ).rejects.toMatchObject({ code: "invalid_multipart" });

    const truncated = await temporaryStore();
    await expect(
      readBoundedArtifactUploadMultipart(
        request(bytes(filePart({}), encode(`--${BOUNDARY}`))),
        truncated.store,
        "document",
      ),
    ).rejects.toMatchObject({ code: "invalid_multipart" });

    const aborted = await temporaryStore();
    const controller = new AbortController();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(current) {
        streamController = current;
      },
      cancel,
    });
    const upload = readBoundedArtifactUploadMultipart(
      request(body, {}, controller.signal),
      aborted.store,
      "document",
    );
    streamController.enqueue(filePart({ value: Buffer.alloc(64 * 1024) }));
    controller.abort();

    await expect(upload).rejects.toMatchObject({ code: "invalid_multipart" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(await stagingEntries(aborted.root)).toEqual([]);
  });

  it("rejects a multipart body with no file and leaves no stage", async () => {
    const { root, store } = await temporaryStore();
    await expect(
      readBoundedArtifactUploadMultipart(
        request(multipartBody()),
        store,
        "document",
      ),
    ).rejects.toMatchObject({ code: "invalid_file" });
    expect(await stagingEntries(root)).toEqual([]);
  });

  it("closes and removes an active stage when the request aborts during a write", async () => {
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
        return await originalWrite(buffer);
      });
      return stage;
    });

    const upload = readBoundedArtifactUploadMultipart(
      request(body, {}, requestAbort.signal),
      store,
      "document",
    );
    bodyController.enqueue(
      filePart({ value: Buffer.concat([PDF, Buffer.alloc(128 * 1024)]) }),
    );
    while (writes === 0) await delay(1);
    requestAbort.abort();
    releaseWrite();

    await expect(upload).rejects.toMatchObject({ code: "invalid_multipart" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(await stagingEntries(root)).toEqual([]);
  });

  it("cleans up exactly once on active source and stage-write I/O failures", async () => {
    const sourceFailure = await temporaryStore();
    let sourceController!: ReadableStreamDefaultController<Uint8Array>;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        sourceController = controller;
      },
    });
    const sourceCreateStage = sourceFailure.store.createStage.bind(
      sourceFailure.store,
    );
    const sourceClose = vi.fn<() => Promise<void>>();
    let sourceWrites = 0;
    let releaseSourceWrite!: () => void;
    const sourceWriteBlocked = new Promise<void>((resolve) => {
      releaseSourceWrite = resolve;
    });
    vi.spyOn(sourceFailure.store, "createStage").mockImplementation(
      async (extension) => {
        const stage = await sourceCreateStage(extension);
        const originalClose = stage.writable.close.bind(stage.writable);
        sourceClose.mockImplementation(originalClose);
        vi.spyOn(stage.writable, "close").mockImplementation(sourceClose);
        const originalWrite = stage.writable.write.bind(stage.writable);
        vi.spyOn(stage.writable, "write").mockImplementation(async (buffer) => {
          sourceWrites += 1;
          await sourceWriteBlocked;
          return await originalWrite(buffer);
        });
        return stage;
      },
    );
    const sourceUpload = readBoundedArtifactUploadMultipart(
      request(source),
      sourceFailure.store,
      "document",
    );
    sourceController.enqueue(
      filePart({ value: Buffer.concat([PDF, Buffer.alloc(64 * 1024)]) }),
    );
    while (sourceWrites === 0) await delay(1);
    sourceController.error(new Error("injected source failure"));
    releaseSourceWrite();
    await expect(sourceUpload).rejects.toMatchObject({
      code: "invalid_multipart",
    });
    expect(sourceClose).toHaveBeenCalledOnce();
    expect(await stagingEntries(sourceFailure.root)).toEqual([]);

    const writeFailure = await temporaryStore();
    const writeCreateStage = writeFailure.store.createStage.bind(
      writeFailure.store,
    );
    const writeEnospc = Object.assign(new Error("disk full"), {
      code: "ENOSPC",
    });
    const writeClose = vi.fn<() => Promise<void>>();
    vi.spyOn(writeFailure.store, "createStage").mockImplementation(
      async (extension) => {
        const stage = await writeCreateStage(extension);
        const originalClose = stage.writable.close.bind(stage.writable);
        writeClose.mockImplementation(originalClose);
        vi.spyOn(stage.writable, "close").mockImplementation(writeClose);
        vi.spyOn(stage.writable, "write").mockRejectedValue(writeEnospc);
        return stage;
      },
    );
    const writeError = await readBoundedArtifactUploadMultipart(
      request(multipartBody(filePart({}))),
      writeFailure.store,
      "document",
    ).catch((error: unknown) => error);
    expect(artifactUploadErrorCode(writeError)).toBe("insufficient_storage");
    expect(writeClose).toHaveBeenCalledOnce();
    expect(await stagingEntries(writeFailure.root)).toEqual([]);
  });

  it("completes bounded partial reads for the exact final 512-byte tail", async () => {
    const { store } = await temporaryStore();
    const originalCreateStage = store.createStage.bind(store);
    const reads: Array<{ length: number; position: number | null }> = [];
    vi.spyOn(store, "createStage").mockImplementation(async (extension) => {
      const stage = await originalCreateStage(extension);
      const originalRead = stage.writable.read.bind(stage.writable);
      vi.spyOn(stage.writable, "read").mockImplementation((async (
        buffer: Buffer,
        offset: number,
        length: number,
        position: number | null,
      ) => {
        reads.push({ length, position });
        return await originalRead(
          buffer,
          offset,
          Math.min(length, 19),
          position,
        );
      }) as never);
      return stage;
    });

    const result = await readBoundedArtifactUploadMultipart(
      request(
        multipartBody(filePart({ filename: "installer.dmg", value: DMG })),
      ),
      store,
      "macos",
    );

    const tailStart = DMG.byteLength - 512;
    const initialTailRead = reads.findIndex(
      ({ length, position }) => length === 512 && position === tailStart,
    );
    expect(initialTailRead).toBeGreaterThanOrEqual(0);
    const tailReads = reads.slice(initialTailRead);
    expect(tailReads[0]).toEqual({
      length: 512,
      position: tailStart,
    });
    const finalTailRead = tailReads.at(-1);
    expect(finalTailRead).toBeDefined();
    expect(finalTailRead!.position! + finalTailRead!.length).toBe(
      DMG.byteLength,
    );
    await discardSuccessfulStage(result);
  });

  it("waits for stage writes before reading an unbounded request body", async () => {
    const { store } = await temporaryStore();
    const payloadBytes = 4 * 1024 * 1024;
    const chunkBytes = 64 * 1024;
    const header = filePart({ value: new Uint8Array() }).subarray(0, -2);
    const footer = encode(`\r\n--${BOUNDARY}--\r\n`);
    let sent = 0;
    let phase = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (phase++ === 0) return void controller.enqueue(header);
        if (sent < payloadBytes) {
          const length = Math.min(chunkBytes, payloadBytes - sent);
          sent += length;
          const chunk = Buffer.alloc(length, 0x61);
          if (sent === length) Buffer.from("%PDF-").copy(chunk);
          return void controller.enqueue(chunk);
        }
        if (phase === 66) return void controller.enqueue(footer);
        controller.close();
      },
    });
    const originalCreateStage = store.createStage.bind(store);
    let writes = 0;
    let releaseFirstWrite!: () => void;
    const firstWriteBlocked = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    vi.spyOn(store, "createStage").mockImplementation(async (extension) => {
      const stage = await originalCreateStage(extension);
      const originalWrite = stage.writable.write.bind(stage.writable);
      vi.spyOn(stage.writable, "write").mockImplementation(async (buffer) => {
        if (++writes === 1) await firstWriteBlocked;
        return await originalWrite(buffer);
      });
      return stage;
    });

    const upload = readBoundedArtifactUploadMultipart(
      request(body),
      store,
      "document",
      {
        maxDocumentBytes: payloadBytes,
        maxMultipartBytes: payloadBytes + 1024 * 1024,
      },
    );
    while (writes === 0) await delay(1);
    await delay(20);
    expect(writes).toBe(1);
    expect(sent).toBeLessThanOrEqual(512 * 1024);
    releaseFirstWrite();

    const result = await upload;
    expect(result.byteSize).toBe(payloadBytes);
    await discardSuccessfulStage(result);
  });

  it("maps nested storage failures while keeping parser errors stable", () => {
    const enospc = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    expect(
      artifactUploadErrorCode(
        new AggregateError([
          new Error("cleanup"),
          new AggregateError([enospc]),
        ]),
      ),
    ).toBe("insufficient_storage");
    expect(artifactUploadErrorCode({ code: "invalid_file" })).toBe(
      "invalid_file",
    );
  });

  it("uses the production 200 MiB document and 1 GiB installer limits", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(200 * 1024 * 1024);
    expect(MAX_INSTALLER_BYTES).toBe(1024 * 1024 * 1024);
  });
});
