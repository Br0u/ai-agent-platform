import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

const DESKTOP_VIEWPORT = { width: 1440, height: 1000 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const ASSISTANT_API = "/api/v1/assistant/chat";
const ASSISTANT_STATUS_API = "/api/v1/assistant/status";
const CURRENCY_AMOUNT =
  /(?:[¥￥$€£]\s*\d)|(?:(?:CNY|RMB|USD)\s*\d)|(?:\d+(?:\.\d+)?\s*元)/u;

type BrowserDiagnostic =
  | {
      kind: "console";
      level: string;
      text: string;
      url: string;
    }
  | { kind: "pageerror"; message: string }
  | {
      kind: "requestfailed";
      method: string;
      url: string;
      errorText: string;
    }
  | { kind: "http"; method: string; status: number; url: string };

function pathname(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function isExpectedNextNavigationCancellation(
  diagnostic: BrowserDiagnostic,
  applicationOrigin: string,
) {
  if (
    diagnostic.kind !== "requestfailed" ||
    diagnostic.method !== "GET" ||
    diagnostic.errorText !== "net::ERR_ABORTED"
  ) {
    return false;
  }
  try {
    const url = new URL(diagnostic.url);
    return (
      url.origin === applicationOrigin &&
      (url.searchParams.has("_rsc") ||
        url.pathname.startsWith("/_next/static/"))
    );
  } catch {
    return false;
  }
}

function isExpectedUnusedPreloadWarning(
  diagnostic: BrowserDiagnostic,
  applicationOrigin: string,
) {
  return (
    diagnostic.kind === "console" &&
    diagnostic.level === "warning" &&
    diagnostic.text.startsWith(`The resource ${applicationOrigin}/`) &&
    diagnostic.text.endsWith(
      " was preloaded using link preload but not used within a few seconds from the window's load event. Please make sure it has an appropriate `as` value and it is preloaded intentionally.",
    ) &&
    (diagnostic.url === "" || diagnostic.url.startsWith(applicationOrigin))
  );
}

function collectBrowserDiagnostics(page: Page): BrowserDiagnostic[] {
  const diagnostics: BrowserDiagnostic[] = [];

  page.on("console", (message) => {
    const level = message.type();
    diagnostics.push({
      kind: "console",
      level,
      text: message.text(),
      url: message.location().url,
    });
  });
  page.on("pageerror", (error) => {
    diagnostics.push({ kind: "pageerror", message: error.message });
  });
  page.on("requestfailed", (request) => {
    diagnostics.push({
      kind: "requestfailed",
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText ?? "unknown request failure",
    });
  });
  page.on("response", (response) => {
    if (
      response.status() === 404 ||
      response.status() === 429 ||
      response.status() >= 500
    ) {
      diagnostics.push({
        kind: "http",
        method: response.request().method(),
        status: response.status(),
        url: response.url(),
      });
    }
  });

  return diagnostics;
}

function expectOnlyDeliberateDiagnostics(
  diagnostics: BrowserDiagnostic[],
  {
    applicationOrigin,
    chat429Count = 0,
    chat503Count = 0,
  }: {
    applicationOrigin: string;
    chat429Count?: number;
    chat503Count?: number;
  },
) {
  const expectedHttp = diagnostics.filter(
    (diagnostic) =>
      diagnostic.kind === "http" &&
      diagnostic.method === "POST" &&
      (diagnostic.status === 429 || diagnostic.status === 503) &&
      pathname(diagnostic.url) === ASSISTANT_API,
  );
  expect(
    diagnostics.filter(
      (diagnostic) =>
        diagnostic.kind === "http" &&
        diagnostic.method === "POST" &&
        diagnostic.status === 429 &&
        pathname(diagnostic.url) === ASSISTANT_API,
    ),
  ).toHaveLength(chat429Count);
  expect(
    diagnostics.filter(
      (diagnostic) =>
        diagnostic.kind === "http" &&
        diagnostic.method === "POST" &&
        diagnostic.status === 503 &&
        pathname(diagnostic.url) === ASSISTANT_API,
    ),
  ).toHaveLength(chat503Count);

  const expectedConsole = diagnostics.filter(
    (diagnostic) =>
      diagnostic.kind === "console" &&
      diagnostic.level === "error" &&
      (expectedHttp.some(
        (http) =>
          http.kind === "http" &&
          pathname(http.url) === pathname(diagnostic.url),
      ) ||
        diagnostic.text.includes("429") ||
        diagnostic.text.includes("503")) &&
      pathname(diagnostic.url) === ASSISTANT_API,
  );
  expect(expectedConsole).toHaveLength(chat429Count + chat503Count);

  const expected = new Set<BrowserDiagnostic>([
    ...expectedHttp,
    ...expectedConsole,
    ...diagnostics.filter((diagnostic) =>
      isExpectedNextNavigationCancellation(diagnostic, applicationOrigin),
    ),
    ...diagnostics.filter((diagnostic) =>
      isExpectedUnusedPreloadWarning(diagnostic, applicationOrigin),
    ),
  ]);
  expect(diagnostics.filter((diagnostic) => !expected.has(diagnostic))).toEqual(
    [],
  );
}

async function configureProject(page: Page, testInfo: TestInfo) {
  expect(["desktop", "mobile"]).toContain(testInfo.project.name);
  await page.setViewportSize(
    testInfo.project.name === "desktop" ? DESKTOP_VIEWPORT : MOBILE_VIEWPORT,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectMinimumControlSize(controls: Locator) {
  const boxes = await controls.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    }),
  );

  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
}

function quickAssistantDialog(page: Page) {
  return page.getByRole("dialog", { name: "M 助手", exact: true });
}

function quickAssistantLauncher(page: Page) {
  return page.getByRole("button", { name: "打开 M 助手", exact: true });
}

function waitForAssistantStatus(page: Page) {
  return page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(ASSISTANT_STATUS_API) &&
      candidate.status() === 200,
  );
}

