import "server-only";

import { isIP } from "node:net";

export class InvalidTrustedClientIpError extends Error {
  readonly code = "INVALID_TRUSTED_CLIENT_IP";

  constructor() {
    super("Trusted X-Real-IP is invalid or ambiguous");
  }
}

function normalizeIpv6(value: string): string {
  let hostname: string;
  try {
    hostname = new URL(`http://[${value}]/`).hostname;
  } catch {
    throw new InvalidTrustedClientIpError();
  }
  const normalized = hostname.slice(1, -1).toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    throw new InvalidTrustedClientIpError();
  }
  return normalized;
}

export function parseTrustedClientIp(value: string): string {
  if (
    value.length === 0 ||
    value !== value.trim() ||
    value.includes(",") ||
    /\s|\[|\]|%/u.test(value)
  ) {
    throw new InvalidTrustedClientIpError();
  }

  const version = isIP(value);
  if (version === 4) return value;
  if (version === 6) return normalizeIpv6(value);
  throw new InvalidTrustedClientIpError();
}

export function resolveTrustedClientIp(
  headers: Headers,
  trustNginxProxy: boolean,
): string | undefined {
  if (!trustNginxProxy) return undefined;
  const value = headers.get("x-real-ip");
  return value === null ? undefined : parseTrustedClientIp(value);
}
