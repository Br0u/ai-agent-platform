import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

const wiring = vi.hoisted(() => ({
  artifact: vi.fn(
    async (
      _key: string,
      _kind: string,
      range?: { start: number; end: number },
    ) => {
      const content = "0123456789";
      const start = range?.start ?? 0;
      const end = range?.end ?? content.length - 1;
      return {
        readable: Readable.from([Buffer.from(content.slice(start, end + 1))]),
        size: content.length,
        start,
        end,
        filename: "元启产品彩页.pdf",
        revisionId: "11111111-1111-4111-8111-111111111111",
      };
    },
  ),
}));

vi.mock("@/server/downloads/service", () => ({
  downloadResourceService: { getPublicArtifact: wiring.artifact },
}));

import { GET, HEAD } from "./route";

const context = {
  params: Promise.resolve({ resourceKey: "yuanqi-brochure" }),
};

describe("public resource download", () => {
  beforeEach(() => wiring.artifact.mockClear());

  it("serves an attachment with UTF-8 filename, no-store, HEAD, and Range", async () => {
    const response = await GET(
      new Request("https://example.test", {
        headers: { range: "bytes=2-4" },
      }),
      context,
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''%E5%85%83%E5%90%AF%E4%BA%A7%E5%93%81%E5%BD%A9%E9%A1%B5.pdf",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.text()).resolves.toBe("234");
    expect(wiring.artifact).toHaveBeenLastCalledWith(
      "yuanqi-brochure",
      "download",
      { start: 2, end: 4 },
    );
    expect(wiring.artifact).toHaveBeenCalledTimes(2);

    const head = await HEAD(
      new Request("https://example.test", { method: "HEAD" }),
      context,
    );
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
  });

  it("does not expose bytes for malformed, contact-only, absent, or failed resources", async () => {
    const malformed = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ resourceKey: "yuanqi/brochure" }),
    });
    expect(malformed.status).toBe(404);
    expect(wiring.artifact).not.toHaveBeenCalled();
    for (const outcome of [null, new Error("ENOENT")] as const) {
      if (outcome instanceof Error)
        wiring.artifact.mockRejectedValueOnce(outcome);
      else wiring.artifact.mockResolvedValueOnce(outcome as never);
      const response = await GET(new Request("https://example.test"), context);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
    }
  });

  it("returns 416 with no artifact bytes for malformed ranges", async () => {
    const response = await GET(
      new Request("https://example.test", {
        headers: { range: "bytes=4-2" },
      }),
      context,
    );
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */10");
    expect(wiring.artifact).toHaveBeenCalledOnce();
  });
});
