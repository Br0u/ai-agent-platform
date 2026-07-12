export type AuthActionState =
  | { kind: "idle" }
  | {
      kind: "error";
      code: "AUTH_INVALID_CREDENTIALS" | "AUTH_LOGOUT_FAILED";
    }
  | { kind: "success"; redirectTo: string };

export const AUTH_ACTION_INITIAL_STATE: AuthActionState = { kind: "idle" };
