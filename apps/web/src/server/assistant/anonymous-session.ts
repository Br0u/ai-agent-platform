import "server-only";

import {
  createHmac,
  randomBytes as nodeRandomBytes,
  timingSafeEqual,
} from "node:crypto";

import { resolveAssistantActor, type AssistantActor } from "./assistant-actor";

export const ASSISTANT_IDLE_TTL_MS = 30 * 60 * 1000;
export const ASSISTANT_ABSOLUTE_TTL_MS = 24 * 60 * 60 * 1000;
const CREDENTIAL_BYTES = 32;
const SIGNATURE_BYTES = 32;
const VERSION = 1;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;
const MAX_COOKIE_VALUE_LENGTH = 1024;

export type AssistantSessionEnvironment = {
  ASSISTANT_PUBLIC_ORIGIN?: string;
  ASSISTANT_SESSION_SECRET?: string;
};

export type AssistantCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
};

export type AnonymousSessionSettings = {
  publicOrigin: string;
  cookie: {
    name: "__Host-aap_assistant_sid" | "aap_assistant_sid_dev";
    options: AssistantCookieOptions;
  };
  readonly secret: Uint8Array;
};

type SessionEnvelope = {
  version: 1;
  credential: string;
  issuedAt: number;
  lastSeen: number;
  actorBinding: string;
};

export type AssistantPublicSession = {
  temporary: true;
  expiresAt: string;
};

export type ResolvedAnonymousSession = {
  publicSession: AssistantPublicSession;
  internalSessionId: string;
  cookie: {
    name: AnonymousSessionSettings["cookie"]["name"];
    value: string;
    options: AssistantCookieOptions;
  };
  setCookie: string;
  rotated: boolean;
  refreshed: boolean;
  safeMetadata: {
    temporary: true;
    expiresAt: string;
    rotated: boolean;
  };
};

export type InspectedAnonymousSession =
  | { kind: "invalid" }
  | { kind: "valid"; internalSessionId: string };

type AnonymousSessionManagerDependencies = {
  settings: AnonymousSessionSettings;
  now?: () => number;
  randomBytes?: (length: number) => Uint8Array;
};

function encodeBase64Url(value: Uint8Array | string): string {
  return Buffer.from(value).toString("base64url");
}

function decodeCanonicalBase64Url(value: string): Uint8Array | null {
  if (!BASE64URL.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.toString("base64url") === value
      ? new Uint8Array(decoded)
      : null;
  } catch {
    return null;
  }
}

function hmac(secret: Uint8Array, domain: string, value: string): Uint8Array {
  return new Uint8Array(
    createHmac("sha256", secret)
      .update(domain)
      .update("\0")
      .update(value)
      .digest(),
  );
}

function equalEncodedMac(expected: Uint8Array, encoded: string): boolean {
  const actual = decodeCanonicalBase64Url(encoded);
  return (
    actual !== null &&
    actual.byteLength === SIGNATURE_BYTES &&
    timingSafeEqual(expected, actual)
  );
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

export function resolveAnonymousSessionSettings(
  environment: AssistantSessionEnvironment,
): AnonymousSessionSettings {
  const rawOrigin = environment.ASSISTANT_PUBLIC_ORIGIN;
  if (!rawOrigin) {
    throw new Error("ASSISTANT_PUBLIC_ORIGIN is required");
  }

  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new Error("ASSISTANT_PUBLIC_ORIGIN must be an exact origin");
  }
  if (
    rawOrigin !== origin.origin ||
    origin.username !== "" ||
    origin.password !== "" ||
    origin.pathname !== "/" ||
    origin.search !== "" ||
    origin.hash !== "" ||
    (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && isLoopbackHostname(origin.hostname)))
  ) {
    throw new Error(
      "ASSISTANT_PUBLIC_ORIGIN must be HTTPS or an exact loopback HTTP origin",
    );
  }

  const rawSecret = environment.ASSISTANT_SESSION_SECRET;
  if (!rawSecret) throw new Error("ASSISTANT_SESSION_SECRET is required");
  const secret = new TextEncoder().encode(rawSecret);
  if (secret.byteLength < 32) {
    throw new Error("ASSISTANT_SESSION_SECRET must contain at least 32 bytes");
  }

  const secure = origin.protocol === "https:";
  return {
    publicOrigin: origin.origin,
    cookie: {
      name: secure ? "__Host-aap_assistant_sid" : "aap_assistant_sid_dev",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure,
      },
    },
    secret,
  };
}

