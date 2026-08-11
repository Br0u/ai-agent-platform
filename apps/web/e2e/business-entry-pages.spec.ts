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
  await expect(page.locator(".download-toast")).toHaveText(
    "已创建下载任务：原型阶段不实际下载，正式版提供安装包",
  );

  await page.getByRole("link", { name: "码多多 2.0 安装部署指南" }).click();
  await expect
    .poll(() =>
      page
        .locator('[data-download-key="mdd2-deploy"]')
        .evaluate((target) => target.getBoundingClientRect().top),
    )
    .toBeGreaterThanOrEqual(80);
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
  await expect
    .poll(() =>
      page
        .locator('[data-download-key="mdd2-deploy"]')
        .evaluate((target) => target.getBoundingClientRect().top),
    )
    .toBeGreaterThanOrEqual(116);

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
