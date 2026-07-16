import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

function splitAnimationList(value: string) {
  return value.split(",").map((item) => item.trim());
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectRowsToFit(
  page: Page,
  selector: string,
  maximumHeight?: number,
) {
  const rows = await page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => ({
      clientHeight: element.clientHeight,
      height: element.getBoundingClientRect().height,
      scrollHeight: element.scrollHeight,
    })),
  );
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.scrollHeight).toBeLessThanOrEqual(row.clientHeight + 1);
    if (maximumHeight !== undefined) {
      expect(row.height).toBeLessThanOrEqual(maximumHeight);
    }
  }
}

async function gotoHome(
  page: Page,
  reducedMotion: "reduce" | "no-preference" = "reduce",
) {
  await page.emulateMedia({ reducedMotion });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
}

async function readAnimationTiming(locator: Locator, animationName: string) {
  return locator.evaluate((element, targetAnimationName) => {
    const style = getComputedStyle(element);
    const animationNames = style.animationName
      .split(",")
      .map((value) => value.trim());
    const animationIndex = animationNames.indexOf(targetAnimationName);

    if (animationIndex < 0) return null;

    const parseTimeInMilliseconds = (value: string) => {
      const normalized = value.trim();
      const amount = Number.parseFloat(normalized);
      return normalized.endsWith("ms") ? amount : amount * 1000;
    };
    const matchingValue = (value: string) => {
      const values = value.split(",").map((item) => item.trim());
      return values[animationIndex % values.length];
    };

    return {
      delayMs: parseTimeInMilliseconds(matchingValue(style.animationDelay)),
      durationMs: parseTimeInMilliseconds(
        matchingValue(style.animationDuration),
      ),
    };
  }, animationName);
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

async function revealHomeRegionsInOrder(page: Page) {
  const regions = page.locator('[data-home-reveal="true"]');
  await expect(regions).toHaveCount(4);

  for (let index = 0; index < (await regions.count()); index += 1) {
    const region = regions.nth(index);
    await region.scrollIntoViewIfNeeded();
    await expect(region).toHaveClass(/is-home-visible/);
  }

  await expect(
    page.locator('[data-home-reveal="true"]:not(.is-home-visible)'),
  ).toHaveCount(0);
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

  const heroFrame = await page
    .locator(".home-hero > .home-frame")
    .boundingBox();
  const closingFrame = await page
    .locator(".home-closing > .home-frame")
    .boundingBox();
  expect(heroFrame).not.toBeNull();
  expect(closingFrame).not.toBeNull();
  expect(heroFrame!.width).toBeGreaterThan(1300);
  expect(closingFrame!.width).toBeGreaterThan(1300);
  expect(heroFrame!.height).toBeGreaterThanOrEqual(800);
  expect(closingFrame!.height).toBeGreaterThanOrEqual(560);

  const heroHeadingFontSize = await page
    .locator(".home-hero h1")
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(heroHeadingFontSize).toBeGreaterThanOrEqual(66);

  const contentFrames = page.locator(
    ".home-platform-overview > .home-frame, .home-enterprise > .home-frame, .home-solutions > .home-frame, .home-resources > .home-frame",
  );
  await expect(contentFrames).toHaveCount(4);
  const contentFrameWidths = await contentFrames.evaluateAll((frames) =>
    frames.map((frame) => frame.getBoundingClientRect().width),
  );
  for (const width of contentFrameWidths) {
    expect(width).toBeGreaterThan(1300);
    expect(Math.abs(width - heroFrame!.width)).toBeLessThanOrEqual(1);
  }

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

  await expectRowsToFit(page, ".home-platform-row", 140);
  await expectRowsToFit(page, ".home-enterprise-row", 124);
  await expectRowsToFit(
    page,
    ".home-solution-row:not(.home-solution-row--subset)",
    124,
  );
  await expectRowsToFit(page, ".home-solution-row--subset", 140);
  await expectRowsToFit(page, ".home-resource", 128);
});

