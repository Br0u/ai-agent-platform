import { describe, expect, expectTypeOf, it } from "vitest";

import {
  isAdminInputPolicySnapshot,
  parseAdminInputPolicySaveInput,
  type AdminInputPolicySaveInput,
  type AdminInputPolicySnapshot,
} from "./admin-input-policy-contract";

const snapshot = (): AdminInputPolicySnapshot => ({
  version: "1",
  revision: 2,
  termCount: 2,
  terms: ["example", "敏感"],
  updatedAt: "2026-08-12T01:02:03.000Z",
  canConfigure: true,
});

describe("Admin input policy contract", () => {
  it("accepts exact configurator and read-only snapshots", () => {
    expect(isAdminInputPolicySnapshot(snapshot())).toBe(true);
    expect(
      isAdminInputPolicySnapshot({
        version: "1",
        revision: 0,
        termCount: 0,
        updatedAt: null,
        canConfigure: false,
      }),
    ).toBe(true);
    expectTypeOf<AdminInputPolicySnapshot>().toMatchTypeOf<{
      terms?: string[];
    }>();
  });

  it.each([
    ["extra key", { ...snapshot(), source: "secret" }],
    ["negative revision", { ...snapshot(), revision: -1 }],
    ["non-string term", { ...snapshot(), terms: ["ok", 3] }],
    ["inconsistent count", { ...snapshot(), termCount: 1 }],
    ["terms without configure access", { ...snapshot(), canConfigure: false }],
    ["non-canonical date", { ...snapshot(), updatedAt: "2026-08-12" }],
  ])("rejects %s", (_label, value) => {
    expect(isAdminInputPolicySnapshot(value)).toBe(false);
  });

  it("rejects accessor and hostile snapshots without invoking them", () => {
    const getter = Object.defineProperty({}, "version", {
      enumerable: true,
      get: () => {
        throw new Error("must not run");
      },
    });
    expect(isAdminInputPolicySnapshot(getter)).toBe(false);
    expect(
      isAdminInputPolicySnapshot(
        Object.assign(Object.create({ version: "1" }), snapshot()),
      ),
    ).toBe(false);
  });

  it("parses only an exact bounded save input", () => {
    const input = parseAdminInputPolicySaveInput({
      source: "example\n敏感",
      expectedRevision: 2,
    });
    expect(input).toEqual({ source: "example\n敏感", expectedRevision: 2 });
    expectTypeOf(input).toEqualTypeOf<AdminInputPolicySaveInput | null>();

    expect(
      parseAdminInputPolicySaveInput({
        source: "example",
        expectedRevision: 2,
        terms: ["example"],
      }),
    ).toBeNull();
    expect(
      parseAdminInputPolicySaveInput({
        source: "example",
        expectedRevision: -1,
      }),
    ).toBeNull();
    expect(
      parseAdminInputPolicySaveInput({
        source: "x".repeat(32 * 1024 + 1),
        expectedRevision: 0,
      }),
    ).toBeNull();
  });
});
