export type AuthErrorCode =
  | "AUTH_ACCOUNT_DISABLED"
  | "AUTH_ACCOUNT_NOT_ACTIVE"
  | "AUTH_REALM_MISMATCH"
  | "AUTH_UNEXPECTED_ERROR"
  | "AUTH_USER_NOT_FOUND";

const PUBLIC_MESSAGES: Readonly<Record<AuthErrorCode, string>> = {
  AUTH_ACCOUNT_DISABLED: "This account is disabled",
  AUTH_ACCOUNT_NOT_ACTIVE: "This account is not active",
  AUTH_REALM_MISMATCH: "This account cannot access this sign-in area",
  AUTH_UNEXPECTED_ERROR: "Authentication request failed",
  AUTH_USER_NOT_FOUND: "Authentication request failed",
};

export class AuthGuardError extends Error {
  readonly code: Exclude<AuthErrorCode, "AUTH_UNEXPECTED_ERROR">;

  constructor(code: Exclude<AuthErrorCode, "AUTH_UNEXPECTED_ERROR">) {
    super(PUBLIC_MESSAGES[code]);
    this.name = "AuthGuardError";
    this.code = code;
  }
}

export function mapAuthError(error: unknown): {
  code: AuthErrorCode;
  message: string;
} {
  if (error instanceof AuthGuardError) {
    return { code: error.code, message: PUBLIC_MESSAGES[error.code] };
  }

  return {
    code: "AUTH_UNEXPECTED_ERROR",
    message: PUBLIC_MESSAGES.AUTH_UNEXPECTED_ERROR,
  };
}
