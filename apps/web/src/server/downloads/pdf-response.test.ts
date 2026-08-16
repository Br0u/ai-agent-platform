import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { artifactResponse, parseSingleByteRange } from "./pdf-response";

function artifact(start = 0, end = 9) {
  const readable = Readable.from([
    Buffer.from("0123456789".slice(start, end + 1)),
  ]);
  return { readable, size: 10, start, end };
}

describe("PDF response", () => {
  it("parses a single byte range", () => {
    expect(parseSingleByteRange("bytes=0-9", 10)).toEqual({ start: 0, end: 9 });
  });

  it("supports suffix ranges and rejects multiple or invalid ranges", () => {
    expect(parseSingleByteRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseSingleByteRange("BYTES=-999999999999999999999", 10)).toEqual({
      start: 0,
      end: 9,
    });
    expect(parseSingleByteRange("bytes=2-999999999999999999999", 10)).toEqual({
      start: 2,
      end: 9,
    });
    expect(parseSingleByteRange("bytes=0-1,3-4", 10)).toBe("invalid");
    expect(parseSingleByteRange("bytes=10-11", 10)).toBe("invalid");
  });

  it("creates a no-store inline partial response with RFC filename encoding", async () => {
    const response = artifactResponse({
      request: new Request("https://example.test/file", {
        headers: { range: "bytes=0-4" },
      }),
      artifact: artifact(0, 4),
      contentType: "application/pdf",
      filename: "资料.pdf",
      disposition: "inline",
      noStore: true,
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-4/10");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''%E8%B5%84%E6%96%99.pdf",
    );
    await expect(response.text()).resolves.toBe("01234");
  });

  it("closes the stream for invalid ranges and HEAD", () => {
    const invalid = artifact();
    const invalidDestroy = vi.spyOn(invalid.readable, "destroy");
    expect(
      artifactResponse({
        request: new Request("https://example.test/file", {
          headers: { range: "bytes=0-1,2-3" },
        }),
        artifact: invalid,
        contentType: "application/pdf",
        filename: "x.pdf",
        disposition: "inline",
      }).status,
    ).toBe(416);
    expect(
      artifactResponse({
        request: new Request("https://example.test/file", {
          headers: { range: "bytes=0-1,2-3" },
        }),
        artifact: artifact(),
        contentType: "application/pdf",
        filename: "x.pdf",
        disposition: "inline",
        noStore: true,
      }).headers.get("x-content-type-options"),
    ).toBe("nosniff");
    expect(invalidDestroy).toHaveBeenCalled();
    const head = artifact();
    const headDestroy = vi.spyOn(head.readable, "destroy");
    expect(
      artifactResponse({
        request: new Request("https://example.test/file", { method: "HEAD" }),
        artifact: head,
        contentType: "application/pdf",
        filename: "x.pdf",
        disposition: "inline",
      }).status,
    ).toBe(200);
    expect(headDestroy).toHaveBeenCalled();
  });

  it("fails closed when the opened stream does not match the requested range", () => {
    const mismatched = artifact();
    const destroy = vi.spyOn(mismatched.readable, "destroy");
    const response = artifactResponse({
      request: new Request("https://example.test/file", {
        headers: { range: "bytes=2-4" },
      }),
      artifact: mismatched,
      contentType: "application/pdf",
      filename: "x.pdf",
      disposition: "attachment",
      noStore: true,
    });
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(destroy).toHaveBeenCalled();
  });

  it("fails closed for a non-full artifact without a Range request", () => {
    const partial = artifact(2, 4);
    const destroy = vi.spyOn(partial.readable, "destroy");
    expect(
      artifactResponse({
        request: new Request("https://example.test/file"),
        artifact: partial,
        contentType: "application/pdf",
        filename: "x.pdf",
        disposition: "attachment",
      }).status,
    ).toBe(500);
    expect(destroy).toHaveBeenCalled();
  });
});
