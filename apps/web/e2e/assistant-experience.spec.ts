import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
  type Response,
  type TestInfo,
} from "@playwright/test";

import { addSignedSession, fixtureCredentials } from "./auth-fixtures";

const VIEWPORTS = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 },
} as const;

type BrowserEvidence = {
  consoleMessages: Array<{ level: string; text: string; url: string }>;
  pageErrors: string[];
  requestFailures: Array<{
    method: string;
    url: string;
    errorText: string;
  }>;
  unexpectedResponses: string[];
};

function collectEvidence(page: Page): BrowserEvidence {
  const evidence: BrowserEvidence = {
    consoleMessages: [],
    pageErrors: [],
    requestFailures: [],
    unexpectedResponses: [],
  };

  page.on("console", (message) => {
    evidence.consoleMessages.push({
      level: message.type(),
      text: message.text(),
      url: message.location().url,
    });
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    evidence.requestFailures.push({
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText ?? "failed",
    });
  });
  page.on("response", (response) => {
    if (
      response.status() === 404 ||
      response.status() === 429 ||
      response.status() >= 500
    ) {
      evidence.unexpectedResponses.push(
        `${response.status()} ${response.request().method()} ${response.url()}`,
      );
    }
  });

  return evidence;
}

async function configure(
  page: Page,
  testInfo: TestInfo,
  reducedMotion: "no-preference" | "reduce" = "no-preference",
) {
  const project = testInfo.project.name as keyof typeof VIEWPORTS;
  expect(Object.keys(VIEWPORTS)).toContain(project);
  await page.setViewportSize(VIEWPORTS[project]);
  await page.emulateMedia({ reducedMotion });
}

async function expectExactViewportWidth(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth === window.innerWidth,
    ),
  ).toBe(true);
}

async function expectVisibleKeyboardFocus(locator: Locator) {
  await expect(locator).toBeFocused();
  const focus = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(focus.outlineStyle).not.toBe("none");
  expect(focus.outlineWidth).not.toBe("0px");
}

async function tabTo(page: Page, target: Locator, limit = 80) {
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press("Tab");
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      await expectVisibleKeyboardFocus(target);
      return;
    }
  }
  throw new Error(
    `Keyboard focus did not reach ${await target.getAttribute("aria-label")}`,
  );
}

async function focusWorkspaceComposer(page: Page, composer: Locator) {
  const headerEntry = page.getByRole("button", {
    name: "聚焦 AI 助理提问框",
  });
  await tabTo(page, headerEntry);
  await page.keyboard.press("Enter");
  await expect(composer).toBeFocused();
  await expect
    .poll(async () =>
      composer.evaluate((element) => {
        const surface = element.closest(".assistant-prompt-input__surface");
        if (surface === null)
          throw new Error("Assistant prompt surface is missing");
        return getComputedStyle(surface).borderColor;
      }),
    )
    .toBe("rgba(126, 151, 216, 0.7)");
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(`${testInfo.project.name}-${name}`, {
    body: await page.screenshot({ animations: "disabled", fullPage: true }),
    contentType: "image/png",
  });
}

function isExpectedUnusedPreloadWarning(
  message: BrowserEvidence["consoleMessages"][number],
  applicationOrigin?: string,
) {
  if (
    applicationOrigin === undefined ||
    message.level !== "warning" ||
    !message.text.startsWith(`The resource ${applicationOrigin}/`) ||
    !message.text.endsWith(
      " was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
    )
  ) {
    return false;
  }

  return message.url === "" || message.url.startsWith(applicationOrigin);
}

function isExpectedNavigationCancellation(
  failure: BrowserEvidence["requestFailures"][number],
  applicationOrigin?: string,
) {
  if (
    applicationOrigin === undefined ||
    failure.errorText !== "net::ERR_ABORTED"
  ) {
    return false;
  }

  try {
    const url = new URL(failure.url);
    if (url.origin !== applicationOrigin) {
      return false;
    }
    if (failure.method === "GET") {
      return (
        url.searchParams.has("_rsc") ||
        url.pathname.startsWith("/_next/static/") ||
        (url.pathname === "/api/v1/session/staff" && url.search === "")
      );
    }
    return false;
  } catch {
    return false;
  }
}

