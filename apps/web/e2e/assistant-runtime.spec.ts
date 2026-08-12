import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  expect,
  request as requestFactory,
  test,
  type APIResponse,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { addSignedSession, fixtureCredentials } from "./auth-fixtures";
import {
  ASSISTANT_STREAM_MEDIA_TYPE,
  formatAssistantStreamEvent,
  parseAssistantStreamFrame,
  type AssistantStreamEvent,
} from "../src/features/assistant/assistant-stream";
import {
  ASSISTANT_CONTENT_MAX_CODE_POINTS,
  type AssistantStreamActionEvent,
  type AssistantStreamActivityEvent,
} from "../src/features/assistant/assistant-contract";
import { parseAdminAssistantStatusResponse } from "../src/features/assistant/admin-assistant-contract";

const CHAT_PATH = "/api/v1/assistant/chat";
const STATUS_PATH = "/api/v1/assistant/status";
const ADMIN_STATUS_PATH = "/api/v1/admin/assistant/status";
const ADMIN_CHAT_PATH = "/api/v1/admin/assistant/chat";
const MODEL_CONFIG_PATH = "/api/v1/admin/assistant/model-configs";
const CHAT_BODY = {
  version: "2",
  message: "如何开始了解平台？",
  history: [],
  page: null,
};
const INVALID_RESPONSE_SENTINEL = "__aap_e2e_invalid_response__";
const CONTROL_PROVIDERS = [
  { provider: "openai", label: "OpenAI", endpoint: "openai-official" },
  {
    provider: "anthropic",
    label: "Claude",
    endpoint: "anthropic-official",
  },
  { provider: "google", label: "Gemini", endpoint: "google-official" },
  {
    provider: "dashscope",
    label: "Qwen / DashScope",
    endpoint: "dashscope-official",
  },
  {
    provider: "deepseek",
    label: "DeepSeek",
    endpoint: "deepseek-official",
  },
  { provider: "minimax", label: "MiniMax", endpoint: "minimax-official" },
] as const;
const SAFE_RULE = Symbol("safe response rule");
type SafeRule = {
  readonly [SAFE_RULE]: true;
  readonly accepts: (value: unknown) => boolean;
};
type SafeShape =
  | null
  | boolean
  | number
  | string
  | SafeRule
  | SafeShape[]
  | { [key: string]: SafeShape };
type ParsedAssistantStreamResponse = {
  message: { role: "assistant"; content: string };
  activities: AssistantStreamActivityEvent[];
  actions: AssistantStreamActionEvent["action"][];
};

function safeRule(accepts: (value: unknown) => boolean): SafeRule {
  return { [SAFE_RULE]: true, accepts };
}

function isSafeRule(value: SafeShape): value is SafeRule {
  return typeof value === "object" && value !== null && SAFE_RULE in value;
}

function isSafeRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactSafeShape(
  actual: unknown,
  expected: SafeShape,
  label: string,
): void {
  const assertNode = (value: unknown, shape: SafeShape, pathLabel: string) => {
    if (isSafeRule(shape)) {
      expect(shape.accepts(value), `${pathLabel}: invalid scalar`).toBe(true);
      return;
    }
    if (Array.isArray(shape)) {
      expect(Array.isArray(value), `${pathLabel}: expected array`).toBe(true);
      if (!Array.isArray(value)) return;
      expect(
        value.length === shape.length,
        `${pathLabel}: unexpected array length`,
      ).toBe(true);
      for (let index = 0; index < shape.length; index += 1) {
        assertNode(value[index], shape[index]!, `${pathLabel}[${index}]`);
      }
      return;
    }
    if (typeof shape === "object" && shape !== null) {
      expect(isSafeRecord(value), `${pathLabel}: expected object`).toBe(true);
      if (!isSafeRecord(value)) return;
      const expectedKeys = Object.keys(shape).sort();
      const actualKeys = Object.keys(value).sort();
      expect(
        actualKeys.length === expectedKeys.length &&
          expectedKeys.every((key, index) => actualKeys[index] === key),
        `${pathLabel}: unexpected keys`,
      ).toBe(true);
      for (const key of expectedKeys) {
        assertNode(value[key], shape[key]!, `${pathLabel}.${key}`);
      }
      return;
    }
    expect(Object.is(value, shape), `${pathLabel}: unexpected scalar`).toBe(
      true,
    );
  };

  assertNode(actual, expected, label);
}

function assertSafeResponse(actual: unknown, label: string) {
  return {
    matches(expected: SafeShape): void {
      assertExactSafeShape(actual, expected, label);
    },
  };
}

const requestIdMatcher = safeRule((value) => typeof value === "string");
const messageIdMatcher = safeRule((value) => typeof value === "string");
const nginxRequestIdMatcher = safeRule(
  (value) => typeof value === "string" && /^[a-f0-9]{32}$/u.test(value),
);

const cumulativeConsoleMessages: string[] = [];

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalEnvironment(name: string): string[] {
  const value = process.env[name];
  return value ? [value] : [];
}

function appendProtectedLedger(name: string, value: string): void {
  if (value.length === 0 || value.includes("\n") || value.includes("\r")) {
    throw new Error("protected ledger value is invalid");
  }
  const ledgerPath = requiredEnvironment(name);
  const stats = statSync(ledgerPath);
  if (!stats.isFile() || (stats.mode & 0o777) !== 0o600) {
    throw new Error("protected ledger is invalid");
  }
  appendFileSync(ledgerPath, `${value}\n`, { encoding: "utf8" });
}

function protectedLedgerValues(name: string): string[] {
  const ledgerPath = requiredEnvironment(name);
  const stats = statSync(ledgerPath);
  if (!stats.isFile() || (stats.mode & 0o777) !== 0o600) {
    throw new Error("protected ledger is invalid");
  }
  return readFileSync(ledgerPath, "utf8")
    .split("\n")
    .filter((value) => value.length > 0);
}

function protectedFileValues(name: string): string[] {
  const filePath = process.env[name];
  if (!filePath) return [];

  let content: string;
  try {
    const stats = statSync(filePath);
    if (!stats.isFile() || (stats.mode & 0o777) !== 0o600) {
      throw new Error("invalid protected file");
    }
    content = readFileSync(filePath, "utf8");
  } catch {
    throw new Error("assistant protected secret file is invalid");
  }
  if (content.trim().length === 0) {
    throw new Error("assistant protected secret file is invalid");
  }
  return [filePath, content];
}

function runtimeProtectedValues(): string[] {
  return [
    "http://agent:7777",
    ...optionalEnvironment("BETTER_AUTH_SECRET"),
    ...optionalEnvironment("MIGRATOR_DATABASE_URL"),
    ...optionalEnvironment("RUNTIME_DATABASE_URL"),
    ...protectedFileValues("POSTGRES_PASSWORD_FILE"),
    ...protectedFileValues("MIGRATOR_DATABASE_PASSWORD_FILE"),
    ...protectedFileValues("RUNTIME_DATABASE_PASSWORD_FILE"),
    ...protectedFileValues("BACKUP_DATABASE_PASSWORD_FILE"),
    ...protectedFileValues("BACKUP_ENCRYPTION_KEY_FILE"),
    ...protectedFileValues("AGNO_MIGRATOR_DATABASE_PASSWORD_FILE"),
    ...protectedFileValues("AGNO_DATABASE_PASSWORD_FILE"),
    ...protectedFileValues("MIGRATOR_DATABASE_URL_FILE"),
    ...protectedFileValues("RUNTIME_DATABASE_URL_FILE"),
    ...protectedFileValues("AGNO_MIGRATOR_DATABASE_URL_FILE"),
    ...protectedFileValues("AGNO_DATABASE_URL_FILE"),
    ...protectedFileValues("AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD_FILE"),
    ...protectedFileValues("AGENT_CONTROL_DATABASE_PASSWORD_FILE"),
    ...protectedFileValues("AGENT_CONTROL_MIGRATOR_DATABASE_URL_FILE"),
    ...protectedFileValues("AGENT_CONTROL_DATABASE_URL_FILE"),
    ...protectedFileValues("SKILL_REGISTRY_MIGRATOR_DATABASE_PASSWORD_FILE"),
    ...protectedFileValues("SKILL_REGISTRY_DATABASE_PASSWORD_FILE"),
    ...protectedFileValues("SKILL_REGISTRY_RUNTIME_DATABASE_PASSWORD_FILE"),
    ...protectedFileValues("SKILL_REGISTRY_MIGRATOR_DATABASE_URL_FILE"),
    ...protectedFileValues("SKILL_REGISTRY_DATABASE_URL_FILE"),
    ...protectedFileValues("SKILL_REGISTRY_RUNTIME_DATABASE_URL_FILE"),
    ...protectedFileValues("BETTER_AUTH_SECRET_FILE"),
    ...protectedFileValues("OS_SECURITY_KEY_FILE"),
    ...protectedFileValues("ASSISTANT_RATE_LIMIT_SECRET_FILE"),
    ...protectedFileValues("MODEL_API_KEY_FILE"),
    ...protectedFileValues("MODEL_CONFIG_ENCRYPTION_KEY_FILE"),
    ...protectedFileValues("AGENT_CONFIG_CONTROL_KEY_FILE"),
    ...protectedFileValues("SKILL_REGISTRY_CONTROL_KEY_FILE"),
    ...protectedLedgerValues("AAP_RUNTIME_MODEL_KEYS_FILE"),
  ];
}

