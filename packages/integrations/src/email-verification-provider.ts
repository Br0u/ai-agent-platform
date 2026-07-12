export type VerificationRequest = {
  userId: string;
  email: string;
};

export type VerificationToken = {
  token: string;
};

export type EmailVerificationResult =
  | { ok: true }
  | {
      ok: false;
      status: 501;
      code: "EMAIL_VERIFICATION_DISABLED";
    };

export interface EmailVerificationProvider {
  getStatus(): { enabled: boolean; mode: "placeholder" | "live" };
  requestVerification(
    input: VerificationRequest,
  ): Promise<EmailVerificationResult>;
  verifyToken(input: VerificationToken): Promise<EmailVerificationResult>;
  resendVerification(
    input: VerificationRequest,
  ): Promise<EmailVerificationResult>;
}

const DISABLED_RESULT = Object.freeze({
  ok: false,
  status: 501,
  code: "EMAIL_VERIFICATION_DISABLED",
} as const);

export function createDisabledEmailVerificationProvider(): EmailVerificationProvider {
  return {
    getStatus: () => ({ enabled: false, mode: "placeholder" }),
    requestVerification: async () => DISABLED_RESULT,
    verifyToken: async () => DISABLED_RESULT,
    resendVerification: async () => DISABLED_RESULT,
  };
}
