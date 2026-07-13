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
  consoleErrors: string[];
  pageErrors: string[];
  localAssetFailures: string[];
};

function collectEvidence(page: Page): BrowserEvidence {
  const evidence: BrowserEvidence = {
    consoleErrors: [],
    pageErrors: [],
    localAssetFailures: [],
  };
  const assetTypes = new Set(["font", "image", "script", "stylesheet"]);

  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (assetTypes.has(request.resourceType())) {
      evidence.localAssetFailures.push(
        `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`,
      );
    }
  });
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      assetTypes.has(response.request().resourceType())
    ) {
      evidence.localAssetFailures.push(
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

function expectCleanEvidence(evidence: BrowserEvidence) {
  expect(evidence.consoleErrors).toEqual([]);
  expect(evidence.pageErrors).toEqual([]);
  expect(evidence.localAssetFailures).toEqual([]);
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

test("portal launchers, drawer, and standalone assistant are keyboard-safe", async ({
  page,
}, testInfo) => {
  await configure(page, testInfo);
  const evidence = collectEvidence(page);
  await page.goto("/");
  await expectExactViewportWidth(page);

  const topEntry = page.getByRole("button", { name: "打开 AI 助理" });
  const floatingEntry = page.getByRole("button", { name: "打开 M 助手" });
  await expect(topEntry).toBeVisible();
  await expect(floatingEntry).toBeVisible();
  await tabTo(page, topEntry);

  const markMotion = await topEntry.locator("svg").evaluate((element) => {
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: style.animationDuration };
  });
  expect(markMotion.name).not.toBe("none");
  expect(markMotion.duration).not.toBe("0s");

  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "M 助手" });
  const drawerInput = page.getByRole("textbox", { name: "向 M 助手提问" });
  await expect(dialog).toBeVisible();
  await expect(drawerInput).toBeFocused();
  const drawerMotion = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transform: style.transform,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
    };
  });
  expect(drawerMotion.transitionProperty).toBe("transform, opacity");
  expect(drawerMotion.transitionDuration).toBe("0.22s, 0.22s");
  await attachScreenshot(page, testInfo, "portal-drawer");

  await page.getByRole("button", { name: "如何开始了解平台？" }).click();
  const newestAnswer = page.locator(".assistant-message--assistant").last();
  await expect(newestAnswer).toBeVisible();
  const messageMotion = await newestAnswer.evaluate((element) => {
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: style.animationDuration };
  });
  expect(messageMotion.name).toBe("assistant-message-enter");
  expect(messageMotion.duration).toBe("0.18s");

  const fullChat = page.getByRole("link", { name: "打开完整 AI 助理" });
  await tabTo(page, fullChat);
  await page.keyboard.press("Escape");
  await expect(topEntry).toBeFocused();
  const closingDrawer = page.locator(".assistant-panel");
  await expect(closingDrawer).toHaveAttribute("data-motion-state", "closing");
  await expect(closingDrawer).toHaveAttribute("aria-hidden", "true");
  await expect(closingDrawer).toHaveAttribute("inert", "");
  await expect(closingDrawer).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const reducedTopEntry = page.getByRole("button", { name: "打开 AI 助理" });
  const reducedMarkMotion = await reducedTopEntry
    .locator("svg")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return { name: style.animationName, duration: style.animationDuration };
    });
  expect(
    reducedMarkMotion.name === "none" || reducedMarkMotion.duration === "0s",
  ).toBe(true);
  await reducedTopEntry.click();
  const reducedDialog = page.getByRole("dialog", { name: "M 助手" });
  const reducedDrawerMotion = await reducedDialog.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transform: style.transform,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(reducedDrawerMotion.transform).toBe("none");
  expect(reducedDrawerMotion.transitionDuration).toBe("0s");
  await page.keyboard.press("Escape");
  await expect(page.locator(".assistant-panel")).toHaveCount(0);
  await expect(reducedTopEntry).toBeFocused();

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  const reloadedFloatingEntry = page.getByRole("button", {
    name: "打开 M 助手",
  });
  await tabTo(page, reloadedFloatingEntry);
  await page.keyboard.press("Enter");
  await expect(drawerInput).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(reloadedFloatingEntry).toBeFocused();

  await page.getByRole("button", { name: "打开 AI 助理" }).click();
  await page.getByRole("link", { name: "打开完整 AI 助理" }).click();
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
  expectCleanEvidence(evidence);
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
  expectCleanEvidence(evidence);
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

  expectCleanEvidence(evidence);
});