function composeArgs(...args: string[]): string[] {
  return [
    "compose",
    "-p",
    requiredEnvironment("AAP_RUNTIME_E2E_PROJECT"),
    "--env-file",
    requiredEnvironment("AAP_RUNTIME_E2E_ENV_FILE"),
    "-f",
    "compose.yaml",
    "-f",
    "compose.e2e.yaml",
    ...args,
  ];
}

function internalUnauthenticatedWebSocketStatus(): number {
  const script = `
const net = require("node:net");
const socket = net.createConnection({ host: "agent", port: 7777 });
let response = "";
const timer = setTimeout(() => process.exit(2), 5000);
socket.on("connect", () => socket.write([
  "GET /workflows/ws HTTP/1.1",
  "Host: agent:7777",
  "Upgrade: websocket",
  "Connection: Upgrade",
  "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
  "Sec-WebSocket-Version: 13",
  "",
  "",
].join("\\r\\n")));
socket.on("data", (chunk) => {
  response += chunk.toString("utf8");
  if (!response.includes("\\r\\n\\r\\n")) return;
  clearTimeout(timer);
  const match = response.match(/^HTTP\\/1\\.1 (\\d{3}) /u);
  if (!match) process.exit(3);
  process.stdout.write(match[1]);
  socket.destroy();
});
socket.on("error", () => process.exit(4));
`;
  const output = execFileSync(
    "docker",
    composeArgs("exec", "-T", "web", "node", "-e", script),
    {
      cwd: path.resolve(process.cwd(), "../.."),
      encoding: "utf8",
      timeout: 10_000,
    },
  ).trim();
  const status = Number(output);
  if (!Number.isSafeInteger(status)) {
    throw new Error("internal WebSocket rejection did not return HTTP status");
  }
  return status;
}

function servicePortBindings(service: "agent" | "db"): string {
  const containerId = execFileSync("docker", composeArgs("ps", "-q", service), {
    cwd: path.resolve(process.cwd(), "../.."),
    encoding: "utf8",
    timeout: 30_000,
  }).trim();
  if (!containerId) throw new Error(`${service} container is unavailable`);
  return execFileSync(
    "docker",
    ["inspect", "--format", "{{json .HostConfig.PortBindings}}", containerId],
    {
      cwd: path.resolve(process.cwd(), "../.."),
      encoding: "utf8",
      timeout: 30_000,
    },
  ).trim();
}

function composeOutput(
  args: string[],
  environment: Record<string, string | undefined> = {},
): string {
  return execFileSync("docker", composeArgs(...args), {
    cwd: path.resolve(process.cwd(), "../.."),
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, ...environment },
  }).trim();
}

function agentContainerMetadata(): { id: string; startedAt: string } {
  const id = composeOutput(["ps", "-q", "agent"]);
  if (!id) throw new Error("agent container is unavailable");
  const startedAt = execFileSync(
    "docker",
    ["inspect", "--format", "{{.State.StartedAt}}", id],
    { encoding: "utf8", timeout: 30_000 },
  ).trim();
  return { id, startedAt };
}

function recreateAgent(enabled: boolean): void {
  composeOutput(
    ["up", "-d", "--no-deps", "--force-recreate", "--wait", "agent"],
    { AGENT_ENABLED: enabled ? "true" : "false" },
  );
}

function databaseQuery(sql: string): string {
  return composeOutput([
    "exec",
    "-T",
    "db",
    "psql",
    "--username",
    requiredEnvironment("POSTGRES_USER"),
    "--dbname",
    requiredEnvironment("POSTGRES_DB"),
    "--tuples-only",
    "--no-align",
    "--command",
    sql,
  ]);
}

const BLOCKED_RESPONSE_KEYS = new Set([
  "agentosinternalurl",
  "ossecuritykey",
  "assistantsessionsecret",
  "assistantratelimitsecret",
  "authorization",
  "cookie",
  "useragent",
  "xrealip",
]);

function normalizeResponseKey(key: string): string {
  return key.replaceAll(/[^a-z0-9]/giu, "").toLowerCase();
}

function isBlockedResponseKey(key: string): boolean {
  const normalized = normalizeResponseKey(key);
  return (
    BLOCKED_RESPONSE_KEYS.has(normalized) ||
    /^(?:internal)?(?:run|session)id$/u.test(normalized)
  );
}

function containsBlockedResponseKey(
  value: unknown,
  visited = new WeakSet<object>(),
): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (visited.has(value)) return false;
  visited.add(value);
  if (Array.isArray(value)) {
    return value.some((entry) => containsBlockedResponseKey(entry, visited));
  }

  return Object.entries(value).some(
    ([key, entry]) =>
      isBlockedResponseKey(key) || containsBlockedResponseKey(entry, visited),
  );
}

function containsProtectedString(
  value: unknown,
  protectedValues: string[],
  visited = new WeakSet<object>(),
): boolean {
  if (typeof value === "string") {
    return protectedValues.some(
      (protectedValue) =>
        protectedValue.length > 0 && value.includes(protectedValue),
    );
  }
  if (typeof value !== "object" || value === null) return false;
  if (visited.has(value)) return false;
  visited.add(value);
  return Object.values(value).some((entry) =>
    containsProtectedString(entry, protectedValues, visited),
  );
}

function expectNoProtectedValue(
  body: unknown,
  protectedValues: string[],
  rawJson?: string,
) {
  const leaked =
    containsProtectedString(body, protectedValues) ||
    (rawJson !== undefined &&
      protectedValues.some(
        (value) => value.length > 0 && rawJson.includes(value),
      ));
  expect(leaked, "protected value leaked in assistant response").toBe(false);

  expect(
    containsBlockedResponseKey(body),
    "internal assistant field leaked in response",
  ).toBe(false);
}

function parseSafeJson(rawJson: string, protectedValues: string[]): unknown {
  let body: unknown;
  try {
    body = JSON.parse(rawJson) as unknown;
  } catch {
    throw new Error("assistant response must be valid JSON");
  }
  expectNoProtectedValue(body, protectedValues, rawJson);
  return body;
}

async function readSafeJson(
  response: APIResponse,
  protectedValues: string[],
): Promise<unknown> {
  expectNoAssistantCookie(response.headers()["set-cookie"]);
  return parseSafeJson(await response.text(), protectedValues);
}

function parseSafeAssistantStreamEvents(
  contentType: string | undefined,
  rawStream: string,
  protectedValues: string[],
): AssistantStreamEvent[] {
  expect(
    contentType?.split(";", 1)[0]?.trim().toLowerCase() ===
      ASSISTANT_STREAM_MEDIA_TYPE,
    "AgentOS stream response must use SSE",
  ).toBe(true);

  const events: AssistantStreamEvent[] = [];
  let remainder = rawStream.replaceAll("\r\n", "\n");
  let boundary = remainder.indexOf("\n\n");
  while (boundary !== -1) {
    const rawFrame = remainder.slice(0, boundary);
    remainder = remainder.slice(boundary + 2);
    if (rawFrame.length > 0) {
      const event = parseAssistantStreamFrame(rawFrame);
      if (event === null) {
        throw new Error("assistant SSE response contains an invalid frame");
      }
      events.push(event);
    }
    boundary = remainder.indexOf("\n\n");
  }
  if (remainder.trim().length > 0) {
    throw new Error("assistant SSE response contains trailing data");
  }

  expectNoProtectedValue(events, protectedValues, rawStream);
  return events;
}

function parseSafeAssistantStream(
  contentType: string | undefined,
  rawStream: string,
  protectedValues: string[],
): ParsedAssistantStreamResponse {
  const events = parseSafeAssistantStreamEvents(
    contentType,
    rawStream,
    protectedValues,
  );

  const content: string[] = [];
  const activities: AssistantStreamActivityEvent[] = [];
  const actions: AssistantStreamActionEvent["action"][] = [];
  let contentCodePoints = 0;
  let done = false;
  for (const event of events) {
    if (done) {
      throw new Error("assistant SSE response contains events after done");
    }
    if (event.type === "answer_delta") {
      contentCodePoints += Array.from(event.content).length;
      if (contentCodePoints > ASSISTANT_CONTENT_MAX_CODE_POINTS) {
        throw new Error("assistant SSE response exceeds the content limit");
      }
      content.push(event.content);
      continue;
    }
    if (event.type === "activity") {
      activities.push(event);
      continue;
    }
    if (event.type === "action") {
      actions.push(event.action);
      continue;
    }
    if (event.type === "done") {
      done = true;
      continue;
    }
    if (event.type === "error") {
      throw new Error("assistant SSE response contains an error event");
    }
    throw new Error("assistant SSE response has an invalid event order");
  }

  if (content.length === 0 || content.join("").trim().length === 0 || !done) {
    throw new Error("assistant SSE response is incomplete");
  }

  const response: ParsedAssistantStreamResponse = {
    message: { role: "assistant", content: content.join("") },
    activities,
    actions,
  };
  expectNoProtectedValue(response, protectedValues, rawStream);
  return response;
}

