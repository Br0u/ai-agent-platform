import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const pages = [
  {
    name: "coding-project",
    path: "/product/coding-project",
    title: "让 AI 持续理解你的开发项目",
  },
  {
    name: "coding-session",
    path: "/product/coding-session",
    title: "让开发上下文不断线",
  },
  {
    name: "coding-mobile",
    path: "/product/coding-mobile",
    title: "让智能编程，接入你的每一种开发环境",
  },
  {
    name: "coding-standard",
    path: "/product/coding-standard",
    title: "让代码质量，有标准可依",
  },
] as const;

const viewports = [
  { name: "1440", width: 1440, height: 1000 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
] as const;

async function gotoCodingPage(page: Page, href: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(href, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  return response;
}

async function expectPageContent(page: Page, title: string) {
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();

  const sections = page.getByTestId("platform-center-section");
  await expect(sections).toHaveCount(6);
  for (let index = 0; index < 6; index += 1) {
    await expect(sections.nth(index)).toBeVisible();
  }

  const demos = page.getByTestId("platform-page-demo");
  expect(await demos.count()).toBeGreaterThan(0);
  for (let index = 0; index < (await demos.count()); index += 1) {
    await expect(demos.nth(index)).toBeVisible();
  }

  await expect(page.getByTestId("platform-center-business")).toBeVisible();
  await expect(page.getByTestId("platform-center-cta")).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function cardGridColumnCount(page: Page) {
  const grid = page
    .locator(
      "[data-testid='platform-center-section'] .platform-center-card-grid",
    )
    .first();
  await expect(grid).toBeVisible();
  return grid.evaluate(
    (element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean)
        .length,
  );
}

test("四个编程子页返回完整内容并只使用 shell 聊天入口", async ({ page }) => {
  test.setTimeout(120_000);

  for (const { path, title } of pages) {
    const response = await gotoCodingPage(page, path);

    expect(response?.status(), path).toBe(200);
    await expectPageContent(page, title);
    await expect(
      page.locator("main.platform-center .floating-assistant"),
    ).toHaveCount(0);
    await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
  }
});

test("四个编程子页的内部链接和锚点均可达", async ({ page }) => {
  test.setTimeout(120_000);

  for (const { path } of pages) {
    await gotoCodingPage(page, path);
    const links = await page
      .locator("main.platform-center a")
      .evaluateAll((anchors) => [
        ...new Map(
          anchors
            .map((anchor) => new URL((anchor as HTMLAnchorElement).href))
            .filter((url) => url.origin === window.location.origin)
            .map((url) => [
              `${url.pathname}${url.search}${url.hash}`,
              {
                hash: url.hash,
                navigationTarget: `${url.pathname}${url.search}${url.hash}`,
                requestTarget: `${url.pathname}${url.search}`,
              },
            ]),
        ).values(),
      ]);
    const requestTargets = [
      ...new Set(links.map((link) => link.requestTarget)),
    ];

    for (const href of requestTargets) {
      const response = await page.request.get(href);
      expect(response.status(), `${path} → ${href}`).toBeLessThan(400);
    }

    for (const link of links.filter(({ hash }) => hash)) {
      await gotoCodingPage(page, link.navigationTarget);
      const targetExists = await page.evaluate((hash) => {
        const id = decodeURIComponent(hash.slice(1));
        return document.getElementById(id) !== null;
      }, link.hash);
      expect(targetExists, `${path} → ${link.navigationTarget}`).toBe(true);
    }
  }
});

test("四个编程子页在三档宽度保持高密度且内容完整", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(180_000);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const { path, title } of pages) {
      await gotoCodingPage(page, path);
      await expect(page.locator("main.platform-center--dense")).toHaveCount(1);
      await expectPageContent(page, title);
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
      }
    }
  }
});

test("四个编程子页在桌面和移动端都能打开与关闭现有 Agent", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(120_000);

  for (const viewport of [viewports[0], viewports[2]]) {
    await page.setViewportSize(viewport);
    for (const { path } of pages) {
      await gotoCodingPage(page, path);
      await page.getByRole("button", { name: "打开码多多" }).click();
      await expect(page.getByRole("dialog", { name: "码多多" })).toBeVisible();
      await page
        .getByRole("button", { name: "关闭码多多", exact: true })
        .click();
      await expect(page.getByRole("dialog", { name: "码多多" })).toHaveCount(0);
    }
  }
});

test("捕获四个编程子页桌面与移动端全页视觉证据", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(180_000);
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/coding-subpages",
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const viewport of [viewports[0], viewports[2]]) {
    await page.setViewportSize(viewport);
    for (const { name, path } of pages) {
      await gotoCodingPage(page, path);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(outputDirectory, `${name}-${viewport.name}.png`),
      });
    }
  }
});
