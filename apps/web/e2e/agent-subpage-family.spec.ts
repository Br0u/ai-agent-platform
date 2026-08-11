import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const pages = [
  {
    name: "agent-knowledge",
    path: "/product/agent-knowledge",
    sectionCount: 6,
    sectionDemoCount: 3,
    title: "企业知识助手：把企业文档、制度、经验变成随时可问的智能库",
  },
  {
    name: "data-agent",
    path: "/product/data-agent",
    sectionCount: 5,
    sectionDemoCount: 1,
    title: "智能问数助手：不用写 SQL，问一句就能拿到数据答案",
  },
  {
    name: "agent-video",
    path: "/product/agent-video",
    sectionCount: 5,
    sectionDemoCount: 0,
    title: "视频理解与智能视觉助手：让视频从「被观看」变成「可理解」",
  },
  {
    name: "agent-orchestration",
    path: "/product/agent-orchestration",
    sectionCount: 5,
    sectionDemoCount: 0,
    title: "企业复杂任务自动化引擎：把多步骤业务变成一条自动流程",
  },
] as const;

const legacyPages = [
  {
    expectedH1: "华鲲元启智能导办一体机",
    path: "/product/knowledge-agent",
  },
  {
    expectedH1: "华鲲元启视觉检索一体机",
    path: "/product/video-agent",
  },
  {
    expectedH1: "AI Agent PlatformOffice Agent 办公智能体矩阵",
    path: "/product/office-agent",
  },
] as const;

const viewports = [
  { name: "1440", width: 1440, height: 1000 },
  { name: "1024", width: 1024, height: 900 },
  { name: "390", width: 390, height: 844 },
] as const;

async function gotoAgentPage(page: Page, href: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(href, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  return response;
}

async function expectPageContent(
  page: Page,
  title: string,
  sectionCount: number,
) {
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveCount(1);
  await expect(h1).toHaveText(title);
  await expect(h1).toBeVisible();

  const sections = page.getByTestId("platform-center-section");
  await expect(sections).toHaveCount(sectionCount);
  for (let index = 0; index < sectionCount; index += 1) {
    await expect(sections.nth(index)).toBeVisible();
  }

  const demos = page.getByTestId("platform-page-demo");
  expect(await demos.count()).toBeGreaterThan(0);
  for (let index = 0; index < (await demos.count()); index += 1) {
    await expect(demos.nth(index)).toBeVisible();
  }

  await expect(page.getByTestId("platform-center-business")).toBeVisible();
  await expect(page.getByTestId("platform-center-cta")).toHaveCount(0);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function gridColumnCounts(page: Page, selector: string) {
  const grids = page.locator(selector);
  expect(await grids.count(), selector).toBeGreaterThan(0);
  return grids.evaluateAll((elements) =>
    elements.map(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean)
          .length,
    ),
  );
}

test("四个智能体子页返回完整内容并只使用 shell 聊天入口", async ({ page }) => {
  test.setTimeout(120_000);

  for (const { path, sectionCount, title } of pages) {
    const response = await gotoAgentPage(page, path);

    expect(response?.status(), path).toBe(200);
    await expectPageContent(page, title, sectionCount);
    await expect(page.locator("main.platform-center--dense")).toHaveCount(1);
    await expect(
      page.locator("main.platform-center .floating-assistant"),
    ).toHaveCount(0);
    await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
  }
});

test("四个智能体子页的内部链接和锚点均可达", async ({ page }) => {
  test.setTimeout(120_000);
  const visitedHashTargets = new Set<string>();

  for (const { path } of pages) {
    await gotoAgentPage(page, path);
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

    expect(requestTargets.length, `${path} same-origin links`).toBeGreaterThan(
      0,
    );
    for (const href of requestTargets) {
      const response = await page.request.get(href);
      expect(response.status(), `${path} → ${href}`).toBeLessThan(400);
    }

    const hashLinks = links.filter(({ hash }) => hash);
    expect(hashLinks.length, `${path} hash links`).toBeGreaterThan(0);
    for (const link of hashLinks) {
      visitedHashTargets.add(link.navigationTarget);
      const expectedUrl = new URL(link.navigationTarget, page.url()).href;
      await gotoAgentPage(page, link.navigationTarget);
      await expect(page).toHaveURL(expectedUrl);
      const targetExists = await page.evaluate((hash) => {
        document
          .querySelectorAll("[data-e2e-hash-target]")
          .forEach((element) =>
            element.removeAttribute("data-e2e-hash-target"),
          );
        const id = decodeURIComponent(hash.slice(1));
        const target = document.getElementById(id);
        if (!target) return false;
        target.dataset.e2eHashTarget = "true";
        return true;
      }, link.hash);
      expect(targetExists, `${path} → ${link.navigationTarget}`).toBe(true);
      const target = page.locator('[data-e2e-hash-target="true"]');
      await expect(target).toHaveCount(1);
      await expect(target).toBeInViewport();
    }
  }

  expect([...visitedHashTargets]).toEqual(
    expect.arrayContaining(["/solutions#knowledge", "/solutions#vision"]),
  );
});

test("四个智能体子页在三档宽度保持高密度且内容完整", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(180_000);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const { path, sectionCount, sectionDemoCount, title } of pages) {
      await gotoAgentPage(page, path);
      await expect(page.locator("main.platform-center--dense")).toHaveCount(1);
      await expectPageContent(page, title, sectionCount);
      await expectNoHorizontalOverflow(page);

      const cardGridColumnCounts = await gridColumnCounts(
        page,
        ".platform-center-card-grid",
      );
      const demoFrames = page.locator(
        ".platform-center-section--with-demo > .product-portal-frame",
      );
      await expect(demoFrames).toHaveCount(sectionDemoCount);
      const demoFrameColumnCounts =
        sectionDemoCount > 0
          ? await gridColumnCounts(
              page,
              ".platform-center-section--with-demo > .product-portal-frame",
            )
          : [];

      if (viewport.width === 1440) {
        for (const [index, columnCount] of cardGridColumnCounts.entries()) {
          expect(
            columnCount,
            `${path} desktop card grid ${index + 1}`,
          ).toBeGreaterThanOrEqual(2);
        }
        for (const [index, columnCount] of demoFrameColumnCounts.entries()) {
          expect(
            columnCount,
            `${path} desktop demo frame ${index + 1}`,
          ).toBeGreaterThanOrEqual(2);
        }
      }
      if (viewport.width === 390) {
        for (const [index, columnCount] of cardGridColumnCounts.entries()) {
          expect(columnCount, `${path} mobile card grid ${index + 1}`).toBe(1);
        }
        for (const [index, columnCount] of demoFrameColumnCounts.entries()) {
          expect(columnCount, `${path} mobile demo frame ${index + 1}`).toBe(1);
        }
      }
    }
  }
});