function parseSafeAssistantErrorStream(
  contentType: string | undefined,
  rawStream: string,
  protectedValues: string[],
): ParsedAssistantStreamResponse {
  const events = parseSafeAssistantStreamEvents(
    contentType,
    rawStream,
    protectedValues,
  );
  const content: string[] = [];
  const activities: AssistantStreamActivityEvent[] = [];
  const actions: AssistantStreamActionEvent["action"][] = [];
  let contentCodePoints = 0;
  let errored = false;
  for (const event of events) {
    if (errored) {
      throw new Error(
        "assistant SSE error response contains events after error",
      );
    }
    if (event.type === "answer_delta") {
      contentCodePoints += Array.from(event.content).length;
      if (contentCodePoints > ASSISTANT_CONTENT_MAX_CODE_POINTS) {
        throw new Error(
          "assistant SSE error response exceeds the content limit",
        );
      }
      content.push(event.content);
      continue;
    }
    if (event.type === "activity") {
      activities.push(event);
      continue;
    }
    if (event.type === "action") {
      actions.push(event.action);
      continue;
    }
    if (event.type === "error") {
      errored = true;
      continue;
    }
    if (event.type === "done") {
      throw new Error("assistant SSE error response must not contain done");
    }
    throw new Error("assistant SSE error response has an invalid event order");
  }

  if (!errored) {
    throw new Error("assistant SSE error response is incomplete");
  }

  const response: ParsedAssistantStreamResponse = {
    message: { role: "assistant", content: content.join("") },
    activities,
    actions,
  };
  expectNoProtectedValue(response, protectedValues, rawStream);
  return response;
}

async function readSafeAssistantStream(
  response: APIResponse,
  protectedValues: string[],
): Promise<ParsedAssistantStreamResponse> {
  expectNoAssistantCookie(response.headers()["set-cookie"]);
  return parseSafeAssistantStream(
    response.headers()["content-type"],
    await response.text(),
    protectedValues,
  );
}

async function readSafeAssistantErrorStream(
  response: APIResponse,
  protectedValues: string[],
): Promise<ParsedAssistantStreamResponse> {
  expectNoAssistantCookie(response.headers()["set-cookie"]);
  return parseSafeAssistantErrorStream(
    response.headers()["content-type"],
    await response.text(),
    protectedValues,
  );
}

function assertNoPublicInvalidModelOutput(value: unknown): void {
  expect(
    /(?:__aap_e2e_invalid_response__|deterministic-turn|invalid_response)/iu.test(
      JSON.stringify(value),
    ),
    "invalid model output reached the public response",
  ).toBe(false);
}

function collectBrowserDiagnostics(context: BrowserContext) {
  const registeredPages = new WeakSet<Page>();
  const registerPage = (page: Page) => {
    if (registeredPages.has(page)) return;
    registeredPages.add(page);
    page.on("console", (message) => {
      cumulativeConsoleMessages.push(message.text());
    });
    page.on("pageerror", (error) => {
      cumulativeConsoleMessages.push(error.message);
    });
  };

  for (const page of context.pages()) registerPage(page);
  context.on("page", registerPage);
}

function expectNoAssistantCookie(setCookie: string | null | undefined): void {
  expect(
    /(?:^|,\s*)aap_assistant_/u.test(setCookie ?? ""),
    "assistant response must not set an assistant cookie",
  ).toBe(false);
}

async function expectRemovedAssistantSessionRoutes(
  request: APIRequestContext,
): Promise<void> {
  const publicPath = ["/api/v1/assistant", "session"].join("/");
  const adminPath = ["/api/v1/admin/assistant", "sessions"].join("/");
  for (const response of [
    await request.delete(publicPath),
    await request.get(adminPath),
  ]) {
    expect(response.status()).toBe(404);
    expectNoAssistantCookie(response.headers()["set-cookie"]);
  }
}

type BoundedReadinessObservation = {
  ready: boolean;
  description: string;
};

async function pollReadinessWithinBudget<T>({
  budgetMs,
  getStatus,
  inspect,
  now = Date.now,
  pause = (delayMs) =>
    new Promise<void>((resolve) => setTimeout(resolve, delayMs)),
}: {
  budgetMs: number;
  getStatus: (timeoutMs: number) => Promise<T>;
  inspect: (value: T) => BoundedReadinessObservation;
  now?: () => number;
  pause?: (delayMs: number) => Promise<void>;
}): Promise<BoundedReadinessObservation> {
  const deadline = now() + budgetMs;
  let lastObservation: BoundedReadinessObservation = {
    ready: false,
    description: "no status response",
  };
  while (true) {
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      return lastObservation;
    }
    const requestTimeoutMs = Math.min(5_000, remainingMs);
    try {
      lastObservation = inspect(await getStatus(requestTimeoutMs));
    } catch (error) {
      const failureKind = error instanceof Error ? error.name : "unknown";
      lastObservation = {
        ready: false,
        description: `status request ${failureKind} after ${requestTimeoutMs}ms`,
      };
    }
    if (lastObservation.ready) {
      return lastObservation;
    }
    const pollDelayMs = Math.min(100, deadline - now());
    if (pollDelayMs > 0) {
      await pause(pollDelayMs);
    }
  }
}

test.describe.configure({ mode: "serial" });

