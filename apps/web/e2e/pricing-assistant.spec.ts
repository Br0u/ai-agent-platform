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
const CURRENCY_AMOUNT =
  /(?:[¥￥$€£]\s*\d)|(?:(?:CNY|RMB|USD)\s*\d)|(?:\d+(?:\.\d+)?\s*元)/u;

type BrowserDiagnostic =
  | {
      kind: "console";
      level: "warning" | "error";
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

function collectBrowserDiagnostics(page: Page): BrowserDiagnostic[] {
  const diagnostics: BrowserDiagnostic[] = [];

  page.on("console", (message) => {
    const level = message.type();
    if (level === "warning" || level === "error") {
      diagnostics.push({
        kind: "console",
        level,
        text: message.text(),
        url: message.location().url,
      });
    }
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
    if (response.status() >= 400) {
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
    chat503Count = 0,
  }: { applicationOrigin: string; chat503Count?: number },
) {
  const expectedHttp = diagnostics.filter(
    (diagnostic) =>
      diagnostic.kind === "http" &&
      diagnostic.method === "POST" &&
      diagnostic.status === 503 &&
      pathname(diagnostic.url) === ASSISTANT_API,
  );
  expect(expectedHttp).toHaveLength(chat503Count);

  const expectedConsole = diagnostics.filter(
    (diagnostic) =>
      diagnostic.kind === "console" &&
      diagnostic.level === "error" &&
      pathname(diagnostic.url) === ASSISTANT_API,
  );
  expect(expectedConsole).toHaveLength(chat503Count);

  const expected = new Set<BrowserDiagnostic>([
    ...expectedHttp,
    ...expectedConsole,
    ...diagnostics.filter((diagnostic) =>
      isExpectedNextNavigationCancellation(diagnostic, applicationOrigin),
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

async function selectRepresentativePricingModules(page: Page) {
  await page.getByLabel("部署方式").selectOption("dedicated-cloud");
  await page.getByLabel("使用规模").selectOption("enterprise");
  await page.getByRole("checkbox", { name: "AI Agent Studio" }).check();
  await page.getByRole("checkbox", { name: "Workflow" }).check();
  await page.getByLabel("服务周期").selectOption("3y");
}

async function navigateFromHeaderToProduct(page: Page, projectName: string) {
  if (projectName === "desktop") {
    await page.getByRole("button", { name: "产品", exact: true }).click();
    await page.getByRole("link", { name: "产品概览", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "打开导航" }).click();
    const navigation = page.getByRole("dialog", { name: "全站导航" });
    await navigation.getByRole("button", { name: "产品", exact: true }).click();
    await navigation.getByRole("link", { name: "产品概览" }).click();
  }
  await expect(page).toHaveURL(/\/product$/u);
}

async function navigateFromHeaderToLogin(page: Page, projectName: string) {
  if (projectName === "desktop") {
    await page.getByRole("link", { name: "登录 / 进入平台" }).click();
  } else {
    await page.getByRole("button", { name: "打开导航" }).click();
    await page
      .getByRole("dialog", { name: "全站导航" })
      .getByRole("link", { name: "登录 / 进入控制台" })
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
  await page.getByLabel("向 M 助手提问").fill(question);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(ASSISTANT_API) && candidate.status() === 200,
  );
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await response;
  await expect(page.getByTestId("assistant-history")).toContainText(question);
  await expect(page.getByTestId("assistant-history")).toContainText(answer);
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

test("pricing quote flow and responsive layout remain exact", async ({
  page,
}, testInfo) => {
  await configureProject(page, testInfo);
  const diagnostics = collectBrowserDiagnostics(page);
  await page.goto("/pricing");

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

  const contact = page.getByRole("link", { name: "获取正式报价" });
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

  await page.goto("/pricing");
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
    await page.goto(route);
    await expect(
      page.getByRole("button", { name: "打开 M 助手" }),
    ).toBeVisible();
  }
  for (const route of ["/login", "/register", "/staff/login"]) {
    await page.goto(route);
    await expect(page.getByRole("button", { name: "打开 M 助手" })).toHaveCount(
      0,
    );
  }

  await page.goto("/pricing");
  const launcher = page.getByRole("button", { name: "打开 M 助手" });
  const reducedMotion = await launcher.evaluate((element) => {
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: style.animationDuration };
  });
  expect(reducedMotion.name === "none" || reducedMotion.duration === "0s").toBe(
    true,
  );

  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "M 助手" });
  const input = page.getByLabel("向 M 助手提问");
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await launcher.click();

  if (testInfo.project.name === "mobile") {
    const panelBox = await dialog.boundingBox();
    const launcherBox = await launcher.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(launcherBox).not.toBeNull();
    expect(panelBox!.width).toBeGreaterThanOrEqual(360);
    expect(panelBox!.x).toBeLessThanOrEqual(13);
    expect(
      Math.abs(MOBILE_VIEWPORT.height - (panelBox!.y + panelBox!.height)),
    ).toBeLessThanOrEqual(2);
    expect(launcherBox!.height).toBeGreaterThanOrEqual(44);
    const drawerStyle = await dialog.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        bottomLeft: style.borderBottomLeftRadius,
        bottomRight: style.borderBottomRightRadius,
        paddingBottom: Number.parseFloat(style.paddingBottom),
      };
    });
    expect(drawerStyle.bottomLeft).toBe("0px");
    expect(drawerStyle.bottomRight).toBe("0px");
    expect(drawerStyle.paddingBottom).toBeGreaterThanOrEqual(12);
    await expectMinimumControlSize(dialog.locator("button, a, input"));
    const staticMobilePanelRule = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        for (const rule of Array.from(sheet.cssRules)) {
          if (
            !(rule instanceof CSSMediaRule) ||
            !rule.conditionText.includes("max-width: 600px")
          ) {
            continue;
          }
          for (const nestedRule of Array.from(rule.cssRules)) {
            if (
              nestedRule instanceof CSSStyleRule &&
              nestedRule.selectorText === ".assistant-panel"
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
    await page
      .getByRole("button", {
        name: expectedCount === 1 ? "发送" : "重试",
        exact: true,
      })
      .click();
    expect((await response).status()).toBe(503);
    expect(interceptedChatRequests).toBe(expectedCount);
    await expect(input).toHaveValue(failedDraft);
  }

  await expect(
    page.getByText("发送失败，请重试或使用下方服务入口。", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("assistant-history")).toBeEmpty();
  const fallbacks = dialog.getByRole("navigation", { name: "其他服务" });
  await expect(fallbacks.getByRole("link", { name: "帮助中心" })).toBeVisible();
  await expect(fallbacks.getByRole("link", { name: "商务咨询" })).toBeVisible();
  await page.unroute(`**${ASSISTANT_API}`);

  expectOnlyDeliberateDiagnostics(diagnostics, {
    applicationOrigin: new URL(page.url()).origin,
    chat503Count: 3,
  });
});

test("assistant session survives header, footer, and identity client routing", async ({
  page,
}, testInfo) => {
  await configureProject(page, testInfo);
  const diagnostics = collectBrowserDiagnostics(page);
  await page.goto("/pricing");
  await page.getByRole("button", { name: "打开 M 助手" }).click();
  const answer = await sendSuccessfulAssistantMessage(page);

  await page.getByRole("button", { name: "关闭 M 助手" }).click();
  await selectRepresentativePricingModules(page);
  const pricingSentinel = `pricing-${testInfo.project.name}-${Date.now()}`;
  await setNavigationSentinel(page, pricingSentinel);
  await page.getByRole("link", { name: "获取正式报价" }).click();
  await expect(page).toHaveURL(/\/contact\?source=pricing/u);
  await expectNavigationSentinel(page, pricingSentinel);
  await page.getByRole("button", { name: "打开 M 助手" }).click();
  await expect(page.getByTestId("assistant-history")).toContainText(answer);

  await navigateFromHeaderToProduct(page, testInfo.project.name);
  await expect(page.getByTestId("assistant-history")).toContainText(answer);

  await page.getByRole("button", { name: "关闭 M 助手" }).click();
  const footerSentinel = `footer-${testInfo.project.name}-${Date.now()}`;
  await setNavigationSentinel(page, footerSentinel);
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "帮助中心" })
    .click();
  await expect(page).toHaveURL(/\/help$/u);
  await expectNavigationSentinel(page, footerSentinel);
  await page.getByRole("button", { name: "打开 M 助手" }).click();
  await expect(page.getByTestId("assistant-history")).toContainText(answer);
  await page.getByRole("button", { name: "关闭 M 助手" }).click();

  const identitySentinel = `identity-${testInfo.project.name}-${Date.now()}`;
  await setNavigationSentinel(page, identitySentinel);
  await navigateFromHeaderToLogin(page, testInfo.project.name);
  await expectNavigationSentinel(page, identitySentinel);
  await expect(page.getByRole("button", { name: "打开 M 助手" })).toHaveCount(
    0,
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/help$/u);
  await expectNavigationSentinel(page, identitySentinel);
  await page.getByRole("button", { name: "打开 M 助手" }).click();
  await expect(page.getByTestId("assistant-history")).toContainText(answer);

  await page.reload();
  await page.getByRole("button", { name: "打开 M 助手" }).click();
  await expect(page.getByTestId("assistant-history")).toBeEmpty();

  expectOnlyDeliberateDiagnostics(diagnostics, {
    applicationOrigin: new URL(page.url()).origin,
  });
});
