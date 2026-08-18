import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

export type OpenedDownloadArtifact = Readonly<{
  readable: Readable;
  size: number;
  start: number;
  end: number;
}>;

export type ArtifactContentType =
  | "application/pdf"
  | "image/webp"
  | "application/vnd.microsoft.portable-executable"
  | "application/x-msi"
  | "application/zip"
  | "application/x-apple-diskimage"
  | "application/vnd.apple.installer+xml";

type ArtifactResponseInput = Readonly<{
  request: Request;
  artifact: OpenedDownloadArtifact;
  filename: string;
}> &
  (
    | Readonly<{
        contentType: "image/webp";
        expectedByteSize?: never;
      }>
    | Readonly<{
        contentType: Exclude<ArtifactContentType, "image/webp">;
        expectedByteSize: number;
      }>
  );

const NO_STORE = "no-store";

export function parseSingleByteRange(
  value: string | null,
  size: number,
): { start: number; end: number } | null | "invalid" {
  if (value === null) return null;
  if (!Number.isSafeInteger(size) || size < 1) return "invalid";
  const match = /^bytes=(\d*)-(\d*)$/iu.exec(value.trim());
  if (!match || (match[1] === "" && match[2] === "")) return "invalid";
  if (match[1] === "") {
    const suffix = BigInt(match[2]);
    if (suffix < 1n) return "invalid";
    const bounded = suffix > BigInt(size) ? size : Number(suffix);
    return { start: size - bounded, end: size - 1 };
  }
  const startValue = BigInt(match[1]);
  if (startValue >= BigInt(size)) return "invalid";
  const start = Number(startValue);
  const endValue = match[2] === "" ? BigInt(size - 1) : BigInt(match[2]);
  const end = endValue >= BigInt(size) ? size - 1 : Number(endValue);
  if (end < start || start < 0) return "invalid";
  return { start, end };
}

function contentDisposition(filename: string) {
  const fallback =
    filename
      .replaceAll(/[\\"\r\n]/gu, "_")
      .replaceAll(/[^\x20-\x7e]/gu, "_")
      .slice(0, 150) || "download";
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/gu,
    (character) => `%${character.codePointAt(0)!.toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function errorResponse(request: Request) {
  const candidate = request.headers.get("x-request-id");
  const requestId =
    candidate !== null && /^[A-Za-z0-9_-]{1,128}$/u.test(candidate)
      ? candidate
      : randomUUID();
  return Response.json(
    { version: "1", requestId, error: { code: "internal_error" } },
    {
      status: 500,
      headers: {
        "Cache-Control": NO_STORE,
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export function artifactResponse(input: ArtifactResponseInput): Response {
  if (
    "expectedByteSize" in input &&
    input.artifact.size !== input.expectedByteSize
  ) {
    input.artifact.readable.destroy();
    return errorResponse(input.request);
  }
  const parsed = parseSingleByteRange(
    input.request.method === "GET" ? input.request.headers.get("range") : null,
    input.artifact.size,
  );
  if (parsed === "invalid") {
    input.artifact.readable.destroy();
    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Cache-Control": NO_STORE,
        "Content-Range": `bytes */${input.artifact.size}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const start = parsed?.start ?? input.artifact.start;
  const end = parsed?.end ?? input.artifact.end;
  const partial = parsed !== null;
  if (
    !Number.isSafeInteger(input.artifact.start) ||
    !Number.isSafeInteger(input.artifact.end) ||
    (parsed === null &&
      (input.artifact.start !== 0 ||
        input.artifact.end !== input.artifact.size - 1)) ||
    input.artifact.start !== start ||
    input.artifact.end !== end
  ) {
    input.artifact.readable.destroy();
    return errorResponse(input.request);
  }
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": NO_STORE,
    "Content-Disposition": contentDisposition(input.filename),
    "Content-Length": String(end - start + 1),
    "Content-Type": input.contentType,
    "X-Content-Type-Options": "nosniff",
  });
  if (partial)
    headers.set(
      "Content-Range",
      `bytes ${start}-${end}/${input.artifact.size}`,
    );
  if (input.request.method === "HEAD") {
    input.artifact.readable.destroy();
    return new Response(null, { status: partial ? 206 : 200, headers });
  }
  return new Response(
    Readable.toWeb(input.artifact.readable) as ReadableStream,
    { status: partial ? 206 : 200, headers },
  );
}
