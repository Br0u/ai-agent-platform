import { execFileSync } from "node:child_process";
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
const CHAT_BODY = {
  message: "如何开始了解平台？",
  context: { pathname: "/assistant" },
};
const INVALID_RESPONSE_SENTINEL = "__aap_e2e_invalid_response__";

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

function runtimeProtectedValues(): string[] {
  return [
    "http://agent:7777",
    ...optionalEnvironment("BETTER_AUTH_SECRET"),
    ...optionalEnvironment("MIGRATOR_DATABASE_URL"),
    ...optionalEnvironment("RUNTIME_DATABASE_URL"),
    ...optionalEnvironment("MODEL_ID"),
    ...optionalEnvironment("MODEL_API_KEY_FILE"),
    ...optionalEnvironment("OS_SECURITY_KEY_FILE"),
    ...optionalEnvironment("AGNO_DATABASE_URL_FILE"),
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

function countAgentSessions(): number {
  const output = execFileSync(
    "docker",
    composeArgs(
      "exec",
      "-T",
      "db",
      "sh",
      "-c",
      'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align --command="SELECT COUNT(*) FROM agno.agno_sessions"',
    ),
    {
      cwd: path.resolve(process.cwd(), "../.."),
      encoding: "utf8",
      timeout: 30_000,
    },
  ).trim();
  const count = Number(output);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Agent session count was not a non-negative integer");
  }
  return count;
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

function expectNoProtectedValue(
  body: unknown,
  protectedValues: string[],
  rawJson = JSON.stringify(body),
) {
  const serialized = JSON.stringify(body);
  for (const value of protectedValues) {
    const leaked = serialized.includes(value) || rawJson.includes(value);
    expect(leaked, "protected value leaked in assistant response").toBe(false);
  }
  const containsInternalField =
    /(?:AGENTOS_INTERNAL_URL|OS_SECURITY_KEY|ASSISTANT_(?:SESSION|RATE_LIMIT)_SECRET|authorization|cookie|user-agent|x-real-ip)/iu.test(
      `${serialized}\n${rawJson}`,
    );
  expect(
    containsInternalField,
    "internal assistant field leaked in response",
  ).toBe(false);
}

async function readSafeJson(
  response: APIResponse,
  protectedValues: string[],
): Promise<unknown> {
  const rawJson = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(rawJson) as unknown;
  } catch {
    throw new Error("assistant response must be valid JSON");
  }
  expectNoProtectedValue(body, protectedValues, rawJson);
  return body;
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
  return match[1];
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
    await page.getByLabel("六位验证码").fill(totpFromUri(uri));
    await page.getByRole("button", { name: "验证并启用" }).click();
    await expect(page).toHaveURL(/\/admin\/assistant$/u);
  }
  await page.close();
}

test.describe.configure({ mode: "serial" });

