import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

export type OpenedDownloadArtifact = Readonly<{
  readable: Readable;
  size: number;
  start: number;
  end: number;
}>;

const NO_STORE = "no-store";

export function parseSingleByteRange(
  value: string | null,
  size: number,
): { start: number; end: number } | null | "invalid" {
  if (value === null) return null;
  if (!Number.isSafeInteger(size) || size < 1) return "invalid";
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim());
  if (!match || (match[1] === "" && match[2] === "")) return "invalid";
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return "invalid";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] === "" ? size - 1 : Number(match[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  )
    return "invalid";
  return { start, end: Math.min(end, size - 1) };
}

function contentDisposition(
  disposition: "inline" | "attachment",
  filename: string,
) {
  const fallback =
    filename
      .replaceAll(/[\\"\r\n]/gu, "_")
      .replaceAll(/[^\x20-\x7e]/gu, "_")
      .slice(0, 150) || "download";
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/gu,
    (character) => `%${character.codePointAt(0)!.toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function artifactErrorResponse(
  request: Request,
  status: number,
  code: string,
): Response {
  const candidate = request.headers.get("x-request-id");
  const requestId =
    candidate !== null && /^[A-Za-z0-9_-]{1,128}$/u.test(candidate)
      ? candidate
      : randomUUID();
  return Response.json(
    { version: "1", requestId, error: { code } },
    { status, headers: { "Cache-Control": NO_STORE } },
  );
}

export function artifactResponse(input: {
  request: Request;
  artifact: OpenedDownloadArtifact;
  contentType: "application/pdf" | "image/webp";
  filename: string;
  disposition: "inline" | "attachment";
  noStore?: boolean;
}): Response {
  const parsed = parseSingleByteRange(
    input.request.headers.get("range"),
    input.artifact.size,
  );
  if (parsed === "invalid") {
    input.artifact.readable.destroy();
    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${input.artifact.size}`,
        ...(input.noStore ? { "Cache-Control": NO_STORE } : {}),
      },
    });
  }
  const start = parsed?.start ?? input.artifact.start;
  const end = parsed?.end ?? input.artifact.end;
  const partial = parsed !== null;
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Disposition": contentDisposition(
      input.disposition,
      input.filename,
    ),
    "Content-Length": String(end - start + 1),
    "Content-Type": input.contentType,
    "X-Content-Type-Options": "nosniff",
    ...(input.noStore ? { "Cache-Control": NO_STORE } : {}),
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
    {
      status: partial ? 206 : 200,
      headers,
    },
  );
}