async function gotoPublicRoute(page: Page, route: string) {
  await page.goto(route);
}

async function openQuickAssistantWithStatus(page: Page) {
  const statusResponse = waitForAssistantStatus(page);
  await quickAssistantLauncher(page).click();
  await statusResponse;
  return quickAssistantDialog(page);
}

async function selectRepresentativePricingModules(page: Page) {
  await page.getByLabel("部署方式").selectOption("dedicated-cloud");
  await page.getByLabel("使用规模").selectOption("enterprise");
  await page.getByRole("checkbox", { name: "AI Agent Studio" }).check();
  await page.getByRole("checkbox", { name: "Workflow" }).check();
  await page.getByLabel("服务周期").selectOption("3y");
}

async function navigateFromHeaderToProduct(page: Page, projectName: string) {
  if (projectName === "desktop") {
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("link", { name: "产品", exact: true })
      .click();
  } else {
    await page.getByRole("button", { name: "打开导航", exact: true }).click();
    const navigation = page.getByRole("dialog", {
      name: "全站导航",
      exact: true,
    });
    await navigation.getByRole("button", { name: "产品", exact: true }).click();
    await navigation
      .getByRole("link", { name: "产品概览", exact: true })
      .click();
  }
  await expect(page).toHaveURL(/\/product$/u);
}

async function navigateFromHeaderToLogin(page: Page, projectName: string) {
  if (projectName === "desktop") {
    await page
      .getByRole("link", { name: "登录 / 进入平台", exact: true })
      .click();
  } else {
    await page.getByRole("button", { name: "打开导航", exact: true }).click();
    await page
      .getByRole("dialog", { name: "全站导航", exact: true })
      .getByRole("link", { name: "登录 / 进入控制台", exact: true })
      .click();
  }
  await expect(page).toHaveURL(/\/login$/u);
}

async function setNavigationSentinel(page: Page, value: string) {
  await page.evaluate((sentinel) => {
    (
      window as Window & { __portalNavigationSentinel?: string }
    ).__portalNavigationSentinel = sentinel;
    document.documentElement.dataset.portalNavigationSentinel = sentinel;
  }, value);
}

async function expectNavigationSentinel(page: Page, value: string) {
  expect(
    await page.evaluate(() => ({
      window: (window as Window & { __portalNavigationSentinel?: string })
        .__portalNavigationSentinel,
      document: document.documentElement.dataset.portalNavigationSentinel,
    })),
  ).toEqual({ window: value, document: value });
}

async function sendSuccessfulAssistantMessage(page: Page) {
  const question = "如何开始了解平台？";
  const answer = "你可以从快速开始文档了解平台结构和使用入口。";
  const dialog = quickAssistantDialog(page);
  await dialog.getByLabel("向 M 助手提问", { exact: true }).fill(question);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(ASSISTANT_API) && candidate.status() === 200,
  );
  await dialog.getByRole("button", { name: "发送消息", exact: true }).click();
  await response;
  await expect(dialog.getByTestId("assistant-history")).toContainText(question);
  await expect(dialog.getByTestId("assistant-history")).toContainText(answer);
  return answer;
}

