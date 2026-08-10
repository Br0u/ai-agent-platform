import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const pages = [
  {
    name: "agent-knowledge-base",
    path: "/product/agent-knowledge-base",
    sectionCount: 3,
    title: "能力底座：让智能体懂知识、懂数据",
  },
  {
    name: "knowledge-metrics",
    path: "/product/knowledge-metrics",
    sectionCount: 4,
    title: "数据源与指标：让业务数据能被 AI 直接问数",
  },
] as const;

const viewports = [
  { name: "1440", width: 1440, height: 1000 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
] as const;

async function gotoCapabilityFoundation(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  return response;
}

async function expectContentVisible(
  page: Page,
  title: string,
  sectionCount: number,
) {
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();

  const sections = page.getByTestId("platform-center-section");
  await expect(sections).toHaveCount(sectionCount);
  for (let index = 0; index < sectionCount; index += 1) {
    await expect(sections.nth(index)).toBeVisible();
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function cardGridColumnCount(page: Page) {
  return page
    .locator(".platform-center-card-grid")
    .first()
    .evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean)
          .length,
    );
}

test("两页返回原型标题、完整区块并只使用 shell 聊天入口", async ({ page }) => {
  for (const { path, sectionCount, title } of pages) {
    const response = await gotoCapabilityFoundation(page, path);

    expect(response?.status(), path).toBe(200);
    await expectContentVisible(page, title, sectionCount);
    await expect(
      page.locator("main.platform-center .floating-assistant"),
    ).toHaveCount(0);
    await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
  }
});

test("两页内部链接没有 404 或服务端错误", async ({ page }) => {
  for (const { path } of pages) {
    await gotoCapabilityFoundation(page, path);
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

test("两页在桌面、平板和移动端保持高密度且内容完整", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const { path, sectionCount, title } of pages) {
      await gotoCapabilityFoundation(page, path);
      await expect(page.locator("main.platform-center--dense")).toHaveCount(1);
      await expectContentVisible(page, title, sectionCount);
      await expectNoHorizontalOverflow(page);

      const columnCount = await cardGridColumnCount(page);
      if (viewport.width === 1440) {
        expect(
          columnCount,
          `${path} desktop card columns`,
        ).toBeGreaterThanOrEqual(2);
      }
      if (viewport.width === 390) {
        expect(columnCount, `${path} mobile card columns`).toBe(1);
        const heroColumnCount = await page
          .locator(".product-detail-hero")
          .evaluate(
            (element) =>
              getComputedStyle(element)
                .gridTemplateColumns.split(" ")
                .filter(Boolean).length,
          );
        expect(heroColumnCount, `${path} mobile hero columns`).toBe(1);
      }
    }
  }
});

test("两页在桌面和移动端都能打开与关闭现有 Agent 聊天", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");

  for (const viewport of [viewports[0], viewports[2]]) {
    await page.setViewportSize(viewport);
    for (const { path } of pages) {
      await gotoCapabilityFoundation(page, path);
      await page.getByRole("button", { name: "打开码多多" }).click();
      await expect(page.getByRole("dialog", { name: "码多多" })).toBeVisible();
      await page
        .getByRole("button", { name: "关闭码多多", exact: true })
        .click();
      await expect(page.getByRole("dialog", { name: "码多多" })).toHaveCount(0);
    }
  }
});

test("捕获两页桌面与移动端全页视觉证据", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(120_000);
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/capability-foundations",
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const viewport of [viewports[0], viewports[2]]) {
    await page.setViewportSize(viewport);
    for (const { name, path } of pages) {
      await gotoCapabilityFoundation(page, path);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(outputDirectory, `${name}-${viewport.name}.png`),
      });
    }
  }
});
