import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { routeRegistry } from "@/config/routes";

import { createCustomerSessionHandler } from "./route";

const safeDto = {
  realm: "customer" as const,
  status: "active" as const,
  displayName: "Alice",
  emailVerificationStatus: "verified" as const,
  organization: {
    legalName: "Acme Corp",
    status: "active" as const,
    role: "owner" as const,
  },
};

function request(cookie?: string) {
  return new Request("http://localhost/api/v1/session/customer", {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("GET /api/v1/session/customer", () => {
  it.each([
    undefined,
    "aap_staff_session=staff-token",
    "not_aap_customer_session=wrong",
    "aap_customer_session_extra=wrong",
  ])(
    "returns a stable 401 without an exact customer cookie: %s",
    async (cookie) => {
      const load = vi.fn().mockResolvedValue(safeDto);
      const GET = createCustomerSessionHandler(load);

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
    },
  );

  it("uses only the customer loader and returns a safe no-store DTO", async () => {
    const load = vi.fn().mockResolvedValue(safeDto);
    const GET = createCustomerSessionHandler(load);
    const response = await GET(
      request("aap_staff_session=ignored; aap_customer_session=customer-token"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(load).toHaveBeenCalledOnce();
    expect(load.mock.calls[0]?.[0]).toBeInstanceOf(Headers);
    const body = await response.json();
    expect(body).toEqual(safeDto);
    expect(JSON.stringify(body)).not.toMatch(
      /token|password|sessionId|userId/i,
    );
  });
});

describe("private Better Auth boundary", () => {
  it("has no public /api/auth handler or generic auth route", () => {
    const appRoot = resolve(process.cwd(), "src/app");
    const publicAuthRoot = resolve(appRoot, "api/auth");
    expect(existsSync(publicAuthRoot)).toBe(false);
    expect(
      routeRegistry.some((route) => route.path.startsWith("/api/auth")),
    ).toBe(false);

    const routeFiles: string[] = [];
    const productionSourceFiles: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/^route\.(?:ts|tsx|js|jsx|mjs|cjs)$/u.test(entry.name)) {
          routeFiles.push(path);
        }
        if (
          !entry.isDirectory() &&
          /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u.test(entry.name) &&
          !/\.test\./u.test(entry.name)
        ) {
          productionSourceFiles.push(path);
        }
      }
    };
    walk(appRoot);

    expect(routeFiles.every((path) => !path.includes("/api/auth/"))).toBe(true);
    // Defense-in-depth regression scan; security review remains mandatory.
    for (const path of productionSourceFiles) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/\btoNextJsHandler\b/);
      expect(source, path).not.toMatch(/\.handler\b/);
      expect(source, path).not.toMatch(
        /from\s+["'][^"']*\/server\/auth\/(?:customer-auth|staff-auth)["']/,
      );
      expect(source, path).not.toMatch(/\b(?:getCustomerAuth|getStaffAuth)\b/);
    }
  });
});