function expectCleanEvidence(
  evidence: BrowserEvidence,
  applicationOrigin?: string,
) {
  const knownDevelopmentMessages = evidence.consoleMessages.filter(
    (message) =>
      message.url.startsWith("webpack-internal:///") &&
      (message.text.startsWith("%cDownload the React DevTools") ||
        message.text === "[HMR] connected" ||
        message.text.startsWith("[Fast Refresh]") ||
        message.text.startsWith("You have Reduced Motion enabled")),
  );
  const knownBrowserMessages = evidence.consoleMessages.filter((message) =>
    isExpectedUnusedPreloadWarning(message, applicationOrigin),
  );
  const allowedNavigationCancellations = evidence.requestFailures.filter(
    (failure) => isExpectedNavigationCancellation(failure, applicationOrigin),
  );
  expect(
    evidence.consoleMessages.filter(
      (message) =>
        !knownDevelopmentMessages.includes(message) &&
        !knownBrowserMessages.includes(message),
    ),
  ).toEqual([]);
  expect(evidence.pageErrors).toEqual([]);
  expect(
    evidence.requestFailures.filter(
      (failure) => !allowedNavigationCancellations.includes(failure),
    ),
  ).toEqual([]);
  expect(evidence.unexpectedResponses).toEqual([]);
}

const ASSISTANT_CHAT_ENDPOINT = "/api/v1/assistant/chat";
const ASSISTANT_STATUS_ENDPOINT = "/api/v1/assistant/status";

async function activateAssistantWithStatus(
  page: Page,
  activate: () => Promise<void>,
) {
  const statusEvents: string[] = [];
  const isAssistantStatusRequest = (url: string) =>
    url.endsWith(ASSISTANT_STATUS_ENDPOINT);
  const onResponse = (response: Response) => {
    if (isAssistantStatusRequest(response.url())) {
      statusEvents.push(
        `response ${response.status()} ${response.request().method()}`,
      );
    }
  };
  const onRequestFailed = (request: Request) => {
    if (isAssistantStatusRequest(request.url())) {
      statusEvents.push(
        `requestfailed ${request.method()} ${request.failure()?.errorText ?? "unknown"}`,
      );
    }
  };
  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);
  const statusResponse = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(ASSISTANT_STATUS_ENDPOINT) &&
      candidate.status() === 200,
  );
  try {
    await activate();
    await statusResponse;
  } catch (error) {
    const observation =
      statusEvents.length === 0
        ? "no assistant status request observed"
        : statusEvents.join(", ");
    throw new Error(
      `assistant activation did not receive a 200 status response: ${observation}`,
      { cause: error },
    );
  } finally {
    page.off("response", onResponse);
    page.off("requestfailed", onRequestFailed);
  }
}

async function expectSingleDialog(page: Page, name: "码多多工作区" | "码多多") {
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByRole("dialog", { name })).toBeVisible();
}