test("GET pricing and assistant APIs reject unsupported methods", async ({
  request,
}) => {
  const deliberate405s = [];
  for (const endpoint of [
    "/api/v1/pricing/estimate",
    "/api/v1/assistant/chat",
  ]) {
    const response = await request.get(endpoint);
    deliberate405s.push({ endpoint, method: "GET", status: response.status() });
  }
  expect(deliberate405s).toEqual([
    { endpoint: "/api/v1/pricing/estimate", method: "GET", status: 405 },
    { endpoint: "/api/v1/assistant/chat", method: "GET", status: 405 },
  ]);
});

test("assistant preset responses expose safe suggested actions", async ({
  page,
}, testInfo) => {
  await configureProject(page, testInfo);
  const diagnostics = collectBrowserDiagnostics(page);
  await gotoPublicRoute(page, "/pricing");
  const dialog = await openQuickAssistantWithStatus(page);

  for (const [question, label, href] of [
    ["如何开始了解平台？", "查看快速开始", "/docs#quick-start"],
    ["如何获取部署支持？", "联系商务", "/contact"],
    ["如何提交产品问题？", "前往客户支持", "/support"],
  ] as const) {
    const response = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith(ASSISTANT_API) && candidate.status() === 200,
    );
    await dialog.getByRole("button", { name: question, exact: true }).click();
    await response;
    await expect(
      dialog.getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("href", href);
  }

  expectOnlyDeliberateDiagnostics(diagnostics, {
    applicationOrigin: new URL(page.url()).origin,
  });
});

