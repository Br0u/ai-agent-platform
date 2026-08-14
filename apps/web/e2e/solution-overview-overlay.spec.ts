import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const solutionSlugs = [
  "finance-compliance",
  "finance-aml",
  "finance-operations",
  "finance-knowledge",
  "finance-assistant",
  "finance-qa",
  "railway-parse",
  "railway-rag",
  "railway-video",
  "railway-exam",
  "electric-ticket",
  "electric-data",
  "electric-fault",
  "electric-video",
  "semi-ai-scientist",
  "ps-ghost-rider",
  "ps-minor",
  "ps-mental",
  "ps-nitrous",
  "ps-violence",
  "ps-trace",
  "em-forest-fire",
  "em-collapse",
  "em-image-hazard",
  "em-dike",
  "em-public-risk",
  "em-dust-fire",
  "enterprise-data",
  "government-process",
] as const;

async function gotoSolutions(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/solutions", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/solutions\/finance-compliance$/u);
}

test("V3 默认进入首个方案并渲染严格详情结构", async ({ page }) => {
  await gotoSolutions(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "贷款合规智能审查" }),
  ).toBeVisible();
  await expect(
    page.locator(".solution-detail-page").getByRole("heading", { level: 2 }),
  ).toHaveText([
    "业务场景与问题",
    "落地效果与价值",
    "解决方案落地",
    "需要落地行业 AI 解决方案？",
  ]);
  await expect(
    page.locator(".solution-detail-capabilities article"),
  ).toHaveCount(4);
  await expect(page.getByText("解决方案建设方法")).toHaveCount(0);
  await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);

  const images = page.locator(".solution-detail-page img");
  await expect(images).toHaveCount(3);
  for (let index = 0; index < (await images.count()); index += 1) {
    await images.nth(index).scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        images.nth(index).evaluate((image) => {
          const element = image as HTMLImageElement;
          return element.complete && element.naturalWidth > 0;
        }),
      )
      .toBe(true);
  }
});

test("解决方案目录页沿用产品页导航、侧栏与备案页脚", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.goto("/product", { waitUntil: "networkidle" });

  const productDirectoryStyles = await page
    .locator(".product-directory")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        width: style.width,
        backgroundImage: style.backgroundImage,
        borderRightColor: style.borderRightColor,
        boxShadow: style.boxShadow,
        backdropFilter: style.backdropFilter,
      };
    });

  await gotoSolutions(page);
  await expect(page.locator(".site-header")).toHaveCSS("min-height", "64px");
  await expect(page.locator(".site-wordmark")).toHaveCSS(
    "background-image",
    /logo\.png/u,
  );
  await expect(page.locator(".site-brand-name")).toBeHidden();
  await expect(page.locator(".portal-footer__main")).toBeHidden();
  await expect(page.locator(".portal-footer__meta span:visible")).toHaveText(
    "备案信息（占位）",
  );

  const solutionDirectoryStyles = await page
    .locator(".solution-directory")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        width: style.width,
        backgroundImage: style.backgroundImage,
        borderRightColor: style.borderRightColor,
        boxShadow: style.boxShadow,
        backdropFilter: style.backdropFilter,
      };
    });
  expect(solutionDirectoryStyles).toEqual(productDirectoryStyles);
});

test("Solutions 视觉层使用数据场、烟雾玻璃与克制交互", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/solutions/finance-compliance", {
    waitUntil: "networkidle",
  });

  const detail = page.locator(".solution-detail-page");
  const hero = page.locator(".solution-detail-hero");
  const backgrounds = await detail.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      image: style.backgroundImage,
      repeat: style.backgroundRepeat,
    };
  });
  expect(backgrounds.image).toMatch(/solutions-hero-data-field-v1\.png/u);
  expect(backgrounds.image).toMatch(/solutions-section-smoke-v1\.png/u);
  expect(backgrounds.repeat).not.toContain("repeat-y");
  await expect(hero).toHaveCSS("background-image", "none");
  await expect(page.locator(".solution-detail-section").first()).toHaveCSS(
    "border-top-width",
    "0px",
  );

  const screenshot = page.locator(".solution-detail-image").first();
  await expect(screenshot).toHaveCSS("backdrop-filter", /blur/u);
  await expect(screenshot).not.toHaveCSS("box-shadow", "none");
  await expect(screenshot).toHaveCSS("outline-style", "solid");

  const artifactDirectory = resolve("artifacts/playwright/solutions-v2");
  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({
    path: resolve(artifactDirectory, "finance-compliance-desktop.png"),
    fullPage: true,
  });

  const capability = page
    .locator(".solution-detail-capabilities article")
    .first();
  await expect(capability).toHaveCSS("transform", "none");
  await capability.hover();
  await expect(capability).not.toHaveCSS("transform", "none");

  const primary = page.locator(".solution-detail-button--primary").first();
  await primary.scrollIntoViewIfNeeded();
  const box = await primary.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect(primary).not.toHaveCSS("transform", "none");
  await page.mouse.up();
});