function actorBinding(secret: Uint8Array, actor: AssistantActor): string {
  if (actor.kind === "anonymous") return "anonymous";
  return encodeBase64Url(
    hmac(secret, "assistant-actor-binding:v1", `customer:${actor.userId}`),
  );
}

function internalSessionId(secret: Uint8Array, credential: string): string {
  return encodeBase64Url(
    hmac(secret, "assistant-internal-session-id:v1", credential),
  );
}

function exactEnvelope(value: unknown): value is SessionEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const envelope = value as Record<string, unknown>;
  return (
    Object.keys(envelope).sort().join(",") ===
      "actorBinding,credential,issuedAt,lastSeen,version" &&
    envelope.version === VERSION &&
    typeof envelope.credential === "string" &&
    typeof envelope.actorBinding === "string" &&
    Number.isSafeInteger(envelope.issuedAt) &&
    Number.isSafeInteger(envelope.lastSeen)
  );
}

function parseCookieHeader(headers: Headers, name: string): string | null {
  const header = headers.get("cookie");
  if (!header) return null;
  const matches: string[] = [];
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator < 0 || trimmed.slice(0, separator) !== name) continue;
    matches.push(trimmed.slice(separator + 1));
  }
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function cookieCount(headers: Headers, name: string): number {
  const header = headers.get("cookie");
  if (!header) return 0;
  return header.split(";").filter((part) => {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    return separator >= 0 && trimmed.slice(0, separator) === name;
  }).length;
}

function expiryAt(envelope: SessionEnvelope): number {
  return Math.min(
    envelope.lastSeen + ASSISTANT_IDLE_TTL_MS,
    envelope.issuedAt + ASSISTANT_ABSOLUTE_TTL_MS,
  );
}

function validTimes(envelope: SessionEnvelope, now: number): boolean {
  return (
    Number.isSafeInteger(now) &&
    envelope.issuedAt >= 0 &&
    envelope.lastSeen >= envelope.issuedAt &&
    envelope.lastSeen <= now &&
    now < envelope.lastSeen + ASSISTANT_IDLE_TTL_MS &&
    now < envelope.issuedAt + ASSISTANT_ABSOLUTE_TTL_MS
  );
}

function serializeCookie(
  name: string,
  value: string,
  options: AssistantCookieOptions,
  expiresAt: number,
): string {
  return [
    `${name}=${value}`,
    "Path=/",
    `Expires=${new Date(expiresAt).toUTCString()}`,
    "HttpOnly",
    ...(options.secure ? ["Secure"] : []),
    "SameSite=Lax",
  ].join("; ");
}

