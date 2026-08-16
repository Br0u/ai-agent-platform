import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

const wiring = vi.hoisted(() => ({
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
  AuthAccessError: class AuthAccessError extends Error {
    status = 403 as const;
  },
  requirePermission: wiring.allow,
}));
vi.mock("@/server/downloads/service", () => ({
  downloadResourceService: { getAdminDraftArtifact: wiring.artifact },
}));

import { GET } from "./route";

describe("admin draft cover", () => {
  it("exports GET", () => {
    expect(GET).toBeTypeOf("function");
  });

  it("serves the current draft cover inline without cache", async () => {
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({
        resourceId: "11111111-1111-4111-8111-111111111111",
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("cover");
    expect(wiring.artifact).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "cover",
    );
  });
});
