import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN_ACCEPTANCE = process.env.RUN_ASSISTANT_STARTUP_ACCEPTANCE === "true";
const describeAcceptance = RUN_ACCEPTANCE ? describe : describe.skip;
const VALID_SECRET = "0123456789abcdef0123456789abcdef";
const RUNTIME_SETTINGS_KEY =
  "ai-agent-platform:assistant:anonymous-session-settings:v1";
const originalNextEnv = readFileSync("next-env.d.ts", "utf8");

function buildEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.ASSISTANT_PUBLIC_ORIGIN;
  delete environment.ASSISTANT_SESSION_SECRET;
  delete environment.NEXT_RUNTIME;
  delete environment.NEXT_PHASE;
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

function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "string" || address === null) {
        server.close();
        reject(new Error("Could not allocate an IPv4 port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function start(port: number, environment: NodeJS.ProcessEnv) {
  const child = spawn("pnpm", ["exec", "next", "start", "-p", String(port)], {
    cwd: process.cwd(),
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });
  return { child, output: () => output };
}

async function waitForHomepage(
  child: ChildProcess,
  output: () => string,
  port: number,
): Promise<Response> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next server exited before ready:\n${output()}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.status > 0) return response;
    } catch {
      // The TCP listener is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Next server:\n${output()}`);
}

function waitForExit(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Invalid Next server did not fail fast"));
    }, 20_000);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

async function triggerServerInitialization(
  child: ChildProcess,
  port: number,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
}

describeAcceptance("built Next assistant startup boundary", () => {
  beforeAll(() => {
    const result = spawnSync("pnpm", ["build"], {
      cwd: process.cwd(),
      env: buildEnvironment(),
      encoding: "utf8",
      timeout: 240_000,
    });
    if (result.status !== 0) {
      throw new Error(
        `Secret-free production build failed:\n${result.stdout}\n${result.stderr}`,
      );
    }
  }, 250_000);

  afterAll(() => {
    writeFileSync("next-env.d.ts", originalNextEnv);
  });

  it("starts with valid runtime config and fails fast for invalid runtime config", async () => {
    const instrumentationTrace = ".next/server/instrumentation.js.nft.json";
    const chatTrace =
      ".next/server/app/api/v1/assistant/chat/route.js.nft.json";
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
    expect(tracedBundlesContaining(chatTrace, symbolExpression)).toHaveLength(
      1,
    );

    const validPort = await availablePort();
    const valid = start(validPort, {
      ...process.env,
      NODE_ENV: "production",
      ASSISTANT_PUBLIC_ORIGIN: `http://127.0.0.1:${validPort}`,
      ASSISTANT_SESSION_SECRET: VALID_SECRET,
    });
    try {
      const homepage = await waitForHomepage(
        valid.child,
        valid.output,
        validPort,
      );
      expect(homepage.status).toBe(200);

      const chat = await fetch(
        `http://127.0.0.1:${validPort}/api/v1/assistant/chat`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: "如何开始了解平台？",
            context: { pathname: "/" },
          }),
        },
      );
      expect(chat.status).toBe(200);
      expect(chat.headers.get("set-cookie")).toContain(
        "aap_assistant_sid_dev=",
      );
      await expect(chat.json()).resolves.toMatchObject({
        version: "1",
        mode: "placeholder",
        session: { temporary: true },
        message: { role: "assistant" },
      });
    } finally {
      await stop(valid.child);
    }

    const invalidPort = await availablePort();
    const invalid = start(invalidPort, {
      ...process.env,
      NODE_ENV: "production",
      ASSISTANT_PUBLIC_ORIGIN: "http://portal.example.com",
      ASSISTANT_SESSION_SECRET: VALID_SECRET,
    });
    await triggerServerInitialization(invalid.child, invalidPort);
    const exitCode = await waitForExit(invalid.child);
    expect(exitCode).not.toBe(0);
    expect(invalid.output()).toContain("ASSISTANT_PUBLIC_ORIGIN");
  }, 60_000);
});
