import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const pages = [
  ["/product", "让企业 AI 落地，深度建设与快速使用双路径"],
  ["/product/standalone", "独立产品中心：成熟企业级 AI 产品，开箱即用"],
  ["/product/code-agent", "企业级的智能编码产品，代码不出域、说需求就落地"],
  ["/product/aippt", "一站式智能演示文稿创作平台，需求直达、分钟级成稿"],
  ["/product/aishrek", "AI 机械设计工作台，导入即解读、对话改参数"],
] as const;

async function gotoProduct(page: Page, path: string) {
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

test("五个产品页面返回原型标题并只使用 shell 聊天入口", async ({ page }) => {
  for (const [path, title] of pages) {
    const response = await gotoProduct(page, path);

    expect(response?.status(), path).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
    await expect(
      page.locator("main.product-portal .floating-assistant"),
    ).toHaveCount(0);
    await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
  }
});

test("五个产品页面内部链接没有 404 或服务端错误", async ({ page }) => {
  for (const [path] of pages) {
    await gotoProduct(page, path);
    const hrefs = await page
      .locator("main.product-portal a")
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

test("产品页面在桌面、平板和移动宽度无横向溢出", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [path] of pages) {
      await gotoProduct(page, path);
      await expectNoHorizontalOverflow(page);
    }
  }
});

test("产品页面保留现有 Agent 聊天的打开与关闭行为", async ({ page }) => {
  for (const path of ["/product", "/product/code-agent", "/product/aishrek"]) {
    await gotoProduct(page, path);
    await page.getByRole("button", { name: "打开码多多" }).click();
    await expect(page.getByRole("dialog", { name: "码多多" })).toBeVisible();
    await page.getByRole("button", { name: "关闭码多多", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "码多多" })).toHaveCount(0);
  }
});

test("捕获产品总览、码多多和 AISHREK 的响应式视觉证据", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(120_000);
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/product-portal",
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const viewport of [
    { name: "1440", width: 1440, height: 1000 },
    { name: "390", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [name, path] of [
      ["overview", "/product"],
      ["code-agent", "/product/code-agent"],
      ["aishrek", "/product/aishrek"],
    ] as const) {
      await gotoProduct(page, path);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(outputDirectory, `${name}-${viewport.name}.png`),
      });
    }
  }
});
