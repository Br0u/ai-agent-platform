import { cancelUnreadRequestBody } from "./cancel-request-body";

export type JsonReadResult = { ok: true; value: unknown } | { ok: false };

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reason: unknown,
): Promise<void> {
  try {
    await reader.cancel(reason);
  } catch {
    // Cleanup must never replace the read or validation failure.
  }
}

export async function readBoundedJson(
  request: Request,
  maximumBytes: number,
): Promise<JsonReadResult> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    /^\d+$/u.test(contentLength) &&
    Number(contentLength) > maximumBytes
  ) {
    await cancelUnreadRequestBody(request);
    return { ok: false };
  }

  if (!request.body) return { ok: false };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await cancelReader(reader, new Error("JSON body is too large"));
        return { ok: false };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      ok: true,
      value: JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      ),
    };
  } catch (error) {
    await cancelReader(reader, error);
    return { ok: false };
  } finally {
    chunks.length = 0;
    try {
      reader.releaseLock();
    } catch {
      // Cleanup only.
    }
  }
}
