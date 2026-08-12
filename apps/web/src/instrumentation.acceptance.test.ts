import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const RUN_ACCEPTANCE = process.env.RUN_ASSISTANT_STARTUP_ACCEPTANCE === "true";
const describeAcceptance = RUN_ACCEPTANCE ? describe : describe.skip;
const originalNextEnv = readFileSync("next-env.d.ts", "utf8");
const NEXT_CLI = resolve("node_modules/next/dist/bin/next");

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolveExit, reject) => {
    const timeout = setTimeout(() => {
      child.off("exit", onExit);
      reject(new Error("Next server did not stop in time"));
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timeout);
      resolveExit();
    };
    child.once("exit", onExit);
  });
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  try {
    await waitForExit(child, 3_000);
  } catch {
    child.kill("SIGKILL");
    await waitForExit(child, 3_000);
  }
}

async function waitForHomepage(
  child: ChildProcess,
  output: () => string,
): Promise<Response> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next server exited before ready:\n${output()}`);
    }
    const port = /Local:\s+http:\/\/localhost:(\d+)/u.exec(output())?.[1];
    if (port) {
      try {
        return await fetch(`http://127.0.0.1:${port}/`);
      } catch {
        // The process can announce its port before the listener is ready.
      }
    }
    await new Promise((resolveRetry) => setTimeout(resolveRetry, 100));
  }
  throw new Error(`Timed out waiting for Next server:\n${output()}`);
}

describeAcceptance("built Next assistant startup boundary", () => {
  afterAll(() => writeFileSync("next-env.d.ts", originalNextEnv));

  it("builds and starts without deprecated assistant session configuration", async () => {
    const environment: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: "" };
    delete environment[["ASSISTANT", "SESSION", "SECRET"].join("_")];
    environment.ASSISTANT_PUBLIC_ORIGIN = "http://127.0.0.1:3000";
    delete environment.NEXT_PHASE;
    delete environment.NEXT_RUNTIME;
    const build = spawnSync(
      process.execPath,
      [NEXT_CLI, "build", "--webpack"],
      {
        cwd: process.cwd(),
        env: environment,
        encoding: "utf8",
        timeout: 240_000,
      },
    );
    expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);
    expect(
      existsSync([".next/server/app/api/v1/assistant", "session"].join("/")),
    ).toBe(false);
    const bundle = readFileSync(".next/server/instrumentation.js", "utf8");
    expect(bundle).not.toContain(["ASSISTANT", "SESSION", "SECRET"].join("_"));
    expect(bundle).not.toContain(["anonymous", "session"].join("-"));

    const child = spawn(process.execPath, [NEXT_CLI, "start", "-p", "0"], {
      cwd: process.cwd(),
      env: { ...environment, NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    try {
      const homepage = await waitForHomepage(child, () => output);
      expect(homepage.status).toBe(200);
    } finally {
      await stop(child);
    }
  }, 250_000);
});
