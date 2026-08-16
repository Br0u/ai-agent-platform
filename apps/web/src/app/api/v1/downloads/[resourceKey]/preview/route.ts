import {
  artifactErrorResponse,
  artifactResponse,
  parseSingleByteRange,
} from "@/server/downloads/pdf-response";
import { downloadResourceService } from "@/server/downloads/service";

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

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
    if (!resourceKey || !KEY.test(resourceKey)) return notFound(request);
    let artifact = await downloadResourceService.getPublicArtifact(
      resourceKey,
      "preview",
    );
    if (!artifact) return notFound(request);
    const range = parseSingleByteRange(
      request.method === "GET" ? request.headers.get("range") : null,
      artifact.size,
    );
    if (range && range !== "invalid") {
      artifact.readable.destroy();
      artifact = await downloadResourceService.getPublicArtifact(
        resourceKey,
        "preview",
        range,
      );
      if (!artifact) return notFound(request);
    }
    return artifactResponse({
      request,
      artifact,
      contentType: "application/pdf",
      filename: artifact.filename,
      disposition: "inline",
      noStore: true,
    });
  } catch {
    return notFound(request);
  }
}

export const GET = serve;
export const HEAD = serve;