function assistantSuccessResponse(content: string) {
  return {
    version: "1",
    requestId: "assistant-dock-e2e",
    mode: "placeholder",
    session: {
      temporary: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
    message: {
      id: "assistant-dock-message",
      role: "assistant",
      content,
    },
    suggestedActions: [],
  };
}

test("portal header, quick assistant, and standalone workspace are keyboard-safe", async ({
  page,
}, testInfo) => {
  test.setTimeout(45_000);
  await configure(page, testInfo);
  const evidence = collectEvidence(page);
  await page.goto("/");
  await expectExactViewportWidth(page);

  const topEntry = page.getByRole("button", { name: "打开 AI 助理" });
  await expect(topEntry).toBeVisible();
  await tabTo(page, topEntry);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/assistant$/u);
  await expect(page.getByRole("main", { name: "码多多工作区" })).toBeVisible();
  const composer = page.getByRole("textbox", { name: "输入问题" });
  await focusWorkspaceComposer(page, composer);
  await page.getByRole("link", { name: "缩小码多多并返回主页面" }).click();
  await expect(page).toHaveURL(/\/$/u);

  await expectExactViewportWidth(page);
  const floatingEntry = page.getByRole("button", { name: "打开码多多" });
  await expect(floatingEntry).toBeVisible();

  await tabTo(page, floatingEntry);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "码多多" });
  const quickClose = dialog.getByRole("button", {
    name: "关闭码多多",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(quickClose).toBeFocused();
  await attachScreenshot(page, testInfo, "portal-drawer");

  const presetResponse = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(ASSISTANT_CHAT_ENDPOINT) &&
      candidate.status() === 200,
  );
  await page.getByRole("button", { name: "如何开始了解平台？" }).click();
  await presetResponse;
  await expect(
    page
      .getByRole("log")
      .getByText("你可以从快速开始文档了解平台结构和使用入口。", {
        exact: true,
      }),
  ).toBeVisible();

  await quickClose.click();
  await expect(dialog).toHaveCount(0);
  await expect(floatingEntry).toBeFocused();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await floatingEntry.click();
  const reducedDialog = page.getByRole("dialog", { name: "码多多" });
  await expect(reducedDialog).toBeVisible();
  await expect(quickClose).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(reducedDialog).toHaveCount(0);
  await expect(floatingEntry).toBeFocused();

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.keyboard.press("Enter");
  await expect(quickClose).toBeFocused();
  const expandDock = page.getByRole("button", {
    name: "展开码多多工作区",
  });
  await tabTo(page, expandDock);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/assistant$/u);
  await expect(page.getByRole("main", { name: "码多多工作区" })).toBeVisible();
  await expect(page.getByRole("button", { name: "打开码多多" })).toHaveCount(0);
  await focusWorkspaceComposer(page, composer);
  await expectExactViewportWidth(page);
  await attachScreenshot(page, testInfo, "assistant-workspace");
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("desktop quick launcher expands into the keyboard-focusable workspace", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop workspace contract");
  await configure(page, testInfo, "reduce");
  const evidence = collectEvidence(page);
  await page.goto("/");
  await activateAssistantWithStatus(page, () =>
    page.getByRole("button", { name: "打开码多多" }).click(),
  );
  await expectSingleDialog(page, "码多多");
  await page.getByRole("button", { name: "展开码多多工作区" }).click();
  await expect(page).toHaveURL(/\/assistant$/u);
  await expect(page.getByRole("main", { name: "码多多工作区" })).toBeVisible();
  const composer = page.getByRole("textbox", { name: "输入问题" });
  await focusWorkspaceComposer(page, composer);
  await expectExactViewportWidth(page);
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("workspace changes its conversation rail at the exact responsive breakpoint", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop breakpoint contract");
  await configure(page, testInfo, "reduce");
  const evidence = collectEvidence(page);
  await page.goto("/");
  await activateAssistantWithStatus(page, () =>
    page.getByRole("button", { name: "打开码多多" }).click(),
  );
  await page.getByRole("button", { name: "展开码多多工作区" }).click();
  const workspace = page.getByRole("main", { name: "码多多工作区" });
  const rail = page.getByRole("complementary", { name: "临时会话" });
  await expect(workspace).toBeVisible();
  await page.setViewportSize({ width: 721, height: VIEWPORTS.desktop.height });
  await expect(rail).toHaveAttribute("data-collapsed", "false");
  await page.setViewportSize({ width: 720, height: VIEWPORTS.desktop.height });
  await expect(rail).toHaveAttribute("data-collapsed", "true");
  await page.setViewportSize({ width: 721, height: VIEWPORTS.desktop.height });
  await expect(rail).toHaveAttribute("data-collapsed", "false");
  await expectExactViewportWidth(page);
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("quick and standalone workspace keep one in-flight conversation", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop continuity contract");
  await configure(page, testInfo, "reduce");
  const evidence = collectEvidence(page);
  let requestCount = 0;
  let markRequestStarted!: () => void;
  let releaseResponse!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    markRequestStarted = resolve;
  });
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const answer = "这条回复跨越快速助手和完整工作区。";
  await page.route(`**${ASSISTANT_CHAT_ENDPOINT}`, async (route) => {
    requestCount += 1;
    markRequestStarted();
    await responseGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(assistantSuccessResponse(answer)),
    });
  });

  await page.goto("/pricing");
  await activateAssistantWithStatus(page, () =>
    page.getByRole("button", { name: "打开码多多" }).click(),
  );
  const quickInput = page.getByRole("textbox", { name: "向码多多提问" });
  const question = "请保留这条跨形态问题";
  await quickInput.fill(question);
  await page.getByRole("button", { name: "发送消息" }).click();
  await requestStarted;
  await page.getByRole("button", { name: "展开码多多工作区" }).click();
  await expect(page).toHaveURL(/\/assistant$/u);
  await expect(page.getByRole("textbox", { name: "输入问题" })).toHaveValue(
    question,
  );
  releaseResponse();
  const messageLog = page.getByRole("log", { name: "码多多对话" });
  await expect(messageLog).toContainText(question);
  await expect(messageLog).toContainText(answer);
  expect(requestCount).toBe(1);

  await page.getByRole("link", { name: "AI Agent Platform 首页" }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const launcher = page.getByRole("button", { name: "打开码多多" });
  await expect(launcher).toBeVisible();

  await launcher.click();
  await expectSingleDialog(page, "码多多");
  const quickDialog = page.getByRole("dialog", { name: "码多多" });
  await expect(
    quickDialog.getByRole("log", { name: "码多多对话" }),
  ).toContainText(question);
  await expect(
    quickDialog.getByRole("log", { name: "码多多对话" }),
  ).toContainText(answer);
  expect(requestCount).toBe(1);

  await quickDialog.getByRole("button", { name: "展开码多多工作区" }).click();
  await expect(page).toHaveURL(/\/assistant$/u);
  const reopenedWorkspace = page.getByRole("main", { name: "码多多工作区" });
  await expect(
    reopenedWorkspace.getByRole("log", { name: "码多多对话" }),
  ).toContainText(question);
  await expect(
    reopenedWorkspace.getByRole("log", { name: "码多多对话" }),
  ).toContainText(answer);
  expect(requestCount).toBe(1);
  await expectExactViewportWidth(page);
  await page.unroute(`**${ASSISTANT_CHAT_ENDPOINT}`);
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("mobile quick launcher expands into a scrolling workspace", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile workspace contract");
  await configure(page, testInfo, "reduce");
  const evidence = collectEvidence(page);
  const answer = `移动端长回复：${"工作区内容 ".repeat(140)}`;
  await page.route(`**${ASSISTANT_CHAT_ENDPOINT}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(assistantSuccessResponse(answer)),
    });
  });

  await page.goto("/");
  await activateAssistantWithStatus(page, () =>
    page.getByRole("button", { name: "打开码多多" }).click(),
  );
  await expectSingleDialog(page, "码多多");
  await page.getByRole("button", { name: "展开码多多工作区" }).click();
  await expect(page).toHaveURL(/\/assistant$/u);
  const workspace = page.getByRole("main", { name: "码多多工作区" });
  const initialBox = await workspace.boundingBox();
  expect(initialBox).not.toBeNull();
  expect(initialBox!.width).toBe(VIEWPORTS.mobile.width);

  const input = page.getByRole("textbox", { name: "输入问题" });
  await input.fill("移动端滚动与软键盘验证");
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(ASSISTANT_CHAT_ENDPOINT) &&
      candidate.status() === 200,
  );
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await response;
  const messageLog = page.getByRole("log", { name: "码多多对话" });
  await expect(messageLog).toContainText("移动端长回复");
  const scrolling = await page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight });
    return {
      clientHeight: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight,
      scrollTop: window.scrollY,
    };
  });
  expect(scrolling.scrollHeight).toBeGreaterThan(scrolling.clientHeight);
  expect(scrolling.scrollTop).toBeGreaterThan(0);

  await input.focus();
  await expect(input).toBeFocused();
  await page.setViewportSize({ width: 390, height: 500 });
  const compactWorkspaceBox = await workspace.boundingBox();
  const composerBox = await input.boundingBox();
  expect(compactWorkspaceBox).not.toBeNull();
  expect(composerBox).not.toBeNull();
  expect(compactWorkspaceBox!.width).toBe(390);
  expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(500);
  await expectExactViewportWidth(page);
  await page.unroute(`**${ASSISTANT_CHAT_ENDPOINT}`);
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("all authentication routes use the precision shell without overflow", async ({
  page,
}, testInfo) => {
  await configure(page, testInfo);
  const evidence = collectEvidence(page);

  for (const [url, heading, field] of [
    ["/login", "登录客户控制台", "邮箱"],
    ["/register", "申请客户账号", "姓名"],
    ["/staff/login", "员工安全登录", "员工用户名或邮箱"],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.locator('[data-shell-variant="auth"]')).toBeVisible();
    await expect(page.locator(".site-header, .portal-footer")).toHaveCount(0);
    await expectExactViewportWidth(page);
    await tabTo(page, page.getByLabel(field));
  }

  await attachScreenshot(page, testInfo, "auth-shell");
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("authenticated assistant operations and protected auth forms are usable", async ({
  page,
  baseURL,
}, testInfo) => {
  if (!baseURL) throw new Error("baseURL is required");
  await configure(page, testInfo);
  const evidence = collectEvidence(page);
  const credentials = fixtureCredentials();
  await addSignedSession(
    page.context(),
    baseURL,
    "workforce",
    credentials.modelAdminSessionToken,
  );

  await page.goto("/admin/assistant");
  await expect(
    page.getByRole("heading", { name: "AI 助理运营" }),
  ).toBeVisible();
  await expect(page.getByLabel("当前管理员")).toContainText("admin.fixture");
  await expect(page.locator('[data-surface="dark-indigo"]')).toBeVisible();
  await expect(page.locator('[data-surface="bright"]')).toBeVisible();
  await expectExactViewportWidth(page);

  const adminAssistantLink = page.getByRole("link", {
    name: "Agent 管理",
    exact: true,
  });
  if (testInfo.project.name === "mobile") {
    const opener = page.getByRole("button", {
      name: "打开CMS 运营后台导航",
    });
    await tabTo(page, opener);
    await page.keyboard.press("Enter");
  }
  await tabTo(page, adminAssistantLink);
  await attachScreenshot(page, testInfo, "admin-assistant");

  for (const [url, heading, field] of [
    ["/staff/change-password", "修改初始密码", "当前密码"],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expectExactViewportWidth(page);
    await tabTo(page, page.getByLabel(field).first());
  }

  expectCleanEvidence(evidence, new URL(page.url()).origin);
});