test.describe("@guard assistant response safety guard", () => {
  test("bounds stalled readiness requests to their remaining total budget", async () => {
    let currentTime = 4_000;
    const requestedTimeouts: number[] = [];
    const outcome = await pollReadinessWithinBudget({
      budgetMs: 10_000,
      now: () => currentTime,
      getStatus: async (timeoutMs) => {
        requestedTimeouts.push(timeoutMs);
        currentTime += timeoutMs;
        throw new Error("stalled status request");
      },
      inspect: () => ({ ready: true, description: "unreachable" }),
    });

    expect(requestedTimeouts).toEqual([5_000, 5_000]);
    expect(requestedTimeouts.every((timeoutMs) => timeoutMs < 30_000)).toBe(
      true,
    );
    expect(outcome).toEqual({
      ready: false,
      description: "status request Error after 5000ms",
    });
  });

  test("rejects internal run and session identifier keys recursively", () => {
    const forbiddenKeys = [
      "sessionId",
      "session_id",
      "runId",
      "run_id",
      "internalSessionId",
    ];
    const rejected = forbiddenKeys.map((key) => {
      try {
        expectNoProtectedValue({ nested: [{ [key]: "opaque-id" }] }, []);
        return false;
      } catch {
        return true;
      }
    });

    expect(
      rejected.every(Boolean),
      "guard must reject every internal run or session identifier key",
    ).toBe(true);
  });

  test("allows requestId and message.id", () => {
    expectNoProtectedValue(
      {
        requestId: "public-request-id",
        message: { id: "public-message-id", content: "safe" },
      },
      [],
    );
  });

  test("rejects protected string values without rendering them", () => {
    const protectedValue = "guard-unit-secret-never-render";
    let rejected = false;
    let safeFailure = false;
    try {
      expectNoProtectedValue(
        { nested: [{ value: `prefix-${protectedValue}-suffix` }] },
        [protectedValue],
      );
    } catch (error) {
      rejected = true;
      const message = error instanceof Error ? error.message : "";
      safeFailure =
        message.includes("protected value leaked in assistant response") &&
        !message.includes(protectedValue);
    }

    expect(rejected, "guard must reject protected string values").toBe(true);
    expect(
      safeFailure,
      "guard failure must use a fixed message without protected data",
    ).toBe(true);

    const dynamicSecret = `debug-metadata-${randomUUID()}`;
    let exactShapeRejected = false;
    let exactShapeFailure = "";
    try {
      assertSafeResponse(
        { version: "1", debug: { metadata: dynamicSecret } },
        "guard response",
      ).matches({ version: "1" });
    } catch (error) {
      exactShapeRejected = true;
      exactShapeFailure =
        error instanceof Error ? error.message : String(error);
    }
    expect(
      exactShapeRejected,
      "exact response shape must reject unknown fields",
    ).toBe(true);
    expect(
      exactShapeFailure.includes(dynamicSecret),
      "exact shape failure rendered an unknown sensitive value",
    ).toBe(false);
  });

  test("loads chmod 600 secret contents while preserving the file path", () => {
    const secretDirectory = mkdtempSync(
      path.join(os.tmpdir(), "aap-runtime-guard-"),
    );
    const secretPath = path.join(secretDirectory, "model-api-key");
    const protectedValue = "file-backed-guard-secret-never-render";
    const originalPath = process.env.MODEL_API_KEY_FILE;
    writeFileSync(secretPath, protectedValue, { mode: 0o600 });
    chmodSync(secretPath, 0o600);
    process.env.MODEL_API_KEY_FILE = secretPath;

    let rejected = false;
    let safeFailure = false;
    try {
      const protectedValues = runtimeProtectedValues();
      try {
        expectNoProtectedValue({ value: protectedValue }, protectedValues);
      } catch (error) {
        rejected = true;
        const message = error instanceof Error ? error.message : "";
        safeFailure =
          !message.includes(protectedValue) && !message.includes(secretPath);
      }
    } finally {
      if (originalPath === undefined) delete process.env.MODEL_API_KEY_FILE;
      else process.env.MODEL_API_KEY_FILE = originalPath;
      rmSync(secretDirectory, { recursive: true, force: true });
    }

    expect(
      rejected,
      "guard must reject the contents loaded from a secret file",
    ).toBe(true);
    expect(
      safeFailure,
      "file-backed guard failure must not reveal path or content",
    ).toBe(true);
  });

  test("fails closed for unreadable, empty, or non-600 secret files", () => {
    const secretDirectory = mkdtempSync(
      path.join(os.tmpdir(), "aap-runtime-guard-invalid-"),
    );
    const originalPath = process.env.MODEL_API_KEY_FILE;
    const scenarios = [
      path.join(secretDirectory, "missing"),
      path.join(secretDirectory, "empty"),
      path.join(secretDirectory, "wrong-mode"),
    ];
    writeFileSync(scenarios[1]!, "", { mode: 0o600 });
    writeFileSync(scenarios[2]!, "mode-secret", { mode: 0o644 });
    chmodSync(scenarios[2]!, 0o644);

    const outcomes: Array<{ rejected: boolean; safeFailure: boolean }> = [];
    try {
      for (const secretPath of scenarios) {
        process.env.MODEL_API_KEY_FILE = secretPath;
        try {
          runtimeProtectedValues();
          outcomes.push({ rejected: false, safeFailure: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          outcomes.push({
            rejected: true,
            safeFailure:
              message.includes("protected secret file is invalid") &&
              !message.includes(secretPath),
          });
        }
      }
    } finally {
      if (originalPath === undefined) delete process.env.MODEL_API_KEY_FILE;
      else process.env.MODEL_API_KEY_FILE = originalPath;
      rmSync(secretDirectory, { recursive: true, force: true });
    }

    expect(
      outcomes.every((outcome) => outcome.rejected),
      "invalid secret files must fail closed",
    ).toBe(true);
    expect(
      outcomes.every((outcome) => outcome.safeFailure),
      "invalid secret file errors must be fixed and path-free",
    ).toBe(true);
  });

  test("reconstructs only complete safe AgentOS SSE responses", () => {
    const done = { type: "done" as const };
    const valid = [
      {
        type: "activity" as const,
        phase: "analyzing" as const,
        label: "正在分析问题",
      },
      { type: "answer_delta" as const, content: "safe " },
      { type: "answer_delta" as const, content: "stream" },
      {
        type: "action" as const,
        action: {
          kind: "navigate" as const,
          pathname: "/pricing",
          label: "价格与服务",
        },
      },
      done,
    ]
      .map(formatAssistantStreamEvent)
      .join("");

    assertSafeResponse(
      parseSafeAssistantStream(
        `${ASSISTANT_STREAM_MEDIA_TYPE}; charset=utf-8`,
        valid,
        [],
      ),
      "guard SSE reconstruction",
    ).matches({
      message: { role: "assistant", content: "safe stream" },
      activities: [
        { type: "activity", phase: "analyzing", label: "正在分析问题" },
      ],
      actions: [
        { kind: "navigate", pathname: "/pricing", label: "价格与服务" },
      ],
    });

    const invalidStreams = [
      ["data: not-json\n\n", "invalid frame"],
      [valid.trimEnd(), "trailing data"],
      [formatAssistantStreamEvent(done), "incomplete"],
      [
        [
          formatAssistantStreamEvent({
            type: "error",
            code: "stream_interrupted",
            message: "回答中断，请重试。",
          }),
        ].join(""),
        "error event",
      ],
      [
        [
          formatAssistantStreamEvent({
            type: "answer_delta",
            content: " \n",
          }),
          formatAssistantStreamEvent(done),
        ].join(""),
        "incomplete",
      ],
      [
        [
          formatAssistantStreamEvent({
            type: "answer_delta",
            content: "x".repeat(ASSISTANT_CONTENT_MAX_CODE_POINTS),
          }),
          formatAssistantStreamEvent({
            type: "answer_delta",
            content: "y",
          }),
          formatAssistantStreamEvent(done),
        ].join(""),
        "content limit",
      ],
    ] as const;
    for (const [rawStream, expectedFailure] of invalidStreams) {
      expect(() =>
        parseSafeAssistantStream(ASSISTANT_STREAM_MEDIA_TYPE, rawStream, []),
      ).toThrow(expectedFailure);
    }
    expect(() =>
      parseSafeAssistantStream("text/event-stream-invalid", valid, []),
    ).toThrow("must use SSE");

    const protectedValue = "guard-sse-secret-never-render";
    let protectedFailure = "";
    try {
      parseSafeAssistantStream(
        ASSISTANT_STREAM_MEDIA_TYPE,
        [
          formatAssistantStreamEvent({
            type: "answer_delta",
            content: protectedValue,
          }),
          formatAssistantStreamEvent(done),
        ].join(""),
        [protectedValue],
      );
    } catch (error) {
      protectedFailure = error instanceof Error ? error.message : "";
    }
    expect(protectedFailure).toContain(
      "protected value leaked in assistant response",
    );
    expect(protectedFailure).not.toContain(protectedValue);
  });

  test("accepts only a safe terminal AgentOS SSE error stream", () => {
    const error = {
      type: "error" as const,
      code: "stream_interrupted" as const,
      message: "回答中断，请重试。",
    };
    const rawErrorStream = [
      formatAssistantStreamEvent({
        type: "answer_delta" as const,
        content: "started before failure",
      }),
      formatAssistantStreamEvent(error),
    ].join("");

    assertSafeResponse(
      parseSafeAssistantErrorStream(
        ASSISTANT_STREAM_MEDIA_TYPE,
        rawErrorStream,
        [],
      ),
      "guard SSE error envelope",
    ).matches({
      message: { role: "assistant", content: "started before failure" },
      activities: [],
      actions: [],
    });
    expect(() =>
      parseSafeAssistantStream(ASSISTANT_STREAM_MEDIA_TYPE, rawErrorStream, []),
    ).toThrow("error event");

    const invalidStreams = [
      [
        [formatAssistantStreamEvent({ type: "done" })].join(""),
        "must not contain done",
      ],
      [
        [
          formatAssistantStreamEvent(error),
          formatAssistantStreamEvent({
            type: "answer_delta",
            content: "after-error",
          }),
        ].join(""),
        "events after error",
      ],
      [
        formatAssistantStreamEvent({
          type: "answer_delta",
          content: "partial",
        }),
        "incomplete",
      ],
    ] as const;
    for (const [invalidRawStream, expectedFailure] of invalidStreams) {
      expect(() =>
        parseSafeAssistantErrorStream(
          ASSISTANT_STREAM_MEDIA_TYPE,
          invalidRawStream,
          [],
        ),
      ).toThrow(expectedFailure);
    }

    const protectedValue = "guard-sse-error-secret-never-render";
    let protectedFailure = "";
    try {
      parseSafeAssistantErrorStream(
        ASSISTANT_STREAM_MEDIA_TYPE,
        [
          formatAssistantStreamEvent({
            type: "answer_delta",
            content: protectedValue,
          }),
          formatAssistantStreamEvent(error),
        ].join(""),
        [protectedValue],
      );
    } catch (caught) {
      protectedFailure = caught instanceof Error ? caught.message : "";
    }
    expect(protectedFailure).toContain(
      "protected value leaked in assistant response",
    );
    expect(protectedFailure).not.toContain(protectedValue);

    const forbiddenPartialError = parseSafeAssistantErrorStream(
      ASSISTANT_STREAM_MEDIA_TYPE,
      [
        formatAssistantStreamEvent({
          type: "answer_delta",
          content: INVALID_RESPONSE_SENTINEL,
        }),
        formatAssistantStreamEvent(error),
      ].join(""),
      [],
    );
    expect(forbiddenPartialError.message.content).toBe(
      INVALID_RESPONSE_SENTINEL,
    );
    expect(() =>
      assertNoPublicInvalidModelOutput(forbiddenPartialError),
    ).toThrow("invalid model output reached the public response");
  });

  test("routes every assistant JSON body through the safety guard", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "e2e/assistant-runtime.spec.ts"),
      "utf8",
    );
    const directJsonCall = [".", "json", "(", ")"].join("");

    expect(
      source.includes(directJsonCall),
      "assistant response bodies must not bypass the safety guard",
    ).toBe(false);
  });
});

test("public runtime is ready, placeholder chat is safe, and Nginx owns the first IP limit", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("BASE_URL is required");
  const protectedValues = runtimeProtectedValues();
  const context = await browser.newContext({ baseURL });
  collectBrowserDiagnostics(context);
  const page = await context.newPage();

  await page.goto("/assistant");
  const statusResponse = await context.request.get(STATUS_PATH);
  expect(statusResponse.status()).toBe(200);
  const status = await readSafeJson(statusResponse, protectedValues);
  assertSafeResponse(status, "placeholder public status").matches({
    version: "1",
    requestId: requestIdMatcher,
    live: true,
    ready: true,
    capability: "placeholder",
    message: "模型尚未配置，当前为安全占位模式。",
  });

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(CHAT_PATH) &&
      response.request().method() === "POST",
  );
  const chat = await page.evaluate(async (input) => {
    const response = await fetch("/api/v1/assistant/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "public-browser-runtime-e2e",
      },
      body: JSON.stringify(input),
    });
    return { status: response.status, rawJson: await response.text() };
  }, CHAT_BODY);
  const browserResponse = await responsePromise;
  const chatBody = parseSafeJson(chat.rawJson, protectedValues);
  expect(chat.status).toBe(200);
  assertSafeResponse(chatBody, "placeholder public chat").matches({
    version: "1",
    requestId: "public-browser-runtime-e2e",
    mode: "placeholder",
    message: {
      id: messageIdMatcher,
      role: "assistant",
      content: "你可以从快速开始文档了解平台结构和使用入口。",
    },
    suggestedActions: [{ label: "查看快速开始", href: "/docs#quick-start" }],
  });
  expectNoAssistantCookie(await browserResponse.headerValue("set-cookie"));
  await expectRemovedAssistantSessionRoutes(context.request);

  const burst = await Promise.all(
    Array.from({ length: 11 }, () =>
      context.request.post(CHAT_PATH, {
        headers: { "x-request-id": "bff-rate-limit-sentinel" },
        data: CHAT_BODY,
      }),
    ),
  );
  expect(
    burst.filter((response) => response.status() === 200).length === 10,
    "placeholder burst success count is invalid",
  ).toBe(true);
  const rejected = burst.filter((response) => response.status() === 429);
  expect(
    rejected.length === 1,
    "placeholder burst rejection count is invalid",
  ).toBe(true);
  expect(
    rejected[0]!.headers()["retry-after"] === "60",
    "rate limit retry interval is invalid",
  ).toBe(true);
  const rejection = await readSafeJson(rejected[0]!, protectedValues);
  assertSafeResponse(rejection, "placeholder rate limit").matches({
    version: "1",
    requestId: nginxRequestIdMatcher,
    error: {
      code: "rate_limited",
      message: "请求过于频繁，请稍后再试。",
      retryable: true,
    },
  });
  expect(
    (rejection as { requestId: string }).requestId ===
      "bff-rate-limit-sentinel",
    "Nginx must replace the untrusted request identifier",
  ).toBe(false);

  await context.close();
});

