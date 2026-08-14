import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

async function gotoHome(
  page: Page,
  reducedMotion: "reduce" | "no-preference" = "reduce",
) {
  await page.emulateMedia({ reducedMotion });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
}

async function gridColumnCount(page: Page, selector: string) {
  return page
    .locator(selector)
    .evaluate(
      (element) =>
        getComputedStyle(element)
          .gridTemplateColumns.split(/\s+/u)
          .filter(Boolean).length,
    );
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test("matches the four-region V2 homepage contract", async ({ page }) => {
  await gotoHome(page);

  await expect(page.locator("main.home > [data-home-region]")).toHaveCount(4);
  await expect(page.locator('[data-home-region="hero"]')).toHaveCount(1);
  await expect(page.locator('[data-home-region="centers"]')).toHaveCount(1);
  await expect(page.locator('[data-home-region="solutions"]')).toHaveCount(1);
  await expect(page.locator('[data-home-region="contact"]')).toHaveCount(1);
  await expect(page.locator('[data-home-region="agents"]')).toHaveCount(0);
  await expect(page.locator(".home-atmosphere > span")).toHaveCount(3);
  await expect(page.locator(".home-featured-card")).toHaveCount(4);
  await expect(page.locator(".center-feature")).toHaveCount(2);
  await expect(page.locator(".center-row")).toHaveCount(4);
  await expect(page.locator(".home-sol-card")).toHaveCount(6);
  await expect(page.locator("main.home [data-home-icon]")).toHaveCount(20);
  await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
});

test("keeps post-hero content visible before reveal JavaScript runs", async ({
  page,
}) => {
  await page.route(/\.js(?:\?|$)/u, (route) => route.abort());
  await gotoHome(page, "no-preference");

  await expect(page.locator("main.home")).not.toHaveClass(/home-reveal-ready/u);
  const regions = page.locator('[data-home-reveal="true"]');
  await expect(regions).toHaveCount(3);
  for (let index = 0; index < (await regions.count()); index += 1) {
    await expect(regions.nth(index)).toHaveCSS("opacity", "1");
  }
});

test("keeps section backgrounds visible while reveal content enters", async ({
  page,
}) => {
  await gotoHome(page, "no-preference");

  const centers = page.locator('[data-home-region="centers"]');
  await centers.evaluate((section) => {
    section.classList.remove("is-home-visible");
    section.closest("main.home")?.classList.add("home-reveal-ready");
  });

  await expect(centers).toHaveCSS("opacity", "1");
  await expect(centers.locator(":scope > .home-frame")).toHaveCSS(
    "opacity",
    "0",
  );
});

test("keeps the existing premium homepage visual language", async ({
  page,
}) => {
  await gotoHome(page);

  const hero = page.locator(".home-hero");
  const heroBackground = await hero.evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  );
  expect(heroBackground).toContain("linear-gradient");
  expect(heroBackground).toContain("dual-track-ai-v2.webp");
  await expect(page.locator(".home-featured-card").first()).toHaveCSS(
    "border-radius",
    "22px",
  );
  await expect(page.locator(".center-row").first()).toHaveCSS(
    "border-radius",
    "14px",
  );
  const cardSurface = await page
    .locator(".home-featured-card")
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backdropFilter: style.backdropFilter,
        boxShadow: style.boxShadow,
      };
    });
  expect(cardSurface.backdropFilter).not.toBe("none");
  expect(cardSurface.boxShadow).not.toBe("none");

  await expect(page.locator(".site-header")).toHaveCSS("min-height", "64px");
  await expect(page.locator(".site-wordmark")).toHaveCSS(
    "background-image",
    /logo\.png/u,
  );
  await expect(page.locator(".portal-footer__main")).toBeHidden();
  await expect(page.locator(".portal-footer__meta span:visible")).toHaveText(
    "备案信息（占位）",
  );
});

test("preserves the shell-owned chat", async ({ page }) => {
  await gotoHome(page);

  await page.getByRole("button", { name: "打开码多多" }).click();
  await expect(page.getByRole("dialog", { name: "码多多" })).toBeVisible();
  await page.getByRole("button", { name: "关闭码多多", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "码多多" })).toHaveCount(0);
});

test("keeps homepage links keyboard-accessible", async ({ page }) => {
  await gotoHome(page);

  const links = page.locator("main.home a");
  expect(await links.count()).toBeGreaterThan(0);
  for (let index = 0; index < (await links.count()); index += 1) {
    const link = links.nth(index);
    await link.focus();
    await expect(link).toBeFocused();
    await expect
      .poll(() =>
        link.evaluate((element) => getComputedStyle(element).outlineStyle),
      )
      .not.toBe("none");
  }
});

test("keeps every homepage internal link free of HTTP errors", async ({
  page,
}) => {
  await gotoHome(page);
  const hrefs = await page.locator("main.home a").evaluateAll((links) => [
    ...new Set(
      links
        .map((link) => new URL((link as HTMLAnchorElement).href))
        .filter((url) => url.origin === window.location.origin)
        .map((url) => `${url.pathname}${url.search}`),
    ),
  ]);

  for (const href of hrefs) {
    const response = await page.request.get(href);
    expect(response.status(), href).toBeLessThan(400);
  }
});

test("keeps the V2 desktop composition", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoHome(page);
  await expectNoHorizontalOverflow(page);

  expect(await gridColumnCount(page, ".home-featured")).toBe(4);
  expect(await gridColumnCount(page, ".centers-layout")).toBe(2);
  expect(await gridColumnCount(page, ".home-sol")).toBe(3);
  expect(await gridColumnCount(page, ".home-contact__layout")).toBe(2);

  const contactCard = await page.locator(".home-contact-card").boundingBox();
  const contactCopy = await page.locator(".home-contact__copy").boundingBox();
  expect(contactCard).not.toBeNull();
  expect(contactCopy).not.toBeNull();
  expect(contactCard!.x).toBeLessThan(contactCopy!.x);
});

test("adapts the V2 composition without clipping", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");

  for (const viewport of [
    { featured: 2, centers: 2, solutions: 2, contact: 2, width: 1024 },
    { featured: 1, centers: 1, solutions: 2, contact: 1, width: 768 },
    { featured: 1, centers: 1, solutions: 1, contact: 1, width: 390 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: 900 });
    await gotoHome(page);
    await expectNoHorizontalOverflow(page);
    expect(await gridColumnCount(page, ".home-featured")).toBe(
      viewport.featured,
    );
    expect(await gridColumnCount(page, ".centers-layout")).toBe(
      viewport.centers,
    );
    expect(await gridColumnCount(page, ".home-sol")).toBe(viewport.solutions);
    expect(await gridColumnCount(page, ".home-contact__layout")).toBe(
      viewport.contact,
    );
  }
});

test("loads without browser diagnostics", async ({ page }) => {
  const diagnostics: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.push(error.message));

  await gotoHome(page);
  await page.waitForTimeout(200);
  expect(diagnostics).toEqual([]);
});

test("captures responsive V2 evidence", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(60_000);
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/home-reference",
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const viewport of [
    { name: "home-1440", width: 1440, height: 1000 },
    { name: "home-1024", width: 1024, height: 1000 },
    { name: "home-768", width: 768, height: 1024 },
    { name: "home-390", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await gotoHome(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: resolve(outputDirectory, `${viewport.name}.png`),
    });
  }
});
