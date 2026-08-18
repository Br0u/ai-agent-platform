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
