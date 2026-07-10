import { describe, expect, it, vi } from "vitest";

import { getLiveness, getReadiness } from "./health";

describe("health behavior", () => {
  it("reports liveness without touching the database", () => {
    const probe = vi.fn();

    expect(getLiveness()).toEqual({ status: "ok" });
    expect(probe).not.toHaveBeenCalled();
  });

  it("reports readiness after a successful database probe", async () => {
    const probe = vi.fn().mockResolvedValue(undefined);

    await expect(getReadiness(probe)).resolves.toEqual({
      status: "ready",
      database: "up",
    });
    expect(probe).toHaveBeenCalledOnce();
  });

  it("returns a stable unavailable result when the database probe fails", async () => {
    const probe = vi.fn().mockRejectedValue(new Error("connection refused"));

    await expect(getReadiness(probe)).resolves.toEqual({
      status: "not_ready",
      database: "down",
      errorCode: "DATABASE_UNAVAILABLE",
    });
  });
});
