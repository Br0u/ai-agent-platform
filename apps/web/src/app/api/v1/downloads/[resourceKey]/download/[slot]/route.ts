import {
  artifactErrorResponse,
  artifactResponse,
  parseSingleByteRange,
} from "@/server/downloads/artifact-response";
import { downloadResourceService } from "@/server/downloads/service";

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const slots = new Set(["windows", "macos"] as const);
type Slot = "windows" | "macos";
const contentTypes = {
  ".exe": "application/vnd.microsoft.portable-executable",
  ".msi": "application/x-msi",
  ".zip": "application/zip",
  ".dmg": "application/x-apple-diskimage",
  ".pkg": "application/vnd.apple.installer+xml",
} as const;

function notFound(request: Request) {
  return artifactErrorResponse(request, 404, "not_found");
}

async function serve(
  request: Request,
  context: { params: Promise<{ resourceKey?: string; slot?: string }> },
) {
  try {
    const { resourceKey, slot: rawSlot } = await context.params;
    if (
      !resourceKey ||
      !KEY.test(resourceKey) ||
      !rawSlot ||
      !slots.has(rawSlot as Slot)
    )
      return notFound(request);
    const slot = rawSlot as Slot;
    let artifact = await downloadResourceService.openPublishedArtifact(
      resourceKey,
      slot,
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
        slot,
        range,
      );
      if (!artifact) return notFound(request);
    }
    const contentType =
      contentTypes[artifact.extension as keyof typeof contentTypes];
    if (!contentType) {
      artifact.readable.destroy();
      return notFound(request);
    }
    return artifactResponse({
      request,
      artifact,
      contentType,
      expectedByteSize: artifact.byteSize,
      filename: artifact.filename,
    });
  } catch {
    return notFound(request);
  }
}

export const GET = serve;
export const HEAD = serve;
