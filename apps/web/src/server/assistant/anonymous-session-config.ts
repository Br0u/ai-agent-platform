import "server-only";

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

let runtimeSettings: AnonymousSessionSettings | undefined;

function runtimeEnvironment(): AssistantSessionEnvironment {
  return {
    ASSISTANT_PUBLIC_ORIGIN: process.env.ASSISTANT_PUBLIC_ORIGIN,
    ASSISTANT_SESSION_SECRET: process.env.ASSISTANT_SESSION_SECRET,
  };
}

export function validateAnonymousSessionRuntimeConfig(
  environment: AssistantSessionEnvironment = runtimeEnvironment(),
): AnonymousSessionSettings {
  runtimeSettings ??= resolveAnonymousSessionSettings(environment);
  return runtimeSettings;
}
