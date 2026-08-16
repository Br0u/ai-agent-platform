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
        filename: "产品介绍.pdf",
        revisionId: "11111111-1111-4111-8111-111111111111",
      };
    },
  ),
}));

vi.mock("@/server/downloads/service", () => ({
  downloadResourceService: { getPublicArtifact: wiring.artifact },
}));

import { GET, HEAD } from "./route";

const context = { params: Promise.resolve({ resourceKey: "yuanqi-intro" }) };

describe("public download preview", () => {
  beforeEach(() => wiring.artifact.mockClear());

  it("serves inline PDF with no-store, UTF-8 filename, and Range", async () => {
    const ranged = await GET(
      new Request("https://example.test", {
        headers: { range: "bytes=-3" },
      }),
      context,
    );
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-type")).toBe("application/pdf");
    expect(ranged.headers.get("content-disposition")).toContain("inline");
    expect(ranged.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''%E4%BA%A7%E5%93%81%E4%BB%8B%E7%BB%8D.pdf",
    );
    expect(ranged.headers.get("cache-control")).toBe("no-store");
    expect(ranged.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(ranged.text()).resolves.toBe("789");
    expect(wiring.artifact).toHaveBeenLastCalledWith(
      "yuanqi-intro",
      "preview",
      { start: 7, end: 9 },
    );
    expect(wiring.artifact).toHaveBeenCalledTimes(2);
  });

  it.each(["bytes=2-4", "bytes=8-2"])(
    "ignores %s on HEAD and matches ordinary GET headers",
    async (range) => {
      const get = await GET(new Request("https://example.test"), context);
      wiring.artifact.mockClear();
      const head = await HEAD(
        new Request("https://example.test", {
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

  it("returns the same safe 404 for malformed, denied, missing, or failed resources", async () => {
    const malformed = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ resourceKey: "INVALID_KEY" }),
    });
    expect(malformed.status).toBe(404);
    expect(wiring.artifact).not.toHaveBeenCalled();
    for (const outcome of [null, new Error("private state")] as const) {
      if (outcome instanceof Error)
        wiring.artifact.mockRejectedValueOnce(outcome);
      else wiring.artifact.mockResolvedValueOnce(outcome as never);
      const response = await GET(new Request("https://example.test"), context);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });

  it("returns 416 with no bytes for malformed ranges", async () => {
    const response = await GET(
      new Request("https://example.test", {
        headers: { range: "bytes=999-1000" },
      }),
      context,
    );
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */10");
    expect(wiring.artifact).toHaveBeenCalledOnce();
  });
});
