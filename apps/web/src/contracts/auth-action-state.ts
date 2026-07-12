export type AuthActionState =
  | { kind: "idle" }
  | { kind: "error"; code: "AUTH_INVALID_CREDENTIALS" }
  | { kind: "success"; redirectTo: string };

export const AUTH_ACTION_INITIAL_STATE: AuthActionState = { kind: "idle" };
