import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

type DevEnvironment = Record<string, string | undefined>;

type LoadDevWebEnvironmentOptions = {
  secretDirectory: string;
  authEnvironmentFile: string;
  baseEnvironment: DevEnvironment;
};

const SECRET_FILES = {
  OS_SECURITY_KEY: "os_security_key",
  AGENT_CONFIG_CONTROL_KEY: "agent_config_control_key",
  ASSISTANT_SESSION_SECRET: "assistant_session_secret",
  ASSISTANT_RATE_LIMIT_SECRET: "assistant_rate_limit_secret",
  SKILL_REGISTRY_CONTROL_KEY: "skill_registry_control_key",
} as const;

function devOrigin(environment: DevEnvironment): string {
  const raw = environment.AAP_DEV_ORIGIN?.trim() || "http://localhost:3000";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("AAP_DEV_ORIGIN must be an exact loopback HTTP origin");
  }
  if (
    url.origin !== raw ||
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error("AAP_DEV_ORIGIN must be an exact loopback HTTP origin");
  }
  return url.origin;
}

async function readSecret(variable: string, target: string): Promise<string> {
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${variable} secret file must be a regular file`);
  }
  if ((metadata.mode & 0o777) !== 0o600) {
    throw new Error(`${variable} secret file must have mode 0600`);
  }
  const raw = await readFile(target, "utf8");
  const value = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  if (!value || /\s/u.test(value)) {
    throw new Error(`${variable} secret must be one non-blank line`);
  }
  return value;
}

async function readAuthSecret(target: string): Promise<string> {
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("auth environment file must be a regular file");
  }
  if ((metadata.mode & 0o777) !== 0o600) {
    throw new Error("auth environment file must have mode 0600");
  }
  const candidates = (await readFile(target, "utf8"))
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("BETTER_AUTH_SECRET="));
  if (candidates.length !== 1) {
    throw new Error(
      "auth environment file must define BETTER_AUTH_SECRET once",
    );
  }
  const value = candidates[0]?.slice("BETTER_AUTH_SECRET=".length) ?? "";
  if (value.length < 32 || /\s/u.test(value)) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  }
  return value;
}

export async function loadDevWebEnvironment({
  secretDirectory,
  authEnvironmentFile,
  baseEnvironment,
}: LoadDevWebEnvironmentOptions): Promise<DevEnvironment> {
  const environment: DevEnvironment = {
    ...baseEnvironment,
    BETTER_AUTH_URL: devOrigin(baseEnvironment),
    BETTER_AUTH_TRUSTED_ORIGINS: devOrigin(baseEnvironment),
    ASSISTANT_PUBLIC_ORIGIN: devOrigin(baseEnvironment),
    AGENTOS_INTERNAL_URL:
      baseEnvironment.AGENTOS_INTERNAL_URL ?? "http://127.0.0.1:7777",
    SKILL_REGISTRY_INTERNAL_URL:
      baseEnvironment.SKILL_REGISTRY_INTERNAL_URL ?? "http://127.0.0.1:7788",
    SKILL_REGISTRY_ALLOW_LOOPBACK: "true",
    BETTER_AUTH_SECRET: await readAuthSecret(authEnvironmentFile),
  };
  for (const [variable, filename] of Object.entries(SECRET_FILES)) {
    environment[variable] = await readSecret(
      variable,
      path.join(secretDirectory, filename),
    );
  }
  return environment;
}