test("public runtime is ready, placeholder chat is safe, and Nginx owns the first IP limit", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("BASE_URL is required");
  const context = await browser.newContext({ baseURL });
  collectBrowserDiagnostics(context);
  const page = await context.newPage();

  await page.goto("/assistant");
  const statusResponse = await context.request.get(STATUS_PATH);
  expect(statusResponse.status()).toBe(200);
  const status = await statusResponse.json();
  expect(status).toMatchObject({
    version: "1",
    live: true,
    ready: true,
    capability: "placeholder",
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
    return { status: response.status, body: await response.json() };
  }, CHAT_BODY);
  const browserResponse = await responsePromise;
  expect(chat.status).toBe(200);
  expect(chat.body).toMatchObject({
    version: "1",
    requestId: "public-browser-runtime-e2e",
    mode: "placeholder",
    session: { temporary: true },
    message: { role: "assistant" },
  });
  const setCookie = (await browserResponse.headerValue("set-cookie")) ?? "";
  expect(setCookie).toContain("aap_assistant_sid_dev=");
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("SameSite=Lax");
  expect(setCookie).not.toContain("Secure");
  const credential = cookieCredential(setCookie);
  firstAssistantCookieCredential = credential;
  expect(
    firstAssistantCookieCredential.length > 0,
    "first assistant cookie credential must be nonempty",
  ).toBe(true);
  expectNoProtectedValue(chat.body, [credential]);
  expectConsoleExcludesCredential(credential);

  const burst = await Promise.all(
    Array.from({ length: 11 }, () =>
      context.request.post(CHAT_PATH, {
        headers: { "x-request-id": "bff-rate-limit-sentinel" },
        data: CHAT_BODY,
      }),
    ),
  );
  expect(burst.filter((response) => response.status() === 200)).toHaveLength(
    10,
  );
  const rejected = burst.filter((response) => response.status() === 429);
  expect(rejected).toHaveLength(1);
  expect(rejected[0]!.headers()["retry-after"]).toBe("60");
  const rejection = await rejected[0]!.json();
  expect(rejection).toEqual({
    version: "1",
    requestId: expect.stringMatching(/^[a-f0-9]{32}$/u),
    error: {
      code: "rate_limited",
      message: "请求过于频繁，请稍后再试。",
      retryable: true,
    },
  });
  expect(rejection.requestId).not.toBe("bff-rate-limit-sentinel");

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
    expect(body).toMatchObject({
      error: { code: "authentication_required" },
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
    expect(body).toMatchObject({ error: { code: "permission_denied" } });
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
  expect(adminStatus).toMatchObject({
    version: "1",
    status: {
      mode: "placeholder",
      runtime: {
        live: true,
        ready: true,
        capability: "placeholder",
        persistence: "disabled",
      },
    },
  });

  const sessionsResponse = await admin.request.get(ADMIN_SESSIONS_PATH);
  expect(sessionsResponse.status()).toBe(200);
  const sessions = await readSafeJson(sessionsResponse, protectedValues);
  expect(sessions).toMatchObject({
    version: "1",
    sessions: {
      persistence: "disabled",
      listing: "not_available",
    },
  });
  expect(sessions).not.toHaveProperty("sessions.items");

  const adminChatResponse = await admin.request.post(ADMIN_CHAT_PATH, {
    data: CHAT_BODY,
  });
  expect(adminChatResponse.status()).toBe(200);
  const adminChat = await readSafeJson(adminChatResponse, protectedValues);
  expect(adminChat).toMatchObject({
    version: "1",
    mode: "placeholder",
    message: { role: "assistant" },
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
    expect(publicStatus).toMatchObject({
      version: "1",
      live: true,
      ready: true,
      capability: "available",
    });
    expect(JSON.stringify(publicStatus)).not.toMatch(
      /(?:maduoduo|e2e-deterministic|deterministic-turn|当前页面路径|用户问题)/iu,
    );
    await publicContext.close();

    const credentials = fixtureCredentials();
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
    const adminStatus = await readSafeJson(adminStatusResponse, [
      ...protectedValues,
      credentials.adminSessionToken,
    ]);
    expect(adminStatus).toMatchObject({
      version: "1",
      status: {
        mode: "agentos",
        runtime: {
          live: true,
          ready: true,
          capability: "available",
          selectedProvider: "agentos",
          persistence: "agentos",
        },
        configuration: {
          defaultAgent: "码多多（maduoduo）",
          model: "已配置",
          skills: "未接入",
          sessionStorage: "AgentOS 持久化已启用",
        },
      },
    });
    expect(JSON.stringify(adminStatus)).not.toMatch(
      /(?:e2e-deterministic|deterministic-turn|当前页面路径|用户问题)/iu,
    );

    const sessionsBefore = countAgentSessions();
    const adminChatResponse = await admin.request.post(ADMIN_CHAT_PATH, {
      data: CHAT_BODY,
    });
    expect(adminChatResponse.status()).toBe(200);
    const adminChat = await readSafeJson(adminChatResponse, [
      ...protectedValues,
      credentials.adminSessionToken,
    ]);
    expect(adminChat).toMatchObject({
      version: "1",
      mode: "agentos",
      message: {
        role: "assistant",
        content: "deterministic-turn:1",
      },
      suggestedActions: [],
    });
    expect(countAgentSessions()).toBe(sessionsBefore);

    const sessionsResponse = await admin.request.get(ADMIN_SESSIONS_PATH);
    expect(sessionsResponse.status()).toBe(200);
    const sessions = await readSafeJson(sessionsResponse, [
      ...protectedValues,
      credentials.adminSessionToken,
    ]);
    expect(sessions).toMatchObject({
      version: "1",
      sessions: {
        persistence: "agentos",
        listing: "not_available",
      },
    });
    expect(sessions).not.toHaveProperty("sessions.items");
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

    const firstResponse = await context.request.post(CHAT_PATH, {
      data: CHAT_BODY,
    });
    expect(firstResponse.status()).toBe(200);
    const first = await readSafeJson(firstResponse, protectedValues);
    expect(first).toMatchObject({
      version: "1",
      mode: "agentos",
      session: { temporary: true },
      message: { role: "assistant", content: "deterministic-turn:1" },
      suggestedActions: [],
    });
    const firstSetCookie = firstResponse.headers()["set-cookie"] ?? "";
    const firstCredential = cookieCredential(firstSetCookie);
    expectNoProtectedValue(first, [...protectedValues, firstCredential]);

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
    expect(second).toMatchObject({
      version: "1",
      mode: "agentos",
      message: { role: "assistant", content: "deterministic-turn:2" },
      suggestedActions: [],
    });

    const deletion = await context.request.delete(SESSION_PATH);
    expect(deletion.status()).toBe(204);
    expect(await deletion.text()).toBe("");
    expect(deletion.headers()["set-cookie"]).toContain(
      "aap_assistant_sid_dev=",
    );
    const cookiesAfterDeletion = await context.cookies();
    expect(
      cookiesAfterDeletion.some(
        (cookie) => cookie.name === "aap_assistant_sid_dev",
      ),
    ).toBe(false);

    const thirdResponse = await context.request.post(CHAT_PATH, {
      data: {
        message: "新会话。",
        context: { pathname: "/assistant" },
      },
    });
    expect(thirdResponse.status()).toBe(200);
    const third = await readSafeJson(thirdResponse, protectedValues);
    expect(third).toMatchObject({
      version: "1",
      mode: "agentos",
      message: { role: "assistant", content: "deterministic-turn:1" },
      suggestedActions: [],
    });
    expect(JSON.stringify(third)).not.toContain("deterministic-turn:2");
    expectConsoleExcludesCredential(firstCredential);
    await context.close();
  });

  test("rejects an unauthenticated WebSocket and keeps Agent plus DB private", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("BASE_URL is required");
    expect(["{}", "null"]).toContain(servicePortBindings("agent"));
    expect(["{}", "null"]).toContain(servicePortBindings("db"));

    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    const websocketUrl = baseURL.replace(/^http/u, "ws") + "/workflows/ws";
    const outcome = await page.evaluate(
      (url) =>
        new Promise<"opened" | "rejected">((resolve) => {
          const socket = new WebSocket(url);
          const timer = window.setTimeout(() => resolve("rejected"), 5_000);
          socket.addEventListener("open", () => {
            window.clearTimeout(timer);
            socket.close();
            resolve("opened");
          });
          socket.addEventListener("error", () => {
            window.clearTimeout(timer);
            resolve("rejected");
          });
          socket.addEventListener("close", () => {
            window.clearTimeout(timer);
            resolve("rejected");
          });
        }),
      websocketUrl,
    );
    expect(outcome).toBe("rejected");
    expect(JSON.stringify(cumulativeConsoleMessages)).not.toMatch(
      /(?:OS_SECURITY_KEY|authorization:\s*bearer)/iu,
    );
    await context.close();
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
    expect(invalid).toMatchObject({
      version: "1",
      error: { code: "assistant_unavailable", retryable: true },
    });
    expect(JSON.stringify(invalid)).not.toMatch(
      /(?:__aap_e2e_invalid_response__|deterministic-turn|invalid_response)/iu,
    );

    const blockedResponse = await context.request.post(CHAT_PATH, {
      data: CHAT_BODY,
    });
    expect(blockedResponse.status()).toBe(503);
    const blocked = await readSafeJson(blockedResponse, protectedValues);
    expect(blocked).toMatchObject({
      version: "1",
      error: { code: "assistant_unavailable", retryable: true },
    });
    expect(JSON.stringify(blocked)).not.toContain("deterministic-turn");

    const statusResponse = await context.request.get(STATUS_PATH);
    expect(statusResponse.status()).toBe(200);
    const status = await readSafeJson(statusResponse, protectedValues);
    expect(status).toMatchObject({
      version: "1",
      ready: false,
      capability: "degraded",
    });
    await context.close();
  });
});
