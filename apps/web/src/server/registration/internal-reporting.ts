import "server-only";

import { randomUUID } from "node:crypto";

const SAFE_ERROR_NAMES = new Set([
  "Error",
  "AggregateError",
  "RegistrationError",
  "AuthAccessError",
]);
const SAFE_CODE = /^(?:[0-9A-Z]{5}|[A-Z][A-Z0-9_]{1,63})$/u;

function safeErrorName(error: unknown): string {
  if (
    error instanceof Error &&
    typeof error.name === "string" &&
    SAFE_ERROR_NAMES.has(error.name)
  ) {
    return error.name;
  }
  return "UnknownError";
}

function safeErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "UNCLASSIFIED";
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" && SAFE_CODE.test(code)
    ? code
    : "UNCLASSIFIED";
}

export function reportRegistrationInternalError(error: unknown): void {
  const envelope = Object.freeze({
    event: "registration.internal_error",
    correlationId: randomUUID(),
    errorName: safeErrorName(error),
    code: safeErrorCode(error),
  });
  try {
    console.error(envelope);
  } catch {
    // A failed diagnostics sink must never change the public action result.
  }
}
