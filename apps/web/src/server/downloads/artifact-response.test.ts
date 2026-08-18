import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { artifactResponse } from "./artifact-response";

function artifact(start = 0, end = 9) {
  const readable = Readable.from([
    Buffer.from("0123456789".slice(start, end + 1)),
  ]);
  return { readable, size: 10, start, end };
}

describe("artifact download response", () => {
  it("streams an installer as a no-store attachment with an RFC filename", async () => {
    const response = artifactResponse({
      request: new Request("https://example.test/file", {
        headers: { range: "bytes=0-4" },
      }),
      artifact: artifact(0, 4),
      contentType: "application/x-msi",
      expectedByteSize: 10,
      filename: "安装 程序.msi",
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-4/10");
    expect(response.headers.get("content-type")).toBe("application/x-msi");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toContain(
      "attachment; filename=\"__ __.msi\"; filename*=UTF-8''%E5%AE%89%E8%A3%85%20%E7%A8%8B%E5%BA%8F.msi",
    );
    await expect(response.text()).resolves.toBe("01234");
  });

  it("preserves GET, HEAD, and invalid Range handling without buffering", () => {
    const head = artifact();
    const headDestroy = vi.spyOn(head.readable, "destroy");
    const headResponse = artifactResponse({
      request: new Request("https://example.test/file", {
        method: "HEAD",
        headers: { range: "bytes=0-4" },
      }),
      artifact: head,
      contentType: "application/pdf",
      expectedByteSize: 10,
      filename: "资料.pdf",
    });
    expect(headResponse.status).toBe(200);
    expect(headResponse.body).toBeNull();
    expect(headDestroy).toHaveBeenCalledOnce();

    const invalid = artifact();
    const invalidDestroy = vi.spyOn(invalid.readable, "destroy");
    const invalidResponse = artifactResponse({
      request: new Request("https://example.test/file", {
        headers: { range: "bytes=0-1,2-3" },
      }),
      artifact: invalid,
      contentType: "application/zip",
      expectedByteSize: 10,
      filename: "client.zip",
    });
    expect(invalidResponse.status).toBe(416);
    expect(invalidDestroy).toHaveBeenCalledOnce();
  });

  it("rejects a primary artifact whose opened size differs from its metadata", () => {
    const mismatched = artifact();
    const destroy = vi.spyOn(mismatched.readable, "destroy");

    const response = artifactResponse({
      request: new Request("https://example.test/file"),
      artifact: mismatched,
      contentType: "application/vnd.apple.installer+xml",
      expectedByteSize: 9,
      filename: "client.pkg",
    });

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(destroy).toHaveBeenCalledOnce();
  });
});