test("keeps platform connectors inside dedicated card gaps", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoHome(page);

  const capabilityCards = await page
    .locator(".home-capability-card")
    .evaluateAll((cards) =>
      cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
    );
  const capabilityConnectors = await page
    .locator(".home-capability-connector")
    .evaluateAll((connectors) =>
      connectors.map((connector) => {
        const rect = connector.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
    );
  expect(capabilityCards).toHaveLength(4);
  expect(capabilityConnectors).toHaveLength(3);
  capabilityConnectors.forEach((connector, index) => {
    expect(connector.left).toBeGreaterThanOrEqual(
      capabilityCards[index].right + 1,
    );
    expect(connector.right).toBeLessThanOrEqual(
      capabilityCards[index + 1].left - 1,
    );
  });
});

test("keeps the compact tablet composition without clipping", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 768, height: 1024 });
  await gotoHome(page);

  await expectNoHorizontalOverflow(page);
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

  const contentFrames = page.locator(
    ".home-platform-overview > .home-frame, .home-enterprise > .home-frame, .home-solutions > .home-frame, .home-resources > .home-frame",
  );
  await expect(contentFrames).toHaveCount(4);
  const contentFrameWidths = await contentFrames.evaluateAll((frames) =>
    frames.map((frame) => frame.getBoundingClientRect().width),
  );
  for (const width of contentFrameWidths) {
    expect(width).toBeLessThan(768);
  }

  const introPanels = await page
    .locator(
      ".home-platform__intro, .home-solutions__intro, .home-resources__intro",
    )
    .evaluateAll((panels) =>
      panels.map((panel) => ({
        clientHeight: panel.clientHeight,
        minHeight: parseFloat(getComputedStyle(panel).minHeight),
        scrollHeight: panel.scrollHeight,
      })),
    );
  expect(introPanels).toHaveLength(3);
  for (const panel of introPanels) {
    expect(panel.minHeight).toBeLessThanOrEqual(480);
    expect(panel.scrollHeight).toBeLessThanOrEqual(panel.clientHeight + 1);
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

  for (const selector of [
    ".home-capability-card",
    ".home-platform-row",
    ".home-enterprise-row",
    ".home-solution-row",
    ".home-resource",
  ]) {
    await expectRowsToFit(page, selector);
  }
});

