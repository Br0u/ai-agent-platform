import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const pages = [
  ["/product/model", "企业模型工程，从资产管理到上线服务"],
  ["/product/knowledge", "企业知识库：让企业文档变成 AI 能用的知识"],
  ["/product/agents", "让企业拥有懂知识、懂业务、懂流程的 AI 助手"],
  ["/product/applications", "成熟业务 AI 应用，拿来即用"],
  ["/product/skills", "可复用的业务技能，拿来即用"],
  ["/product/coding", "码多多：让智能编程走进企业日常开发"],
  ["/product/governance", "平台用得安全，权限管得清楚"],
] as const;

async function gotoCenter(page: Page, path: string) {
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

test("七个元启平台中心返回原型标题并只使用 shell 聊天入口", async ({
  page,
}) => {
  for (const [path, title] of pages) {
    const response = await gotoCenter(page, path);

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

test("七个元启平台中心内部链接没有 404 或服务端错误", async ({ page }) => {
  for (const [path] of pages) {
    await gotoCenter(page, path);
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

test("七个元启平台中心在桌面、平板和移动宽度无横向溢出", async ({
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
      await gotoCenter(page, path);
      await expectNoHorizontalOverflow(page);
    }
  }
});

test("元启平台中心保留现有 Agent 聊天的打开与关闭行为", async ({ page }) => {
  for (const path of ["/product/model", "/product/agents", "/product/coding"]) {
    await gotoCenter(page, path);
    await page.getByRole("button", { name: "打开码多多" }).click();
    await expect(page.getByRole("dialog", { name: "码多多" })).toBeVisible();
    await page.getByRole("button", { name: "关闭码多多", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "码多多" })).toHaveCount(0);
  }
});

test("捕获模型、智能体与编程中心的响应式视觉证据", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(120_000);
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/platform-centers",
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const viewport of [
    { name: "1440", width: 1440, height: 1000 },
    { name: "390", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [name, path] of [
      ["model", "/product/model"],
      ["agents", "/product/agents"],
      ["coding", "/product/coding"],
    ] as const) {
      await gotoCenter(page, path);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(outputDirectory, `${name}-${viewport.name}.png`),
      });
    }
  }
});
