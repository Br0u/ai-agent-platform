import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadDevWebEnvironment } from "./dev-web-environment.mjs";

const secretFiles = {
  BETTER_AUTH_SECRET: "better_auth_secret",
  OS_SECURITY_KEY: "os_security_key",
  AGENT_CONFIG_CONTROL_KEY: "agent_config_control_key",
  ASSISTANT_SESSION_SECRET: "assistant_session_secret",
  ASSISTANT_RATE_LIMIT_SECRET: "assistant_rate_limit_secret",
  SKILL_REGISTRY_CONTROL_KEY: "skill_registry_control_key",
} as const;

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function secretDirectory(mode = 0o600): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "aap-web-dev-"));
  temporaryDirectories.push(directory);
  for (const [variable, filename] of Object.entries(secretFiles)) {
    const target = path.join(directory, filename);
    await writeFile(target, `${variable.toLowerCase()}-value\n`, { mode });
    await chmod(target, mode);
  }
  return directory;
}

describe("loadDevWebEnvironment", () => {
  it("loads private control keys and pins the host dev services", async () => {
    const directory = await secretDirectory();
    const authEnvironmentFile = path.join(directory, ".env.local");
    await writeFile(
      authEnvironmentFile,
      `BETTER_AUTH_SECRET=${"local-auth-secret".repeat(4)}\n`,
      { mode: 0o600 },
    );

    const environment = await loadDevWebEnvironment({
      secretDirectory: directory,
      authEnvironmentFile,
      baseEnvironment: { KEEP_ME: "yes" },
    });

    expect(environment).toMatchObject({
      KEEP_ME: "yes",
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
      ASSISTANT_PUBLIC_ORIGIN: "http://localhost:3000",
      AGENTOS_INTERNAL_URL: "http://127.0.0.1:7777",
      SKILL_REGISTRY_INTERNAL_URL: "http://127.0.0.1:7788",
      SKILL_REGISTRY_ALLOW_LOOPBACK: "true",
      BETTER_AUTH_SECRET: "local-auth-secret".repeat(4),
      OS_SECURITY_KEY: "os_security_key-value",
      AGENT_CONFIG_CONTROL_KEY: "agent_config_control_key-value",
      ASSISTANT_SESSION_SECRET: "assistant_session_secret-value",
      ASSISTANT_RATE_LIMIT_SECRET: "assistant_rate_limit_secret-value",
      SKILL_REGISTRY_CONTROL_KEY: "skill_registry_control_key-value",
    });
  });

  it("rejects a secret file that is readable by other users", async () => {
    const directory = await secretDirectory();
    const authEnvironmentFile = path.join(directory, ".env.local");
    await writeFile(
      authEnvironmentFile,
      `BETTER_AUTH_SECRET=${"local-auth-secret".repeat(4)}\n`,
      { mode: 0o600 },
    );
    await chmod(path.join(directory, secretFiles.OS_SECURITY_KEY), 0o644);

    await expect(
      loadDevWebEnvironment({
        secretDirectory: directory,
        authEnvironmentFile,
        baseEnvironment: {},
      }),
    ).rejects.toThrow("OS_SECURITY_KEY secret file must have mode 0600");
  });
});
