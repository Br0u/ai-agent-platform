import { describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";

import { createReadinessHandler } from "./handler";

describe("GET /api/health/ready", () => {
  it("exports only the supported route handler surface", () => {
    const source = readFileSync("src/app/api/health/ready/route.ts", "utf8");

    expect(source).not.toMatch(/export function createReadinessHandler/u);
  });

  it("returns 200 when the database probe succeeds", async () => {
    const GET = createReadinessHandler(vi.fn().mockResolvedValue(undefined));
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      database: "up",
    });
  });

  it("returns 503 without leaking connection details", async () => {
    const GET = createReadinessHandler(
      vi.fn().mockRejectedValue(new Error("password secret")),
    );
    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "not_ready",
      database: "down",
      errorCode: "DATABASE_UNAVAILABLE",
    });
  });
});
