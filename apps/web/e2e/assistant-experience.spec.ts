import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import {
  addSignedSession,
  fixtureCredentials,
  totpFromUri,
} from "./auth-fixtures";

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
        url.pathname.startsWith("/_next/static/")
      );
    }
    return (
      failure.method === "POST" &&
      url.pathname === "/staff/two-factor" &&
      url.searchParams.get("returnTo") === "/admin/assistant"
    );
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
const ASSISTANT_DOCK_WIDTH_STORAGE_KEY =
  "ai-agent-platform:assistant-dock-width:v1";

function expectWidth(locator: Locator, expected: number, tolerance = 2) {
  return expect
    .poll(async () => (await locator.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(expected - tolerance)
    .then(async () =>
      expect((await locator.boundingBox())?.width ?? 0).toBeLessThanOrEqual(
        expected + tolerance,
      ),
    );
}

async function expectSingleDialog(
  page: Page,
  name: "AI 助理工作区" | "M 助手",
) {
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByRole("dialog", { name })).toBeVisible();
}

async function dragDockToWidth(
  page: Page,
  dialog: Locator,
  separator: Locator,
  targetWidth: number,
  cancel = false,
) {
  const separatorBox = await separator.boundingBox();
  const dialogBox = await dialog.boundingBox();
  expect(separatorBox).not.toBeNull();
  expect(dialogBox).not.toBeNull();
  const startX = separatorBox!.x + separatorBox!.width / 2;
  const startY = separatorBox!.y + Math.min(120, separatorBox!.height / 2);
  const targetX = startX + dialogBox!.width - targetWidth;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, startY, { steps: 8 });
  if (cancel) {
    await separator.dispatchEvent("pointercancel", { pointerId: 1 });
  }
  await page.mouse.up();
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

async function ensureAdminTwoFactor(
  page: Page,
  baseURL: string,
  sessionToken: string,
) {
  await addSignedSession(page.context(), baseURL, "workforce", sessionToken);
  await page.goto("/staff/two-factor?returnTo=%2Fadmin%2Fassistant");

  const start = page.getByRole("button", { name: "开始设置" });
  if (await start.isVisible()) {
    await page.getByLabel("当前密码").fill(fixtureCredentials().adminPassword);
    await start.click();
    const uri = (
      await page.locator("code").filter({ hasText: "otpauth://" }).textContent()
    )?.trim();
    if (!uri) throw new Error("TOTP URI was not rendered");
    await page.getByLabel("六位验证码").fill(totpFromUri(uri));
    await page.getByRole("button", { name: "验证并启用" }).click();
    await expect(page).toHaveURL(/\/admin\/assistant$/u);
  }
}

test("portal header entry, quick assistant, dock, and standalone workspace are keyboard-safe", async ({
  page,
}, testInfo) => {
  await configure(page, testInfo);
  const evidence = collectEvidence(page);
  await page.goto("/");
  await expectExactViewportWidth(page);

  const topEntry = page.getByRole("button", { name: "打开 AI 助理" });
  await expect(topEntry).toBeVisible();
  await tabTo(page, topEntry);
  await page.keyboard.press("Enter");
  await expectSingleDialog(page, "AI 助理工作区");
  await expect(page.getByRole("textbox", { name: "输入问题" })).toBeFocused();
  await page.getByRole("button", { name: "关闭 AI 助理工作区" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(topEntry).toBeFocused();

  await expectExactViewportWidth(page);
  const floatingEntry = page.getByRole("button", { name: "打开 M 助手" });
  await expect(floatingEntry).toBeVisible();

  await tabTo(page, floatingEntry);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "M 助手" });
  const quickClose = dialog.getByRole("button", {
    name: "关闭 M 助手",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(quickClose).toBeFocused();
  await attachScreenshot(page, testInfo, "portal-drawer");

  await page.getByRole("button", { name: "如何开始了解平台？" }).click();
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
  const reducedDialog = page.getByRole("dialog", { name: "M 助手" });
  await expect(reducedDialog).toBeVisible();
  await expect(quickClose).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(reducedDialog).toHaveCount(0);
  await expect(floatingEntry).toBeFocused();

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.keyboard.press("Enter");
  await expect(quickClose).toBeFocused();
  const expandDock = page.getByRole("button", {
    name: "展开 AI 助理工作区",
  });
  await tabTo(page, expandDock);
  await page.keyboard.press("Enter");
  await expectSingleDialog(page, "AI 助理工作区");
  const fullChat = page.getByRole("link", { name: "进入完整工作区" });
  await tabTo(page, fullChat);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/assistant$/u);
  await expect(page.getByRole("main", { name: "AI 助理工作区" })).toBeVisible();
  await expect(page.getByRole("button", { name: "打开 M 助手" })).toHaveCount(
    0,
  );
  const composer = page.getByRole("textbox", { name: "输入问题" });
  await page.getByRole("button", { name: "打开 AI 助理" }).click();
  await expectVisibleKeyboardFocus(composer);
  await expectExactViewportWidth(page);
  await attachScreenshot(page, testInfo, "assistant-workspace");
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("desktop dock clamps, persists only completed resizing, and restores focus", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop resize contract");
  await configure(page, testInfo, "reduce");
  const evidence = collectEvidence(page);
  await page.goto("/");
  await page.evaluate(
    (key) => window.localStorage.removeItem(key),
    ASSISTANT_DOCK_WIDTH_STORAGE_KEY,
  );
  await page.reload();

  const topEntry = page.getByRole("button", { name: "打开 AI 助理" });
  await topEntry.click();
  const dialog = page.getByRole("dialog", { name: "AI 助理工作区" });
  const separator = dialog.getByRole("separator", {
    name: "调整 AI 助理工作区宽度",
  });
  await expectWidth(dialog, 480);
  await expect(separator).toHaveAttribute("aria-valuemin", "380");
  await expect(separator).toHaveAttribute("aria-valuemax", "760");

  await dragDockToWidth(page, dialog, separator, 300);
  await expectWidth(dialog, 380);
  await expect(separator).toHaveAttribute("aria-valuenow", "380");

  await separator.focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await expectWidth(dialog, 428);
  await expect
    .poll(() =>
      page.evaluate(
        (key) => window.localStorage.getItem(key),
        ASSISTANT_DOCK_WIDTH_STORAGE_KEY,
      ),
    )
    .toBe("428");

  await dragDockToWidth(page, dialog, separator, 900);
  await expectWidth(dialog, 760);
  await expect(separator).toHaveAttribute("aria-valuenow", "760");
  await expect
    .poll(() =>
      page.evaluate(
        (key) => window.localStorage.getItem(key),
        ASSISTANT_DOCK_WIDTH_STORAGE_KEY,
      ),
    )
    .toBe("760");

  await dragDockToWidth(page, dialog, separator, 600, true);
  await expectWidth(dialog, 760);
  expect(
    await page.evaluate(
      (key) => window.localStorage.getItem(key),
      ASSISTANT_DOCK_WIDTH_STORAGE_KEY,
    ),
  ).toBe("760");

  await page.reload();
  await page.getByRole("button", { name: "打开 AI 助理" }).click();
  await expectWidth(page.getByRole("dialog", { name: "AI 助理工作区" }), 760);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "打开 AI 助理" }),
  ).toBeFocused();

  await page.getByRole("button", { name: "打开 AI 助理" }).click();
  await page.getByTestId("assistant-dock-backdrop").click({
    position: { x: 20, y: 20 },
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "打开 AI 助理" }),
  ).toBeFocused();
  await expectExactViewportWidth(page);
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("quick, dock, and standalone workspace keep one in-flight conversation", async ({
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
  const answer = "这条回复跨越快速助手、侧边工作区和完整工作区。";
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
  await page.getByRole("button", { name: "打开 M 助手" }).click();
  const quickInput = page.getByRole("textbox", { name: "向 M 助手提问" });
  const question = "请保留这条跨形态问题";
  await quickInput.fill(question);
  await page.getByRole("button", { name: "展开 AI 助理工作区" }).click();
  await expectSingleDialog(page, "AI 助理工作区");
  await expect(page.getByRole("textbox", { name: "输入问题" })).toHaveValue(
    question,
  );

  await page.getByRole("button", { name: "收起为快速助手" }).click();
  await expectSingleDialog(page, "M 助手");
  await expect(quickInput).toHaveValue(question);
  await page.getByRole("button", { name: "发送消息" }).click();
  await requestStarted;
  await page.getByRole("button", { name: "展开 AI 助理工作区" }).click();
  await expectSingleDialog(page, "AI 助理工作区");
  await expect(page.getByRole("textbox", { name: "输入问题" })).toHaveValue(
    question,
  );

  await page.getByRole("link", { name: "进入完整工作区" }).click();
  await expect(page).toHaveURL(/\/assistant$/u);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  releaseResponse();
  const messageLog = page.getByRole("log", { name: "AI 助理对话" });
  await expect(messageLog).toContainText(question);
  await expect(messageLog).toContainText(answer);
  expect(requestCount).toBe(1);
  await expectExactViewportWidth(page);
  await page.unroute(`**${ASSISTANT_CHAT_ENDPOINT}`);
  expectCleanEvidence(evidence, new URL(page.url()).origin);
});

test("mobile dock is a single full-screen, keyboard-safe scrolling workspace", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile dock contract");
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
  await page.getByRole("button", { name: "打开 AI 助理" }).click();
  await expectSingleDialog(page, "AI 助理工作区");
  const dialog = page.getByRole("dialog", { name: "AI 助理工作区" });
  await expect(dialog.getByRole("separator")).toHaveCount(0);
  const initialBox = await dialog.boundingBox();
  expect(initialBox).not.toBeNull();
  expect(initialBox!.x).toBe(0);
  expect(initialBox!.y).toBe(0);
  expect(initialBox!.width).toBe(VIEWPORTS.mobile.width);
  expect(initialBox!.height).toBe(VIEWPORTS.mobile.height);

  const input = page.getByRole("textbox", { name: "输入问题" });
  await input.fill("移动端滚动与软键盘验证");
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(ASSISTANT_CHAT_ENDPOINT) &&
      candidate.status() === 200,
  );
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await response;
  const messageLog = page.getByRole("log", { name: "AI 助理对话" });
  await expect(messageLog).toContainText("移动端长回复");
  const scrolling = await messageLog.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    };
  });
  expect(scrolling.scrollHeight).toBeGreaterThan(scrolling.clientHeight);
  expect(scrolling.scrollTop).toBeGreaterThan(0);

  await input.focus();
  await page.setViewportSize({ width: 390, height: 500 });
  await expect
    .poll(async () => (await dialog.boundingBox())?.height ?? 0)
    .toBeLessThanOrEqual(500);
  const compactDialogBox = await dialog.boundingBox();
  const composerBox = await input.boundingBox();
  expect(compactDialogBox).not.toBeNull();
  expect(composerBox).not.toBeNull();
  expect(compactDialogBox!.x).toBe(0);
  expect(compactDialogBox!.width).toBe(390);
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

  await page.goto("/staff/two-factor");
  await expect(page.getByRole("heading", { name: "双因素认证" })).toBeVisible();
  await tabTo(page, page.getByLabel("六位验证码").first());
  await expectExactViewportWidth(page);
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
  await ensureAdminTwoFactor(
    page,
    baseURL,
    testInfo.project.name === "desktop"
      ? credentials.adminSessionToken
      : credentials.noTotpAdminSessionToken,
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
    name: "AI 助理",
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
    ["/staff/re-auth", "重新验证身份", "员工用户名或邮箱"],
    ["/staff/two-factor", "双因素认证", "当前密码"],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expectExactViewportWidth(page);
    await tabTo(page, page.getByLabel(field).first());
  }

  expectCleanEvidence(evidence, new URL(page.url()).origin);
});
