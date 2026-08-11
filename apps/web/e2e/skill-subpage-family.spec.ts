import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const pages = [
  {
    name: "skills-programming",
    path: "/product/skills-programming",
    title: "编程类技能：让研发与工程更省心",
    sectionIds: [
      "skills-programming-position",
      "skills-programming-caps",
      "sk-eval",
      "sk-dify",
      "sk-aiknow",
    ],
    demoCount: 4,
    detailDemoCount: 3,
    targets: [
      "/product/model-assets",
      "/product/agent-orchestration",
      "/product/skills",
    ],
  },
  {
    name: "skills-application",
    path: "/product/skills-application",
    title: "应用类技能：让业务应用更可靠",
    sectionIds: [
      "skills-application-position",
      "skills-application-caps",
      "sk-video",
      "sk-agentguard",
    ],
    demoCount: 3,
    detailDemoCount: 2,
    targets: ["/product/agent-video", "/product/governance", "/product/skills"],
  },
  {
    name: "skills-office",
    path: "/product/skills-office",
    title: "办公类技能：让日常工作更高效",
    sectionIds: [
      "skills-office-position",
      "skills-office-caps",
      "sk-meeting",
      "sk-hello",
    ],
    demoCount: 3,
    detailDemoCount: 2,
    targets: ["/product/app-writing", "/product/skills"],
  },
] as const;

const viewports = [
  { name: "1440", width: 1440, height: 1000 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
] as const;

async function gotoSkillPage(page: Page, href: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(href, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  return response;
}

async function expectPageContent(page: Page, config: (typeof pages)[number]) {
  const h1 = page.getByRole("heading", {
    exact: true,
    level: 1,
    name: config.title,
  });
  await expect(h1).toBeVisible();
  await expect(page.locator("main h1")).toHaveCount(1);

  const sections = page.getByTestId("platform-center-section");
  await expect(sections).toHaveCount(config.sectionIds.length);
  for (const id of config.sectionIds) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }

  const visuals = page.locator("main.platform-center .product-portal-visual");
  expect(await visuals.count()).toBeGreaterThan(0);
  for (let index = 0; index < (await visuals.count()); index += 1) {
    await expect(visuals.nth(index)).toBeVisible();
  }

  const demos = page.getByTestId("platform-page-demo");
  await expect(demos).toHaveCount(config.demoCount);
  for (let index = 0; index < config.demoCount; index += 1) {
    await expect(demos.nth(index)).toBeVisible();
  }

  const business = page.getByTestId("platform-center-business");
  await expect(business).toBeVisible();
  const businessDemo = business.getByTestId("platform-page-demo");
  await expect(businessDemo).toHaveCount(1);
  await expect(businessDemo).toBeVisible();
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

test("三个技能子页返回完整内容并只使用 shell 聊天入口", async ({ page }) => {
  test.setTimeout(120_000);

  for (const config of pages) {
    const response = await gotoSkillPage(page, config.path);

    expect(response?.status(), config.path).toBe(200);
    await expectPageContent(page, config);
    await expect(page.locator("main.platform-center--dense")).toHaveCount(1);
    await expect(
      page.locator("main.platform-center .floating-assistant"),
    ).toHaveCount(0);
    await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
  }
});

test("三个技能子页的正式内部链接均可达且不伪造 hash 动作", async ({ page }) => {
  test.setTimeout(120_000);

  for (const config of pages) {
    await gotoSkillPage(page, config.path);
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

    expect(links.length, `${config.path} same-origin links`).toBeGreaterThan(0);
    expect(links.every(({ hash }) => hash === "")).toBe(true);
    const navigationTargets = new Set(
      links.map((link) => link.navigationTarget),
    );
    for (const target of config.targets) {
      expect(navigationTargets.has(target), `${config.path} → ${target}`).toBe(
        true,
      );
    }

    const requestTargets = [
      ...new Set(links.map((link) => link.requestTarget)),
    ];
    for (const href of requestTargets) {
      const response = await page.request.get(href);
      expect(response.status(), `${config.path} → ${href}`).toBeLessThan(400);
    }
  }
});

test("三个技能子页在三档宽度保持高密度且内容完整", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(180_000);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const config of pages) {
      await gotoSkillPage(page, config.path);
      await expectPageContent(page, config);
      await expectNoHorizontalOverflow(page);
      await expect(page.locator("main.platform-center--dense")).toHaveCount(1);
      await expect(page.locator(".platform-center-groups")).toHaveCount(0);

      const cardColumns = await gridColumnCounts(
        page,
        ".platform-center-card-grid",
      );
      const detailFrames = page.locator(
        ".platform-center-section--with-demo > .product-portal-frame",
      );
      await expect(detailFrames).toHaveCount(config.detailDemoCount);
      const detailColumns = await gridColumnCounts(
        page,
        ".platform-center-section--with-demo > .product-portal-frame",
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
            `${config.path} card grid ${index + 1}`,
          ).toBeGreaterThanOrEqual(2);
        }
        for (const [index, columnCount] of detailColumns.entries()) {
          expect(columnCount, `${config.path} detail frame ${index + 1}`).toBe(
            2,
          );
        }
        expect(businessColumns[0], `${config.path} business`).toBe(2);
      }
      if (viewport.width === 390) {
        for (const [index, columnCount] of cardColumns.entries()) {
          expect(columnCount, `${config.path} card grid ${index + 1}`).toBe(1);
        }
        for (const [index, columnCount] of detailColumns.entries()) {
          expect(columnCount, `${config.path} detail frame ${index + 1}`).toBe(
            1,
          );
        }
        expect(businessColumns[0], `${config.path} business`).toBe(1);
      }
    }
  }
});

test("三个技能子页在桌面和移动端都能打开与关闭现有 Agent", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(120_000);

  for (const viewport of [viewports[0], viewports[2]]) {
    await page.setViewportSize(viewport);
    for (const { path } of pages) {
      await gotoSkillPage(page, path);
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

test("捕获三个技能子页桌面与移动端全页视觉证据", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(180_000);
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/skill-subpages",
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const viewport of [viewports[0], viewports[2]]) {
    await page.setViewportSize(viewport);
    for (const config of pages) {
      const screenshotPath = resolve(
        outputDirectory,
        `${config.name}-${viewport.name}.png`,
      );
      await rm(screenshotPath, { force: true });
      const response = await gotoSkillPage(page, config.path);
      expect(response?.status(), `${config.path} screenshot`).toBe(200);
      await expect(
        page.getByRole("heading", {
          exact: true,
          level: 1,
          name: config.title,
        }),
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
