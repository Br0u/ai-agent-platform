import "server-only";

import Busboy, { type BusboyFileStream } from "@fastify/busboy";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";

import { cancelUnreadRequestBody } from "../http/cancel-request-body";
import {
  ARTIFACT_FILE_TYPES,
  detectArtifact,
  sanitizeArtifactFilename,
  type ArtifactSlot,
} from "./artifact-file";
import type { DownloadStage } from "./file-store";

export const MAX_DOCUMENT_BYTES = 200 * 1024 * 1024;
export const MAX_INSTALLER_BYTES = 1024 * 1024 * 1024;
export const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

const MAX_CONTENT_TYPE_BYTES = 256;
const SAMPLE_BYTES = 512;
const MULTIPART =
  /^multipart\/form-data\s*;\s*boundary=(?:"[!#$%&'*+.^_`|~0-9A-Za-z-]{1,70}"|[!#$%&'*+.^_`|~0-9A-Za-z-]{1,70})$/u;

export type ArtifactUploadExtension =
  | ".pdf"
  | ".exe"
  | ".msi"
  | ".zip"
  | ".dmg"
  | ".pkg";

export type ArtifactUploadErrorCode =
  | "invalid_multipart"
  | "invalid_file"
  | "file_too_large";

export class ArtifactUploadError extends Error {
  constructor(
    readonly code: ArtifactUploadErrorCode,
    cause?: unknown,
  ) {
    super(
      "Invalid artifact upload",
      cause === undefined ? undefined : { cause },
    );
    this.name = "ArtifactUploadError";
  }
}

export class ArtifactUploadStageHandle {
  private constructor() {}

  static create(): ArtifactUploadStageHandle {
    return Object.freeze(new ArtifactUploadStageHandle());
  }
}

const stages = new WeakMap<ArtifactUploadStageHandle, DownloadStage>();

export function takeArtifactUploadStage(
  handle: ArtifactUploadStageHandle,
): DownloadStage {
  const stage = stages.get(handle);
  if (!stage) throw new Error("Invalid or consumed artifact stage");
  stages.delete(handle);
  return stage;
}

export type BoundedArtifactUpload = Readonly<{
  stage: ArtifactUploadStageHandle;
  byteSize: number;
  sha256: string;
  originalName: string;
  extension: ArtifactUploadExtension;
  mediaType: string;
}>;

export type ArtifactUploadFileStore = Readonly<{
  createStage(extension: ArtifactUploadExtension): Promise<DownloadStage>;
}>;

export type ArtifactUploadLimits = Readonly<{
  maxDocumentBytes?: number;
  maxInstallerBytes?: number;
  maxMultipartBytes?: number;
}>;

type FileResult = Readonly<{
  byteSize: number;
  sha256: string;
  originalName: string;
}>;

function error(code: ArtifactUploadErrorCode = "invalid_multipart") {
  return new ArtifactUploadError(code);
}

function normalizeError(value: unknown): ArtifactUploadError {
  return value instanceof ArtifactUploadError
    ? value
    : new ArtifactUploadError("invalid_multipart", value);
}

function isEnospc(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    value.code === "ENOSPC"
  );
}

export function artifactUploadErrorCode(
  error: unknown,
): ArtifactUploadErrorCode | "insufficient_storage" | null {
  const seen = new Set<unknown>();
  const queue = [error];
  let parserCode: ArtifactUploadErrorCode | null = null;
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || current === null || seen.has(current))
      continue;
    if (typeof current === "object") seen.add(current);
    if (isEnospc(current)) return "insufficient_storage";
    if (current instanceof ArtifactUploadError) parserCode ??= current.code;
    if (typeof current === "object" && current !== null) {
      if (
        "code" in current &&
        (current.code === "invalid_multipart" ||
          current.code === "invalid_file" ||
          current.code === "file_too_large")
      ) {
        parserCode ??= current.code;
      }
      if ("cause" in current) queue.push(current.cause);
      if ("errors" in current && Array.isArray(current.errors)) {
        queue.push(...current.errors);
      }
    }
  }
  return parserCode;
}

async function rejectBeforeRead(
  request: Request,
  code: ArtifactUploadErrorCode = "invalid_multipart",
): Promise<never> {
  const rejection = error(code);
  await cancelUnreadRequestBody(request, rejection);
  throw rejection;
}

function readContentLength(request: Request, maxMultipartBytes: number) {
  const raw = request.headers.get("content-length");
  if (raw === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(raw)) throw error();
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) throw error();
  if (parsed > maxMultipartBytes) throw error("file_too_large");
  return parsed;
}

function checkedLimit(value: number | undefined, fallback: number) {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit <= 0) throw error();
  return limit;
}

