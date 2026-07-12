export type AuthActionState =
  | { kind: "idle" }
  | {
      kind: "error";
      code:
        | "AUTH_INVALID_CREDENTIALS"
        | "AUTH_RATE_LIMITED"
        | "AUTH_LOGOUT_FAILED";
    }
  | { kind: "success"; redirectTo: string };

export const AUTH_ACTION_INITIAL_STATE: AuthActionState = { kind: "idle" };

export type StaffSecurityActionState =
  | { kind: "idle" }
  | {
      kind: "error";
      code:
        | "AUTH_INVALID_INPUT"
        | "AUTH_INVALID_CREDENTIALS"
        | "AUTH_RATE_LIMITED"
        | "AUTH_TOTP_ALREADY_ENABLED"
        | "AUTH_REAUTH_REQUIRED"
        | "AUTH_MFA_REQUIRED"
        | "AUTH_INFRASTRUCTURE_FAILURE";
    }
  | { kind: "success"; redirectTo: string }
  | {
      kind: "enrollment";
      totpURI: string;
      recoveryCodes: string[];
      qrDataUrl?: string;
    };

export const STAFF_SECURITY_ACTION_INITIAL_STATE: StaffSecurityActionState = {
  kind: "idle",
};
