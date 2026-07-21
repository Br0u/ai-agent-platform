import "server-only";

import Busboy, { type BusboyFileStream } from "@fastify/busboy";
import { once } from "node:events";
import { Readable } from "node:stream";

import { cancelUnreadRequestBody } from "./cancel-request-body";

const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_ARCHIVE_BYTES + 64 * 1024;
const MAX_CONTENT_TYPE_BYTES = 256;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MULTIPART =
  /^multipart\/form-data\s*;\s*boundary=(?:"[!#$%&'*+.^_`|~0-9A-Za-z-]{1,70}"|[!#$%&'*+.^_`|~0-9A-Za-z-]{1,70})$/u;

export type BoundedMultipartErrorCode =
  | "invalid_multipart"
  | "body_too_large"
  | "archive_too_large";

export class BoundedMultipartError extends Error {
  constructor(readonly code: BoundedMultipartErrorCode) {
    super("Invalid skill upload");
    this.name = "BoundedMultipartError";
  }
}

export type BoundedSkillUpload = {
  archive: Uint8Array;
  targetSkillId?: string;
};

function reject(code: BoundedMultipartErrorCode = "invalid_multipart"): never {
  throw new BoundedMultipartError(code);
}

async function rejectBeforeRead(
  request: Request,
  code: BoundedMultipartErrorCode = "invalid_multipart",
): Promise<never> {
  const error = new BoundedMultipartError(code);
  await cancelUnreadRequestBody(request, error);
  throw error;
}

function contentLength(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (raw === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(raw)) reject();
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) reject();
  if (parsed > MAX_BODY_BYTES) reject("body_too_large");
  return parsed;
}

function validZipPrefix(archive: Uint8Array): boolean {
  return (
    archive.byteLength >= 4 &&
    archive[0] === 0x50 &&
    archive[1] === 0x4b &&
    archive[2] === 0x03 &&
    archive[3] === 0x04
  );
}

export async function readBoundedSkillUploadMultipart(
  request: Request,
): Promise<BoundedSkillUpload> {
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
    declaredLength = contentLength(request);
  } catch (error) {
    await cancelUnreadRequestBody(request, error);
    throw error;
  }
  if (declaredLength === 0 || request.body === null || request.bodyUsed) {
    return await rejectBeforeRead(request);
  }

  let source: Readable | null = null;
  let parser: ReturnType<typeof Busboy> | null = null;
  let activeFile: BusboyFileStream | null = null;
  let archiveChunks: Buffer[] | null = [];
  let archiveBytes = 0;
  let archive: Uint8Array | null = null;
  let targetSkillId: string | undefined;
  let rawBytes = 0;
  let settled = false;

  return await new Promise<BoundedSkillUpload>((resolve, rejectPromise) => {
    function cleanup(): void {
      request.signal.removeEventListener("abort", onAbort);
    }

    function fail(code: BoundedMultipartErrorCode = "invalid_multipart"): void {
      if (settled) return;
      settled = true;
      cleanup();
      const error = new BoundedMultipartError(code);
      activeFile?.destroy(error);
      parser?.destroy(error);
      source?.destroy(error);
      archiveChunks = null;
      archive = null;
      rejectPromise(error);
    }

    function onAbort(): void {
      fail();
    }

    try {
      source = Readable.fromWeb(
        request.body as unknown as import("node:stream/web").ReadableStream,
      );
      source.on("error", () => fail());
      parser = Busboy({
        headers: { "content-type": contentType },
        highWaterMark: 64 * 1024,
        fileHwm: 64 * 1024,
        limits: {
          fieldNameSize: 32,
          fieldSize: 36,
          fields: 1,
          fileSize: MAX_ARCHIVE_BYTES,
          files: 1,
          parts: 2,
          headerPairs: 8,
          headerSize: 2 * 1024,
        },
      });
    } catch {
      fail();
      return;
    }

    request.signal.addEventListener("abort", onAbort, { once: true });
    parser.on("error", () => fail());
    parser.on("partsLimit", () => fail());
    parser.on("filesLimit", () => fail());
    parser.on("fieldsLimit", () => fail());

    parser.on(
      "file",
      (fieldName, stream, _filename, _transferEncoding, mimeType) => {
        if (
          fieldName !== "archive" ||
          activeFile !== null ||
          archive !== null ||
          mimeType.toLowerCase() !== "application/zip"
        ) {
          stream.resume();
          fail();
          return;
        }
        activeFile = stream;
        stream.on("limit", () => fail("archive_too_large"));
        stream.on("error", () => fail());
        stream.on("data", (chunk: Buffer) => {
          if (settled || archiveChunks === null) return;
          archiveBytes += chunk.byteLength;
          if (archiveBytes > MAX_ARCHIVE_BYTES) {
            fail("archive_too_large");
            return;
          }
          archiveChunks.push(Buffer.from(chunk));
        });
        stream.on("end", () => {
          if (settled || stream.truncated || archiveChunks === null) {
            if (stream.truncated) fail("archive_too_large");
            return;
          }
          const combined = Buffer.concat(archiveChunks, archiveBytes);
          archive = new Uint8Array(combined.byteLength);
          archive.set(combined);
          combined.fill(0);
          archiveChunks = null;
          activeFile = null;
        });
      },
    );

    parser.on(
      "field",
      (fieldName, value, fieldNameTruncated, valueTruncated) => {
        if (
          fieldName !== "targetSkillId" ||
          targetSkillId !== undefined ||
          fieldNameTruncated ||
          valueTruncated ||
          !UUID.test(value)
        ) {
          fail();
          return;
        }
        targetSkillId = value;
      },
    );

    parser.on("finish", () => {
      if (settled) return;
      if (
        archive === null ||
        activeFile !== null ||
        archiveBytes === 0 ||
        !validZipPrefix(archive) ||
        (declaredLength !== null && declaredLength !== rawBytes)
      ) {
        fail();
        return;
      }
      settled = true;
      cleanup();
      const result = {
        archive,
        ...(targetSkillId === undefined ? {} : { targetSkillId }),
      };
      archive = null;
      resolve(result);
    });

    void (async () => {
      try {
        for await (const value of source as Readable) {
          if (settled) return;
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          rawBytes += chunk.byteLength;
          if (rawBytes > MAX_BODY_BYTES) {
            fail("body_too_large");
            return;
          }
          if (!(parser as ReturnType<typeof Busboy>).write(chunk)) {
            await once(parser as ReturnType<typeof Busboy>, "drain");
          }
        }
        if (!settled) (parser as ReturnType<typeof Busboy>).end();
      } catch {
        fail();
      }
    })();
  }).finally(() => {
    archiveChunks = null;
    archive = null;
    activeFile = null;
    parser = null;
    source = null;
  });
}
