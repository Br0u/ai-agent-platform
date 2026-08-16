import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

const wiring = vi.hoisted(() => ({
  AuthAccessError: class AuthAccessError extends Error {
    constructor(readonly status: 401 | 403) {
      super("access");
    }
  },
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
  AuthAccessError: wiring.AuthAccessError,
  requirePermission: wiring.allow,
}));
vi.mock("@/server/downloads/service", () => ({
  downloadResourceService: { getAdminDraftArtifact: wiring.artifact },
}));

import { GET, HEAD } from "./route";

const valid = {
  params: Promise.resolve({
    resourceId: "11111111-1111-4111-8111-111111111111",
  }),
};

describe("admin draft PDF", () => {
  beforeEach(() => {
    wiring.allow.mockReset();
    wiring.allow.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
    });
    wiring.artifact.mockClear();
  });

  it("resolves only the current draft artifact and reopens a valid range", async () => {
    const response = await GET(
      new Request("https://example.test", { headers: { range: "bytes=2-4" } }),
      valid,
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.text()).resolves.toBe("234");
    expect(wiring.artifact).toHaveBeenLastCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "pdf",
      { start: 2, end: 4 },
    );
  });

  it("returns 416 no-store for multiple ranges and supports HEAD", async () => {
    const invalid = await GET(
      new Request("https://example.test", {
        headers: { range: "bytes=0-1,2-3" },
      }),
      valid,
    );
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("content-range")).toBe("bytes */10");
    expect(invalid.headers.get("x-content-type-options")).toBe("nosniff");
    const head = await HEAD(
      new Request("https://example.test", { method: "HEAD" }),
      valid,
    );
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
  });

  it.each([401, 403] as const)("maps workforce denial %s", async (status) => {
    wiring.allow.mockRejectedValueOnce(new wiring.AuthAccessError(status));
    const response = await GET(new Request("https://example.test"), valid);
    expect(response.status).toBe(status);
  });

  it("returns 404 for invalid, absent, or cleanup-hidden drafts", async () => {
    const malformed = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ resourceId: "not-a-revision-id" }),
    });
    expect(malformed.status).toBe(404);
    wiring.artifact.mockResolvedValueOnce(null as never);
    const absent = await GET(new Request("https://example.test"), valid);
    expect(absent.status).toBe(404);
  });
});
