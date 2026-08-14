import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const pages = [
  {
    name: "app-writing",
    path: "/product/app-writing",
    sectionCount: 5,
    groupCount: 0,
    title: "通用文本写作：一句话起稿，AI 帮你写完全文",
    anchors: ["writing-caps", "writing-flow", "writing-trace"],
  },
  {
    name: "app-bidding",
    path: "/product/app-bidding",
    sectionCount: 4,
    groupCount: 1,
    title: "投标智能助手：把投标从「加班赶」变成「有条理」",
    anchors: ["bidding-workflow", "bidding-caps", "bidding-trace"],
  },
  {
    name: "app-contract",
    path: "/product/app-contract",
    sectionCount: 4,
    groupCount: 1,
    title: "合同智能审查：条款逐条核对，风险早发现",
    anchors: ["contract-workflow", "contract-caps", "contract-trace"],
  },
] as const;

const viewports = [
  { name: "1440", width: 1440, height: 1000 },
  { name: "1024", width: 1024, height: 900 },
  { name: "390", width: 390, height: 844 },
] as const;

async function gotoApplicationPage(page: Page, href: string) {
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
  const h1 = page.getByRole("heading", {
    exact: true,
    level: 1,
    name: title,
  });
  await expect(h1).toBeVisible();
  await expect(page.locator("main h1")).toHaveCount(1);

  const sections = page.getByTestId("platform-center-section");
  await expect(sections).toHaveCount(sectionCount);
  for (let index = 0; index < sectionCount; index += 1) {
    await expect(sections.nth(index)).toBeVisible();
  }

  const visuals = page.locator("main.platform-center .product-portal-visual");
  expect(await visuals.count()).toBeGreaterThan(0);
  for (let index = 0; index < (await visuals.count()); index += 1) {
    await expect(visuals.nth(index)).toBeVisible();
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

async function gridColumnCounts(page: Page, selector: string) {
  const grids = page.locator(selector);
  const count = await grids.count();
  expect(count, selector).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await expect(grids.nth(index)).toBeVisible();
  }
  return grids.evaluateAll((elements) =>
    elements.map(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean)
          .length,
    ),
  );
}

test("三个行业应用子页返回完整内容并只使用 shell 聊天入口", async ({
  page,
}) => {
  test.setTimeout(120_000);

  for (const { path, sectionCount, title } of pages) {
    const response = await gotoApplicationPage(page, path);

    expect(response?.status(), path).toBe(200);
    await expectPageContent(page, title, sectionCount);
    await expect(page.locator("main.platform-center--dense")).toHaveCount(1);
    await expect(
      page.locator("main.platform-center .floating-assistant"),
    ).toHaveCount(0);
    await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
  }
});

test("三个行业应用子页的内部链接和锚点均可达", async ({ page }) => {
  test.setTimeout(120_000);

  for (const { anchors, path } of pages) {
    await gotoApplicationPage(page, path);
    const links = await page
      .locator("main.platform-center a")
      .evaluateAll((elements) => [
        ...new Map(
          elements
            .map((element) => new URL((element as HTMLAnchorElement).href))
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

    const navigationTargets = new Set(
      links.map((link) => link.navigationTarget),
    );
    for (const anchor of anchors) {
      expect(navigationTargets.has(`${path}#${anchor}`)).toBe(true);
    }
    expect(navigationTargets.has("/solutions/finance-compliance")).toBe(true);

    const requestTargets = [
      ...new Set(links.map((link) => link.requestTarget)),
    ];
    for (const href of requestTargets) {
      const response = await page.request.get(href);
      expect(response.status(), `${path} → ${href}`).toBeLessThan(400);
    }

    for (const link of links.filter(({ hash }) => hash)) {
      const expectedUrl = new URL(link.navigationTarget, page.url()).href;
      await gotoApplicationPage(page, link.navigationTarget);
      await expect(page).toHaveURL(expectedUrl);
      const targetExists = await page.evaluate((hash) => {
        document
          .querySelectorAll("[data-e2e-hash-target]")
          .forEach((element) =>
            element.removeAttribute("data-e2e-hash-target"),
          );
        const target = document.getElementById(
          decodeURIComponent(hash.slice(1)),
        );
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
});

test("三个行业应用子页在三档宽度保持高密度且内容完整", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(180_000);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const { groupCount, path, sectionCount, title } of pages) {
      await gotoApplicationPage(page, path);
      await expectPageContent(page, title, sectionCount);
      await expectNoHorizontalOverflow(page);
      await expect(page.locator("main.platform-center--dense")).toHaveCount(1);
      await expect(
        page.locator(".platform-center-section--with-demo"),
      ).toHaveCount(0);

      const groups = page.locator(".platform-center-groups");
      await expect(groups).toHaveCount(groupCount);
      if (groupCount > 0) {
        await expect(groups.locator(":scope > article")).toHaveCount(
          groupCount,
        );
        for (let index = 0; index < groupCount; index += 1) {
          await expect(groups.nth(index)).toBeVisible();
        }
      }

      const cardColumns = await gridColumnCounts(
        page,
        ".platform-center-card-grid",
      );
      const businessColumns = await gridColumnCounts(
        page,
        ".product-portal-business",
      );
      expect(businessColumns).toHaveLength(1);

      if (viewport.width === 1440) {
        for (const [index, columnCount] of cardColumns.entries()) {
          expect(
            columnCount,
            `${path} card grid ${index + 1}`,
          ).toBeGreaterThanOrEqual(2);
        }
        expect(businessColumns[0], `${path} business`).toBe(2);
      }
      if (viewport.width === 390) {
        for (const [index, columnCount] of cardColumns.entries()) {
          expect(columnCount, `${path} card grid ${index + 1}`).toBe(1);
        }
        expect(businessColumns[0], `${path} business`).toBe(1);
      }
    }
  }
});

test("三个行业应用子页在桌面和移动端都能打开与关闭现有 Agent", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(120_000);

  for (const viewport of [viewports[0], viewports[2]]) {
    await page.setViewportSize(viewport);
    for (const { path } of pages) {
      await gotoApplicationPage(page, path);
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

test("捕获三个行业应用子页三档宽度全页视觉证据", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(180_000);
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/application-subpages",
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
      const response = await gotoApplicationPage(page, path);
      expect(response?.status(), `${path} screenshot`).toBe(200);
      await expect(
        page.getByRole("heading", { exact: true, level: 1, name: title }),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: screenshotPath,
      });
    }
  }
});
