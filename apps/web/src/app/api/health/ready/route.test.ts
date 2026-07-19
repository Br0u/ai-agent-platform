import { afterEach, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";

import { createReadinessHandler } from "./handler";

const DATABASE_UNAVAILABLE = {
  status: "not_ready",
  database: "down",
  errorCode: "DATABASE_UNAVAILABLE",
} as const;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/health/ready", () => {
  it("exports only the supported route handler surface", () => {
    const source = readFileSync("src/app/api/health/ready/route.ts", "utf8");

    expect(source).not.toMatch(/export function createReadinessHandler/u);
  });

  it("returns 200 when the database probe succeeds", async () => {
    const GET = createReadinessHandler(vi.fn().mockResolvedValue(undefined));
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
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
    await expect(response.json()).resolves.toEqual(DATABASE_UNAVAILABLE);
  });

  it("returns the fixed 503 response at the total readiness deadline", async () => {
    vi.useFakeTimers();
    const probe = vi.fn(() => new Promise<void>(() => undefined));
    const GET = createReadinessHandler(probe);
    let response: Response | undefined;
    void GET().then((value) => {
      response = value;
    });

    await vi.advanceTimersByTimeAsync(2_999);
    expect(response).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(response).toBeDefined();
    if (!response) throw new Error("readiness handler did not settle");
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(DATABASE_UNAVAILABLE);
    expect(probe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
