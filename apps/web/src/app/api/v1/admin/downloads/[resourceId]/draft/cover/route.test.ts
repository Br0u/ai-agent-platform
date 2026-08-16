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
  artifact: vi.fn(async () => ({
    readable: Readable.from([Buffer.from("cover")]),
    size: 5,
    start: 0,
    end: 4,
  })),
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

describe("admin draft cover", () => {
  beforeEach(() => {
    wiring.allow.mockReset();
    wiring.allow.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
    });
    wiring.artifact.mockClear();
  });

  it("serves the current draft cover inline without cache", async () => {
    const response = await GET(new Request("https://example.test"), valid);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.text()).resolves.toBe("cover");
  });

  it("serves HEAD and maps missing or unauthorized drafts", async () => {
    const head = await HEAD(
      new Request("https://example.test", { method: "HEAD" }),
      valid,
    );
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    wiring.artifact.mockResolvedValueOnce(null as never);
    expect((await GET(new Request("https://example.test"), valid)).status).toBe(
      404,
    );
    wiring.allow.mockRejectedValueOnce(new wiring.AuthAccessError(401));
    expect((await GET(new Request("https://example.test"), valid)).status).toBe(
      401,
    );
    wiring.allow.mockRejectedValueOnce(new wiring.AuthAccessError(403));
    expect((await GET(new Request("https://example.test"), valid)).status).toBe(
      403,
    );
  });
});
