import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const pages = [
  ["/product/model-optimization", "模型优化：数据、训练、评估，让模型更懂业务"],
  ["/product/model-task-center", "任务中心：模型任务统一管理"],
  ["/product/model-assets", "模型资产管理：让企业模型资产一条线管到底"],
  ["/product/model-training", "模型训练：让模型更贴合你的业务"],
  ["/product/model-evaluation", "模型评估：效果好不好，用数据说话"],
  ["/product/model-data", "数据准备：训练效果从数据开始"],
  ["/product/model-deploy", "模型部署：让模型变成可调用的服务"],
] as const;

async function gotoModelPage(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  return response;
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test("七个模型子页返回原型标题并只使用 shell 聊天入口", async ({ page }) => {
  for (const [path, title] of pages) {
    const response = await gotoModelPage(page, path);

    expect(response?.status(), path).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
    await expect(
      page.locator("main.platform-center .floating-assistant"),
    ).toHaveCount(0);
    await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
  }
});

test("七个模型子页内部链接没有 404 或服务端错误", async ({ page }) => {
  for (const [path] of pages) {
    await gotoModelPage(page, path);
    const hrefs = await page
      .locator("main.platform-center a")
      .evaluateAll((links) => [
        ...new Set(
          links
            .map((link) => new URL((link as HTMLAnchorElement).href))
            .filter((url) => url.origin === window.location.origin)
            .map((url) => `${url.pathname}${url.search}`),
        ),
      ]);

    for (const href of hrefs) {
      const response = await page.request.get(href);
      expect(response.status(), `${path} → ${href}`).toBeLessThan(400);
    }
  }
});

test("七个模型子页在桌面、平板和移动宽度无横向溢出", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [path] of pages) {
      await gotoModelPage(page, path);
      await expectNoHorizontalOverflow(page);
    }
  }
});

test("产品详情在桌面使用高密度双栏并在移动端折回单栏", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoModelPage(page, "/product/model-task-center");
  await expect(page.locator("main.platform-center--dense")).toHaveCount(1);

  const sectionFrame = page.locator(
    "#task-training.platform-center-section--with-demo > .product-portal-frame",
  );
  const desktopLayout = await sectionFrame.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      columnCount: style.gridTemplateColumns.split(" ").filter(Boolean).length,
      display: style.display,
    };
  });
  expect(desktopLayout).toStrictEqual({ columnCount: 2, display: "grid" });

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoModelPage(page, "/product/model-task-center");
  const mobileColumnCount = await sectionFrame.evaluate(
    (element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean)
        .length,
  );
  expect(mobileColumnCount).toBe(1);
});

test("模型子页保留现有 Agent 聊天的打开与关闭行为", async ({ page }) => {
  for (const path of [
    "/product/model-assets",
    "/product/model-training",
    "/product/model-deploy",
  ]) {
    await gotoModelPage(page, path);
    await page.getByRole("button", { name: "打开码多多" }).click();
    await expect(page.getByRole("dialog", { name: "码多多" })).toBeVisible();
    await page.getByRole("button", { name: "关闭码多多", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "码多多" })).toHaveCount(0);
  }
});

test("捕获模型资产、训练与部署子页的响应式视觉证据", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(120_000);
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/model-subpages",
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const viewport of [
    { name: "1440", width: 1440, height: 1000 },
    { name: "390", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [name, path] of [
      ["model-assets", "/product/model-assets"],
      ["model-training", "/product/model-training"],
      ["model-deploy", "/product/model-deploy"],
    ] as const) {
      await gotoModelPage(page, path);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(outputDirectory, `${name}-${viewport.name}.png`),
      });
    }
  }
});
