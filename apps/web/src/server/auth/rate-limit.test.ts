import { describe, expect, it } from "vitest";

import { authRateLimitKey } from "./rate-limit";

describe("authentication rate limit keys", () => {
  it("separates realms and operations without persisting identifiers", () => {
    const secret = "test-secret-that-is-longer-than-thirty-two-characters";
    const customer = authRateLimitKey(
      secret,
      { realm: "customer", operation: "login" },
      "identifier",
      "customer@example.com",
    );
    const staff = authRateLimitKey(
      secret,
      { realm: "workforce", operation: "login" },
      "identifier",
      "customer@example.com",
    );

    expect(customer).not.toBe(staff);
    expect(customer).not.toContain("customer@example.com");
    expect(customer).toMatch(/^auth:customer:login:identifier:[a-f0-9]{64}$/u);
  });
});
