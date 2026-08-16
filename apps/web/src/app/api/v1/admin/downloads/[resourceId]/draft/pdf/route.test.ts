import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

const wiring = vi.hoisted(() => ({
  allow: vi.fn(async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
  })),
  artifact: vi.fn(
    async (
      _id: string,
      _kind: string,
      range?: { start: number; end: number },
    ) => ({
      readable: Readable.from([
        Buffer.from(
          "0123456789".slice(range?.start ?? 0, (range?.end ?? 9) + 1),
        ),
      ]),
      size: 10,
      start: range?.start ?? 0,
      end: range?.end ?? 9,
    }),
  ),
}));

vi.mock("@/server/auth/access", () => ({
  AuthAccessError: class AuthAccessError extends Error {
    status = 403 as const;
  },
  requirePermission: wiring.allow,
}));
vi.mock("@/server/downloads/service", () => ({
  downloadResourceService: { getAdminDraftArtifact: wiring.artifact },
}));

import { GET } from "./route";

describe("admin draft PDF", () => {
  it("exports GET", () => {
    expect(GET).toBeTypeOf("function");
  });

  it("resolves only the current draft artifact and reopens a valid range", async () => {
    const response = await GET(
      new Request("https://example.test", { headers: { range: "bytes=2-4" } }),
      {
        params: Promise.resolve({
          resourceId: "11111111-1111-4111-8111-111111111111",
        }),
      },
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("234");
    expect(wiring.artifact).toHaveBeenLastCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "pdf",
      { start: 2, end: 4 },
    );
  });
});
