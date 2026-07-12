import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { assertE2EEnvironment, fixtureIdentities } from "./seed-auth-e2e";
import { recoveryCodeDigest, verifyAtRestState } from "./assert-auth-at-rest";

describe("test-only auth E2E tools", () => {
  it("binds credential account text and user UUID as distinct PostgreSQL parameters", () => {
    const source = readFileSync(
      new URL("./seed-auth-e2e.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      "VALUES (gen_random_uuid(), $1, 'credential', $2::uuid, $3)",
    );
  });
  it("refuses production and missing fixture credentials", () => {
    expect(() => assertE2EEnvironment({ NODE_ENV: "production" })).toThrow(
      "test-only",
    );
    expect(() => assertE2EEnvironment({ NODE_ENV: "test" })).toThrow(
      "E2E_CUSTOMER_PASSWORD",
    );
  });

  it("builds deterministic fixtures without exposing passwords in identities", () => {
    const env = {
      NODE_ENV: "test",
      E2E_CUSTOMER_PASSWORD: "customer-long-passphrase",
      E2E_STAFF_PASSWORD: "staff-long-passphrase",
      E2E_ADMIN_PASSWORD: "admin-long-passphrase",
    };
    const credentials = assertE2EEnvironment(env);
    expect(fixtureIdentities).toMatchObject({
      customer: { realm: "customer", status: "active" },
      staff: { realm: "workforce", status: "active" },
      admin: {
        realm: "workforce",
        status: "active",
        sessionToken: "e2e-admin-session",
      },
    });
    expect(JSON.stringify(fixtureIdentities)).not.toContain(
      credentials.customerPassword,
    );
  });

  it("converges only fixture-owned security and membership state", () => {
    const source = readFileSync(
      new URL("./seed-auth-e2e.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      "DELETE FROM two_factors WHERE user_id = ANY($1::uuid[])",
    );
    expect(source).toContain("DELETE FROM user_roles WHERE user_id = $1");
    expect(source).toContain(
      "DELETE FROM organization_memberships WHERE user_id = ANY($1::uuid[])",
    );
    expect(source).toMatch(
      /ON CONFLICT \(token\) DO UPDATE SET[\s\S]*user_id = EXCLUDED\.user_id[\s\S]*realm = EXCLUDED\.realm[\s\S]*ip_address = EXCLUDED\.ip_address[\s\S]*user_agent = EXCLUDED\.user_agent/,
    );
    expect(source).not.toContain("DELETE FROM user_roles;");
    expect(source).not.toContain("DELETE FROM organization_memberships;");
  });

  it("asserts hashed presence and consumed state without accepting plaintext", () => {
    const code = "ABCDE-FGHIJ-KLMNO-PQRST";
    const hash = recoveryCodeDigest(code);
    expect(hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      verifyAtRestState(
        "--expect-present-hashed",
        code,
        JSON.stringify([hash]),
        false,
      ),
    ).toBe(true);
    expect(() =>
      verifyAtRestState(
        "--expect-present-hashed",
        code,
        JSON.stringify([code]),
        false,
      ),
    ).toThrow("plaintext");
    expect(verifyAtRestState("--expect-consumed", code, "[]", false)).toBe(
      true,
    );
    expect(() =>
      verifyAtRestState(
        "--expect-consumed",
        code,
        JSON.stringify([hash]),
        false,
      ),
    ).toThrow("still exists");
    expect(() =>
      verifyAtRestState("--expect-consumed", code, "[]", true),
    ).toThrow("revoked fixture session");
  });
});