test("pricing quote flow and responsive layout remain exact", async ({
  page,
}, testInfo) => {
  await configureProject(page, testInfo);
  const diagnostics = collectBrowserDiagnostics(page);
  await gotoPublicRoute(page, "/pricing");

  await expect(
    page.getByRole("heading", { level: 1, name: "价格计算", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("在线估算尚未开放，最终价格以商务报价为准", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText(CURRENCY_AMOUNT);

  await selectRepresentativePricingModules(page);
  await expect(page.locator("main")).not.toContainText(CURRENCY_AMOUNT);

  const contact = page
    .getByRole("main")
    .getByRole("link", { name: "获取正式报价", exact: true });
  const expectedContactHref =
    "/contact?source=pricing&deployment=dedicated-cloud&scale=enterprise&modules=agent-studio%2Cworkflow&term=3y";
  await expect(contact).toHaveAttribute("href", expectedContactHref);
  await contact.click();
  await expect(page).toHaveURL(
    (url) => `${url.pathname}${url.search}` === expectedContactHref,
  );
  const summary = page
    .getByRole("heading", { level: 2, name: "价格计算需求摘要" })
    .locator("xpath=..");
  for (const row of [
    "部署方式：专有云",
    "使用规模：企业级",
    "功能模块：AI Agent Studio、Workflow",
    "服务周期：三年",
    "此摘要仅用于需求沟通，不是正式报价。",
  ]) {
    await expect(summary).toContainText(row);
  }

  await gotoPublicRoute(page, "/pricing");
  await expectNoHorizontalOverflow(page);
  const configBox = await page
    .getByRole("region", { name: "需求配置" })
    .boundingBox();
  const summaryBox = await page
    .getByRole("region", { name: "方案摘要" })
    .boundingBox();
  expect(configBox).not.toBeNull();
  expect(summaryBox).not.toBeNull();

  if (testInfo.project.name === "desktop") {
    expect(configBox!.width / summaryBox!.width).toBeCloseTo(7 / 5, 1);
    expect(Math.abs(configBox!.y - summaryBox!.y)).toBeLessThan(2);
    const firstModule = page.getByRole("checkbox", {
      name: "AI Agent Studio",
    });
    await firstModule.focus();
    await page.keyboard.press("Tab");
    const secondModule = page.getByRole("checkbox", {
      name: "Knowledge Base",
    });
    await expect(secondModule).toBeFocused();
    const outline = await secondModule
      .locator("xpath=..")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { style: style.outlineStyle, width: style.outlineWidth };
      });
    expect(outline.style).not.toBe("none");
    expect(outline.width).not.toBe("0px");
  } else {
    expect(summaryBox!.y).toBeGreaterThan(configBox!.y + configBox!.height);
    expect(Math.abs(configBox!.width - summaryBox!.width)).toBeLessThan(2);
  }

  expectOnlyDeliberateDiagnostics(diagnostics, {
    applicationOrigin: new URL(page.url()).origin,
  });
});

test("assistant visibility, accessibility, and failure recovery are resilient", async ({
  page,
}, testInfo) => {
  await configureProject(page, testInfo);
  const diagnostics = collectBrowserDiagnostics(page);

  for (const route of ["/pricing", "/product"]) {
    await gotoPublicRoute(page, route);
    await expect(quickAssistantLauncher(page)).toBeVisible();
  }
  for (const route of ["/login", "/register", "/staff/login"]) {
    await page.goto(route);
    await expect(quickAssistantLauncher(page)).toHaveCount(0);
  }

  await gotoPublicRoute(page, "/pricing");
  const launcher = quickAssistantLauncher(page);
  const reducedMotion = await launcher.evaluate((element) => {
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: style.animationDuration };
  });
  expect(reducedMotion.name === "none" || reducedMotion.duration === "0s").toBe(
    true,
  );
  const closedLauncherBox = await launcher.boundingBox();

  const dialog = await openQuickAssistantWithStatus(page);
  const input = dialog.getByLabel("向 M 助手提问", { exact: true });
  await expect(input).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "关闭 M 助手", exact: true }),
  ).toBeFocused();
  await expect(input).not.toHaveAttribute("maxlength");
  await expect(dialog.getByText("0 / 500", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await launcher.click();

  if (testInfo.project.name === "mobile") {
    const panelBox = await dialog.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(closedLauncherBox).not.toBeNull();
    expect(panelBox!.width).toBeGreaterThanOrEqual(360);
    expect(panelBox!.x).toBeLessThanOrEqual(13);
    expect(
      Math.abs(MOBILE_VIEWPORT.height - (panelBox!.y + panelBox!.height)),
    ).toBeLessThanOrEqual(2);
    expect(closedLauncherBox!.height).toBeGreaterThanOrEqual(44);
    const drawerStyle = await dialog.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        bottomLeft: style.borderBottomLeftRadius,
        bottomRight: style.borderBottomRightRadius,
      };
    });
    expect(drawerStyle.bottomLeft).toBe("0px");
    expect(drawerStyle.bottomRight).toBe("0px");
    await expectMinimumControlSize(dialog.locator("button, a, input"));
    const staticMobilePanelRule = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        for (const rule of Array.from(sheet.cssRules)) {
          if (
            !(rule instanceof CSSMediaRule) ||
            !rule.conditionText.includes("max-width: 640px")
          ) {
            continue;
          }
          for (const nestedRule of Array.from(rule.cssRules)) {
            if (
              nestedRule instanceof CSSStyleRule &&
              nestedRule.selectorText === ".floating-assistant__panel"
            ) {
              return nestedRule.style.paddingBottom;
            }
          }
        }
      }
      return null;
    });
    expect(staticMobilePanelRule).toContain("env(safe-area-inset-bottom)");
    await expectNoHorizontalOverflow(page);
  }

  let unicodeChatRequests = 0;
  page.on("request", (request) => {
    if (pathname(request.url()) === ASSISTANT_API) unicodeChatRequests += 1;
  });
  const send = dialog.getByRole("button", {
    name: "发送消息",
    exact: true,
  });
  await input.fill(`  ${"😀".repeat(500)}  `);
  await expect(send).toBeEnabled();
  const unicodeRequest = page.waitForRequest((request) =>
    request.url().endsWith(ASSISTANT_API),
  );
  const unicodeResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(ASSISTANT_API) && response.status() === 200,
  );
  await send.click();
  expect(JSON.parse((await unicodeRequest).postData() ?? "null").message).toBe(
    "😀".repeat(500),
  );
  await unicodeResponse;
  expect(unicodeChatRequests).toBe(1);

  await input.fill(`  ${"😀".repeat(501)}  `);
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByText("501 / 500", { exact: true })).toBeVisible();
  await expect(send).toBeDisabled();
  expect(unicodeChatRequests).toBe(1);

  let interceptedChatRequests = 0;
  await page.route(`**${ASSISTANT_API}`, async (route) => {
    interceptedChatRequests += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "placeholder",
        error: {
          code: "assistant_unavailable",
          message: "助手服务暂不可用，请使用帮助中心或商务咨询。",
        },
      }),
    });
  });

  const failedDraft = "请提供部署支持";
  await input.fill(failedDraft);
  for (const expectedCount of [1, 2, 3]) {
    const response = page.waitForResponse((candidate) =>
      candidate.url().endsWith(ASSISTANT_API),
    );
    await quickAssistantDialog(page)
      .getByRole("button", {
        name: expectedCount === 1 ? "发送消息" : "重试",
        exact: true,
      })
      .click();
    expect((await response).status()).toBe(503);
    expect(interceptedChatRequests).toBe(expectedCount);
    await expect(input).toHaveValue(failedDraft);
  }

  await expect(
    dialog.getByText("发送失败，请重试或使用帮助中心或商务咨询。", {
      exact: true,
    }),
  ).toBeVisible();
  const history = dialog.getByTestId("assistant-history");
  await expect(history).toContainText(
    "AI 服务尚未接入。你可以先查看帮助中心或联系商务顾问。",
  );
  await expect(history).not.toContainText(failedDraft);
  const fallbacks = dialog.getByRole("navigation", {
    name: "M 助手兜底链接",
    exact: true,
  });
  await expect(
    fallbacks.getByRole("link", { name: "帮助中心", exact: true }),
  ).toBeVisible();
  await expect(
    fallbacks.getByRole("link", { name: "商务咨询", exact: true }),
  ).toBeVisible();
  await page.unroute(`**${ASSISTANT_API}`);

  expectOnlyDeliberateDiagnostics(diagnostics, {
    applicationOrigin: new URL(page.url()).origin,
    chat503Count: 3,
  });
});

