import { describe, expect, it } from "vitest";

import {
  createDisabledEmailVerificationProvider,
  type EmailVerificationProvider,
} from "./email-verification-provider";

describe("disabled email verification provider", () => {
  it("reports a disabled placeholder status", () => {
    expect(createDisabledEmailVerificationProvider().getStatus()).toEqual({
      enabled: false,
      mode: "placeholder",
    });
  });

  it.each(["requestVerification", "resendVerification"] as const)(
    "%s returns the typed disabled result",
    async (method) => {
      const provider: EmailVerificationProvider =
        createDisabledEmailVerificationProvider();
      await expect(
        provider[method]({ userId: "user-1", email: "customer@example.com" }),
      ).resolves.toEqual({
        ok: false,
        status: 501,
        code: "EMAIL_VERIFICATION_DISABLED",
      });
    },
  );

  it("verifyToken returns the same typed disabled result", async () => {
    await expect(
      createDisabledEmailVerificationProvider().verifyToken({
        token: "unused-token",
      }),
    ).resolves.toEqual({
      ok: false,
      status: 501,
      code: "EMAIL_VERIFICATION_DISABLED",
    });
  });

  it("does not expose a success callback surface", () => {
    expect(
      Object.keys(createDisabledEmailVerificationProvider()).sort(),
    ).toEqual([
      "getStatus",
      "requestVerification",
      "resendVerification",
      "verifyToken",
    ]);
  });
});
