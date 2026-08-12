import { describe, expect, it } from "vitest";

import { createStaffAuthOptions, staffRealm } from "./staff-auth";

const env = {
  BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
};

describe("staff auth configuration", () => {
  it("has no two-factor endpoints or plugin", () => {
    expect(staffRealm.endpoints.allowed).toEqual([
      "/sign-in/email",
      "/sign-in/username",
      "/sign-out",
      "/get-session",
    ]);
    const options = createStaffAuthOptions({ env, adapter: {} as never });
    expect(
      options.plugins.some((plugin) =>
        String(plugin.id).toLowerCase().includes("two-factor"),
      ),
    ).toBe(false);
  });
});