test("assistant session survives public routing and resets at the identity boundary", async ({
  page,
}, testInfo) => {
  await configureProject(page, testInfo);
  const diagnostics = collectBrowserDiagnostics(page);
  await gotoPublicRoute(page, "/pricing");
  await openQuickAssistantWithStatus(page);
  const answer = await sendSuccessfulAssistantMessage(page);

  await quickAssistantDialog(page)
    .getByRole("button", { name: "关闭 M 助手", exact: true })
    .click();
  await selectRepresentativePricingModules(page);
  const pricingSentinel = `pricing-${testInfo.project.name}-${Date.now()}`;
  await setNavigationSentinel(page, pricingSentinel);
  await page
    .getByRole("main")
    .getByRole("link", { name: "获取正式报价", exact: true })
    .click();
  await expect(page).toHaveURL(/\/contact\?source=pricing/u);
  await expectNavigationSentinel(page, pricingSentinel);
  await quickAssistantLauncher(page).click();
  await expect(
    quickAssistantDialog(page).getByTestId("assistant-history"),
  ).toContainText(answer);

  if (testInfo.project.name === "mobile") {
    await quickAssistantDialog(page)
      .getByRole("button", { name: "关闭 M 助手", exact: true })
      .click();
  }
  await navigateFromHeaderToProduct(page, testInfo.project.name);
  await expect(quickAssistantDialog(page)).toHaveCount(0);
  await quickAssistantLauncher(page).click();
  await expect(
    quickAssistantDialog(page).getByTestId("assistant-history"),
  ).toContainText(answer);
  await quickAssistantDialog(page)
    .getByRole("button", { name: "关闭 M 助手", exact: true })
    .click();
  const footerSentinel = `footer-${testInfo.project.name}-${Date.now()}`;
  await setNavigationSentinel(page, footerSentinel);
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "帮助中心", exact: true })
    .click();
  await expect(page).toHaveURL(/\/help$/u);
  await expectNavigationSentinel(page, footerSentinel);
  await quickAssistantLauncher(page).click();
  await expect(
    quickAssistantDialog(page).getByTestId("assistant-history"),
  ).toContainText(answer);
  await quickAssistantDialog(page)
    .getByRole("button", { name: "关闭 M 助手", exact: true })
    .click();

  const identitySentinel = `identity-${testInfo.project.name}-${Date.now()}`;
  await setNavigationSentinel(page, identitySentinel);
  await navigateFromHeaderToLogin(page, testInfo.project.name);
  await expectNavigationSentinel(page, identitySentinel);
  await expect(quickAssistantLauncher(page)).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/help$/u);
  await expectNavigationSentinel(page, identitySentinel);
  await openQuickAssistantWithStatus(page);
  await expect(
    quickAssistantDialog(page).getByTestId("assistant-history"),
  ).not.toContainText(answer);
  await expect(
    quickAssistantDialog(page).getByTestId("assistant-history"),
  ).toContainText("你好，我是 M 助手。");

  await page.reload();
  await openQuickAssistantWithStatus(page);
  await expect(
    quickAssistantDialog(page).getByTestId("assistant-history"),
  ).not.toContainText(answer);
  await expect(
    quickAssistantDialog(page).getByTestId("assistant-history"),
  ).toContainText("你好，我是 M 助手。");

  expectOnlyDeliberateDiagnostics(diagnostics, {
    applicationOrigin: new URL(page.url()).origin,
  });
});
