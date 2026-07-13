import { expect, test, type Locator, type Page } from "@playwright/test";

const DESKTOP_VIEWPORT = { width: 1440, height: 1000 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const ASSISTANT_API = "/api/v1/assistant/chat";

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

test("verifies pricing and M assistant across public and identity routes", async ({
  page,
  request,
}, testInfo) => {
  const projectName = testInfo.project.name;
  expect(["desktop", "mobile"]).toContain(projectName);
  await page.setViewportSize(
    projectName === "desktop" ? DESKTOP_VIEWPORT : MOBILE_VIEWPORT,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });

  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  for (const endpoint of [
    "/api/v1/pricing/estimate",
    "/api/v1/assistant/chat",
  ]) {
    const response = await request.get(endpoint);
    expect(response.status(), `GET ${endpoint}`).toBe(405);
  }

  for (const pathname of ["/pricing", "/product"]) {
    await page.goto(pathname);
    await expect(
      page.getByRole("button", { name: "打开 M 助手" }),
    ).toBeVisible();
  }
  for (const pathname of ["/login", "/register", "/staff/login"]) {
    await page.goto(pathname);
    await expect(page.getByRole("button", { name: "打开 M 助手" })).toHaveCount(
      0,
    );
  }

  await page.goto("/pricing");
  await expect(
    page.getByRole("heading", { level: 1, name: "价格计算", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("在线估算尚未开放，最终价格以商务报价为准", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText(
    /(?:[¥￥$€£]\s*\d)|(?:(?:CNY|RMB|USD)\s*\d)|(?:\d+(?:\.\d+)?\s*元)/u,
  );

  await page.getByLabel("部署方式").selectOption("dedicated-cloud");
  await page.getByLabel("使用规模").selectOption("enterprise");
  await page.getByRole("checkbox", { name: "AI Agent Studio" }).check();
  await page.getByRole("checkbox", { name: "Workflow" }).check();
  await page.getByLabel("服务周期").selectOption("3y");

  const contact = page.getByRole("link", { name: "获取正式报价" });
  const expectedContactHref =
    "/contact?source=pricing&deployment=dedicated-cloud&scale=enterprise&modules=agent-studio%2Cworkflow&term=3y";
  await expect(contact).toHaveAttribute("href", expectedContactHref);
  await contact.click();
  await expect(page).toHaveURL(
    (url) => `${url.pathname}${url.search}` === expectedContactHref,
  );
  const contactSummary = page.getByRole("heading", {
    level: 2,
    name: "价格计算需求摘要",
  });
  const summarySection = contactSummary.locator("xpath=..");
  await expect(summarySection).toContainText("部署方式：专有云");
  await expect(summarySection).toContainText("使用规模：企业级");
  await expect(summarySection).toContainText(
    "功能模块：AI Agent Studio、Workflow",
  );
  await expect(summarySection).toContainText("服务周期：三年");
  await expect(summarySection).toContainText(
    "此摘要仅用于需求沟通，不是正式报价。",
  );

  await page.goto("/pricing");
  await expectNoHorizontalOverflow(page);
  const configPanel = page.getByRole("region", { name: "需求配置" });
  const summaryPanel = page.getByRole("region", { name: "方案摘要" });
  const [configBox, pricingSummaryBox] = await Promise.all([
    configPanel.boundingBox(),
    summaryPanel.boundingBox(),
  ]);
  expect(configBox).not.toBeNull();
  expect(pricingSummaryBox).not.toBeNull();

  if (projectName === "desktop") {
    expect(configBox!.width / pricingSummaryBox!.width).toBeCloseTo(7 / 5, 1);
    expect(Math.abs(configBox!.y - pricingSummaryBox!.y)).toBeLessThan(2);

    const firstModule = page.getByRole("checkbox", {
      name: "AI Agent Studio",
    });
    await firstModule.focus();
    await page.keyboard.press("Tab");
    const secondModule = page.getByRole("checkbox", {
      name: "Knowledge Base",
    });
    await expect(secondModule).toBeFocused();
    const focusOutline = await secondModule
      .locator("xpath=..")
      .evaluate((el) => {
        const style = getComputedStyle(el);
        return { style: style.outlineStyle, width: style.outlineWidth };
      });
    expect(focusOutline.style).not.toBe("none");
    expect(focusOutline.width).not.toBe("0px");
  } else {
    expect(pricingSummaryBox!.y).toBeGreaterThan(
      configBox!.y + configBox!.height,
    );
    expect(Math.abs(configBox!.width - pricingSummaryBox!.width)).toBeLessThan(
      2,
    );
  }

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
  const assistantInput = page.getByLabel("向 M 助手提问");
  await expect(dialog).toBeVisible();
  await expect(assistantInput).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await launcher.click();

  if (projectName === "mobile") {
    const [panelBox, launcherBox] = await Promise.all([
      dialog.boundingBox(),
      launcher.boundingBox(),
    ]);
    expect(panelBox).not.toBeNull();
    expect(launcherBox).not.toBeNull();
    expect(panelBox!.width).toBeGreaterThanOrEqual(360);
    expect(panelBox!.x).toBeLessThanOrEqual(13);
    expect(launcherBox!.height).toBeGreaterThanOrEqual(44);
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
    const safeAreaRulePresent = await page.evaluate(() => {
      const containsSafeArea = (rules: CSSRuleList): boolean =>
        Array.from(rules).some((rule) => {
          if (rule.cssText.includes("safe-area-inset-bottom")) return true;
          return "cssRules" in rule
            ? containsSafeArea((rule as CSSGroupingRule).cssRules)
            : false;
        });
      return Array.from(document.styleSheets).some((sheet) =>
        containsSafeArea(sheet.cssRules),
      );
    });
    expect(safeAreaRulePresent).toBe(true);
    await expectNoHorizontalOverflow(page);
  }

  let interceptedChatRequests = 0;
  await page.route(`**${ASSISTANT_API}`, async (route) => {
    interceptedChatRequests += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "ASSISTANT_UNAVAILABLE",
        message: "Assistant service is unavailable",
      }),
    });
  });

  const failedDraft = "请提供部署支持";
  await assistantInput.fill(failedDraft);
  const firstFailure = page.waitForResponse((response) =>
    response.url().endsWith(ASSISTANT_API),
  );
  await page.getByRole("button", { name: "发送", exact: true }).click();
  expect((await firstFailure).status()).toBe(503);
  await expect(
    page.getByText("发送失败，请重试或使用下方服务入口。", { exact: true }),
  ).toBeVisible();
  await expect(assistantInput).toHaveValue(failedDraft);
  await expect(page.getByTestId("assistant-history")).toBeEmpty();
  const fallbackNavigation = dialog.getByRole("navigation", {
    name: "其他服务",
  });
  await expect(
    fallbackNavigation.getByRole("link", { name: "帮助中心" }),
  ).toBeVisible();
  await expect(
    fallbackNavigation.getByRole("link", { name: "商务咨询" }),
  ).toBeVisible();
  expect(interceptedChatRequests).toBe(1);

  for (const expectedCount of [2, 3]) {
    const retryFailure = page.waitForResponse((response) =>
      response.url().endsWith(ASSISTANT_API),
    );
    await page.getByRole("button", { name: "重试", exact: true }).click();
    expect((await retryFailure).status()).toBe(503);
    expect(interceptedChatRequests).toBe(expectedCount);
    await expect(assistantInput).toHaveValue(failedDraft);
  }

  await page.unroute(`**${ASSISTANT_API}`);
  const successfulQuestion = "如何开始了解平台？";
  const successfulAnswer = "你可以从快速开始文档了解平台结构和使用入口。";
  await assistantInput.fill(successfulQuestion);
  const successResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(ASSISTANT_API) && response.status() === 200,
  );
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await successResponse;
  await expect(page.getByTestId("assistant-history")).toContainText(
    successfulQuestion,
  );
  await expect(page.getByTestId("assistant-history")).toContainText(
    successfulAnswer,
  );

  await navigateFromHeaderToProduct(page, projectName);
  await expect(page.getByTestId("assistant-history")).toContainText(
    successfulAnswer,
  );

  await page.getByRole("button", { name: "关闭 M 助手" }).click();
  await expect(page.getByRole("dialog", { name: "M 助手" })).toHaveCount(0);
  await navigateFromHeaderToLogin(page, projectName);
  await expect(page.getByRole("button", { name: "打开 M 助手" })).toHaveCount(
    0,
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/product$/u);
  await page.getByRole("button", { name: "打开 M 助手" }).click();
  await expect(page.getByTestId("assistant-history")).toContainText(
    successfulAnswer,
  );

  await page.reload();
  await page.getByRole("button", { name: "打开 M 助手" }).click();
  await expect(page.getByTestId("assistant-history")).toBeEmpty();

  expect(consoleErrors).toEqual(
    Array(3).fill(
      "Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
    ),
  );
});
