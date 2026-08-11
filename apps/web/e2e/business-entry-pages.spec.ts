import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

async function gotoDownloads(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto("/downloads", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("load");
  expect(response?.status()).toBe(200);
}

async function gotoPartners(page: Page, suffix = "") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(`/partners${suffix}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("load");
  expect(response?.status()).toBe(200);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test("downloads 执行完整内容、筛选和原型下载确认合同", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoDownloads(page);

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "从产品资料到安装体验，一站式获取华鲲资源",
    }),
  ).toHaveCount(1);
  await expect(page.locator("[data-download-key]")).toHaveCount(13);
  for (const anchor of [
    "dl-materials",
    "dl-software",
    "dl-deployment",
    "dl-whitepapers",
  ]) {
    await expect(page.locator(`#${anchor}`)).toHaveCount(1);
  }

  const search = page.getByRole("searchbox", {
    name: "在下载中心目录中筛选",
  });
  await search.fill("安装部署指南");
  await expect(
    page.getByRole("link", { name: "码多多 2.0 安装部署指南" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "企业 AI 落地白皮书" }),
  ).toHaveCount(0);
  await search.fill("不存在的资料");
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(search).toHaveValue("");

  await page
    .getByRole("button", {
      name: "在线预览元启 AI 开发赋能平台产品介绍",
    })
    .click();
  await expect(page.locator(".download-toast")).toHaveText(
    "「元启 AI 开发赋能平台产品介绍」在线预览：正式版提供，原型以内容槽位示意",
  );
  await page
    .getByRole("button", {
      name: "下载资料元启 AI 开发赋能平台产品介绍",
    })
    .click();
  await expect(page.locator(".download-toast")).toHaveText(
    "「元启 AI 开发赋能平台产品介绍」下载：原型阶段暂不提供真实文件，正式版上线后开放",
  );

  const softwareTrigger = page.getByRole("button", {
    name: "下载安装码多多 2.0 桌面客户端",
  });
  await softwareTrigger.click();
  const dialog = page.getByRole("dialog", { name: "确认下载安装包" });
  const close = dialog.getByRole("button", { name: "关闭" });
  const headerLink = page.locator(".site-header a").first();
  const routeTransition = page.locator(".site-route-transition");
  await expect
    .poll(() =>
      routeTransition.evaluate(
        (element) => getComputedStyle(element).willChange,
      ),
    )
    .toBe("auto");
  const dialogBackdropBox = await page
    .locator(".download-dialog-backdrop")
    .boundingBox();
  expect.soft(dialogBackdropBox?.y).toBe(0);
  const softwareUrl = page.url();
  const softwareHeaderBox = await headerLink.boundingBox();
  expect(softwareHeaderBox).not.toBeNull();
  await page.mouse.click(
    softwareHeaderBox!.x + softwareHeaderBox!.width / 2,
    softwareHeaderBox!.y + softwareHeaderBox!.height / 2,
  );
  await expect.soft(page).toHaveURL(softwareUrl);
  await expect.soft(dialog).toHaveCount(1);
  await headerLink.focus();
  await expect.soft(close).toBeFocused();
  const launcher = page.getByRole("button", { name: "打开码多多" });
  await launcher.focus();
  await expect.soft(close).toBeFocused();
  const launcherBox = await launcher.boundingBox();
  expect(launcherBox).not.toBeNull();
  await page.mouse.click(
    launcherBox!.x + launcherBox!.width / 2,
    launcherBox!.y + launcherBox!.height / 2,
  );
  await expect.soft(dialog).toHaveCount(1);
  await expect.soft(page.locator(".floating-assistant__panel")).toHaveCount(0);
  const confirm = dialog.getByRole("button", { name: "确认下载" });
  await expect(confirm).toBeDisabled();
  await dialog
    .getByRole("checkbox", {
      name: "我已了解该版本的适用环境和使用说明",
    })
    .check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(softwareTrigger).toBeFocused();
  await expect
    .poll(() =>
      routeTransition.evaluate(
        (element) => getComputedStyle(element).willChange,
      ),
    )
    .toBe("opacity, transform");
  await expect(page.locator(".download-toast")).toHaveText(
    "已创建下载任务：原型阶段不实际下载，正式版提供安装包",
  );
});

test("downloads 资源锚点在 desktop 和 mobile 落入 sticky 可视区", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");

  for (const viewport of [
    { width: 1440, height: 1000, min: 80, max: 100 },
    { width: 390, height: 844, min: 120, max: 145 },
  ]) {
    await page.setViewportSize(viewport);
    await gotoDownloads(page);
    if (viewport.width === 390) {
      await page
        .getByRole("button", { name: "下载中心目录", exact: true })
        .click();
    }
    await page.getByRole("link", { name: "码多多 2.0 安装部署指南" }).click();

    const anchor = page.locator('[data-download-key="mdd2-deploy"]');
    await expect(anchor).toBeInViewport();
    await expect
      .poll(() =>
        anchor.evaluate((target) => target.getBoundingClientRect().top),
      )
      .toBeGreaterThanOrEqual(viewport.min);
    await expect
      .poll(() =>
        anchor.evaluate((target) => target.getBoundingClientRect().top),
      )
      .toBeLessThanOrEqual(viewport.max);
  }
});

