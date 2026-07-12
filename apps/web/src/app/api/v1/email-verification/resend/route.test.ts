import { describe, expect, it } from "vitest";

import { createEmailVerificationResendHandler } from "./handler";

describe("email verification resend endpoint", () => {
  it("returns the explicit disabled contract while SMTP is unavailable", async () => {
    const response = await createEmailVerificationResendHandler(async () => ({
      ok: false,
      status: 501,
      code: "EMAIL_VERIFICATION_DISABLED" as const,
    }))();
    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({
      error: { code: "EMAIL_VERIFICATION_DISABLED" },
    });
  });
});
