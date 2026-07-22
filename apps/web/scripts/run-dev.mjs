import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadDevWebEnvironment } from "../src/server/dev/dev-web-environment.mts";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(scriptDirectory, "..");
const repositoryDirectory = path.resolve(appDirectory, "../..");

function defaultSecretDirectory() {
  if (process.env.AAP_DEV_SECRET_DIR) {
    return path.resolve(process.env.AAP_DEV_SECRET_DIR);
  }
  const result = spawnSync(
    "git",
    [
      "-C",
      repositoryDirectory,
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error("Unable to locate the shared local secret directory");
  }
  return path.join(path.dirname(result.stdout.trim()), ".secrets");
}

const secretDirectory = defaultSecretDirectory();
const environment = await loadDevWebEnvironment({
  secretDirectory,
  authEnvironmentFile:
    process.env.AAP_DEV_AUTH_ENV_FILE ??
    path.join(path.dirname(secretDirectory), "apps/web/.env.local"),
  baseEnvironment: process.env,
});
const nextCli = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const child = spawn(process.execPath, [nextCli, "dev", "--webpack"], {
  cwd: appDirectory,
  env: environment,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  console.error(`Unable to start Next.js dev server: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = signal === null ? (code ?? 1) : 1;
});
