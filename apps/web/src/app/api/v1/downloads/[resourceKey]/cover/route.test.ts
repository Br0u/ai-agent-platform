import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

const REVISION = "11111111-1111-4111-8111-111111111111";
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
        filename: "元启产品彩页.webp",
        revisionId: REVISION,
      };
    },
  ),
}));

vi.mock("@/server/downloads/service", () => ({
  downloadResourceService: { openPublishedArtifact: wiring.artifact },
}));

import { GET, HEAD } from "./route";

const context = {
  params: Promise.resolve({ resourceKey: "yuanqi-brochure" }),
};

describe("public download cover", () => {
  beforeEach(() => wiring.artifact.mockClear());

  it("serves only the requested current revision with immutable caching", async () => {
    const response = await GET(
      new Request(`https://example.test?revision=${REVISION}`),
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("content-disposition")).toContain("inline");
    expect(response.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''%E5%85%83%E5%90%AF%E4%BA%A7%E5%93%81%E5%BD%A9%E9%A1%B5.webp",
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(wiring.artifact).toHaveBeenCalledWith(
      "yuanqi-brochure",
      "document",
      undefined,
      "cover",
      REVISION,
    );
  });

  it("re-resolves the current pointer before opening a byte range", async () => {
    const response = await GET(
      new Request(`https://example.test?revision=${REVISION}`, {
        headers: { range: "bytes=2-4" },
      }),
      context,
    );
    expect(response.status).toBe(206);
    await expect(response.text()).resolves.toBe("234");
    expect(wiring.artifact).toHaveBeenLastCalledWith(
      "yuanqi-brochure",
      "document",
      { start: 2, end: 4 },
      "cover",
      REVISION,
    );
    expect(wiring.artifact).toHaveBeenCalledTimes(2);
  });

  it.each(["bytes=2-4", "bytes=8-2"])(
    "ignores %s on HEAD and matches ordinary GET headers",
    async (range) => {
      const get = await GET(
        new Request(`https://example.test?revision=${REVISION}`),
        context,
      );
      wiring.artifact.mockClear();
      const head = await HEAD(
        new Request(`https://example.test?revision=${REVISION}`, {
          method: "HEAD",
          headers: { range },
        }),
        context,
      );
      expect(get.status).toBe(200);
      expect(head.status).toBe(200);
      expect(head.body).toBeNull();
      for (const header of [
        "content-type",
        "content-length",
        "content-disposition",
        "accept-ranges",
        "cache-control",
      ])
        expect(head.headers.get(header), header).toBe(get.headers.get(header));
      expect(wiring.artifact).toHaveBeenCalledOnce();
    },
  );

  it("rejects invalid GET ranges without reopening", async () => {
    wiring.artifact.mockClear();
    const invalid = await GET(
      new Request(`https://example.test?revision=${REVISION}`, {
        headers: { range: "bytes=0-1,3-4" },
      }),
      context,
    );
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("x-content-type-options")).toBe("nosniff");
    expect(wiring.artifact).toHaveBeenCalledOnce();
  });

  it.each([
    ["malformed key", { resourceKey: "../secret" }, REVISION],
    ["missing revision", { resourceKey: "yuanqi-brochure" }, null],
    ["malformed revision", { resourceKey: "yuanqi-brochure" }, "latest"],
  ])("returns a safe 404 for %s", async (_name, params, revision) => {
    const url = revision
      ? `https://example.test?revision=${revision}`
      : "https://example.test";
    const response = await GET(new Request(url), {
      params: Promise.resolve(params),
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "not_found" },
    });
    expect(wiring.artifact).not.toHaveBeenCalled();
  });

  it("maps missing, invalid, cleanup-hidden, and filesystem failures to the same safe 404", async () => {
    for (const outcome of [null, new Error("ENOENT")] as const) {
      if (outcome instanceof Error)
        wiring.artifact.mockRejectedValueOnce(outcome);
      else wiring.artifact.mockResolvedValueOnce(outcome as never);
      const response = await GET(
        new Request(`https://example.test?revision=${REVISION}`),
        context,
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "not_found" },
      });
    }
  });
});