test("downloads 在 1440 和 390 无横溢、保留唯一 Agent 并管理移动目录焦点", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/download-center",
  );
  await mkdir(outputDirectory, { recursive: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoDownloads(page);
  await expectNoHorizontalOverflow(page);
  await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: resolve(outputDirectory, "downloads-1440.png"),
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoDownloads(page);
  await expectNoHorizontalOverflow(page);
  await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
  const trigger = page.getByRole("button", {
    name: "下载中心目录",
    exact: true,
  });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "下载中心目录" });
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  const drawerBackdropBox = await page
    .locator(".download-directory-backdrop")
    .boundingBox();
  expect.soft(drawerBackdropBox?.y).toBe(0);
  const directoryUrl = page.url();
  const directoryHeaderLink = page.locator(".site-header a").first();
  const directoryHeaderBox = await directoryHeaderLink.boundingBox();
  expect(directoryHeaderBox).not.toBeNull();
  await page.mouse.click(
    directoryHeaderBox!.x + directoryHeaderBox!.width / 2,
    directoryHeaderBox!.y + directoryHeaderBox!.height / 2,
  );
  await expect.soft(page).toHaveURL(directoryUrl);
  await expect.soft(drawer).toHaveCount(1);
  const directorySearch = drawer.getByRole("searchbox", {
    name: "在下载中心目录中筛选",
  });
  await expect(directorySearch).toBeFocused();
  const headerLink = page.locator(".site-header a").first();
  await headerLink.focus();
  await expect.soft(directorySearch).toBeFocused();
  const launcher = page.getByRole("button", { name: "打开码多多" });
  await launcher.focus();
  await expect.soft(directorySearch).toBeFocused();
  const launcherBox = await launcher.boundingBox();
  expect(launcherBox).not.toBeNull();
  await page.mouse.click(
    launcherBox!.x + launcherBox!.width / 2,
    launcherBox!.y + launcherBox!.height / 2,
  );
  await expect.soft(drawer).toHaveCount(0);
  await expect.soft(page.locator(".floating-assistant__panel")).toHaveCount(0);

  await trigger.click();
  await expect(directorySearch).toBeFocused();
  const targetLink = drawer.getByRole("link", {
    name: "码多多 2.0 安装部署指南",
  });
  await targetLink.click();
  await expect(drawer).toHaveCount(0);

  await trigger.click();
  await expect(directorySearch).toBeFocused();
  const focusables = drawer.locator(
    'a[href]:visible, button:not([disabled]):visible, input:not([disabled]):visible, [tabindex]:not([tabindex="-1"]):visible',
  );
  const first = focusables.first();
  const last = focusables.last();
  await last.focus();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: resolve(outputDirectory, "downloads-390.png"),
  });
});

test("partners 执行五视图、15 key、筛选、history 和联系弹层合同", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoPartners(page, "?view=business#pb-tiers");

  const directory = page.getByRole("navigation", {
    name: "合作伙伴完整目录",
  });
  await expect(directory.getByRole("link")).toHaveCount(15);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "多元化商业模式，匹配每一类伙伴",
    }),
  ).toHaveCount(1);
  await expect(page.locator("#pb-tiers")).toHaveAttribute(
    "data-partner-target",
    "business-tiers",
  );

  for (const [label, view, hash, heading] of [
    ["合作伙伴总览", "overview", "po-hero", "共建企业 AI 生态，共享增长机遇"],
    ["商业模式", "business", "pb-hero", "多元化商业模式，匹配每一类伙伴"],
    ["伙伴政策", "policy", "pp-hero", "清晰的准入与认证体系，提供明确成长路径"],
    ["伙伴培训", "training", "pt-hero", "系统化培训与认证，快速掌握元启平台"],
    ["成为合作伙伴", "become", "pbc-hero", "成为华鲲合作伙伴"],
  ] as const) {
    await directory.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/partners\\?view=${view}#${hash}$`, "u"),
    );
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toHaveCount(1);
  }

  await page.getByRole("button", { name: "返回合作伙伴总览" }).click();
  await expect(page).toHaveURL(/\/partners\?view=overview#po-hero$/u);
  const search = page.getByRole("searchbox", {
    name: "在合作伙伴目录中筛选",
  });
  await search.fill("认证路径");
  await expect(directory.getByRole("link", { name: "认证路径" })).toBeVisible();
  await expect(directory.getByRole("link", { name: "分润政策" })).toHaveCount(
    0,
  );
  await search.fill("不存在的伙伴内容");
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(search).toHaveValue("");
  await page.getByRole("button", { name: "收起合作伙伴目录" }).click();
  await expect(
    page.getByRole("button", { name: "展开合作伙伴目录" }),
  ).toHaveAttribute("aria-expanded", "false");

  const trigger = page
    .locator("#po-hero")
    .getByRole("button", { name: "联系生态负责人" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "生态合作咨询" });
  const close = dialog.getByRole("button", { name: "关闭" });
  await expect(close).toBeFocused();
  await expect(dialog.getByText("联系方式素材待确认")).toBeVisible();
  await expect(dialog.getByText("邮箱素材待确认")).toBeVisible();
  await expect(dialog.getByText("联系二维码素材槽位")).toBeVisible();
  await expect(page.locator(".partner-shell")).toHaveAttribute("inert", "");
  const routeTransition = page.locator(".site-route-transition");
  await expect
    .poll(() =>
      routeTransition.evaluate(
        (element) => getComputedStyle(element).willChange,
      ),
    )
    .toBe("auto");
  const headerLink = page.locator(".site-header a").first();
  await headerLink.focus();
  await expect(close).toBeFocused();
  const launcher = page.getByRole("button", { name: "打开码多多" });
  await launcher.focus();
  await expect(close).toBeFocused();
  const dialogUrl = page.url();
  const headerBox = await headerLink.boundingBox();
  expect(headerBox).not.toBeNull();
  await page.mouse.click(
    headerBox!.x + headerBox!.width / 2,
    headerBox!.y + headerBox!.height / 2,
  );
  await expect(page).toHaveURL(dialogUrl);
  await expect(dialog).toHaveCount(1);
  await expect(page.locator(".floating-assistant__panel")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator(".partner-shell")).not.toHaveAttribute("inert", "");
});