test("reveals post-hero regions once with staged foreground motion and a breathing purple atmosphere", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHome(page, "no-preference");

  const resources = page.locator('[data-home-region="resources"]');
  await expect(resources).not.toHaveClass(/is-home-visible/);
  const revealRegions = page.locator('[data-home-reveal="true"]');
  await expect(revealRegions).toHaveCount(4);
  for (let index = 0; index < (await revealRegions.count()); index += 1) {
    const region = revealRegions.nth(index);
    await region.scrollIntoViewIfNeeded();
    await expect(region).toHaveClass(/is-home-visible/);
  }

  const firstText = resources.locator('[data-home-reveal-item="text"]').first();
  const firstBlock = resources
    .locator('[data-home-reveal-item="block"]')
    .first();
  await expect
    .poll(() =>
      firstText.evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe("1");

  const revealAnimationNames = await Promise.all([
    resources.evaluate((element) => getComputedStyle(element).animationName),
    firstText.evaluate((element) => getComputedStyle(element).animationName),
    firstBlock.evaluate((element) => getComputedStyle(element).animationName),
  ]);
  expect(revealAnimationNames[0]).toContain("home-section-reveal");
  expect(revealAnimationNames[1]).toContain("home-text-reveal");
  expect(revealAnimationNames[2]).toContain("home-block-reveal");

  expect(await readAnimationTiming(resources, "home-section-reveal")).toEqual({
    delayMs: 0,
    durationMs: 520,
  });

  const platform = page.locator('[data-home-region="platform"]');
  const enterprise = page.locator('[data-home-region="enterprise"]');
  const solutions = page.locator('[data-home-region="solutions"]');
  const timingExpectations: Array<{
    animationName: "home-block-reveal" | "home-text-reveal";
    delayMs: number;
    element: Locator;
    label: string;
  }> = [
    {
      animationName: "home-text-reveal",
      delayMs: 0,
      element: platform.locator(".home-section-kicker"),
      label: "platform kicker",
    },
    {
      animationName: "home-text-reveal",
      delayMs: 60,
      element: platform.locator("h2"),
      label: "platform heading",
    },
    {
      animationName: "home-text-reveal",
      delayMs: 120,
      element: platform.locator(".home-section-intro"),
      label: "platform intro",
    },
    {
      animationName: "home-block-reveal",
      delayMs: 180,
      element: platform.locator(".home-actions"),
      label: "platform actions",
    },
    {
      animationName: "home-block-reveal",
      delayMs: 720,
      element: platform.locator(".home-platform__illustration"),
      label: "platform illustration",
    },
    {
      animationName: "home-block-reveal",
      delayMs: 540,
      element: solutions.locator(".home-solutions__illustration"),
      label: "solutions illustration",
    },
    {
      animationName: "home-block-reveal",
      delayMs: 480,
      element: resources.locator(".home-resources__illustration"),
      label: "resources illustration",
    },
  ];
  const staggerGroups = [
    {
      delays: [240, 300, 360, 420],
      elements: platform.locator(".home-capability-card"),
      label: "platform capability",
    },
    {
      delays: [480, 540, 600, 660],
      elements: platform.locator(".home-platform-row"),
      label: "platform row",
    },
    {
      delays: [180, 240, 300, 360],
      elements: enterprise.locator(".home-enterprise-row"),
      label: "enterprise row",
    },
    {
      delays: [240, 300, 360, 420, 480],
      elements: solutions.locator(".home-solution-row"),
      label: "solution row",
    },
    {
      delays: [240, 300, 360, 420],
      elements: resources.locator(".home-resource"),
      label: "resource row",
    },
  ];
  for (const group of staggerGroups) {
    await expect(group.elements).toHaveCount(group.delays.length);
    group.delays.forEach((delayMs, index) => {
      timingExpectations.push({
        animationName: "home-block-reveal",
        delayMs,
        element: group.elements.nth(index),
        label: `${group.label} ${index + 1}`,
      });
    });
  }

  for (const expectation of timingExpectations) {
    const timing = await readAnimationTiming(
      expectation.element,
      expectation.animationName,
    );
    expect(timing, expectation.label).toEqual({
      delayMs: expectation.delayMs,
      durationMs: expectation.animationName === "home-text-reveal" ? 480 : 440,
    });
  }

  const purpleAtmosphere = page.locator(".home-atmosphere span:nth-child(2)");
  const purpleStyle = await purpleAtmosphere.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationName: style.animationName,
      animationDirection: style.animationDirection,
      animationDuration: style.animationDuration,
      animationIterationCount: style.animationIterationCount,
    };
  });
  const purpleAnimationNames = splitAnimationList(purpleStyle.animationName);
  const purpleAnimationDirections = splitAnimationList(
    purpleStyle.animationDirection,
  );
  const purpleAnimationDurations = splitAnimationList(
    purpleStyle.animationDuration,
  );
  const purpleAnimationIterationCounts = splitAnimationList(
    purpleStyle.animationIterationCount,
  );
  const driftIndex = purpleAnimationNames.indexOf("home-atmosphere-drift");
  const breathIndex = purpleAnimationNames.indexOf("home-purple-breathe");
  expect(driftIndex).toBeGreaterThanOrEqual(0);
  expect(breathIndex).toBeGreaterThanOrEqual(0);
  expect(purpleAnimationDirections[breathIndex]).toBe("alternate");
  expect(purpleAnimationDurations[breathIndex]).toBe("8s");
  expect(purpleAnimationIterationCounts[breathIndex]).toBe("infinite");

  const breath = await purpleAtmosphere.evaluate((element) => {
    const animation = element
      .getAnimations()
      .find(
        (candidate) =>
          (candidate as CSSAnimation).animationName === "home-purple-breathe",
      );
    const effect = animation?.effect as KeyframeEffect | null | undefined;
    const timing = effect?.getTiming();
    const keyframes = effect?.getKeyframes() ?? [];
    return {
      easing: keyframes[0]?.easing,
      iterations: timing?.iterations,
      opacities: keyframes.map((keyframe) => String(keyframe.opacity)),
      scales: keyframes.map((keyframe) => String(keyframe.scale)),
    };
  });
  expect(breath.iterations).toBe(Infinity);
  expect(breath.easing).toBe("ease-in-out");
  expect(breath.opacities).toEqual(["0.72", "1"]);
  expect(breath.scales).toEqual(["0.94", "1.06"]);

  const revealIterationCounts = await page
    .locator(
      '[data-home-reveal="true"], [data-home-reveal="true"] [data-home-reveal-item]',
    )
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          animationIterationCount: style.animationIterationCount,
          animationName: style.animationName,
          itemType: element.getAttribute("data-home-reveal-item"),
        };
      }),
    );
  for (const reveal of revealIterationCounts) {
    const expectedAnimationName = reveal.itemType
      ? `home-${reveal.itemType}-reveal`
      : "home-section-reveal";
    const names = splitAnimationList(reveal.animationName);
    const iterations = splitAnimationList(reveal.animationIterationCount);
    const expectedIndex = names.indexOf(expectedAnimationName);
    expect(expectedIndex, expectedAnimationName).toBeGreaterThanOrEqual(0);
    expect(iterations[expectedIndex], expectedAnimationName).toBe("1");
  }

  const firstResource = resources.locator(".home-resource").first();
  await firstResource.evaluate((element) =>
    Promise.all(
      element
        .getAnimations()
        .filter((animation) => {
          const iterations = animation.effect?.getTiming().iterations;
          return iterations !== Infinity;
        })
        .map((animation) => animation.finished),
    ),
  );
  await firstResource.hover();
  await expect
    .poll(() =>
      firstResource.evaluate(
        (element) =>
          new DOMMatrixReadOnly(getComputedStyle(element).transform).m42,
      ),
    )
    .toBeLessThan(-1);

  await page.mouse.down();
  await expect
    .poll(() =>
      firstResource.evaluate(
        (element) =>
          new DOMMatrixReadOnly(getComputedStyle(element).transform).m42,
      ),
    )
    .toBeGreaterThan(0);
  await page.mouse.move(0, 0);
  await page.mouse.up();

  const heroAnimationNames = await page
    .locator('[data-home-region="hero"], [data-home-region="hero"] *')
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).animationName),
    );
  expect(
    heroAnimationNames.some(
      (animationName) =>
        animationName.includes("home-section-reveal") ||
        animationName.includes("home-purple-breathe"),
    ),
  ).toBe(false);

  await page.locator('[data-home-region="hero"]').scrollIntoViewIfNeeded();
  await expect(resources).toHaveClass(/is-home-visible/);
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

  const reveals = await page
    .locator(
      '[data-home-reveal="true"], [data-home-reveal="true"] [data-home-reveal-item]',
    )
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          animationName: style.animationName,
          filter: style.filter,
          opacity: style.opacity,
          transform: style.transform,
        };
      }),
    );
  for (const item of reveals) {
    expect(item.animationName).toBe("none");
    expect(item.filter).toBe("none");
    expect(item.opacity).toBe("1");
    expect(item.transform).toBe("none");
  }

  const purpleAtmosphere = await page
    .locator(".home-atmosphere span:nth-child(2)")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationName: style.animationName,
        scale: style.scale,
        transform: style.transform,
      };
    });
  expect(purpleAtmosphere.animationName).toBe("none");
  expect(["none", "1"]).toContain(purpleAtmosphere.scale);
  expect(purpleAtmosphere.transform).toBe("none");

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
    await revealHomeRegionsInOrder(page);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      animations: "disabled",
      path: resolve(outputDirectory, `${evidence.name}.png`),
      fullPage: true,
    });
  }
});
