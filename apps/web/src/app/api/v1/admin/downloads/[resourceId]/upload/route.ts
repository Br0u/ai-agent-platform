import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";

import { AuthAccessError, requirePermission } from "@/server/auth/access";
import {
  MutationRequestError,
  requireTrustedMultipartMutation,
} from "@/server/http/require-trusted-mutation";
import { cancelUnreadRequestBody } from "@/server/http/cancel-request-body";
import {
  PdfUploadError,
  readBoundedPdfUploadMultipart,
  takePdfUploadStage,
} from "@/server/downloads/pdf-upload";
import { pdfTools } from "@/server/downloads/pdf-tools";
import {
  downloadResourceFileStore,
  downloadResourceService,
} from "@/server/downloads/service";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-57][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MULTIPART =
  /^multipart\/form-data[\t ]*;[\t ]*boundary=(?:"[!#$%&'*+.^_`|~0-9A-Za-z-]{1,70}"|[!#$%&'*+.^_`|~0-9A-Za-z-]{1,70})$/u;

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
  await stage.writable.close().catch(() => undefined);
  await unlink(stage.path).catch(() => undefined);
}

function statusFor(error: unknown, request: Request) {
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
  if (error instanceof InvalidPdfError) return [422, "invalid_pdf"] as const;
  if (
    error instanceof Error &&
    /^(?:DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT|DOWNLOAD_RESOURCE_UPLOAD_REQUIRES_DRAFT|DOWNLOAD_RESOURCE_NOT_FOUND)$/.test(
      error.message,
    )
  )
    return [409, "state_conflict"] as const;
  return [500, "internal_error"] as const;
}

class InvalidPdfError extends Error {}

export async function POST(
  request: Request,
  context: { params: Promise<{ resourceId?: string }> },
): Promise<Response> {
  const id = requestId(request);
  let pdfStage: ReturnType<typeof takePdfUploadStage> | undefined;
  let coverStage:
    | Awaited<ReturnType<typeof pdfTools.derive>>["stagedCover"]
    | undefined;
  try {
    requireTrustedMultipartMutation(request);
    await requirePermission("admin:downloads");
    const params = await context.params;
    const resourceId = params.resourceId;
    const expectedRowVersion = ifMatch(request);
    if (!resourceId || !UUID.test(resourceId) || expectedRowVersion === null)
      return errorResponse(id, 400, "invalid_input");

    const upload = await readBoundedPdfUploadMultipart(
      request,
      downloadResourceFileStore,
    );
    pdfStage = takePdfUploadStage(upload.stage);
    let derived: Awaited<ReturnType<typeof pdfTools.derive>>;
    try {
      derived = await pdfTools.derive(
        pdfStage.path,
        downloadResourceFileStore,
        request.signal,
      );
    } catch (error) {
      if (request.signal.aborted) throw error;
      throw new InvalidPdfError("PDF could not be processed", { cause: error });
    }
    coverStage = derived.stagedCover;
    const resource = await downloadResourceService.attachUploadedPdf({
      id: resourceId,
      expectedRowVersion,
      pdfStage,
      coverStage,
      pageCount: derived.pageCount,
      byteSize: upload.byteSize,
      sha256: upload.sha256,
    });
    pdfStage = undefined;
    coverStage = undefined;
    return Response.json(
      { version: "1", requestId: id, resource },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    await cancelUnreadRequestBody(request, error);
    const [status, code] = statusFor(error, request);
    return errorResponse(id, status, code);
  } finally {
    if (pdfStage) await discardStage(pdfStage);
    if (coverStage) await discardStage(coverStage);
  }
}
