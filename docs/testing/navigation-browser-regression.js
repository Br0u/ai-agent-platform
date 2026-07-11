async function navigationBrowserRegression(page) {
  const origin = await page.evaluate(() => window.location.origin);
  const results = {};

  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const assertClose = (actual, expected, label) => {
    assert(
      Math.abs(actual - expected) <= 1,
      `${label}: expected ${expected}px, received ${actual}px`,
    );
  };
  const columnCount = async () =>
    page
      .locator(".portal-footer__navigation")
      .evaluate(
        (element) =>
          getComputedStyle(element)
            .gridTemplateColumns.split(/\s+/)
            .filter(Boolean).length,
      );
  const horizontalOverflow = () =>
    page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
  const openMobileNavigation = async () => {
    await page.getByRole("button", { name: "打开导航" }).click();
    const dialog = page.getByRole("dialog", { name: "全站导航" });
    assert(await dialog.isVisible(), "mobile navigation dialog is not visible");
    return dialog;
  };
  const closeMobileNavigation = async (previousOverflow) => {
    await page.getByRole("button", { name: "关闭导航", exact: true }).click();
    assert(
      !(await page.locator(".mobile-navigation__overlay").isVisible()),
      "mobile navigation overlay did not close",
    );
    const restoredOverflow = await page.evaluate(
      () => document.body.style.overflow,
    );
    assert(
      restoredOverflow === previousOverflow,
      `body overflow was not restored: expected ${JSON.stringify(previousOverflow)}, received ${JSON.stringify(restoredOverflow)}`,
    );
    return restoredOverflow;
  };

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  const footerLinkHeights = await page
    .locator(".portal-footer__group a")
    .evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().height),
    );
  assert(footerLinkHeights.length > 0, "no footer links were rendered");
  assert(
    footerLinkHeights.every((height) => height >= 44),
    `footer link target below 44px: ${JSON.stringify(footerLinkHeights)}`,
  );
  const desktopFooterColumns = await columnCount();
  assert(
    desktopFooterColumns === 4,
    `1440 footer expected 4 columns, received ${desktopFooterColumns}`,
  );
  const desktopOverflow = await horizontalOverflow();
  assert(
    desktopOverflow === 0,
    `1440 page has ${desktopOverflow}px horizontal overflow`,
  );
  results.desktop = {
    viewport: [1440, 1000],
    footerColumns: desktopFooterColumns,
    minimumFooterTarget: Math.min(...footerLinkHeights),
    horizontalOverflow: desktopOverflow,
  };

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  const tabletPreviousOverflow = await page.evaluate(
    () => document.body.style.overflow,
  );
  await openMobileNavigation();
  const tabletOverlay = await page
    .locator(".mobile-navigation__overlay")
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    });
  assertClose(tabletOverlay.top, 0, "1024 overlay top");
  assertClose(tabletOverlay.left, 0, "1024 overlay left");
  assertClose(tabletOverlay.width, 1024, "1024 overlay width");
  assertClose(tabletOverlay.height, 768, "1024 overlay height");
  const tabletOpenOverflow = await page.evaluate(
    () => document.body.style.overflow,
  );
  assert(
    tabletOpenOverflow === "hidden",
    `1024 open body overflow expected hidden, received ${JSON.stringify(tabletOpenOverflow)}`,
  );
  const tabletRestoredOverflow = await closeMobileNavigation(
    tabletPreviousOverflow,
  );
  results.tablet = {
    viewport: [1024, 768],
    overlay: tabletOverlay,
    openBodyOverflow: tabletOpenOverflow,
    restoredBodyOverflow: tabletRestoredOverflow,
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  const mobileScrollY = await page.evaluate(() => {
    const maximumScroll = document.documentElement.scrollHeight - innerHeight;
    window.scrollTo(0, Math.min(600, maximumScroll));
    return window.scrollY;
  });
  assert(mobileScrollY > 0, "390 page could not be scrolled before opening");
  const mobilePreviousOverflow = await page.evaluate(
    () => document.body.style.overflow,
  );
  const mobileDialog = await openMobileNavigation();
  await mobileDialog.locator(".mobile-navigation__accordion").first().click();

  const mobileBodyScroll = await mobileDialog
    .locator(".mobile-navigation__body")
    .evaluate(async (body) => {
      const target = Math.min(160, body.scrollHeight - body.clientHeight);
      body.scrollTop = target;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return { target, actual: body.scrollTop };
    });
  assert(
    mobileBodyScroll.target > 0 && mobileBodyScroll.actual > 0,
    `390 drawer body did not actually scroll: ${JSON.stringify(mobileBodyScroll)}`,
  );

  const dialogTargets = await mobileDialog
    .locator("button:visible, a[href]:visible")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label:
            element.getAttribute("aria-label") || element.textContent.trim(),
          width: rect.width,
          height: rect.height,
        };
      }),
    );
  const mobileFooterTargets = await page
    .locator(".portal-footer__link:visible")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.textContent.trim(),
          width: rect.width,
          height: rect.height,
        };
      }),
    );
  const mobileTargets = [...dialogTargets, ...mobileFooterTargets];
  assert(
    mobileTargets.length > 0,
    "390 page has no measured navigation targets",
  );
  assert(
    mobileTargets.every((target) => target.width >= 44 && target.height >= 44),
    `390 navigation target below 44x44: ${JSON.stringify(
      mobileTargets.filter((target) => target.width < 44 || target.height < 44),
    )}`,
  );

  const mobileGeometry = await mobileDialog.evaluate((dialog) => {
    const drawerRect = dialog.getBoundingClientRect();
    const overlayRect = dialog.parentElement.getBoundingClientRect();
    const body = dialog.querySelector(".mobile-navigation__body");
    const action = dialog.querySelector(".mobile-navigation__action-wrap");
    const actionRect = action.getBoundingClientRect();
    return {
      overlay: {
        top: overlayRect.top,
        left: overlayRect.left,
        width: overlayRect.width,
        height: overlayRect.height,
      },
      drawer: {
        top: drawerRect.top,
        left: drawerRect.left,
        height: drawerRect.height,
      },
      body: {
        clientHeight: body.clientHeight,
        scrollHeight: body.scrollHeight,
        overflowY: getComputedStyle(body).overflowY,
      },
      action: {
        top: actionRect.top,
        bottom: actionRect.bottom,
        visible: actionRect.top >= 0 && actionRect.bottom <= window.innerHeight,
      },
    };
  });
  assertClose(mobileGeometry.overlay.top, 0, "390 overlay top");
  assertClose(mobileGeometry.overlay.left, 0, "390 overlay left");
  assertClose(mobileGeometry.overlay.width, 390, "390 overlay width");
  assertClose(mobileGeometry.overlay.height, 844, "390 overlay height");
  assertClose(mobileGeometry.drawer.top, 0, "390 drawer top");
  assertClose(mobileGeometry.drawer.height, 844, "390 drawer height");
  assert(
    mobileGeometry.body.scrollHeight > mobileGeometry.body.clientHeight,
    `390 drawer body is not scrollable: ${JSON.stringify(mobileGeometry.body)}`,
  );
  assert(
    mobileGeometry.body.overflowY === "auto",
    `390 drawer body overflow-y expected auto, received ${mobileGeometry.body.overflowY}`,
  );
  const mobileFooterColumns = await columnCount();
  assert(
    mobileFooterColumns === 1,
    `390 footer expected 1 column, received ${mobileFooterColumns}`,
  );
  assert(
    mobileGeometry.action.visible,
    `390 bottom login action is outside the viewport: ${JSON.stringify(mobileGeometry.action)}`,
  );
  assertClose(mobileGeometry.action.bottom, 844, "390 action bottom");
  const mobileOverflow = await horizontalOverflow();
  assert(
    mobileOverflow === 0,
    `390 page has ${mobileOverflow}px horizontal overflow`,
  );
  const exposedBackdropX = Math.max(
    1,
    Math.floor(mobileGeometry.drawer.left / 2),
  );
  await page.mouse.move(exposedBackdropX, 400);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(50);
  const scrollYAfterBackdropWheel = await page.evaluate(() => window.scrollY);
  assert(
    scrollYAfterBackdropWheel === mobileScrollY,
    `390 background scrolled behind the drawer: expected ${mobileScrollY}, received ${scrollYAfterBackdropWheel}`,
  );
  const mobileRestoredOverflow = await closeMobileNavigation(
    mobilePreviousOverflow,
  );
  const mobileRestoredScrollY = await page.evaluate(() => window.scrollY);
  assert(
    mobileRestoredScrollY === mobileScrollY,
    `390 scroll position changed after close: expected ${mobileScrollY}, received ${mobileRestoredScrollY}`,
  );
  results.mobile = {
    viewport: [390, 844],
    ...mobileGeometry,
    bodyScroll: mobileBodyScroll,
    minimumTarget: {
      width: Math.min(...mobileTargets.map((target) => target.width)),
      height: Math.min(...mobileTargets.map((target) => target.height)),
    },
    footerColumns: mobileFooterColumns,
    horizontalOverflow: mobileOverflow,
    backgroundScroll: {
      beforeOpen: mobileScrollY,
      afterBackdropWheel: scrollYAfterBackdropWheel,
      afterClose: mobileRestoredScrollY,
    },
    restoredBodyOverflow: mobileRestoredOverflow,
  };

  return results;
}