test("protected assistant APIs enforce 401, 403, and safe admin success", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("BASE_URL is required");
  const credentials = fixtureCredentials();
  const protectedValues = [
    ...runtimeProtectedValues(),
    requiredEnvironment("BETTER_AUTH_SECRET"),
    credentials.staffSessionToken,
    credentials.adminSessionToken,
  ];

  const anonymous = await requestFactory.newContext({ baseURL });
  for (const [method, endpoint] of [
    ["get", ADMIN_STATUS_PATH],
    ["post", ADMIN_CHAT_PATH],
  ] as const) {
    const response =
      method === "get"
        ? await anonymous.get(endpoint)
        : await anonymous.post(endpoint, { data: CHAT_BODY });
    expect(response.status()).toBe(401);
    const body = await readSafeJson(response, protectedValues);
    assertSafeResponse(body, "anonymous admin rejection").matches({
      version: "1",
      requestId: requestIdMatcher,
      error: {
        code: "authentication_required",
        message: "Authentication required",
        retryable: false,
      },
    });
  }
  await anonymous.dispose();

  const staff = await browser.newContext({ baseURL });
  collectBrowserDiagnostics(staff);
  await addSignedSession(
    staff,
    baseURL,
    "workforce",
    credentials.staffSessionToken,
  );
  for (const [method, endpoint] of [
    ["get", ADMIN_STATUS_PATH],
    ["post", ADMIN_CHAT_PATH],
  ] as const) {
    const response =
      method === "get"
        ? await staff.request.get(endpoint)
        : await staff.request.post(endpoint, { data: CHAT_BODY });
    expect(response.status()).toBe(403);
    const body = await readSafeJson(response, protectedValues);
    assertSafeResponse(body, "staff admin rejection").matches({
      version: "1",
      requestId: requestIdMatcher,
      error: {
        code: "permission_denied",
        message: "Permission denied",
        retryable: false,
      },
    });
  }
  await staff.close();

  const admin = await browser.newContext({ baseURL });
  collectBrowserDiagnostics(admin);
  await addSignedSession(
    admin,
    baseURL,
    "workforce",
    credentials.adminSessionToken,
  );
  const adminStatusResponse = await admin.request.get(ADMIN_STATUS_PATH);
  expect(adminStatusResponse.status()).toBe(200);
  const adminStatus = await readSafeJson(adminStatusResponse, protectedValues);
  assertSafeResponse(adminStatus, "placeholder admin status").matches({
    version: "1",
    requestId: requestIdMatcher,
    status: {
      mode: "placeholder",
      runtime: {
        live: true,
        ready: true,
        capability: "placeholder",
        providerMode: "placeholder",
        selectedProvider: "placeholder",
        persistence: "disabled",
        circuits: {
          readiness: { state: "closed", consecutiveFailures: 0 },
          execution: { state: "closed", consecutiveFailures: 0 },
        },
        readiness: { cacheTtlMs: 0, probeTimeoutMs: 0, failureThreshold: 0 },
        source: "none",
        provider: null,
        modelId: null,
        configRevision: null,
        activationVersion: null,
        testStatus: "not_configured",
      },
      services: [
        {
          id: "agentos",
          label: "AgentOS",
          state: "not_connected",
          detail: "尚未探测",
        },
        {
          id: "database",
          label: "运行数据库",
          state: "not_connected",
          detail: "尚未探测",
        },
        {
          id: "model",
          label: "模型",
          state: "not_configured",
          detail: "尚未配置",
        },
        {
          id: "public_entry",
          label: "公开入口",
          state: "placeholder",
          detail: "占位模式可用",
        },
      ],
      configuration: {
        defaultAgent: "码多多（占位）",
        model: "未配置",
        skills: "已接入",
        pageMemory: "仅当前页面内存；刷新或离开后清空",
      },
      message: "公开入口使用安全占位模式；AgentOS 基础设施尚未探测。",
    },
  });

  const adminChatResponse = await admin.request.post(ADMIN_CHAT_PATH, {
    data: CHAT_BODY,
  });
  expect(adminChatResponse.status()).toBe(200);
  const adminChat = await readSafeJson(adminChatResponse, protectedValues);
  assertSafeResponse(adminChat, "placeholder admin chat").matches({
    version: "1",
    requestId: requestIdMatcher,
    mode: "placeholder",
    message: {
      id: messageIdMatcher,
      role: "assistant",
      content: "你可以从快速开始文档了解平台结构和使用入口。",
    },
    suggestedActions: [{ label: "查看快速开始", href: "/docs#quick-start" }],
  });
  await admin.close();
});