test("partners 五视图分别冷启动 query/hash 并落入 sticky 可视区", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");

  for (const viewport of [
    { width: 1440, height: 1000, min: 145, max: 170 },
    { width: 390, height: 844, min: 158, max: 185 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [view, hash, heading, targetHeading] of [
      [
        "overview",
        "po-flow",
        "共建企业 AI 生态，共享增长机遇",
        "合作流程一目了然",
      ],
      [
        "business",
        "pb-tiers",
        "多元化商业模式，匹配每一类伙伴",
        "分润政策：四级伙伴体系",
      ],
      [
        "policy",
        "pp-cert",
        "清晰的准入与认证体系，提供明确成长路径",
        "认证体系",
      ],
      [
        "training",
        "pt-path",
        "系统化培训与认证，快速掌握元启平台",
        "三级认证路径",
      ],
      ["become", "pbc-types", "成为华鲲合作伙伴", "选择合作方向"],
    ] as const) {
      await gotoPartners(page, `?view=${view}#${hash}`);
      await expect(page).toHaveURL(
        new RegExp(`/partners\\?view=${view}#${hash}$`, "u"),
      );
      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toHaveCount(1);
      const target = page
        .locator("section")
        .filter({
          has: page.getByRole("heading", { level: 2, name: targetHeading }),
        })
        .first();
      await expect(target).toBeInViewport();
      await expect
        .poll(() =>
          target.evaluate((element) => element.getBoundingClientRect().top),
        )
        .toBeGreaterThanOrEqual(viewport.min);
      await expect
        .poll(() =>
          target.evaluate((element) => element.getBoundingClientRect().top),
        )
        .toBeLessThanOrEqual(viewport.max);
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoPartners(page, "#partner-contact");
  const dialog = page.getByRole("dialog", { name: "生态合作咨询" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "返回合作伙伴总览" }),
  ).toBeFocused();
  await expect(page).toHaveURL(/\/partners\?view=overview#po-hero$/u);
});

test("partners 在 1440 和 390 无横溢、锚点可见、抽屉隔离并保留唯一 Agent", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/partner-center",
  );
  await mkdir(outputDirectory, { recursive: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoPartners(page);
  await expectNoHorizontalOverflow(page);
  await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: resolve(outputDirectory, "partners-1440.png"),
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoPartners(page);
  await expectNoHorizontalOverflow(page);
  await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
  const trigger = page.getByRole("button", {
    name: "合作伙伴目录",
    exact: true,
  });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "合作伙伴目录" });
  const search = drawer.getByRole("searchbox", {
    name: "在合作伙伴目录中筛选",
  });
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  await expect(search).toBeFocused();
  const headerLink = page.locator(".site-header a").first();
  await headerLink.focus();
  await expect(search).toBeFocused();
  const launcher = page.getByRole("button", { name: "打开码多多" });
  await launcher.focus();
  await expect(search).toBeFocused();
  const focusables = drawer.locator(
    'a[href]:visible, button:not([disabled]):visible, input:not([disabled]):visible, [tabindex]:not([tabindex="-1"]):visible',
  );
  const first = focusables.first();
  const last = focusables.last();
  await last.focus();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
  await drawer.getByRole("link", { name: "认证路径" }).click();
  await expect(page).toHaveURL(/\/partners\?view=training#pt-path$/u);
  await expect(drawer).toHaveCount(0);
  const anchor = page.locator("#pt-path");
  await expect(anchor).toBeInViewport();
  await expect
    .poll(() => anchor.evaluate((target) => target.getBoundingClientRect().top))
    .toBeGreaterThanOrEqual(138);

  await trigger.click();
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator(".partner-main")).not.toHaveAttribute("inert", "");
  await expectNoHorizontalOverflow(page);
  await gotoPartners(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: resolve(outputDirectory, "partners-390.png"),
  });
});
