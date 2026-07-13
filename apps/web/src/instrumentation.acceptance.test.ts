import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const RUN_ACCEPTANCE = process.env.RUN_ASSISTANT_STARTUP_ACCEPTANCE === "true";
const describeAcceptance = RUN_ACCEPTANCE ? describe : describe.skip;
const VALID_SECRET = "0123456789abcdef0123456789abcdef";
const RUNTIME_SETTINGS_KEY =
  "ai-agent-platform:assistant:anonymous-session-settings:v1";
const originalNextEnv = readFileSync("next-env.d.ts", "utf8");
const children = new Set<ChildProcess>();
const NEXT_CLI = resolve("node_modules/next/dist/bin/next");

function buildEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.ASSISTANT_PUBLIC_ORIGIN;
  delete environment.ASSISTANT_SESSION_SECRET;
  delete environment.NEXT_RUNTIME;
  delete environment.NEXT_PHASE;
  environment.DATABASE_URL = "";
  return environment;
}

function readTraceFiles(tracePath: string): string[] {
  const trace = JSON.parse(readFileSync(tracePath, "utf8")) as {
    files?: unknown;
  };
  expect(trace.files).toBeInstanceOf(Array);
  return trace.files as string[];
}

function tracedBundlesContaining(tracePath: string, needle: string): string[] {
  return readTraceFiles(tracePath)
    .filter((file) => file.endsWith(".js"))
    .filter((file) =>
      readFileSync(resolve(dirname(tracePath), file), "utf8").includes(needle),
    );
}

function start(environment: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [NEXT_CLI, "start", "-p", "0"], {
    cwd: process.cwd(),
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  return { child, output: () => output };
}

function startedPort(output: string): number | null {
  const match = /Local:\s+http:\/\/localhost:(\d+)/u.exec(output);
  return match?.[1] ? Number(match[1]) : null;
}

async function waitForStartedPort(
  child: ChildProcess,
  output: () => string,
): Promise<number> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const port = startedPort(output());
    if (port !== null) return port;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next server exited before ready:\n${output()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Next server:\n${output()}`);
}

async function waitForHomepage(
  child: ChildProcess,
  output: () => string,
): Promise<{ port: number; response: Response }> {
  const port = await waitForStartedPort(child, output);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next server exited before homepage:\n${output()}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      return { port, response };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for Next homepage:\n${output()}`);
}

type ExitResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

function waitForExit(
  child: ChildProcess,
  timeoutMs: number,
  failureMessage: string,
): Promise<ExitResult> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    };
    const timeout = setTimeout(() => {
      child.off("exit", onExit);
      reject(new Error(failureMessage));
    }, timeoutMs);
    child.once("exit", onExit);
  });
}

async function triggerServerInitialization(
  child: ChildProcess,
  output: () => string,
): Promise<void> {
  const port = await waitForStartedPort(child, output);
  const deadline = Date.now() + 10_000;
  while (
    Date.now() < deadline &&
    child.exitCode === null &&
    child.signalCode === null
  ) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  try {
    await waitForExit(child, 3_000, "Next server ignored SIGTERM");
  } catch {
    child.kill("SIGKILL");
    await waitForExit(child, 3_000, "Next server ignored SIGKILL");
  }
}

async function stopAllChildren(): Promise<void> {
  await Promise.all([...children].map((child) => stop(child)));
}

describeAcceptance("built Next assistant startup boundary", () => {
  beforeAll(() => {
    const result = spawnSync(
      process.execPath,
      [NEXT_CLI, "build", "--webpack"],
      {
        cwd: process.cwd(),
        env: buildEnvironment(),
        encoding: "utf8",
        timeout: 240_000,
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `Secret-free production build failed:\n${result.stdout}\n${result.stderr}`,
      );
    }
  }, 250_000);

  afterEach(async () => {
    await stopAllChildren();
    expect(children.size).toBe(0);
  });

  afterAll(async () => {
    try {
      await stopAllChildren();
    } finally {
      writeFileSync("next-env.d.ts", originalNextEnv);
    }
  });

  it("starts with valid runtime config and fails fast for invalid runtime config", async () => {
    const instrumentationTrace = ".next/server/instrumentation.js.nft.json";
    const sessionTrace =
      ".next/server/app/api/v1/assistant/session/route.js.nft.json";
    const tracedFiles = readTraceFiles(instrumentationTrace).join("\n");
    expect(tracedFiles).not.toMatch(
      /(?:packages\/database|node_modules\/\.pnpm\/pg@)/u,
    );
    const instrumentationBundle = readFileSync(
      ".next/server/instrumentation.js",
      "utf8",
    );
    expect(instrumentationBundle).not.toMatch(/require\(["']pg["']\)/u);
    const symbolExpression = `Symbol.for("${RUNTIME_SETTINGS_KEY}")`;
    expect(
      tracedBundlesContaining(instrumentationTrace, symbolExpression),
    ).toHaveLength(1);
    expect(
      tracedBundlesContaining(sessionTrace, symbolExpression),
    ).toHaveLength(1);

    const valid = start({
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "",
      ASSISTANT_PUBLIC_ORIGIN: "http://127.0.0.1:0",
      ASSISTANT_SESSION_SECRET: VALID_SECRET,
    });
    try {
      const homepage = await waitForHomepage(valid.child, valid.output);
      expect(homepage.response.status).toBe(200);

      const session = await fetch(
        `http://127.0.0.1:${homepage.port}/api/v1/assistant/session`,
        {
          method: "DELETE",
        },
      );
      expect(session.status).toBe(204);
      expect(session.headers.get("set-cookie")).toContain(
        "aap_assistant_sid_dev=",
      );
      expect(await session.text()).toBe("");
    } finally {
      await stop(valid.child);
    }

    const invalid = start({
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "",
      ASSISTANT_PUBLIC_ORIGIN: "http://portal.example.com",
      ASSISTANT_SESSION_SECRET: VALID_SECRET,
    });
    await triggerServerInitialization(invalid.child, invalid.output);
    const exit = await waitForExit(
      invalid.child,
      20_000,
      "Invalid Next server did not fail fast",
    );
    expect(exit.code).not.toBe(0);
    expect(invalid.output()).toContain("ASSISTANT_PUBLIC_ORIGIN");
  }, 60_000);
});