test.describe("@agentos deterministic runtime", () => {
  test("reports only 码多多 as available for the public run", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("BASE_URL is required");
    const protectedValues = runtimeProtectedValues();
    const publicContext = await browser.newContext({ baseURL });
    const publicStatusResponse = await publicContext.request.get(STATUS_PATH);
    expect(publicStatusResponse.status()).toBe(200);
    const publicStatus = await readSafeJson(
      publicStatusResponse,
      protectedValues,
    );
    assertSafeResponse(publicStatus, "AgentOS public status").matches({
      version: "1",
      requestId: requestIdMatcher,
      live: true,
      ready: true,
      capability: "available",
      message: "AI 助理基础服务已就绪。",
    });
    expect(
      /(?:maduoduo|e2e-deterministic|deterministic-turn|当前页面路径|用户问题)/iu.test(
        JSON.stringify(publicStatus),
      ),
      "public status exposed internal Agent data",
    ).toBe(false);

    const publicChatResponse = await publicContext.request.post(CHAT_PATH, {
      data: CHAT_BODY,
    });
    expect(publicChatResponse.status()).toBe(200);
    const publicChat = await readSafeAssistantStream(
      publicChatResponse,
      protectedValues,
    );
    assertSafeResponse(publicChat, "AgentOS public chat").matches({
      message: {
        role: "assistant",
        content: "deterministic-turn:1",
      },
      activities: safeRule((value) => Array.isArray(value)),
      actions: [],
    });
    await publicContext.close();
  });

  test("serves the Admin deterministic run with current-page memory", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("BASE_URL is required");
    const protectedValues = runtimeProtectedValues();
    const credentials = fixtureCredentials();
    const admin = await browser.newContext({ baseURL });
    collectBrowserDiagnostics(admin);
    await addSignedSession(
      admin,
      baseURL,
      "workforce",
      credentials.adminSessionToken,
    );

    const adminStatusResponse = await admin.request.get(ADMIN_STATUS_PATH);
    expect(adminStatusResponse.status()).toBe(200);
    const adminStatus = await readSafeJson(adminStatusResponse, [
      ...protectedValues,
      credentials.adminSessionToken,
    ]);
    assertSafeResponse(adminStatus, "AgentOS admin status").matches({
      version: "1",
      requestId: requestIdMatcher,
      status: {
        mode: "agentos",
        runtime: {
          live: true,
          ready: true,
          capability: "available",
          providerMode: "agentos",
          selectedProvider: "agentos",
          persistence: "disabled",
          circuits: {
            readiness: { state: "closed", consecutiveFailures: 0 },
            execution: { state: "closed", consecutiveFailures: 0 },
          },
          readiness: {
            cacheTtlMs: 1000,
            probeTimeoutMs: 500,
            failureThreshold: 1,
          },
          source: "deployment",
          provider: "openai",
          modelId: "e2e-deterministic",
          configRevision: null,
          activationVersion: null,
          testStatus: "untested",
        },
        services: [
          {
            id: "agentos",
            label: "AgentOS",
            state: "ready",
            detail: "基础服务已就绪",
          },
          {
            id: "database",
            label: "运行数据库",
            state: "ready",
            detail: "运行依赖已就绪",
          },
          {
            id: "model",
            label: "模型",
            state: "ready",
            detail: "部署模型已启用",
          },
          {
            id: "public_entry",
            label: "公开入口",
            state: "ready",
            detail: "AgentOS 模式可用",
          },
        ],
        configuration: {
          defaultAgent: "码多多（maduoduo）",
          model: "OpenAI / e2e-deterministic（部署配置）",
          skills: "已接入",
          pageMemory: "仅当前页面内存；刷新或离开后清空",
        },
        message: "AI 助理基础服务已就绪。",
      },
    });
    expect(
      /(?:deterministic-turn|当前页面路径|用户问题)/iu.test(
        JSON.stringify(adminStatus),
      ),
      "admin status exposed internal Agent data",
    ).toBe(false);

    const adminChatResponse = await admin.request.post(ADMIN_CHAT_PATH, {
      data: CHAT_BODY,
    });
    expect(adminChatResponse.status()).toBe(200);
    const adminChat = await readSafeJson(adminChatResponse, [
      ...protectedValues,
      credentials.adminSessionToken,
    ]);
    assertSafeResponse(adminChat, "AgentOS admin chat").matches({
      version: "1",
      requestId: requestIdMatcher,
      mode: "agentos",
      message: {
        id: messageIdMatcher,
        role: "assistant",
        content: "deterministic-turn:1",
      },
      suggestedActions: [],
    });
    await admin.close();
  });

  test("rejects an unauthenticated WebSocket and keeps Agent plus DB private", async ({
    baseURL,
  }) => {
    if (!baseURL) throw new Error("BASE_URL is required");
    expect(["{}", "null"]).toContain(servicePortBindings("agent"));
    expect(["{}", "null"]).toContain(servicePortBindings("db"));
    expect(internalUnauthenticatedWebSocketStatus()).toBe(403);
    expect(
      /(?:OS_SECURITY_KEY|authorization:\s*bearer)/iu.test(
        JSON.stringify(cumulativeConsoleMessages),
      ),
      "browser diagnostics exposed an internal credential",
    ).toBe(false);
  });

  test("bounds invalid output to a safe SSE error without opening the execution circuit", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("BASE_URL is required");
    const protectedValues = runtimeProtectedValues();
    const context = await browser.newContext({ baseURL });

    const invalidResponse = await context.request.post(CHAT_PATH, {
      data: {
        version: "2",
        message: INVALID_RESPONSE_SENTINEL,
        history: [],
        page: null,
      },
    });
    expect(invalidResponse.status()).toBe(200);
    const invalid = await readSafeAssistantErrorStream(
      invalidResponse,
      protectedValues,
    );
    assertSafeResponse(invalid, "AgentOS invalid SSE envelope").matches({
      message: {
        role: "assistant",
        content: safeRule((value) => typeof value === "string"),
      },
      activities: safeRule((value) => Array.isArray(value)),
      actions: [],
    });
    assertNoPublicInvalidModelOutput(invalid);

    const recoveredResponse = await context.request.post(CHAT_PATH, {
      data: CHAT_BODY,
    });
    expect(recoveredResponse.status()).toBe(200);
    const recovered = await readSafeAssistantStream(
      recoveredResponse,
      protectedValues,
    );
    assertSafeResponse(recovered, "AgentOS bounded failure recovery").matches({
      message: {
        role: "assistant",
        content: "deterministic-turn:1",
      },
      activities: safeRule((value) => Array.isArray(value)),
      actions: [],
    });

    const credentials = fixtureCredentials();
    const admin = await browser.newContext({ baseURL });
    await addSignedSession(
      admin,
      baseURL,
      "workforce",
      credentials.adminSessionToken,
    );
    const adminStatusResponse = await admin.request.get(ADMIN_STATUS_PATH);
    expect(adminStatusResponse.status()).toBe(200);
    const adminStatus = await readSafeJson(adminStatusResponse, [
      ...protectedValues,
      credentials.adminSessionToken,
    ]);
    assertSafeResponse(
      adminStatus,
      "AgentOS bounded failure admin status",
    ).matches({
      version: "1",
      requestId: requestIdMatcher,
      status: {
        mode: "agentos",
        runtime: {
          live: true,
          ready: true,
          capability: "available",
          providerMode: "agentos",
          selectedProvider: "agentos",
          persistence: "disabled",
          circuits: {
            readiness: { state: "closed", consecutiveFailures: 0 },
            execution: { state: "closed", consecutiveFailures: 0 },
          },
          readiness: {
            cacheTtlMs: 1000,
            probeTimeoutMs: 500,
            failureThreshold: 1,
          },
          source: "deployment",
          provider: "openai",
          modelId: "e2e-deterministic",
          configRevision: null,
          activationVersion: null,
          testStatus: "untested",
        },
        services: [
          {
            id: "agentos",
            label: "AgentOS",
            state: "ready",
            detail: "基础服务已就绪",
          },
          {
            id: "database",
            label: "运行数据库",
            state: "ready",
            detail: "运行依赖已就绪",
          },
          {
            id: "model",
            label: "模型",
            state: "ready",
            detail: "部署模型已启用",
          },
          {
            id: "public_entry",
            label: "公开入口",
            state: "ready",
            detail: "AgentOS 模式可用",
          },
        ],
        configuration: {
          defaultAgent: "码多多（maduoduo）",
          model: "OpenAI / e2e-deterministic（部署配置）",
          skills: "已接入",
          pageMemory: "仅当前页面内存；刷新或离开后清空",
        },
        message: "AI 助理基础服务已就绪。",
      },
    });

    const statusResponse = await context.request.get(STATUS_PATH);
    expect(statusResponse.status()).toBe(200);
    const status = await readSafeJson(statusResponse, protectedValues);
    assertSafeResponse(status, "AgentOS bounded failure public status").matches(
      {
        version: "1",
        requestId: requestIdMatcher,
        live: true,
        ready: true,
        capability: "available",
        message: "AI 助理基础服务已就绪。",
      },
    );
    await admin.close();
    await context.close();
  });
});

