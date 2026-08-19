import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";

import { AuthAccessError, requirePermission } from "@/server/auth/access";
import { resolveTrustedRequestIp } from "@/server/auth/shared-options";
import { cancelUnreadRequestBody } from "@/server/http/cancel-request-body";
import {
  MutationRequestError,
  requireTrustedMultipartMutation,
} from "@/server/http/require-trusted-mutation";
import {
  artifactUploadErrorCode,
  readBoundedArtifactUploadMultipart,
  takeArtifactUploadStage,
} from "@/server/downloads/artifact-upload";
import { getPdfToolErrorCode, pdfTools } from "@/server/downloads/pdf-tools";
import {
  downloadResourceFileStore,
  downloadResourceService,
} from "@/server/downloads/service";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-57][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MULTIPART =
  /^multipart\/form-data[\t ]*;[\t ]*boundary=(?:"[!#$%&'*+.^_`|~0-9A-Za-z-]{1,70}"|[!#$%&'*+.^_`|~0-9A-Za-z-]{1,70})$/u;
const slots = new Set(["document", "windows", "macos"] as const);
type Slot = "document" | "windows" | "macos";

class InputError extends Error {}

function requestId(request: Request) {
  const value = request.headers.get("x-request-id");
  return value !== null && /^[A-Za-z0-9_-]{1,128}$/u.test(value)
    ? value
    : randomUUID();
}

function errorResponse(requestIdValue: string, status: number, code: string) {
  return Response.json(
    { version: "1", requestId: requestIdValue, error: { code } },
    { status, headers: NO_STORE },
  );
}

function ifMatch(request: Request) {
  const value = request.headers.get("if-match");
  const match = value === null ? null : /^"([1-9][0-9]*)"$/u.exec(value);
  if (!match) return null;
  const rowVersion = Number(match[1]);
  return Number.isSafeInteger(rowVersion) ? rowVersion : null;
}

async function discardStage(stage: {
  path: string;
  writable: { close(): Promise<void> };
}) {
  const failures: unknown[] = [];
  await stage.writable.close().catch((error: unknown) => failures.push(error));
  await unlink(stage.path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      failures.push(error);
  });
  if (failures.length)
    throw new AggregateError(failures, "Upload stage cleanup failed");
}

function context(request: Request) {
  const userAgent = request.headers
    .get("user-agent")
    ?.replace(/[\u0000-\u001f\u007f]/gu, "")
    .trim()
    .slice(0, 512);
  const ipAddress = resolveTrustedRequestIp(request.headers);
  return {
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}

function statusFor(error: unknown, request: Request) {
  if (error instanceof InputError) return [400, "invalid_input"] as const;
  if (
    error instanceof MutationRequestError &&
    !MULTIPART.test(request.headers.get("content-type") ?? "")
  )
    return [415, "unsupported_media_type"] as const;
  if (error instanceof MutationRequestError)
    return [403, "mutation_rejected"] as const;
  if (error instanceof AuthAccessError)
    return [
      error.status,
      error.status === 401 ? "authentication_required" : "permission_denied",
    ] as const;
  const uploadCode = artifactUploadErrorCode(error);
  if (uploadCode === "insufficient_storage")
    return [507, "insufficient_storage"] as const;
  if (uploadCode === "invalid_multipart")
    return [400, "invalid_multipart"] as const;
  if (uploadCode === "invalid_file") return [422, "invalid_file"] as const;
  if (uploadCode === "file_too_large") return [413, "file_too_large"] as const;
  if (getPdfToolErrorCode(error) === "invalid_pdf")
    return [422, "invalid_file"] as const;
  if (
    error instanceof Error &&
    error.message === "DOWNLOAD_RESOURCE_ARTIFACT_SLOT_MISMATCH"
  )
    return [422, "invalid_file"] as const;
  if (
    error instanceof Error &&
    /^(?:DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT|DOWNLOAD_RESOURCE_UPLOAD_REQUIRES_DRAFT|DOWNLOAD_RESOURCE_NOT_FOUND)$/.test(
      error.message,
    )
  )
    return [409, "state_conflict"] as const;
  return [500, "internal_error"] as const;
}

function throwIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  const error = new Error("Upload aborted");
  error.name = "AbortError";
  throw error;
}

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ resourceId?: string; slot?: string }> },
): Promise<Response> {
  const id = requestId(request);
  let stage: ReturnType<typeof takeArtifactUploadStage> | undefined;
  let coverStage:
    | Awaited<ReturnType<typeof pdfTools.derive>>["stagedCover"]
    | undefined;
  let response: Response;
  try {
    requireTrustedMultipartMutation(request);
    await requirePermission("admin:downloads");
    const { resourceId, slot: rawSlot } = await routeContext.params;
    const expectedRowVersion = ifMatch(request);
    if (!resourceId || !UUID.test(resourceId) || expectedRowVersion === null)
      throw new InputError();
    if (!rawSlot || !slots.has(rawSlot as Slot))
      return errorResponse(id, 404, "not_found");
    const slot = rawSlot as Slot;
    const upload = await readBoundedArtifactUploadMultipart(
      request,
      downloadResourceFileStore,
      slot,
    );
    stage = takeArtifactUploadStage(upload.stage);
    let pageCount: number | undefined;
    if (slot === "document") {
      const derived = await pdfTools.derive(
        stage.path,
        downloadResourceFileStore,
        request.signal,
      );
      coverStage = derived.stagedCover;
      pageCount = derived.pageCount;
    }
    throwIfAborted(request.signal);
    const attached = await downloadResourceService.attachUploadedArtifact(
      {
        id: resourceId,
        expectedRowVersion,
        slot,
        stage,
        coverStage,
        pageCount,
        originalFilename: upload.originalName,
        extension: upload.extension,
        mediaType: upload.mediaType,
        byteSize: upload.byteSize,
        sha256: upload.sha256,
      },
      context(request),
      request.signal,
    );
    stage = undefined;
    coverStage = undefined;
    response = Response.json(
      { version: "1", requestId: id, resource: attached.dto },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    await cancelUnreadRequestBody(request, error);
    const [status, code] = statusFor(error, request);
    response = errorResponse(id, status, code);
  }

  const cleanupFailures: unknown[] = [];
  if (stage)
    await discardStage(stage).catch((error: unknown) =>
      cleanupFailures.push(error),
    );
  if (coverStage)
    await discardStage(coverStage).catch((error: unknown) =>
      cleanupFailures.push(error),
    );
  return cleanupFailures.length
    ? errorResponse(id, 500, "internal_error")
    : response;
}