function maximumArtifactBytes(
  slot: ArtifactSlot,
  limits: ArtifactUploadLimits,
) {
  return slot === "document"
    ? checkedLimit(limits.maxDocumentBytes, MAX_DOCUMENT_BYTES)
    : checkedLimit(limits.maxInstallerBytes, MAX_INSTALLER_BYTES);
}

async function discardStage(stage: DownloadStage) {
  let closeError: unknown;
  try {
    await stage.writable.close();
  } catch (caught) {
    closeError = caught;
  }
  let unlinkError: unknown;
  try {
    await unlink(stage.path);
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code !== "ENOENT") {
      unlinkError = caught;
    }
  }
  if (closeError !== undefined || unlinkError !== undefined) {
    throw new AggregateError(
      [closeError, unlinkError].filter((caught) => caught !== undefined),
      "Artifact stage cleanup failed",
    );
  }
}

async function artifactSamples(stage: DownloadStage, byteSize: number) {
  const stats = await stage.writable.stat();
  if (!stats.isFile() || stats.size !== byteSize) throw error("invalid_file");
  const prefix = Buffer.alloc(Math.min(SAMPLE_BYTES, byteSize));
  const suffix = Buffer.alloc(Math.min(SAMPLE_BYTES, byteSize));
  for (const [sample, position] of [
    [prefix, 0],
    [suffix, byteSize - suffix.byteLength],
  ] as const) {
    let offset = 0;
    while (offset < sample.byteLength) {
      const { bytesRead } = await stage.writable.read(
        sample,
        offset,
        sample.byteLength - offset,
        position + offset,
      );
      if (bytesRead === 0) throw error("invalid_file");
      offset += bytesRead;
    }
  }
  return { prefix, suffix };
}

