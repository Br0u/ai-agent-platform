import { describe, expect, it, vi } from "vitest";

import { readBoundedJson } from "./read-bounded-json";

function streamRequest(
  body: ReadableStream<Uint8Array>,
  contentLength?: string,
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (contentLength !== undefined) headers.set("content-length", contentLength);
  return new Request("https://admin.example.test/json", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("bounded JSON reader", () => {
  it("fully consumes valid JSON, releases the lock, and does not cancel", async () => {
    const cancel = vi.fn(async () => undefined);
    const bytes = new TextEncoder().encode('{"safe":true}');
    const request = streamRequest(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
        cancel,
      }),
    );

    await expect(readBoundedJson(request, 1024)).resolves.toEqual({
      ok: true,
      value: { safe: true },
    });
    expect(cancel).not.toHaveBeenCalled();
    expect(request.body?.locked).toBe(false);
  });

  it("cancels an unread body rejected by declared content length", async () => {
    const cancel = vi.fn(async () => undefined);
    const request = streamRequest(
      new ReadableStream<Uint8Array>({ pull() {}, cancel }),
      "9",
    );

    await expect(readBoundedJson(request, 8)).resolves.toEqual({ ok: false });
    expect(cancel).toHaveBeenCalledOnce();
    expect(request.body?.locked).toBe(false);
  });

  it("cancels a chunk overrun and releases its reader lock", async () => {
    const cancel = vi.fn(async () => undefined);
    const request = streamRequest(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(9));
        },
        cancel,
      }),
    );

    await expect(readBoundedJson(request, 8)).resolves.toEqual({ ok: false });
    expect(cancel).toHaveBeenCalledOnce();
    expect(request.body?.locked).toBe(false);
  });

  it("releases the reader and preserves failure when read and cancel both reject", async () => {
    const primary = new Error("private read failure");
    const reader = {
      read: vi.fn(async () => {
        throw primary;
      }),
      cancel: vi.fn(async () => {
        throw new Error("private cancel failure");
      }),
      releaseLock: vi.fn(),
    };
    const request = {
      headers: new Headers(),
      body: { getReader: () => reader },
    } as unknown as Request;

    await expect(readBoundedJson(request, 8)).resolves.toEqual({ ok: false });
    expect(reader.cancel).toHaveBeenCalledExactlyOnceWith(primary);
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });
});
