import {
  artifactErrorResponse,
  artifactResponse,
  parseSingleByteRange,
} from "@/server/downloads/artifact-response";
import { downloadResourceService } from "@/server/downloads/service";

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-57][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function notFound(request: Request) {
  const response = artifactErrorResponse(request, 404, "not_found");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

async function serve(
  request: Request,
  context: { params: Promise<{ resourceKey?: string }> },
) {
  try {
    const resourceKey = (await context.params).resourceKey;
    const revisionId = new URL(request.url).searchParams.get("revision");
    if (
      !resourceKey ||
      !KEY.test(resourceKey) ||
      !revisionId ||
      !UUID.test(revisionId)
    )
      return notFound(request);
    let artifact = await downloadResourceService.openPublishedArtifact(
      resourceKey,
      "document",
      undefined,
      "cover",
      revisionId,
    );
    if (!artifact) return notFound(request);
    const range = parseSingleByteRange(
      request.method === "GET" ? request.headers.get("range") : null,
      artifact.size,
    );
    if (range && range !== "invalid") {
      artifact.readable.destroy();
      artifact = await downloadResourceService.openPublishedArtifact(
        resourceKey,
        "document",
        range,
        "cover",
        revisionId,
      );
      if (!artifact) return notFound(request);
    }
    const response = artifactResponse({
      request,
      artifact,
      contentType: "image/webp",
      filename: artifact.filename,
      disposition: "inline",
    });
    if (response.ok)
      response.headers.set(
        "Cache-Control",
        "public, max-age=31536000, immutable",
      );
    return response;
  } catch {
    return notFound(request);
  }
}

export const GET = serve;
export const HEAD = serve;
