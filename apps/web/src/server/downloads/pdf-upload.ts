import "server-only";

import Busboy, { type BusboyFileStream } from "@fastify/busboy";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";

import { cancelUnreadRequestBody } from "../http/cancel-request-body";
import type { DownloadStage } from "./file-store";

export const MAX_PDF_BYTES = 200 * 1024 * 1024;
export const MAX_MULTIPART_BYTES = MAX_PDF_BYTES + 1024 * 1024;

const MAX_CONTENT_TYPE_BYTES = 256;
const MULTIPART =
  /^multipart\/form-data\s*;\s*boundary=(?:"[!#$%&'*+.^_`|~0-9A-Za-z-]{1,70}"|[!#$%&'*+.^_`|~0-9A-Za-z-]{1,70})$/u;

export type PdfUploadErrorCode =
  | "invalid_multipart"
  | "body_too_large"
  | "pdf_too_large";

export class PdfUploadError extends Error {
  constructor(readonly code: PdfUploadErrorCode) {
    super("Invalid PDF upload");
    this.name = "PdfUploadError";
  }
}

export class PdfUploadStageHandle {
  private constructor() {}

  static create(): PdfUploadStageHandle {
    return Object.freeze(new PdfUploadStageHandle());
  }
}

const stages = new WeakMap<PdfUploadStageHandle, DownloadStage>();

export function takePdfUploadStage(
  handle: PdfUploadStageHandle,
): DownloadStage {
  const stage = stages.get(handle);
  if (!stage) throw new Error("Invalid or consumed PDF stage");
  stages.delete(handle);
  return stage;
}

export type BoundedPdfUpload = Readonly<{
  stage: PdfUploadStageHandle;
  byteSize: number;
  sha256: string;
  originalName: string;
}>;

type PdfUploadFileStore = Readonly<{
  createStage(extension: ".pdf"): Promise<DownloadStage>;
}>;

type PdfUploadLimits = Readonly<{
  maxPdfBytes?: number;
  maxMultipartBytes?: number;
}>;

type FileResult = Readonly<{
  byteSize: number;
  sha256: string;
  originalName: string;
}>;

function error(code: PdfUploadErrorCode = "invalid_multipart") {
  return new PdfUploadError(code);
}

function normalizeError(value: unknown): PdfUploadError {
  return value instanceof PdfUploadError ? value : error();
}

async function rejectBeforeRead(
  request: Request,
  code: PdfUploadErrorCode = "invalid_multipart",
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
  if (parsed > maxMultipartBytes) throw error("body_too_large");
  return parsed;
}

function sanitizePdfDisplayName(filename: string) {
  const leaf = (filename.replaceAll("\\", "/").split("/").at(-1) ?? "")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/gu, "_")
    .trim();
  const stem = leaf.slice(0, -4);
  if (
    Buffer.byteLength(leaf, "utf8") > 255 ||
    !/\.pdf$/iu.test(leaf) ||
    /^[.\s]*$/u.test(stem)
  ) {
    throw error();
  }
  return leaf;
}

function checkedLimit(value: number | undefined, fallback: number) {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit <= 0) throw error();
  return limit;
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
      "PDF stage cleanup failed",
    );
  }
}

export async function readBoundedPdfUploadMultipart(
  request: Request,
  fileStore: PdfUploadFileStore,
  configuredLimits: PdfUploadLimits = {},
): Promise<BoundedPdfUpload> {
  const maxPdfBytes = checkedLimit(configuredLimits.maxPdfBytes, MAX_PDF_BYTES);
  const maxMultipartBytes = checkedLimit(
    configuredLimits.maxMultipartBytes,
    MAX_MULTIPART_BYTES,
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
  let activeSink: ReturnType<
    DownloadStage["writable"]["createWriteStream"]
  > | null = null;
  let rawStage: DownloadStage | null = null;
  let fileTask: Promise<FileResult> | null = null;
  let rawBytes = 0;
  let fileCount = 0;
  let parserFinished = false;
  let terminalError: PdfUploadError | null = null;
  let settled = false;

  return await new Promise<BoundedPdfUpload>((resolve, reject) => {
    function removeAbortListener() {
      request.signal.removeEventListener("abort", onAbort);
    }

    async function finishFailure(primary: PdfUploadError) {
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
              "PDF upload cleanup failed",
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
      activeSink?.destroy(primary);
      parser?.destroy(primary);
      source?.destroy(primary);
      void finishFailure(primary);
    }

    function onAbort() {
      fail();
    }

    async function writePdf(
      stream: BusboyFileStream,
      originalName: string,
    ): Promise<FileResult> {
      const stage = await fileStore.createStage(".pdf");
      rawStage = stage;
      if (settled) throw terminalError ?? error();

      const sink = stage.writable.createWriteStream({
        autoClose: false,
        highWaterMark: 64 * 1024,
      });
      activeSink = sink;
      const hash = createHash("sha256");
      let byteSize = 0;
      try {
        for await (const value of stream) {
          if (settled) throw terminalError ?? error();
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          byteSize += chunk.byteLength;
          if (byteSize > maxPdfBytes) throw error("pdf_too_large");
          hash.update(chunk);
          if (!sink.write(chunk)) await once(sink, "drain");
        }
        if (stream.truncated) throw error("pdf_too_large");
        if (byteSize === 0) throw error();
        const finished = once(sink, "finish");
        sink.end();
        await finished;
        const closed = once(sink, "close");
        sink.destroy();
        await closed;
        activeSink = null;
        activeFile = null;
        return {
          byteSize,
          sha256: hash.digest("hex"),
          originalName,
        };
      } catch (caught) {
        if (!sink.destroyed) {
          const closed = once(sink, "close").catch(() => undefined);
          sink.destroy(caught instanceof Error ? caught : undefined);
          await closed;
        }
        throw caught;
      }
    }

    async function finishSuccess() {
      if (settled || !parserFinished) return;
      if (fileCount !== 1 || fileTask === null) {
        fail();
        return;
      }
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
      settled = true;
      removeAbortListener();
      const handle = PdfUploadStageHandle.create();
      stages.set(handle, rawStage);
      resolve({ stage: handle, ...file });
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
          fileSize: maxPdfBytes,
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
    parser.on("partsLimit", fail);
    parser.on("filesLimit", fail);
    parser.on("fieldsLimit", fail);
    parser.on("field", () => fail());
    parser.on(
      "file",
      (fieldName, stream, filename, _transferEncoding, mimeType) => {
        let originalName: string;
        try {
          originalName = sanitizePdfDisplayName(filename);
        } catch (caught) {
          stream.resume();
          fail(caught);
          return;
        }
        if (
          fieldName !== "pdf" ||
          fileCount !== 0 ||
          mimeType.toLowerCase() !== "application/pdf"
        ) {
          stream.resume();
          fail();
          return;
        }
        fileCount += 1;
        activeFile = stream;
        stream.on("limit", () => fail(error("pdf_too_large")));
        stream.on("error", fail);
        fileTask = writePdf(stream, originalName);
        void fileTask.catch(fail);
      },
    );
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
            fail(error("body_too_large"));
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
    activeSink = null;
    rawStage = null;
    fileTask = null;
  });
}