test("桌面目录严格使用 V2 八行业并支持搜索折叠", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await gotoSolutions(page);
  await page.getByRole("button", { name: "展开解决方案目录" }).click();
  const directory = page.getByRole("navigation", { name: "解决方案完整目录" });
  await expect(directory.locator(":scope > ul > li > div > a")).toHaveText([
    "金融行业解决方案",
    "铁路行业解决方案",
    "电力行业解决方案",
    "半导体行业解决方案",
    "公安行业解决方案",
    "应急行业解决方案",
    "企业通用解决方案",
    "政务行业解决方案",
  ]);
  const search = page.getByRole("searchbox", {
    name: "在解决方案目录中筛选",
  });
  await search.fill("森林火灾");
  await expect(page.getByRole("link", { name: "森林火灾预警" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "贷款合规智能审查" }),
  ).toHaveCount(0);
  await search.fill("");
  await page
    .getByRole("button", { name: "展开或收起金融行业解决方案" })
    .click();
  await expect(
    page.getByRole("link", { name: "贷款合规智能审查" }),
  ).toHaveCount(0);
});

test("解决方案目录在桌面显示静默进度并在移动断点改用抽屉", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 980 },
    { width: 901, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await gotoSolutions(page);
    await expect(page.locator(".solution-directory")).toHaveCSS(
      "width",
      "52px",
    );
    await expect(page.getByTestId("directory-progress-rail")).toBeVisible();
    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  }

  await page.setViewportSize({ width: 1440, height: 980 });
  await gotoSolutions(page);

  const directory = page.locator(".solution-directory");
  const rail = page.getByTestId("directory-progress-rail");
  const dot = page.getByTestId("directory-progress-dot");
  await expect(directory).toHaveCSS("width", "52px");
  await expect(rail).toBeVisible();
  const top = await dot.getAttribute("style");
  const stableRoute = page.url();

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(async () => dot.getAttribute("style")).not.toBe(top);
  await expect(
    page.getByRole("link", { name: "贷款合规智能审查" }),
  ).toHaveCount(0);
  expect(page.url()).toBe(stableRoute);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(dot).toHaveCSS("transition-duration", "0s");

  await page.getByRole("button", { name: "展开解决方案目录" }).click();
  await expect(
    page.getByRole("link", { name: "贷款合规智能审查" }),
  ).toHaveAttribute("aria-current", "page");

  for (const width of [900, 800]) {
    await page.setViewportSize({ width, height: 844 });
    await gotoSolutions(page);
    await expect(page.getByTestId("directory-progress-rail")).not.toBeVisible();
    await expect(directory).not.toHaveCSS("width", "52px");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoSolutions(page);
  await page.getByRole("button", { name: "解决方案目录" }).click();
  const drawer = page.getByRole("dialog", { name: "解决方案目录" });
  await expect(drawer).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "解决方案目录" }),
  ).toBeFocused();
});

test("29 个 V2 方案路由均可访问", async ({ page }) => {
  for (const slug of solutionSlugs) {
    const response = await page.request.get(`/solutions/${slug}`);
    expect(response.status(), slug).toBeLessThan(400);
  }
});

test("移动目录保持模态交互并输出验收截图", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoSolutions(page);
  const trigger = page.getByRole("button", { name: "解决方案目录" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "解决方案目录" });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".solution-content")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  const artifactDirectory = resolve("artifacts/playwright/solutions-v2");
  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({
    path: resolve(artifactDirectory, "finance-compliance-mobile.png"),
    fullPage: true,
  });
});
