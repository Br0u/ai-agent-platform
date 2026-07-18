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
  type BrowserContext,
  type Page,
} from "@playwright/test";

import {
  addSignedSession,
  fixtureCredentials,
  totpFromUri,
} from "./auth-fixtures";

const CHAT_PATH = "/api/v1/assistant/chat";
const SESSION_PATH = "/api/v1/assistant/session";
const STATUS_PATH = "/api/v1/assistant/status";
const ADMIN_STATUS_PATH = "/api/v1/admin/assistant/status";
const ADMIN_SESSIONS_PATH = "/api/v1/admin/assistant/sessions";
const ADMIN_CHAT_PATH = "/api/v1/admin/assistant/chat";
const MODEL_CONFIG_PATH = "/api/v1/admin/assistant/model-configs";
const CHAT_BODY = {
  message: "如何开始了解平台？",
  context: { pathname: "/assistant" },
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
const expiresAtMatcher = safeRule(
  (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value),
);
const nginxRequestIdMatcher = safeRule(
  (value) => typeof value === "string" && /^[a-f0-9]{32}$/u.test(value),
);

const cumulativeConsoleMessages: string[] = [];
let firstAssistantCookieCredential: string | undefined;

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalEnvironment(name: string): string[] {
  const value = process.env[name];
  return value ? [value] : [];
}

function appendDynamicProtectedValue(value: string): void {
  if (value.length === 0 || value.includes("\n") || value.includes("\r")) {
    throw new Error("dynamic protected value is invalid");
  }
  const patternsFile = requiredEnvironment("AAP_RUNTIME_DYNAMIC_PATTERNS_FILE");
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(patternsFile);
  } catch {
    throw new Error("dynamic pattern file is invalid");
  }
  if (!stats.isFile() || (stats.mode & 0o777) !== 0o600) {
    throw new Error("dynamic pattern file is invalid");
  }
  appendFileSync(patternsFile, `${value}\n`, { encoding: "utf8" });
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
    ...protectedFileValues("BETTER_AUTH_SECRET_FILE"),
    ...protectedFileValues("OS_SECURITY_KEY_FILE"),
    ...protectedFileValues("ASSISTANT_SESSION_SECRET_FILE"),
    ...protectedFileValues("ASSISTANT_RATE_LIMIT_SECRET_FILE"),
    ...protectedFileValues("MODEL_API_KEY_FILE"),
    ...protectedFileValues("MODEL_CONFIG_ENCRYPTION_KEY_FILE"),
    ...protectedFileValues("AGENT_CONFIG_CONTROL_KEY_FILE"),
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

function agentSessionIds(): Set<string> {
  const output = execFileSync(
    "docker",
    composeArgs(
      "exec",
      "-T",
      "db",
      "sh",
      "-c",
      'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align --command="SELECT session_id FROM agno.agno_sessions ORDER BY session_id"',
    ),
    {
      cwd: path.resolve(process.cwd(), "../.."),
      encoding: "utf8",
      timeout: 30_000,
    },
  ).trim();
  const sessionIds = new Set(output === "" ? [] : output.split("\n"));
  for (const sessionId of sessionIds) {
    appendDynamicProtectedValue(sessionId);
  }
  return sessionIds;
}

function sameStringSet(left: Set<string>, right: Set<string>): boolean {
  return (
    left.size === right.size && [...left].every((value) => right.has(value))
  );
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

const OPTIONAL_IDENTITY_AUDIT_COLLECTOR = String.raw`
import os
import re
import stat
import sys

path = "/tmp/aap-session-identity-audit"
pattern = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
)
try:
    descriptor = os.open(
        path,
        os.O_RDONLY
        | getattr(os, "O_NOFOLLOW", 0)
        | getattr(os, "O_NONBLOCK", 0),
    )
except FileNotFoundError:
    raise SystemExit(0)
except OSError:
    raise SystemExit("identity audit collection failed") from None

try:
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError
        if stat.S_IMODE(metadata.st_mode) != 0o600:
            raise ValueError
        payload = os.read(descriptor, 65537)
        if len(payload) > 65536:
            raise ValueError
    finally:
        os.close(descriptor)
except Exception:
    raise SystemExit("identity audit collection failed") from None

if not payload:
    raise SystemExit(0)
try:
    text = payload.decode("ascii")
    identities = text.splitlines()
    if not text.endswith("\n"):
        raise ValueError
    if any(pattern.fullmatch(identity) is None for identity in identities):
        raise ValueError
except Exception:
    raise SystemExit("identity audit collection failed") from None
sys.stdout.write(text)
`.trim();

function collectAgentSessionIdentityAudit(): void {
  const output = composeOutput([
    "exec",
    "-T",
    "agent",
    "python",
    "-c",
    OPTIONAL_IDENTITY_AUDIT_COLLECTOR,
  ]);
  if (output.length === 0) return;
  for (const identity of output.split("\n")) {
    appendDynamicProtectedValue(identity);
  }
}

function recreateAgent(enabled: boolean): void {
  collectAgentSessionIdentityAudit();
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
  const setCookie = response.headers()["set-cookie"];
  if (setCookie?.includes("aap_assistant_sid_dev=")) {
    cookieCredential(setCookie);
  }
  return parseSafeJson(await response.text(), protectedValues);
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

function expectConsoleExcludesCredential(credential: string) {
  expect(
    credential.length > 0,
    "assistant cookie credential must be nonempty",
  ).toBe(true);
  const leaked = cumulativeConsoleMessages.some((message) =>
    message.includes(credential),
  );
  expect(leaked, "assistant cookie credential leaked to console").toBe(false);
}

function requiredAssistantCookieCredential(): string {
  const credential = firstAssistantCookieCredential;
  expect(
    Boolean(credential),
    "first assistant cookie credential was not captured",
  ).toBe(true);
  if (!credential)
    throw new Error("assistant cookie credential is unavailable");
  return credential;
}

function cookieCredential(setCookie: string): string {
  const match = setCookie.match(/(?:^|,\s*)aap_assistant_sid_dev=([^;]+)/u);
  if (!match?.[1]) throw new Error("development assistant cookie is missing");
  stableCookieCredential(match[1]);
  return match[1];
}

function stableCookieCredential(cookieValue: string): string {
  const payload = cookieValue.split(".")[0];
  if (!payload) throw new Error("assistant cookie payload is missing");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("assistant cookie payload is invalid");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("credential" in parsed) ||
    typeof parsed.credential !== "string" ||
    parsed.credential.length === 0
  ) {
    throw new Error("assistant cookie credential is invalid");
  }
  appendDynamicProtectedValue(cookieValue);
  appendDynamicProtectedValue(parsed.credential);
  return parsed.credential;
}

async function completeSeededAdminTwoFactor(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto("/staff/two-factor?returnTo=%2Fadmin%2Fassistant");
  const start = page.getByRole("button", { name: "开始设置" });
  if (await start.isVisible()) {
    await page.getByLabel("当前密码").fill(fixtureCredentials().adminPassword);
    await start.click();
    const uri = (
      await page.locator("code").filter({ hasText: "otpauth://" }).textContent()
    )?.trim();
    if (!uri) throw new Error("TOTP enrollment URI is missing");
    const totp = new URL(uri);
    const totpSecret = totp.searchParams.get("secret");
    if (!totpSecret) throw new Error("TOTP enrollment secret is missing");
    appendDynamicProtectedValue(uri);
    appendDynamicProtectedValue(totpSecret);
    await page.getByLabel("六位验证码").fill(totpFromUri(uri));
    await page.getByRole("button", { name: "验证并启用" }).click();
    await expect(page).toHaveURL(/\/admin\/assistant$/u);
  }
  await page.close();
}

test.describe.configure({ mode: "serial" });

test.describe("@guard assistant response safety guard", () => {
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
    session: { temporary: true, expiresAt: expiresAtMatcher },
    message: {
      id: messageIdMatcher,
      role: "assistant",
      content: "你可以从快速开始文档了解平台结构和使用入口。",
    },
    suggestedActions: [{ label: "查看快速开始", href: "/docs#quick-start" }],
  });
  const setCookie = (await browserResponse.headerValue("set-cookie")) ?? "";
  expect(
    setCookie.includes("aap_assistant_sid_dev="),
    "assistant cookie is missing",
  ).toBe(true);
  expect(
    setCookie.includes("HttpOnly"),
    "assistant cookie is not HttpOnly",
  ).toBe(true);
  expect(
    setCookie.includes("SameSite=Lax"),
    "assistant cookie SameSite policy is invalid",
  ).toBe(true);
  expect(
    setCookie.includes("Secure"),
    "loopback assistant cookie unexpectedly requires Secure",
  ).toBe(false);
  const credential = cookieCredential(setCookie);
  firstAssistantCookieCredential = credential;
  expect(
    firstAssistantCookieCredential.length > 0,
    "first assistant cookie credential must be nonempty",
  ).toBe(true);
  expectNoProtectedValue(
    chatBody,
    [...protectedValues, credential],
    chat.rawJson,
  );
  expectConsoleExcludesCredential(credential);

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
  const rejection = await readSafeJson(rejected[0]!, [
    ...protectedValues,
    credential,
  ]);
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

  const logs = execFileSync(
    "docker",
    [
      "compose",
      "-p",
      requiredEnvironment("AAP_RUNTIME_E2E_PROJECT"),
      "--env-file",
      requiredEnvironment("AAP_RUNTIME_E2E_ENV_FILE"),
      "-f",
      "compose.yaml",
      "-f",
      "compose.e2e.yaml",
      "logs",
      "--no-color",
      "web",
      "agent",
      "proxy",
    ],
    {
      cwd: path.resolve(process.cwd(), "../.."),
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  expect(
    logs.includes(credential),
    "assistant cookie credential leaked to container logs",
  ).toBe(false);
  expectConsoleExcludesCredential(credential);
  await context.close();
});

test("protected assistant APIs enforce 401, 403, and safe admin success", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("BASE_URL is required");
  const credentials = fixtureCredentials();
  const assistantCredential = requiredAssistantCookieCredential();
  const protectedValues = [
    ...runtimeProtectedValues(),
    requiredEnvironment("BETTER_AUTH_SECRET"),
    credentials.staffSessionToken,
    credentials.adminSessionToken,
    assistantCredential,
  ];

  const anonymous = await requestFactory.newContext({ baseURL });
  for (const [method, endpoint] of [
    ["get", ADMIN_STATUS_PATH],
    ["get", ADMIN_SESSIONS_PATH],
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
    ["get", ADMIN_SESSIONS_PATH],
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
  await completeSeededAdminTwoFactor(admin);
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
        skills: "未接入",
        sessionStorage: "未启用",
      },
      message: "公开入口使用安全占位模式；AgentOS 基础设施尚未探测。",
    },
  });

  const sessionsResponse = await admin.request.get(ADMIN_SESSIONS_PATH);
  expect(sessionsResponse.status()).toBe(200);
  const sessions = await readSafeJson(sessionsResponse, protectedValues);
  assertSafeResponse(sessions, "placeholder admin sessions").matches({
    version: "1",
    requestId: requestIdMatcher,
    sessions: {
      persistence: "disabled",
      listing: "not_available",
      message: "占位模式未持久化会话；管理列表不可用。",
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
  expectConsoleExcludesCredential(assistantCredential);
  await admin.close();
});

test.describe("@agentos deterministic runtime", () => {
  test("reports only 码多多 as available and cleans the real Admin ephemeral run", async ({
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
    await publicContext.close();

    const credentials = fixtureCredentials();
    const admin = await browser.newContext({ baseURL });
    collectBrowserDiagnostics(admin);
    await addSignedSession(
      admin,
      baseURL,
      "workforce",
      credentials.noTotpAdminSessionToken,
    );
    await completeSeededAdminTwoFactor(admin);

    const adminStatusResponse = await admin.request.get(ADMIN_STATUS_PATH);
    expect(adminStatusResponse.status()).toBe(200);
    const adminStatus = await readSafeJson(adminStatusResponse, [
      ...protectedValues,
      credentials.noTotpAdminSessionToken,
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
          persistence: "agentos",
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
          skills: "未接入",
          sessionStorage: "AgentOS 持久化已启用",
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

    const sessionsBefore = agentSessionIds();
    const adminChatResponse = await admin.request.post(ADMIN_CHAT_PATH, {
      data: CHAT_BODY,
    });
    expect(adminChatResponse.status()).toBe(200);
    const adminChat = await readSafeJson(adminChatResponse, [
      ...protectedValues,
      credentials.noTotpAdminSessionToken,
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
    expect(
      sameStringSet(agentSessionIds(), sessionsBefore),
      "Admin ephemeral run changed the persisted Agent session identity set",
    ).toBe(true);

    const sessionsResponse = await admin.request.get(ADMIN_SESSIONS_PATH);
    expect(sessionsResponse.status()).toBe(200);
    const sessions = await readSafeJson(sessionsResponse, [
      ...protectedValues,
      credentials.noTotpAdminSessionToken,
    ]);
    assertSafeResponse(sessions, "AgentOS admin sessions").matches({
      version: "1",
      requestId: requestIdMatcher,
      sessions: {
        persistence: "agentos",
        listing: "not_available",
        message: "AgentOS 持久化已启用，但管理列表不在本阶段范围。",
      },
    });
    await admin.close();
  });

  test("keeps two real turns in one Cookie and starts over after DELETE", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("BASE_URL is required");
    const context = await browser.newContext({ baseURL });
    collectBrowserDiagnostics(context);
    const protectedValues = runtimeProtectedValues();
    const sessionsBeforeFirstTurn = agentSessionIds();

    const firstResponse = await context.request.post(CHAT_PATH, {
      data: CHAT_BODY,
    });
    expect(firstResponse.status()).toBe(200);
    const first = await readSafeJson(firstResponse, protectedValues);
    assertSafeResponse(first, "AgentOS first turn").matches({
      version: "1",
      requestId: requestIdMatcher,
      mode: "agentos",
      session: { temporary: true, expiresAt: expiresAtMatcher },
      message: {
        id: messageIdMatcher,
        role: "assistant",
        content: "deterministic-turn:1",
      },
      suggestedActions: [],
    });
    const firstSetCookie = firstResponse.headers()["set-cookie"] ?? "";
    const firstCredential = cookieCredential(firstSetCookie);
    expectNoProtectedValue(first, [...protectedValues, firstCredential]);
    const sessionsAfterFirstTurn = agentSessionIds();
    const firstSessionCandidates = [...sessionsAfterFirstTurn].filter(
      (sessionId) => !sessionsBeforeFirstTurn.has(sessionId),
    );
    expect(
      firstSessionCandidates.length === 1,
      "first browser context must create exactly one Agent session",
    ).toBe(true);
    const firstSessionId = firstSessionCandidates[0];
    if (!firstSessionId) throw new Error("first Agent session was not created");
    expectNoProtectedValue(first, [firstSessionId]);

    const secondResponse = await context.request.post(CHAT_PATH, {
      data: {
        message: "请继续。",
        context: { pathname: "/assistant" },
      },
    });
    expect(secondResponse.status()).toBe(200);
    const second = await readSafeJson(secondResponse, [
      ...protectedValues,
      firstCredential,
    ]);
    assertSafeResponse(second, "AgentOS second turn").matches({
      version: "1",
      requestId: requestIdMatcher,
      mode: "agentos",
      session: { temporary: true, expiresAt: expiresAtMatcher },
      message: {
        id: messageIdMatcher,
        role: "assistant",
        content: "deterministic-turn:2",
      },
      suggestedActions: [],
    });
    const stableCookie = (await context.cookies()).find(
      (cookie) => cookie.name === "aap_assistant_sid_dev",
    )?.value;
    expect(
      stableCookie !== undefined &&
        stableCookieCredential(stableCookie) ===
          stableCookieCredential(firstCredential),
      "assistant Cookie credential changed between turn one and turn two",
    ).toBe(true);

    const independentContext = await browser.newContext({ baseURL });
    collectBrowserDiagnostics(independentContext);
    const independentResponse = await independentContext.request.post(
      CHAT_PATH,
      { data: CHAT_BODY },
    );
    expect(independentResponse.status()).toBe(200);
    const independent = await readSafeJson(
      independentResponse,
      protectedValues,
    );
    assertSafeResponse(independent, "AgentOS independent turn").matches({
      version: "1",
      requestId: requestIdMatcher,
      mode: "agentos",
      session: { temporary: true, expiresAt: expiresAtMatcher },
      message: {
        id: messageIdMatcher,
        role: "assistant",
        content: "deterministic-turn:1",
      },
      suggestedActions: [],
    });
    await independentContext.close();

    const deletion = await context.request.delete(SESSION_PATH);
    expect(deletion.status()).toBe(204);
    expect(
      (await deletion.text()) === "",
      "assistant session deletion returned a body",
    ).toBe(true);
    expect(
      deletion.headers()["set-cookie"]?.includes("aap_assistant_sid_dev=") ===
        true,
      "assistant session deletion did not clear its cookie",
    ).toBe(true);
    const cookiesAfterDeletion = await context.cookies();
    expect(
      cookiesAfterDeletion.some(
        (cookie) => cookie.name === "aap_assistant_sid_dev",
      ),
    ).toBe(false);
    expect(
      agentSessionIds().has(firstSessionId),
      "DELETE must remove the original persisted Agent session",
    ).toBe(false);
    const sessionsAfterDeletion = agentSessionIds();

    const thirdResponse = await context.request.post(CHAT_PATH, {
      data: {
        message: "新会话。",
        context: { pathname: "/assistant" },
      },
    });
    expect(thirdResponse.status()).toBe(200);
    const third = await readSafeJson(thirdResponse, protectedValues);
    assertSafeResponse(third, "AgentOS replacement turn").matches({
      version: "1",
      requestId: requestIdMatcher,
      mode: "agentos",
      session: { temporary: true, expiresAt: expiresAtMatcher },
      message: {
        id: messageIdMatcher,
        role: "assistant",
        content: "deterministic-turn:1",
      },
      suggestedActions: [],
    });
    const sessionsAfterNewTurn = agentSessionIds();
    const replacementCandidates = [...sessionsAfterNewTurn].filter(
      (sessionId) => !sessionsAfterDeletion.has(sessionId),
    );
    const newSessionId = replacementCandidates[0];
    expect(
      replacementCandidates.length === 1 && newSessionId !== firstSessionId,
      "new turn after DELETE must create a different Agent session",
    ).toBe(true);
    if (!newSessionId)
      throw new Error("replacement Agent session was not created");
    expectNoProtectedValue(third, [newSessionId]);
    expectConsoleExcludesCredential(firstCredential);
    await context.close();
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

  test("returns a safe 503 for invalid output and opens the execution circuit", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("BASE_URL is required");
    const protectedValues = runtimeProtectedValues();
    const context = await browser.newContext({ baseURL });

    const invalidResponse = await context.request.post(CHAT_PATH, {
      data: {
        message: INVALID_RESPONSE_SENTINEL,
        context: { pathname: "/assistant" },
      },
    });
    expect(invalidResponse.status()).toBe(503);
    const invalid = await readSafeJson(invalidResponse, protectedValues);
    assertSafeResponse(invalid, "AgentOS invalid response").matches({
      version: "1",
      requestId: requestIdMatcher,
      error: {
        code: "assistant_unavailable",
        message: "助手服务暂不可用，请使用帮助中心或商务咨询。",
        retryable: true,
      },
    });
    expect(
      /(?:__aap_e2e_invalid_response__|deterministic-turn|invalid_response)/iu.test(
        JSON.stringify(invalid),
      ),
      "invalid model output reached the public response",
    ).toBe(false);

    const blockedResponse = await context.request.post(CHAT_PATH, {
      data: CHAT_BODY,
    });
    expect(blockedResponse.status()).toBe(503);
    const blocked = await readSafeJson(blockedResponse, protectedValues);
    assertSafeResponse(blocked, "AgentOS circuit rejection").matches({
      version: "1",
      requestId: requestIdMatcher,
      error: {
        code: "assistant_unavailable",
        message: "助手服务暂不可用，请使用帮助中心或商务咨询。",
        retryable: true,
      },
    });
    expect(
      JSON.stringify(blocked).includes("deterministic-turn"),
      "circuit rejection contained model output",
    ).toBe(false);

    const credentials = fixtureCredentials();
    const admin = await browser.newContext({ baseURL });
    await addSignedSession(
      admin,
      baseURL,
      "workforce",
      credentials.adminSessionToken,
    );
    await completeSeededAdminTwoFactor(admin);
    const adminStatusResponse = await admin.request.get(ADMIN_STATUS_PATH);
    expect(adminStatusResponse.status()).toBe(200);
    const adminStatus = await readSafeJson(adminStatusResponse, [
      ...protectedValues,
      credentials.adminSessionToken,
    ]);
    assertSafeResponse(adminStatus, "AgentOS degraded admin status").matches({
      version: "1",
      requestId: requestIdMatcher,
      status: {
        mode: "agentos",
        runtime: {
          live: true,
          ready: false,
          capability: "degraded",
          providerMode: "agentos",
          selectedProvider: "unavailable",
          persistence: "agentos",
          circuits: {
            readiness: { state: "closed", consecutiveFailures: 0 },
            execution: { state: "open", consecutiveFailures: 1 },
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
            state: "degraded",
            detail: "模型执行暂不可用",
          },
          {
            id: "public_entry",
            label: "公开入口",
            state: "degraded",
            detail: "降级模式",
          },
        ],
        configuration: {
          defaultAgent: "码多多（maduoduo）",
          model: "OpenAI / e2e-deterministic（部署配置，执行暂不可用）",
          skills: "未接入",
          sessionStorage: "AgentOS 持久化已启用",
        },
        message: "助手基础服务暂不可用。",
      },
    });

    const statusResponse = await context.request.get(STATUS_PATH);
    expect(statusResponse.status()).toBe(200);
    const status = await readSafeJson(statusResponse, protectedValues);
    assertSafeResponse(status, "AgentOS degraded public status").matches({
      version: "1",
      requestId: requestIdMatcher,
      live: true,
      ready: false,
      capability: "degraded",
      message: "助手基础服务暂不可用。",
    });
    agentSessionIds();
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

    const registerKey = (provider: string, suffix: string) => {
      const key = `e2e-acceptance-${provider}-${randomUUID()}-${suffix}`;
      submittedKeys[provider] = key;
      submittedLastFour[provider] = suffix;
      appendProtectedLedger("AAP_RUNTIME_MODEL_KEYS_FILE", key);
      appendProtectedLedger("AAP_RUNTIME_MODEL_KEY_LAST4_FILE", suffix);
      return key;
    };
    const currentProtectedValues = () => runtimeProtectedValues();
    const ask = async (expectedMarker: string) => {
      const context = await browser.newContext({ baseURL });
      collectBrowserDiagnostics(context);
      const response = await context.request.post(CHAT_PATH, {
        data: CHAT_BODY,
      });
      expect(response.status()).toBe(200);
      const body = await readSafeJson(response, currentProtectedValues());
      expect(JSON.stringify(body)).toContain(expectedMarker);
      const deletion = await context.request.delete(SESSION_PATH);
      expect(deletion.status()).toBe(204);
      await context.close();
    };

    const admin = await browser.newContext({ baseURL });
    collectBrowserDiagnostics(admin);
    await addSignedSession(
      admin,
      baseURL,
      "workforce",
      credentials.adminSessionToken,
    );
    await completeSeededAdminTwoFactor(admin);
    const adminPage = await admin.newPage();
    await adminPage.goto("/admin/assistant");
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
    const forbiddenSaveBody = await readSafeJson(
      forbiddenSave,
      currentProtectedValues(),
    );
    expect(JSON.stringify(forbiddenSaveBody)).toContain("permission_denied");
    const forbiddenReveal = await admin.request.post(
      `${MODEL_CONFIG_PATH}/openai/reveal-key`,
      { headers: originHeaders, data: { revision: 1 } },
    );
    expect(forbiddenReveal.status()).toBe(403);
    await readSafeJson(forbiddenReveal, currentProtectedValues());
    await admin.close();

    const stale = await browser.newContext({ baseURL });
    collectBrowserDiagnostics(stale);
    await addSignedSession(
      stale,
      baseURL,
      "workforce",
      credentials.modelAdminStaleSessionToken,
    );
    const stalePage = await stale.newPage();
    await stalePage.goto("/admin/assistant");
    const staleKey = registerKey("stale-forbidden", "F002");
    await stalePage.getByLabel("Model ID").fill("e2e-stale-forbidden");
    await stalePage.getByLabel(/新 API Key/u).fill(staleKey);
    await stalePage.getByRole("button", { name: "保存草稿" }).click();
    await expect(stalePage).toHaveURL(/\/staff\/re-auth$/u);
    const staleResponse = await stale.request.put(
      `${MODEL_CONFIG_PATH}/openai`,
      {
        headers: originHeaders,
        data: {
          modelId: "e2e-stale-forbidden",
          endpointId: "openai-official",
          apiKey: staleKey,
          expectedRevision: 0,
        },
      },
    );
    expect(staleResponse.status()).toBe(401);
    const staleBody = await readSafeJson(
      staleResponse,
      currentProtectedValues(),
    );
    expect(JSON.stringify(staleBody)).toContain("reauth_required");
    expect(JSON.stringify(staleBody)).toContain("/staff/re-auth");
    await stale.close();

    const modelAdmin = await browser.newContext({ baseURL });
    collectBrowserDiagnostics(modelAdmin);
    await addSignedSession(
      modelAdmin,
      baseURL,
      "workforce",
      credentials.modelAdminSessionToken,
    );
    const page = await modelAdmin.newPage();
    await page.goto("/admin/assistant");
    await expect(page.getByText("控制面已启用", { exact: true })).toBeVisible();

    for (const [index, fixture] of CONTROL_PROVIDERS.entries()) {
      const suffix = `K${String(index + 1).padStart(3, "0")}`;
      const key = registerKey(fixture.provider, suffix);
      await page
        .getByRole("tab", { name: new RegExp(fixture.label, "u") })
        .click();
      await page.getByLabel("Model ID").fill(modelIds[fixture.provider]!);
      await expect(page.getByLabel("Endpoint")).toHaveValue(fixture.endpoint);
      await page.getByLabel(/新 API Key/u).fill(key);
      await page.getByRole("button", { name: "保存草稿" }).click();
      await expect(
        page.getByText("保存成功，配置状态已刷新。", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(`已配置 · 末四位 ${suffix}`)).toBeVisible();
    }

    const listedResponse = await modelAdmin.request.get(MODEL_CONFIG_PATH);
    expect(listedResponse.status()).toBe(200);
    const listed = await readSafeJson(listedResponse, currentProtectedValues());
    const listedText = JSON.stringify(listed);
    for (const fixture of CONTROL_PROVIDERS) {
      expect(listedText).toContain(modelIds[fixture.provider]!);
      expect(listedText).toContain(submittedLastFour[fixture.provider]!);
      expect(listedText).not.toContain(submittedKeys[fixture.provider]!);
    }

    await page.getByRole("tab", { name: /OpenAI/u }).click();
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
    await expect(page.getByText(/仍运行 rev 1/u)).toBeVisible();
    await ask("deterministic-model:e2e-openai-rev1:turn:1");

    recreateAgent(true);
    await ask("deterministic-model:e2e-openai-rev1:turn:1");

    await page.reload();
    await page.getByRole("tab", { name: /Qwen \/ DashScope/u }).click();
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
    await ask("deterministic-model:e2e-qwen-rev1:turn:1");

    const staleRevision = await modelAdmin.request.post(
      `${MODEL_CONFIG_PATH}/openai/test-and-activate`,
      { headers: originHeaders, data: { revision: 1 } },
    );
    expect(staleRevision.status()).toBe(409);
    const conflictBody = await readSafeJson(
      staleRevision,
      currentProtectedValues(),
    );
    expect(JSON.stringify(conflictBody)).toContain("configuration_conflict");
    for (const lastFour of Object.values(submittedLastFour)) {
      expect(JSON.stringify(conflictBody)).not.toContain(lastFour);
    }

    await page.reload();
    await page.getByRole("tab", { name: /Qwen \/ DashScope/u }).click();
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
    const revealBody = parseSafeJson(await revealResponse.text(), []);
    expect(JSON.stringify(revealBody)).toContain(submittedKeys.dashscope!);
    const bootstrapReveal = await modelAdmin.request.post(
      `${MODEL_CONFIG_PATH}/openai/reveal-key`,
      { headers: originHeaders, data: { revision: 0 } },
    );
    expect(bootstrapReveal.status()).toBe(400);
    await readSafeJson(bootstrapReveal, currentProtectedValues());

    const capabilityRequests: string[] = [];
    page.on("request", (request) => capabilityRequests.push(request.url()));
    for (const label of [
      "本地算力暂不可用",
      "Skill 加载暂不可用",
      "知识库暂不可用",
      "网页与操作工具暂不可用",
    ]) {
      const button = page.getByRole("button", { name: label });
      await expect(button).toBeDisabled();
      await button.evaluate((element) =>
        (element as HTMLButtonElement).click(),
      );
    }
    expect(
      capabilityRequests.some((url) =>
        /(?:skill|knowledge|tools?|localhost|health)/iu.test(url),
      ),
    ).toBe(false);
    for (const [title, status] of [
      ["本地算力", "预留 / 未连接"],
      ["Skill 加载", "未接入"],
      ["知识库", "未接入"],
      ["网页与操作工具", "未接入"],
    ] as const) {
      const card = page.getByRole("article").filter({ hasText: title });
      await expect(card).toContainText(status);
    }

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
      expect(JSON.stringify(cumulativeConsoleMessages)).not.toContain(lastFour);
    }

    recreateAgent(false);
    await page.close();
    const disabledPage = await modelAdmin.newPage();
    await disabledPage.goto("/admin/assistant");
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
    const disabledBody = await readSafeJson(
      disabledSave,
      currentProtectedValues(),
    );
    expect(JSON.stringify(disabledBody)).toContain("control_disabled");
    await disabledPage.close();
    recreateAgent(true);
    await ask("deterministic-model:e2e-qwen-rev1:turn:1");
    const finalAuditChatResponse = await modelAdmin.request.post(
      ADMIN_CHAT_PATH,
      { data: CHAT_BODY },
    );
    expect(finalAuditChatResponse.status()).toBe(200);
    const finalAuditChat = await readSafeJson(
      finalAuditChatResponse,
      currentProtectedValues(),
    );
    expect(JSON.stringify(finalAuditChat)).toContain(
      "deterministic-model:e2e-qwen-rev1:turn:1",
    );
    collectAgentSessionIdentityAudit();

    for (const key of Object.values(submittedKeys)) {
      expect(JSON.stringify(cumulativeConsoleMessages)).not.toContain(key);
    }
    await modelAdmin.close();
  });
});