export async function readBoundedArtifactUploadMultipart(
  request: Request,
  fileStore: ArtifactUploadFileStore,
  slot: ArtifactSlot,
  configuredLimits: ArtifactUploadLimits = {},
): Promise<BoundedArtifactUpload> {
  const maxArtifactBytes = maximumArtifactBytes(slot, configuredLimits);
  const maxMultipartBytes = checkedLimit(
    configuredLimits.maxMultipartBytes,
    maxArtifactBytes + MAX_MULTIPART_OVERHEAD_BYTES,
  );
  const contentType = request.headers.get("content-type");
  if (
    contentType === null ||
    Buffer.byteLength(contentType, "utf8") > MAX_CONTENT_TYPE_BYTES ||
    !MULTIPART.test(contentType)
  ) {
    return await rejectBeforeRead(request);
  }

  let declaredLength: number | null;
  try {
    declaredLength = readContentLength(request, maxMultipartBytes);
  } catch (caught) {
    await cancelUnreadRequestBody(request, caught);
    throw caught;
  }
  if (
    declaredLength === 0 ||
    request.body === null ||
    request.bodyUsed ||
    request.signal.aborted
  ) {
    return await rejectBeforeRead(request);
  }

  let source: Readable | null = null;
  let parser: ReturnType<typeof Busboy> | null = null;
  let activeFile: BusboyFileStream | null = null;
  let rawStage: DownloadStage | null = null;
  let fileTask: Promise<FileResult> | null = null;
  let rawBytes = 0;
  let fileCount = 0;
  let parserFinished = false;
  let terminalError: ArtifactUploadError | null = null;
  let settled = false;

  return await new Promise<BoundedArtifactUpload>((resolve, reject) => {
    function removeAbortListener() {
      request.signal.removeEventListener("abort", onAbort);
    }

    async function finishFailure(primary: ArtifactUploadError) {
      await fileTask?.catch(() => undefined);
      let cleanupError: unknown;
      if (rawStage !== null) {
        try {
          await discardStage(rawStage);
        } catch (caught) {
          cleanupError = caught;
        }
      }
      await cancelUnreadRequestBody(request, primary);
      reject(
        cleanupError === undefined
          ? primary
          : new AggregateError(
              [primary, cleanupError],
              "Artifact upload cleanup failed",
            ),
      );
    }

    function fail(caught: unknown = error()) {
      if (settled) return;
      settled = true;
      const primary = normalizeError(caught);
      terminalError = primary;
      removeAbortListener();
      activeFile?.destroy(primary);
      parser?.destroy(primary);
      source?.destroy(primary);
      void finishFailure(primary);
    }

    function onAbort() {
      fail();
    }

    async function writeArtifact(
      stream: BusboyFileStream,
      originalName: string,
    ): Promise<FileResult> {
      const extension = /\.[A-Za-z0-9]+$/u
        .exec(originalName)?.[0]
        ?.toLowerCase();
      if (!extension) throw error("invalid_file");
      const artifactExtension = extension as ArtifactUploadExtension;
      const allowedTypes = ARTIFACT_FILE_TYPES[slot];
      if (!allowedTypes || !allowedTypes[artifactExtension]) {
        throw error("invalid_file");
      }
      const stage = await fileStore.createStage(artifactExtension);
      rawStage = stage;
      if (settled) throw terminalError ?? error();

      const hash = createHash("sha256");
      let byteSize = 0;
      for await (const value of stream) {
        if (settled) throw terminalError ?? error();
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        byteSize += chunk.byteLength;
        if (byteSize > maxArtifactBytes) throw error("file_too_large");
        hash.update(chunk);
        let remaining = chunk;
        while (remaining.byteLength > 0) {
          if (settled) throw terminalError ?? error();
          const { bytesWritten } = await stage.writable.write(remaining);
          if (bytesWritten === 0) throw error();
          remaining = remaining.subarray(bytesWritten);
        }
      }
      if (stream.truncated) throw error("file_too_large");
      if (byteSize === 0) throw error("invalid_file");
      activeFile = null;
      return {
        byteSize,
        sha256: hash.digest("hex"),
        originalName,
      };
    }

    async function finishSuccess() {
      if (settled || !parserFinished) return;
      if (fileCount !== 1 || fileTask === null)
        return fail(error("invalid_file"));
      let file: FileResult;
      try {
        file = await fileTask;
      } catch (caught) {
        fail(caught);
        return;
      }
      if (settled) return;
      if (
        rawStage === null ||
        (declaredLength !== null && declaredLength !== rawBytes)
      ) {
        fail();
        return;
      }
      let recognized: ReturnType<typeof detectArtifact>;
      let originalName: string;
      try {
        originalName = sanitizeArtifactFilename(file.originalName);
        recognized = detectArtifact({
          slot,
          filename: originalName,
          ...(await artifactSamples(rawStage, file.byteSize)),
        });
      } catch (caught) {
        fail(
          caught instanceof ArtifactUploadError
            ? caught
            : new ArtifactUploadError("invalid_file", caught),
        );
        return;
      }
      if (settled) return;
      settled = true;
      removeAbortListener();
      const handle = ArtifactUploadStageHandle.create();
      stages.set(handle, rawStage);
      resolve({
        ...file,
        originalName,
        ...recognized,
        extension: recognized.extension as ArtifactUploadExtension,
        stage: handle,
      });
    }

    try {
      source = Readable.fromWeb(
        request.body as unknown as import("node:stream/web").ReadableStream,
      );
      source.on("error", fail);
      parser = Busboy({
        headers: { "content-type": contentType },
        highWaterMark: 64 * 1024,
        fileHwm: 64 * 1024,
        limits: {
          fieldNameSize: 32,
          fieldSize: 1,
          fields: 0,
          fileSize: maxArtifactBytes,
          files: 1,
          parts: 1,
          headerPairs: 8,
          headerSize: 2 * 1024,
        },
      });
    } catch (caught) {
      fail(caught);
      return;
    }

    request.signal.addEventListener("abort", onAbort, { once: true });
    parser.on("error", fail);
    parser.on("partsLimit", () => fail(error("invalid_file")));
    parser.on("filesLimit", () => fail(error("invalid_file")));
    parser.on("fieldsLimit", () => fail(error("invalid_file")));
    parser.on("field", () => fail(error("invalid_file")));
    parser.on("file", (fieldName, stream, filename) => {
      if (fieldName !== "artifact" || fileCount !== 0) {
        stream.resume();
        fail(error("invalid_file"));
        return;
      }
      fileCount += 1;
      activeFile = stream;
      stream.on("limit", () => fail(error("file_too_large")));
      stream.on("error", fail);
      fileTask = writeArtifact(stream, filename);
      void fileTask.catch(fail);
    });
    parser.on("finish", () => {
      parserFinished = true;
      void finishSuccess();
    });

    void (async () => {
      try {
        for await (const value of source as Readable) {
          if (settled) return;
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          rawBytes += chunk.byteLength;
          if (rawBytes > maxMultipartBytes) {
            fail(error("file_too_large"));
            return;
          }
          if (declaredLength !== null && rawBytes > declaredLength) {
            fail();
            return;
          }
          if (!(parser as ReturnType<typeof Busboy>).write(chunk)) {
            await once(parser as ReturnType<typeof Busboy>, "drain");
          }
        }
        if (!settled) (parser as ReturnType<typeof Busboy>).end();
      } catch (caught) {
        fail(caught);
      }
    })();
  }).finally(() => {
    source = null;
    parser = null;
    activeFile = null;
    rawStage = null;
    fileTask = null;
  });
}
