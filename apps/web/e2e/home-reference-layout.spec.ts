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

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
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

async function expectCardsToFit(page: Page, selector: string, count: number) {
  const cards = page.locator(selector);
  await expect(cards).toHaveCount(count);

  const sizes = await cards.evaluateAll((elements) =>
    elements.map((element) => ({
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
    })),
  );

  for (const size of sizes) {
    expect(size.scrollHeight).toBeLessThanOrEqual(size.clientHeight + 1);
    expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth + 1);
  }
}

test("keeps the prototype content contract and the shell-owned chat entry", async ({
  page,
}) => {
  await gotoHome(page);

  await expect(page.locator('[data-home-region="hero"]')).toHaveCount(1);
  await expect(page.locator('[data-home-region="agents"]')).toHaveCount(1);
  await expect(page.locator('[data-home-region="solutions"]')).toHaveCount(1);
  await expect(page.locator('[data-home-region="contact"]')).toHaveCount(1);
  await expect(page.locator(".home-featured-card")).toHaveCount(2);
  await expect(page.locator(".home-agent-card")).toHaveCount(5);
  await expect(page.locator(".home-solution-card")).toHaveCount(6);
  await expect(page.locator("main.home .floating-assistant")).toHaveCount(0);
  await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
});

test("preserves the shell chat open, close, and workspace navigation", async ({
  page,
}) => {
  await gotoHome(page);

  await page.getByRole("button", { name: "打开码多多" }).click();
  await expect(page.getByRole("dialog", { name: "码多多" })).toBeVisible();
  await page.getByRole("button", { name: "关闭码多多", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "码多多" })).toHaveCount(0);

  await page.getByRole("button", { name: "打开码多多" }).click();
  await page.getByRole("button", { name: "展开码多多工作区" }).click();
  await expect(page).toHaveURL(/\/assistant$/u);
});

test("keeps homepage links keyboard-accessible with usable targets", async ({
  page,
}) => {
  await gotoHome(page);

  const controls = page.locator("main.home a, main.home button");
  expect(await controls.count()).toBeGreaterThan(0);
  const metadata = await controls.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        name:
          element.getAttribute("aria-label")?.trim() ||
          element.textContent?.trim() ||
          "",
        tabIndex: (element as HTMLElement).tabIndex,
        width: rect.width,
      };
    }),
  );

  for (const item of metadata) {
    expect(item.height).toBeGreaterThanOrEqual(44);
    expect(item.width).toBeGreaterThanOrEqual(44);
    expect(item.name).not.toBe("");
    expect(item.tabIndex).toBeGreaterThanOrEqual(0);
  }

  for (let index = 0; index < (await controls.count()); index += 1) {
    const control = controls.nth(index);
    await control.focus();
    await expect(control).toBeFocused();
    await expect
      .poll(() =>
        control.evaluate(
          (element) => getComputedStyle(element).outlineStyle !== "none",
        ),
      )
      .toBe(true);
  }
});

test("uses the approved desktop composition", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoHome(page);
  await expectNoHorizontalOverflow(page);

  const copy = await page.locator(".home-hero__copy").boundingBox();
  const visual = await page.locator(".home-hero__visual").boundingBox();
  const contactCopy = await page.locator(".home-contact__copy").boundingBox();
  const contactCard = await page.locator(".home-contact-card").boundingBox();

  expect(copy).not.toBeNull();
  expect(visual).not.toBeNull();
  expect(contactCopy).not.toBeNull();
  expect(contactCard).not.toBeNull();
  expect(copy!.x).toBeLessThan(visual!.x);
  expect(contactCopy!.x).toBeLessThan(contactCard!.x);
  expect(await gridColumnCount(page, ".home-featured")).toBe(2);
  expect(await gridColumnCount(page, ".home-agent-grid")).toBe(5);
  expect(await gridColumnCount(page, ".home-solution-grid")).toBe(3);

  await expectCardsToFit(page, ".home-featured-card", 2);
  await expectCardsToFit(page, ".home-agent-card", 5);
  await expectCardsToFit(page, ".home-solution-card", 6);
});

test("adapts at tablet and mobile widths without clipping", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");

  for (const viewport of [
    { agentColumns: 2, solutionColumns: 2, width: 768, height: 1024 },
    { agentColumns: 1, solutionColumns: 1, width: 390, height: 844 },
  ]) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await gotoHome(page);
    await expectNoHorizontalOverflow(page);

    const copy = await page.locator(".home-hero__copy").boundingBox();
    const visual = await page.locator(".home-hero__visual").boundingBox();
    const contactCopy = await page.locator(".home-contact__copy").boundingBox();
    const contactCard = await page.locator(".home-contact-card").boundingBox();

    expect(visual!.y).toBeGreaterThan(copy!.y + copy!.height);
    expect(contactCard!.y).toBeGreaterThan(
      contactCopy!.y + contactCopy!.height,
    );
    expect(await gridColumnCount(page, ".home-agent-grid")).toBe(
      viewport.agentColumns,
    );
    expect(await gridColumnCount(page, ".home-solution-grid")).toBe(
      viewport.solutionColumns,
    );

    await expectCardsToFit(page, ".home-featured-card", 2);
    await expectCardsToFit(page, ".home-agent-card", 5);
    await expectCardsToFit(page, ".home-solution-card", 6);
  }
});

test("reveals only post-hero regions with the existing observer", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHome(page, "no-preference");

  const regions = page.locator('[data-home-reveal="true"]');
  await expect(regions).toHaveCount(3);

  for (let index = 0; index < (await regions.count()); index += 1) {
    const region = regions.nth(index);
    await region.scrollIntoViewIfNeeded();
    await expect(region).toHaveClass(/is-home-visible/u);
    await expect
      .poll(() =>
        region.evaluate((element) => getComputedStyle(element).animationName),
      )
      .toContain("home-section-reveal");
  }

  await expect(page.locator('[data-home-region="hero"]')).not.toHaveAttribute(
    "data-home-reveal",
  );
});

test("removes decorative and reveal motion when requested", async ({
  page,
}) => {
  await gotoHome(page, "reduce");

  const styles = await page
    .locator(
      ".home-atmosphere span, [data-home-reveal], [data-home-reveal-item]",
    )
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          animationName: style.animationName,
          opacity: style.opacity,
          transform: style.transform,
          transitionDuration: style.transitionDuration,
        };
      }),
    );

  for (const style of styles) {
    expect(style.animationName).toBe("none");
    expect(style.opacity).toBe("1");
    expect(style.transform).toBe("none");
    expect(style.transitionDuration.split(", ")).toEqual(
      expect.arrayContaining(["0s"]),
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

test("captures responsive visual evidence", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(60_000);
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/home-reference",
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const viewport of [
    { name: "home-1440", width: 1440, height: 1000 },
    { name: "home-768", width: 768, height: 1024 },
    { name: "home-390", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await gotoHome(page, "reduce");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: resolve(outputDirectory, `${viewport.name}.png`),
    });
  }
});