test.describe("@control deterministic model control", () => {
  test("enforces authorization, switches atomically, restores, reveals briefly, and never leaks", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    if (!baseURL) throw new Error("BASE_URL is required");
    const credentials = fixtureCredentials();
    const originHeaders = {
      "Content-Type": "application/json",
      Origin: baseURL,
    };
    const submittedKeys: Record<string, string> = {};
    const submittedLastFour: Record<string, string> = {};
    const modelIds: Record<string, string> = {
      openai: "e2e-openai-rev1",
      anthropic: "e2e-anthropic-rev1",
      google: "e2e-google-rev1",
      dashscope: "e2e-qwen-rev1",
      deepseek: "e2e-deepseek-rev1",
      minimax: "e2e-minimax-rev1",
    };
    type ControlResponseExposure =
      | "strict"
      | "model-config-list"
      | "model-config-page"
      | "model-key-reveal";
    const controlResponseLedger: Array<{
      exposure: ControlResponseExposure;
      rawJson: string;
      allowedPlaintext?: string;
      allowedLastFour: string[];
      method: string;
      pathname: string;
      status: number;
    }> = [];
    const pendingControlResponses: Array<Promise<void>> = [];
    const controlResponseCaptureFailures: string[] = [];

    const registerKey = (provider: string, suffix: string) => {
      const key = `e2e-acceptance-${provider}-${randomUUID()}-${suffix}`;
      submittedKeys[provider] = key;
      submittedLastFour[provider] = suffix;
      appendProtectedLedger("AAP_RUNTIME_MODEL_KEYS_FILE", key);
      appendProtectedLedger("AAP_RUNTIME_MODEL_KEY_LAST4_FILE", suffix);
      return key;
    };
    const currentProtectedValues = ({
      allowedLastFour = [],
      allowedPlaintext,
    }: {
      allowedLastFour?: string[];
      allowedPlaintext?: string;
    } = {}) => {
      const allowedValues = new Set(allowedLastFour);
      if (allowedPlaintext !== undefined) {
        allowedValues.add(allowedPlaintext);
        const embeddedPlaintextLastFour = Object.values(submittedLastFour).find(
          (lastFour) => allowedPlaintext.endsWith(lastFour),
        );
        if (embeddedPlaintextLastFour !== undefined) {
          allowedValues.add(embeddedPlaintextLastFour);
        }
      }
      return [
        ...runtimeProtectedValues(),
        credentials.modelAdminSessionToken,
        ...Object.values(submittedLastFour),
      ].filter((value) => !allowedValues.has(value));
    };
    const readControlJson = async (
      response: APIResponse,
      {
        exposure = "strict",
        method = "DIRECT",
        allowedPlaintext,
        allowedLastFour = [],
      }: {
        exposure?: ControlResponseExposure;
        method?: string;
        allowedPlaintext?: string;
        allowedLastFour?: string[];
      } = {},
    ): Promise<unknown> => {
      expectNoAssistantCookie(response.headers()["set-cookie"]);
      const rawJson = await response.text();
      controlResponseLedger.push({
        exposure,
        rawJson,
        allowedPlaintext,
        allowedLastFour,
        method,
        pathname: new URL(response.url()).pathname,
        status: response.status(),
      });
      return parseSafeJson(
        rawJson,
        currentProtectedValues({
          allowedLastFour,
          allowedPlaintext,
        }),
      );
    };
    const readControlAssistantStream = async (
      response: APIResponse,
    ): Promise<unknown> => {
      expectNoAssistantCookie(response.headers()["set-cookie"]);
      const rawStream = await response.text();
      controlResponseLedger.push({
        exposure: "strict",
        rawJson: rawStream,
        allowedLastFour: [],
        method: "DIRECT",
        pathname: new URL(response.url()).pathname,
        status: response.status(),
      });
      return parseSafeAssistantStream(
        response.headers()["content-type"],
        rawStream,
        currentProtectedValues(),
      );
    };
    async function trackControlResponses(
      context: BrowserContext,
    ): Promise<void> {
      await context.route("**/api/v1/**", async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        const method = request.method();
        const capture = (async () => {
          try {
            const upstream = await route.fetch();
            const status = upstream.status();
            const rawJson = await upstream.text();
            let exposure: ControlResponseExposure = "strict";
            let allowedPlaintext: string | undefined;
            let allowedLastFour: string[] = [];
            if (
              status === 200 &&
              method === "GET" &&
              pathname === MODEL_CONFIG_PATH
            ) {
              exposure = "model-config-list";
              allowedLastFour = CONTROL_PROVIDERS.flatMap((fixture) => {
                const value = submittedLastFour[fixture.provider];
                return value === undefined ? [] : [value];
              });
            } else if (status === 200 && method === "PUT") {
              const fixture = CONTROL_PROVIDERS.find(
                (candidate) =>
                  pathname === `${MODEL_CONFIG_PATH}/${candidate.provider}`,
              );
              if (fixture !== undefined) {
                exposure = "model-config-page";
                const value = submittedLastFour[fixture.provider];
                allowedLastFour = value === undefined ? [] : [value];
              }
            } else if (status === 200 && method === "POST") {
              const fixture = CONTROL_PROVIDERS.find(
                (candidate) =>
                  pathname ===
                  `${MODEL_CONFIG_PATH}/${candidate.provider}/reveal-key`,
              );
              if (fixture !== undefined) {
                exposure = "model-key-reveal";
                allowedPlaintext = submittedKeys[fixture.provider];
              }
            }

            controlResponseLedger.push({
              exposure,
              rawJson,
              allowedPlaintext,
              allowedLastFour,
              method,
              pathname,
              status,
            });
            await route.fulfill({ response: upstream, body: rawJson });
          } catch {
            controlResponseCaptureFailures.push(`${method} ${pathname}`);
            await route.abort().catch(() => undefined);
          }
        })();
        pendingControlResponses.push(capture);
        await capture;
      });
    }
    async function drainControlResponses(): Promise<void> {
      await Promise.all(pendingControlResponses);
    }
    const ask = async (expectedMarker: string) => {
      const context = await browser.newContext({ baseURL });
      collectBrowserDiagnostics(context);
      await trackControlResponses(context);
      const response = await context.request.post(CHAT_PATH, {
        data: CHAT_BODY,
      });
      if (response.status() !== 200) {
        const failure = await readControlJson(response);
        expect(
          response.status(),
          `assistant chat returned a safe failure body: ${JSON.stringify(failure)}`,
        ).toBe(200);
      }
      const body = await readControlAssistantStream(response);
      expect(JSON.stringify(body)).toContain(expectedMarker);
      await drainControlResponses();
      await context.close();
    };

    const waitForRestoredDynamicModel = async ({
      provider,
      modelId,
      configRevision,
    }: {
      provider: (typeof CONTROL_PROVIDERS)[number]["provider"];
      modelId: string;
      configRevision: number;
    }) => {
      const outcome = await pollReadinessWithinBudget({
        budgetMs: 20_000,
        getStatus: async (timeoutMs) => {
          const response = await modelAdmin.request.get(ADMIN_STATUS_PATH, {
            timeout: timeoutMs,
          });
          const statusCode = response.status();
          const body = await readControlJson(response, { method: "GET" });
          return {
            status: parseAdminAssistantStatusResponse(body),
            statusCode,
          };
        },
        inspect: ({ status, statusCode }) => {
          if (status === null) {
            return {
              ready: false,
              description: `HTTP ${statusCode} invalid public status envelope`,
            };
          }
          const runtime = status.status.runtime;
          const description = [
            `HTTP ${statusCode}`,
            runtime.capability,
            runtime.source,
            String(runtime.provider),
            String(runtime.modelId),
            String(runtime.configRevision),
            runtime.circuits.readiness.state,
            runtime.circuits.execution.state,
          ].join(" ");
          return {
            ready:
              statusCode === 200 &&
              runtime.live &&
              runtime.ready &&
              runtime.capability === "available" &&
              runtime.selectedProvider === "agentos" &&
              runtime.source === "dynamic" &&
              runtime.provider === provider &&
              runtime.modelId === modelId &&
              runtime.configRevision === configRevision &&
              runtime.circuits.readiness.state === "closed" &&
              runtime.circuits.execution.state === "closed",
            description,
          };
        },
      });
      if (outcome.ready) {
        return;
      }
      throw new Error(
        `agent recreate did not restore ${provider}/${modelId}/rev ${configRevision}: ${outcome.description}`,
      );
    };

    const admin = await browser.newContext({ baseURL });
    collectBrowserDiagnostics(admin);
    await trackControlResponses(admin);
    await addSignedSession(
      admin,
      baseURL,
      "workforce",
      credentials.adminSessionToken,
    );
    const adminPage = await admin.newPage();
    await adminPage.goto("/admin/assistant");
    await adminPage.getByRole("tab", { name: "模型配置" }).click();
    await expect(
      adminPage.getByRole("heading", { name: "云模型配置" }),
    ).toBeVisible();
    await expect(adminPage.getByLabel("Model ID")).toBeDisabled();
    await expect(
      adminPage.getByRole("button", { name: "保存草稿" }),
    ).toHaveCount(0);
    await expect(
      adminPage.getByRole("button", { name: "查看已保存 Key" }),
    ).toHaveCount(0);
    const forbiddenKey = registerKey("admin-forbidden", "F001");
    const forbiddenSave = await admin.request.put(
      `${MODEL_CONFIG_PATH}/openai`,
      {
        headers: originHeaders,
        data: {
          modelId: "e2e-admin-forbidden",
          endpointId: "openai-official",
          apiKey: forbiddenKey,
          expectedRevision: 0,
        },
      },
    );
    expect(forbiddenSave.status()).toBe(403);
    const forbiddenSaveBody = await readControlJson(forbiddenSave);
    expect(JSON.stringify(forbiddenSaveBody)).toContain("permission_denied");
    const forbiddenReveal = await admin.request.post(
      `${MODEL_CONFIG_PATH}/openai/reveal-key`,
      { headers: originHeaders, data: { revision: 1 } },
    );
    expect(forbiddenReveal.status()).toBe(403);
    await readControlJson(forbiddenReveal);
    await drainControlResponses();
    await admin.close();

    for (const [index, fixture] of CONTROL_PROVIDERS.entries()) {
      registerKey(fixture.provider, `K${String(index + 1).padStart(3, "0")}`);
    }
    const modelAdmin = await browser.newContext({ baseURL });
    collectBrowserDiagnostics(modelAdmin);
    await trackControlResponses(modelAdmin);
    await addSignedSession(
      modelAdmin,
      baseURL,
      "workforce",
      credentials.modelAdminSessionToken,
    );
    const page = await modelAdmin.newPage();
    await page.goto("/admin/assistant");
    await page.getByRole("tab", { name: "模型配置" }).click();
    await expect(page.getByText("控制面已启用", { exact: true })).toBeVisible();

    for (const [index, fixture] of CONTROL_PROVIDERS.entries()) {
      const suffix = `K${String(index + 1).padStart(3, "0")}`;
      await page.getByLabel("模型供应商").selectOption(fixture.provider);
      await page.getByLabel("Model ID").fill(modelIds[fixture.provider]!);
      await expect(page.getByLabel("Endpoint")).toHaveValue(fixture.endpoint);
      await page
        .getByLabel(/新 API Key/u)
        .fill(submittedKeys[fixture.provider]!);
      await page.getByRole("button", { name: "保存草稿" }).click();
      await expect(
        page.getByText("保存成功，配置状态已刷新。", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(`已配置 · 末四位 ${suffix}`)).toBeVisible();
    }

    const listedResponse = await modelAdmin.request.get(MODEL_CONFIG_PATH);
    expect(listedResponse.status()).toBe(200);
    const listed = await readControlJson(listedResponse, {
      exposure: "model-config-list",
      method: "GET",
      allowedLastFour: CONTROL_PROVIDERS.map(
        (fixture) => submittedLastFour[fixture.provider]!,
      ),
    });
    const listedText = JSON.stringify(listed);
    for (const fixture of CONTROL_PROVIDERS) {
      expect(listedText).toContain(modelIds[fixture.provider]!);
      expect(listedText).toContain(submittedLastFour[fixture.provider]!);
      expect(listedText).not.toContain(submittedKeys[fixture.provider]!);
    }

    await page.getByLabel("模型供应商").selectOption("openai");
    await page.getByRole("button", { name: "测试并启用" }).click();
    await expect(
      page.getByText("测试通过，已启用 OpenAI rev 1。", { exact: true }),
    ).toBeVisible();
    await ask("deterministic-model:e2e-openai-rev1:turn:1");

    await page.getByLabel("Model ID").fill("e2e-fail-openai-rev2");
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(
      page.getByText("保存成功，配置状态已刷新。", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "测试并启用" }).click();
    await expect(
      page.getByText("模型测试失败，配置状态已刷新。", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("当前供应商状态")).toContainText(
      "仍运行 rev 1",
    );
    await ask("deterministic-model:e2e-openai-rev1:turn:1");

    recreateAgent(true);
    await waitForRestoredDynamicModel({
      provider: "openai",
      modelId: modelIds.openai,
      configRevision: 1,
    });
    await ask("deterministic-model:e2e-openai-rev1:turn:1");

    await page.reload();
    await page.getByRole("tab", { name: "模型配置" }).click();
    await page.getByLabel("模型供应商").selectOption("dashscope");
    const beforeSwitch = agentContainerMetadata();
    await page.getByRole("button", { name: "测试并启用" }).click();
    await expect(
      page.getByText("测试通过，已启用 Qwen / DashScope rev 1。", {
        exact: true,
      }),
    ).toBeVisible();
    const afterSwitch = agentContainerMetadata();
    expect(afterSwitch).toEqual(beforeSwitch);
    await ask("deterministic-model:e2e-qwen-rev1:turn:1");

    recreateAgent(true);
    const afterRestart = agentContainerMetadata();
    expect(afterRestart.id).not.toBe(afterSwitch.id);
    expect(afterRestart.startedAt).not.toBe(afterSwitch.startedAt);
    await waitForRestoredDynamicModel({
      provider: "dashscope",
      modelId: modelIds.dashscope,
      configRevision: 1,
    });
    await ask("deterministic-model:e2e-qwen-rev1:turn:1");

    const staleRevision = await modelAdmin.request.post(
      `${MODEL_CONFIG_PATH}/openai/test-and-activate`,
      { headers: originHeaders, data: { revision: 1 } },
    );
    expect(staleRevision.status()).toBe(409);
    const conflictBody = await readControlJson(staleRevision);
    expect(JSON.stringify(conflictBody)).toContain("configuration_conflict");
    for (const lastFour of Object.values(submittedLastFour)) {
      expect(JSON.stringify(conflictBody)).not.toContain(lastFour);
    }

    await page.reload();
    await page.getByRole("tab", { name: "模型配置" }).click();
    await page.getByLabel("模型供应商").selectOption("dashscope");
    await page.clock.install();
    await page.getByRole("button", { name: "查看已保存 Key" }).click();
    const revealed = page.getByLabel("临时显示的模型密钥");
    await expect(revealed).toContainText(submittedKeys.dashscope!);
    await expect(revealed).toContainText(
      "复制后由操作系统剪贴板负责保管，30 秒隐藏不会清除剪贴板。",
    );
    await page.clock.fastForward(30_000);
    await expect(revealed).toHaveCount(0);

    const revealResponse = await modelAdmin.request.post(
      `${MODEL_CONFIG_PATH}/dashscope/reveal-key`,
      { headers: originHeaders, data: { revision: 1 } },
    );
    expect(revealResponse.status()).toBe(200);
    expect(revealResponse.headers()["cache-control"]).toContain("no-store");
    expect(revealResponse.headers()["cache-control"]).toContain("private");
    const revealBody = await readControlJson(revealResponse, {
      exposure: "model-key-reveal",
      method: "POST",
      allowedPlaintext: submittedKeys.dashscope!,
    });
    expect(JSON.stringify(revealBody)).toContain(submittedKeys.dashscope!);
    const bootstrapReveal = await modelAdmin.request.post(
      `${MODEL_CONFIG_PATH}/openai/reveal-key`,
      { headers: originHeaders, data: { revision: 0 } },
    );
    expect(bootstrapReveal.status()).toBe(400);
    await readControlJson(bootstrapReveal);

    const controlRows = databaseQuery(
      "SELECT provider || ':' || revision || ':' || is_current || ':' || test_status || ':' || octet_length(api_key_ciphertext) || ':' || encode(api_key_ciphertext, 'hex') FROM agent_control.model_configs ORDER BY provider, revision",
    );
    expect(controlRows.split("\n")).toHaveLength(7);
    expect(controlRows).toContain("openai:1:false:passed:");
    expect(controlRows).toContain("openai:2:true:failed:");
    for (const fixture of CONTROL_PROVIDERS) {
      expect(controlRows).toContain(`${fixture.provider}:`);
    }
    const openAiCiphers = controlRows
      .split("\n")
      .filter((row) => row.startsWith("openai:"))
      .map((row) => row.split(":").at(-1));
    expect(openAiCiphers).toHaveLength(2);
    expect(openAiCiphers[0]).toBeTruthy();
    expect(openAiCiphers[1]).toBeTruthy();
    expect(openAiCiphers[0]).not.toBe(openAiCiphers[1]);
    const activePointer = databaseQuery(
      "SELECT c.provider || ':' || a.config_revision || ':' || a.activation_version FROM agent_control.active_model_config a JOIN agent_control.model_configs c ON c.id = a.model_config_id",
    );
    expect(activePointer).toMatch(/^dashscope:1:[1-9][0-9]*$/u);
    const webAuditText = databaseQuery(
      "SELECT coalesce(string_agg(action || ':' || metadata::text, E'\\n'), '') FROM audit_logs WHERE action LIKE 'assistant.model_config%' OR action IN ('assistant.model_key_reveal_requested', 'assistant.model_key_revealed');",
    );
    expect(webAuditText).toContain("assistant.model_key_reveal_requested:");
    expect(webAuditText).toContain("assistant.model_key_revealed:");
    const controlEventText = databaseQuery(
      "SELECT coalesce(string_agg(action || ':' || provider || ':' || model_id || ':' || endpoint_id || ':' || result, E'\\n'), '') FROM agent_control.control_events;",
    );
    for (const key of Object.values(submittedKeys)) {
      expect(controlRows).not.toContain(key);
      expect(webAuditText).not.toContain(key);
      expect(controlEventText).not.toContain(key);
    }
    for (const lastFour of Object.values(submittedLastFour)) {
      expect(webAuditText).not.toContain(lastFour);
      expect(controlEventText).not.toContain(lastFour);
    }

    recreateAgent(false);
    await drainControlResponses();
    await page.close();
    const disabledPage = await modelAdmin.newPage();
    await disabledPage.goto("/admin/assistant");
    await disabledPage.getByRole("tab", { name: "模型配置" }).click();
    await expect(
      disabledPage.getByText("部署已关闭控制面", { exact: true }),
    ).toBeVisible();
    await expect(disabledPage.getByLabel("Model ID")).toBeDisabled();
    const disabledSave = await modelAdmin.request.put(
      `${MODEL_CONFIG_PATH}/google`,
      {
        headers: originHeaders,
        data: {
          modelId: "e2e-disabled-write",
          endpointId: "google-official",
          expectedRevision: 1,
        },
      },
    );
    expect(disabledSave.status()).toBe(503);
    const disabledBody = await readControlJson(disabledSave);
    expect(JSON.stringify(disabledBody)).toContain("control_disabled");
    await drainControlResponses();
    await disabledPage.close();
    recreateAgent(true);
    await waitForRestoredDynamicModel({
      provider: "dashscope",
      modelId: modelIds.dashscope,
      configRevision: 1,
    });
    await ask("deterministic-model:e2e-qwen-rev1:turn:1");
    const finalAuditChatResponse = await modelAdmin.request.post(
      ADMIN_CHAT_PATH,
      { data: CHAT_BODY },
    );
    expect(finalAuditChatResponse.status()).toBe(200);
    const finalAuditChat = await readControlJson(finalAuditChatResponse);
    expect(JSON.stringify(finalAuditChat)).toContain(
      "deterministic-model:e2e-qwen-rev1:turn:1",
    );
    await Promise.all(pendingControlResponses);
    expect(controlResponseCaptureFailures).toEqual([]);
    const expectedListLastFour = CONTROL_PROVIDERS.map(
      (fixture) => submittedLastFour[fixture.provider]!,
    ).sort();
    for (const response of controlResponseLedger) {
      if (response.exposure === "strict") {
        expect(response.allowedPlaintext).toBeUndefined();
        expect(response.allowedLastFour).toEqual([]);
      } else {
        expect(response.status).toBe(200);
        if (response.exposure === "model-config-list") {
          expect(response.method).toBe("GET");
          expect(response.pathname).toBe(MODEL_CONFIG_PATH);
          expect(response.allowedPlaintext).toBeUndefined();
          expect([...response.allowedLastFour].sort()).toEqual(
            expectedListLastFour,
          );
        } else {
          const suffix =
            response.exposure === "model-config-page" ? "" : "/reveal-key";
          const fixture = CONTROL_PROVIDERS.find(
            (candidate) =>
              response.pathname ===
              `${MODEL_CONFIG_PATH}/${candidate.provider}${suffix}`,
          );
          expect(fixture).toBeDefined();
          if (fixture !== undefined) {
            if (response.exposure === "model-config-page") {
              expect(response.method).toBe("PUT");
              expect(response.allowedPlaintext).toBeUndefined();
              expect(response.allowedLastFour).toEqual([
                submittedLastFour[fixture.provider],
              ]);
            } else {
              expect(response.method).toBe("POST");
              expect(response.allowedPlaintext).toBe(
                submittedKeys[fixture.provider],
              );
              expect(response.allowedLastFour).toEqual([]);
            }
          }
        }
      }
      let fullKeyScanText = response.rawJson;
      if (response.exposure === "model-key-reveal") {
        expect(response.allowedPlaintext).toBeTruthy();
        fullKeyScanText = fullKeyScanText.replaceAll(
          response.allowedPlaintext!,
          "",
        );
      }
      for (const token of [credentials.modelAdminSessionToken]) {
        expect(response.rawJson).not.toContain(token);
      }
      for (const key of Object.values(submittedKeys)) {
        expect(fullKeyScanText).not.toContain(key);
      }
      let lastFourScanText = fullKeyScanText;
      for (const allowedLastFour of response.allowedLastFour) {
        lastFourScanText = lastFourScanText.replaceAll(allowedLastFour, "");
      }
      for (const lastFour of Object.values(submittedLastFour)) {
        expect(lastFourScanText).not.toContain(lastFour);
      }
    }
    const terminalConsoleText = JSON.stringify(cumulativeConsoleMessages);
    for (const protectedValue of [
      credentials.modelAdminSessionToken,
      ...Object.values(submittedKeys),
      ...Object.values(submittedLastFour),
    ]) {
      expect(terminalConsoleText).not.toContain(protectedValue);
    }
    await modelAdmin.close();
  });
});
