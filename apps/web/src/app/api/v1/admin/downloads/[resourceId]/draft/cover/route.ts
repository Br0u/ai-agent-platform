import { AuthAccessError, requirePermission } from "@/server/auth/access";
import {
  artifactErrorResponse,
  artifactResponse,
  parseSingleByteRange,
} from "@/server/downloads/pdf-response";
import { downloadResourceService } from "@/server/downloads/service";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-57][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function error(request: Request, error: unknown) {
  const status = error instanceof AuthAccessError ? error.status : 500;
  return artifactErrorResponse(
    request,
    status,
    status === 401
      ? "authentication_required"
      : status === 403
        ? "permission_denied"
        : "internal_error",
  );
}

async function serve(
  request: Request,
  context: { params: Promise<{ resourceId?: string }> },
): Promise<Response> {
  try {
    await requirePermission("admin:downloads");
    const resourceId = (await context.params).resourceId;
    if (!resourceId || !UUID.test(resourceId))
      return artifactErrorResponse(request, 404, "not_found");
    let artifact = await downloadResourceService.getAdminDraftArtifact(
      resourceId,
      "cover",
    );
    if (!artifact) return artifactErrorResponse(request, 404, "not_found");
    const range = parseSingleByteRange(
      request.headers.get("range"),
      artifact.size,
    );
    if (range && range !== "invalid") {
      artifact.readable.destroy();
      artifact = await downloadResourceService.getAdminDraftArtifact(
        resourceId,
        "cover",
        range,
      );
      if (!artifact) return artifactErrorResponse(request, 404, "not_found");
    }
    return artifactResponse({
      request,
      artifact,
      contentType: "image/webp",
      filename: "cover.webp",
      disposition: "inline",
      noStore: true,
    });
  } catch (caught) {
    return error(request, caught);
  }
}

export const GET = serve;
export const HEAD = serve;