test("四个智能体子页在桌面和移动端都能打开与关闭现有 Agent", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(120_000);

  for (const viewport of [viewports[0], viewports[2]]) {
    await page.setViewportSize(viewport);
    for (const { path } of pages) {
      await gotoAgentPage(page, path);
      await expect(
        page.locator("main.platform-center .floating-assistant"),
      ).toHaveCount(0);
      await expect(page.locator(".floating-assistant__launcher")).toHaveCount(
        1,
      );
      await page.getByRole("button", { name: "打开码多多" }).click();
      await expect(page.getByRole("dialog", { name: "码多多" })).toBeVisible();
      await page
        .getByRole("button", { name: "关闭码多多", exact: true })
        .click();
      await expect(page.getByRole("dialog", { name: "码多多" })).toHaveCount(0);
    }
  }
});

test("现有三个智能体一体机页面保留原路径和标题", async ({ page }) => {
  for (const { expectedH1, path } of legacyPages) {
    const response = await gotoAgentPage(page, path);

    expect(response?.status(), path).toBe(200);
    expect(new URL(page.url()).pathname).toBe(path);
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText(expectedH1);
  }
});

test("捕获四个智能体子页三档宽度全页视觉证据", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(180_000);
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/agent-subpages",
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const { name, path, title } of pages) {
      const screenshotPath = resolve(
        outputDirectory,
        `${name}-${viewport.name}.png`,
      );
      await rm(screenshotPath, { force: true });
      const response = await gotoAgentPage(page, path);
      expect(response?.status(), `${path} screenshot`).toBe(200);
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toHaveCount(1);
      await expect(h1).toHaveText(title);
      await expect(h1).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: screenshotPath,
      });
    }
  }
});
