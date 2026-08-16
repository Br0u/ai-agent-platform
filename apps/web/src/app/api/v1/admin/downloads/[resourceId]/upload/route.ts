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
  PdfUploadError,
  readBoundedPdfUploadMultipart,
  takePdfUploadStage,
} from "@/server/downloads/pdf-upload";
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
  await unlink(stage.path).catch((error: unknown) => failures.push(error));
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
  if (error instanceof PdfUploadError)
    return [
      error.code === "invalid_multipart" ? 400 : 413,
      error.code,
    ] as const;
  if (getPdfToolErrorCode(error) === "invalid_pdf")
    return [422, "invalid_pdf"] as const;
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
  routeContext: { params: Promise<{ resourceId?: string }> },
): Promise<Response> {
  const id = requestId(request);
  let pdfStage: ReturnType<typeof takePdfUploadStage> | undefined;
  let coverStage:
    | Awaited<ReturnType<typeof pdfTools.derive>>["stagedCover"]
    | undefined;
  let response: Response;
  try {
    requireTrustedMultipartMutation(request);
    await requirePermission("admin:downloads");
    const resourceId = (await routeContext.params).resourceId;
    const expectedRowVersion = ifMatch(request);
    if (!resourceId || !UUID.test(resourceId) || expectedRowVersion === null)
      throw new InputError();
    const upload = await readBoundedPdfUploadMultipart(
      request,
      downloadResourceFileStore,
    );
    pdfStage = takePdfUploadStage(upload.stage);
    const derived = await pdfTools.derive(
      pdfStage.path,
      downloadResourceFileStore,
      request.signal,
    );
    coverStage = derived.stagedCover;
    throwIfAborted(request.signal);
    const resource = await downloadResourceService.attachUploadedPdf(
      {
        id: resourceId,
        expectedRowVersion,
        pdfStage,
        coverStage,
        pageCount: derived.pageCount,
        byteSize: upload.byteSize,
        sha256: upload.sha256,
      },
      context(request),
      request.signal,
    );
    pdfStage = undefined;
    coverStage = undefined;
    response = Response.json(
      { version: "1", requestId: id, resource },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    await cancelUnreadRequestBody(request, error);
    const [status, code] = statusFor(error, request);
    response = errorResponse(id, status, code);
  }

  const cleanupFailures: unknown[] = [];
  if (pdfStage)
    await discardStage(pdfStage).catch((error: unknown) =>
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
