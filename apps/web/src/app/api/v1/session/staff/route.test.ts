import { describe, expect, it, vi } from "vitest";

import { createStaffSessionHandler } from "./route";

const safeDto = {
  realm: "workforce" as const,
  status: "active" as const,
  displayName: "Staff",
  mustChangePassword: false,
  twoFactorEnabled: true,
  permissions: ["admin:users", "support:tickets"],
};

function request(cookie?: string) {
  return new Request("http://localhost/api/v1/session/staff", {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("GET /api/v1/session/staff", () => {
  it.each([
    undefined,
    "aap_customer_session=customer-token",
    "not_aap_staff_session=wrong",
    "aap_staff_session_extra=wrong",
  ])("returns 401 and ignores the other realm cookie: %s", async (cookie) => {
    const load = vi.fn().mockResolvedValue(safeDto);
    const GET = createStaffSessionHandler(load);
    const response = await GET(request(cookie));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTH_SESSION_REQUIRED",
        message: "Authentication required",
      },
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("uses only the staff loader and returns stable sorted permissions", async () => {
    const load = vi.fn().mockResolvedValue(safeDto);
    const GET = createStaffSessionHandler(load);
    const response = await GET(
      request("aap_customer_session=ignored; aap_staff_session=staff-token"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(load).toHaveBeenCalledOnce();
    const body = await response.json();
    expect(body).toEqual(safeDto);
    expect(JSON.stringify(body)).not.toMatch(
      /token|passwordHash|sessionId|userId|totpSecret/i,
    );
  });
});
