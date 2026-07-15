import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function gotoHome(
  page: Page,
  reducedMotion: "reduce" | "no-preference" = "reduce",
) {
  await page.emulateMedia({ reducedMotion });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
}

async function loadHomeImages(page: Page) {
  const images = page.locator("main.home img");
  for (let index = 0; index < (await images.count()); index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate((element) => (element as HTMLImageElement).complete),
      )
      .toBe(true);
    await expect
      .poll(() =>
        image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

function collectDiagnostics(page: Page) {
  const diagnostics: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error")
      diagnostics.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) =>
    diagnostics.push(`pageerror: ${error.message}`),
  );
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText ?? "unknown";
    if (error === "net::ERR_ABORTED" && request.url().includes("_rsc")) return;
    if (request.resourceType() === "image") {
      diagnostics.push(`image request failed: ${request.url()} (${error})`);
    }
  });
  page.on("response", (response) => {
    if (
      response.request().resourceType() === "image" &&
      response.status() >= 400
    ) {
      diagnostics.push(
        `image response ${response.status()}: ${response.url()}`,
      );
    }
  });
  return diagnostics;
}

function luminance(hex: string) {
  const channels = hex
    .match(/[0-9a-f]{2}/gi)
    ?.map((value) => parseInt(value, 16) / 255);
  if (!channels || channels.length !== 3)
    throw new Error(`Invalid color: ${hex}`);
  const [red, green, blue] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

test("keeps all homepage controls accessible and prevents overflow", async ({
  page,
}) => {
  await gotoHome(page);
  await expectNoHorizontalOverflow(page);
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
    const focus = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    expect(focus.outlineStyle).not.toBe("none");
    expect(parseFloat(focus.outlineWidth)).toBeGreaterThan(0);
  }
});

test("matches the approved desktop composition", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoHome(page);

  const hero = await page.locator(".home-hero__grid").boundingBox();
  const copy = await page.locator(".home-hero__copy").boundingBox();
  const evidence = await page.locator(".home-evidence").boundingBox();
  expect(hero).not.toBeNull();
  expect(copy).not.toBeNull();
  expect(evidence).not.toBeNull();
  expect(copy!.x).toBeLessThan(evidence!.x);
  expect(evidence!.width).toBeGreaterThan(copy!.width);
  expect(copy!.width / hero!.width).toBeGreaterThan(0.34);
  expect(copy!.width / hero!.width).toBeLessThan(0.48);

  const capabilityTops = await page
    .locator(".home-capability-card")
    .evaluateAll((cards) =>
      cards.map((card) => Math.round(card.getBoundingClientRect().top)),
    );
  expect(new Set(capabilityTops).size).toBe(1);

  for (const selector of [
    ".home-platform__grid",
    ".home-solutions__grid",
    ".home-resources__grid",
  ]) {
    const columns = await page
      .locator(selector)
      .evaluate(
        (element) =>
          getComputedStyle(element)
            .gridTemplateColumns.split(/\s+/)
            .filter(Boolean).length,
      );
    expect(columns).toBe(2);
  }

  for (const selector of [
    ".home-platform-row",
    ".home-enterprise-row",
    ".home-solution-row",
    ".home-resource",
  ]) {
    const radius = await page
      .locator(selector)
      .first()
      .evaluate((element) =>
        parseFloat(getComputedStyle(element).borderTopLeftRadius),
      );
    expect(radius).toBeGreaterThanOrEqual(18);
    expect(radius).toBeLessThanOrEqual(26);
  }
});

test("stacks reference regions without clipping on mobile", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHome(page);

  await expectNoHorizontalOverflow(page);
  const heroCopy = await page.locator(".home-hero__copy").boundingBox();
  const evidence = await page.locator(".home-evidence").boundingBox();
  expect(heroCopy).not.toBeNull();
  expect(evidence).not.toBeNull();
  expect(evidence!.y).toBeGreaterThan(heroCopy!.y + heroCopy!.height);

  const capabilityColumns = await page
    .locator(".home-capability-rail")
    .evaluate(
      (element) =>
        getComputedStyle(element)
          .gridTemplateColumns.split(/\s+/)
          .filter(Boolean).length,
    );
  expect(capabilityColumns).toBe(2);

  for (const selector of [
    ".home-platform__grid",
    ".home-solutions__grid",
    ".home-resources__grid",
  ]) {
    const columns = await page
      .locator(selector)
      .evaluate(
        (element) =>
          getComputedStyle(element)
            .gridTemplateColumns.split(/\s+/)
            .filter(Boolean).length,
      );
    expect(columns).toBe(1);
  }
});

test("removes decorative motion when reduced motion is requested", async ({
  page,
}) => {
  await gotoHome(page, "reduce");
  const motion = await page
    .locator(".home-atmosphere span, main.home [data-home-region]")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          animationName: style.animationName,
          transform: style.transform,
          transitionDuration: style.transitionDuration,
        };
      }),
    );
  for (const item of motion) {
    expect(item.animationName).toBe("none");
    expect(item.transform).toBe("none");
  }

  const resource = page.locator(".home-resource").first();
  await resource.hover();
  const interactiveMotion = await resource.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transform: style.transform,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(interactiveMotion.transform).toBe("none");
  expect(
    interactiveMotion.transitionDuration
      .split(", ")
      .every((value) => value === "0s"),
  ).toBe(true);
});

test("uses AA-safe homepage text tokens", async ({ page }) => {
  await gotoHome(page);
  const tokens = await page.locator("main.home").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      blueText: style.getPropertyValue("--home-blue-text").trim(),
      canvas: style.getPropertyValue("--home-canvas").trim(),
      ink: style.getPropertyValue("--home-ink").trim(),
      muted: style.getPropertyValue("--home-muted").trim(),
      violet: style.getPropertyValue("--home-violet").trim(),
    };
  });
  expect(contrastRatio(tokens.blueText, tokens.canvas)).toBeGreaterThanOrEqual(
    4.5,
  );
  expect(contrastRatio(tokens.ink, tokens.canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(tokens.muted, tokens.canvas)).toBeGreaterThanOrEqual(
    4.5,
  );
  expect(contrastRatio(tokens.violet, tokens.canvas)).toBeGreaterThanOrEqual(
    4.5,
  );
});

test("loads without console, React, or image diagnostics", async ({ page }) => {
  const diagnostics = collectDiagnostics(page);
  await gotoHome(page);
  await loadHomeImages(page);
  await page.waitForTimeout(250);
  expect(diagnostics).toEqual([]);
});

test("captures named visual evidence", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/home-reference",
  );
  await mkdir(outputDirectory, { recursive: true });
  for (const evidence of [
    {
      name: "home-1440",
      width: 1440,
      height: 1000,
      reducedMotion: "no-preference" as const,
    },
    {
      name: "home-768",
      width: 768,
      height: 1024,
      reducedMotion: "no-preference" as const,
    },
    {
      name: "home-390",
      width: 390,
      height: 844,
      reducedMotion: "no-preference" as const,
    },
    {
      name: "home-1440-reduced",
      width: 1440,
      height: 1000,
      reducedMotion: "reduce" as const,
    },
  ]) {
    await page.setViewportSize({
      width: evidence.width,
      height: evidence.height,
    });
    await gotoHome(page, evidence.reducedMotion);
    await loadHomeImages(page);
    await page.screenshot({
      path: resolve(outputDirectory, `${evidence.name}.png`),
      fullPage: true,
    });
  }
});
