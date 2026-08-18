import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

const wiring = vi.hoisted(() => ({
  artifact: vi.fn(
    async (
      _key: string,
      _slot: string,
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
        filename: "码里奥安装包.exe",
        mediaType: "application/vnd.microsoft.portable-executable" as const,
        extension: ".exe",
        byteSize: content.length,
      };
    },
  ),
}));

vi.mock("@/server/downloads/service", () => ({
  downloadResourceService: { openPublishedArtifact: wiring.artifact },
}));

import { GET, HEAD } from "./route";

const params = (slot: string) => ({
  params: Promise.resolve({ resourceKey: "mdd2-client", slot }),
});

describe("public installer download", () => {
  beforeEach(() => wiring.artifact.mockClear());

  it("serves Windows as an attachment with fixed MIME, safe filename, Range, and no-store", async () => {
    const response = await GET(
      new Request("https://example.test", { headers: { range: "bytes=2-4" } }),
      params("windows"),
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.microsoft.portable-executable",
    );
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.text()).resolves.toBe("234");
    expect(wiring.artifact).toHaveBeenLastCalledWith("mdd2-client", "windows", {
      start: 2,
      end: 4,
    });
  });

  it("supports macOS HEAD without opening a Range", async () => {
    const response = await HEAD(
      new Request("https://example.test", {
        method: "HEAD",
        headers: { range: "bytes=2-4" },
      }),
      params("macos"),
    );
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(wiring.artifact).toHaveBeenCalledWith("mdd2-client", "macos");
  });

  it.each(["document", "other"])(
    "returns 404 for unavailable slot %s",
    async (slot) => {
      const response = await GET(
        new Request("https://example.test"),
        params(slot),
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(wiring.artifact).not.toHaveBeenCalled();
    },
  );

  it.each([null, new Error("disk mismatch")])(
    "returns 404 for missing, unpublished, or invalid physical artifacts",
    async (outcome) => {
      if (outcome instanceof Error)
        wiring.artifact.mockRejectedValueOnce(outcome);
      else wiring.artifact.mockResolvedValueOnce(outcome as never);
      const response = await GET(
        new Request("https://example.test"),
        params("windows"),
      );
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "not_found" },
      });
    },
  );
});