export function createAnonymousSessionManager(
  dependencies: AnonymousSessionManagerDependencies,
) {
  const now = dependencies.now ?? Date.now;
  const randomBytes =
    dependencies.randomBytes ?? ((length: number) => nodeRandomBytes(length));
  const { settings } = dependencies;

  function encodeEnvelope(envelope: SessionEnvelope): string {
    const payload = encodeBase64Url(JSON.stringify(envelope));
    const signature = encodeBase64Url(
      hmac(settings.secret, "assistant-cookie-signature:v1", payload),
    );
    return `${payload}.${signature}`;
  }

  function readEnvelope(
    headers: Headers,
    actor: AssistantActor,
    at: number,
  ): SessionEnvelope | null {
    if (cookieCount(headers, settings.cookie.name) !== 1) return null;
    const cookie = parseCookieHeader(headers, settings.cookie.name);
    if (!cookie || cookie.length > MAX_COOKIE_VALUE_LENGTH) return null;
    const parts = cookie.split(".");
    if (parts.length !== 2) return null;
    const [payload = "", signature = ""] = parts;
    const decodedPayload = decodeCanonicalBase64Url(payload);
    if (
      decodedPayload === null ||
      !equalEncodedMac(
        hmac(settings.secret, "assistant-cookie-signature:v1", payload),
        signature,
      )
    ) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(decodedPayload));
    } catch {
      return null;
    }
    if (!exactEnvelope(parsed)) return null;
    const credential = decodeCanonicalBase64Url(parsed.credential);
    if (credential === null || credential.byteLength !== CREDENTIAL_BYTES) {
      return null;
    }
    if (!validTimes(parsed, at)) return null;
    const expectedBinding = actorBinding(settings.secret, actor);
    if (
      parsed.actorBinding.length !== expectedBinding.length ||
      !timingSafeEqual(
        Buffer.from(parsed.actorBinding),
        Buffer.from(expectedBinding),
      )
    ) {
      return null;
    }
    return parsed;
  }

  function resolve(
    headers: Headers,
    actor: AssistantActor,
  ): ResolvedAnonymousSession {
    const at = now();
    let envelope = readEnvelope(headers, actor, at);
    const rotated = envelope === null;
    if (envelope === null) {
      const credentialBytes = randomBytes(CREDENTIAL_BYTES);
      if (credentialBytes.byteLength !== CREDENTIAL_BYTES) {
        throw new TypeError("Assistant random source must return 32 bytes");
      }
      envelope = {
        version: VERSION,
        credential: encodeBase64Url(credentialBytes),
        issuedAt: at,
        lastSeen: at,
        actorBinding: actorBinding(settings.secret, actor),
      };
    } else {
      envelope = { ...envelope, lastSeen: at };
    }

    const value = encodeEnvelope(envelope);
    const expiresAt = expiryAt(envelope);
    const publicSession: AssistantPublicSession = {
      temporary: true,
      expiresAt: new Date(expiresAt).toISOString(),
    };
    return {
      publicSession,
      internalSessionId: internalSessionId(
        settings.secret,
        envelope.credential,
      ),
      cookie: {
        name: settings.cookie.name,
        value,
        options: { ...settings.cookie.options },
      },
      setCookie: serializeCookie(
        settings.cookie.name,
        value,
        settings.cookie.options,
        expiresAt,
      ),
      rotated,
      refreshed: !rotated,
      safeMetadata: { ...publicSession, rotated },
    };
  }

  function inspect(
    headers: Headers,
    actor: AssistantActor,
  ): InspectedAnonymousSession {
    const envelope = readEnvelope(headers, actor, now());
    return envelope
      ? {
          kind: "valid",
          internalSessionId: internalSessionId(
            settings.secret,
            envelope.credential,
          ),
        }
      : { kind: "invalid" };
  }

  function clearCookie(): string {
    return [
      `${settings.cookie.name}=`,
      "Path=/",
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "Max-Age=0",
      "HttpOnly",
      ...(settings.cookie.options.secure ? ["Secure"] : []),
      "SameSite=Lax",
    ].join("; ");
  }

  return { resolve, inspect, clearCookie };
}

export type AnonymousSessionManager = ReturnType<
  typeof createAnonymousSessionManager
>;

let defaultSettings: AnonymousSessionSettings | undefined;
let defaultManager: AnonymousSessionManager | undefined;

function runtimeEnvironment(): AssistantSessionEnvironment {
  return {
    ASSISTANT_PUBLIC_ORIGIN: process.env.ASSISTANT_PUBLIC_ORIGIN,
    ASSISTANT_SESSION_SECRET: process.env.ASSISTANT_SESSION_SECRET,
  };
}

export function validateAnonymousSessionRuntimeConfig(
  environment: AssistantSessionEnvironment = runtimeEnvironment(),
): AnonymousSessionSettings {
  defaultSettings ??= resolveAnonymousSessionSettings(environment);
  return defaultSettings;
}

export function getAnonymousSessionManager(): AnonymousSessionManager {
  defaultSettings ??= validateAnonymousSessionRuntimeConfig();
  defaultManager ??= createAnonymousSessionManager({
    settings: defaultSettings,
  });
  return defaultManager;
}

export async function resolveAnonymousSession(
  request: Request,
): Promise<ResolvedAnonymousSession> {
  const actor = await resolveAssistantActor(request);
  return getAnonymousSessionManager().resolve(request.headers, actor);
}
