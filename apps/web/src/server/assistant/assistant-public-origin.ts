import "server-only";

export type AssistantPublicOriginEnvironment = {
  NODE_ENV?: string;
  ASSISTANT_PUBLIC_ORIGIN?: string;
};

const DEVELOPMENT_ORIGIN = "http://localhost:3000";
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function resolveAssistantPublicOrigin(
  environment: AssistantPublicOriginEnvironment = process.env,
): URL {
  const configured = environment.ASSISTANT_PUBLIC_ORIGIN;
  if (
    (!configured || configured.length === 0) &&
    environment.NODE_ENV === "production"
  ) {
    throw new TypeError("ASSISTANT_PUBLIC_ORIGIN is required in production");
  }
  const value = configured || DEVELOPMENT_ORIGIN;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError("ASSISTANT_PUBLIC_ORIGIN must be an exact URL origin");
  }
  if (
    value !== parsed.origin ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new TypeError("ASSISTANT_PUBLIC_ORIGIN must be an exact URL origin");
  }
  if (parsed.protocol === "https:") return parsed;
  if (parsed.protocol === "http:" && LOOPBACK_HOSTNAMES.has(parsed.hostname)) {
    return parsed;
  }
  throw new TypeError(
    "ASSISTANT_PUBLIC_ORIGIN must use HTTPS or an HTTP loopback origin",
  );
}
