import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

async function gotoSolutions(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto("/solutions", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("load");
  expect(response?.status()).toBe(200);
}

async function expectNoHorizontalOverflow(page: Page) {
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
}

test("覆盖原型总览内容并只保留 shell 的唯一 Agent 入口", async ({ page }) => {
  await gotoSolutions(page);

  await expect(
    page.getByRole("heading", {
      level: 1,
      exact: true,
      name: "面向企业实际业务问题的 AI 解决方案",
    }),
  ).toHaveCount(1);
  await expect(page.locator("[data-solution-scene]")).toHaveCount(6);
  await expect(page.locator("[data-solution-industry]")).toHaveCount(4);
  await expect(page.getByRole("tab")).toHaveCount(6);
  await expect(
    page.getByText("平台治理横向贯穿", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("案例内容待授权补充", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("main.solutions-page .floating-assistant"),
  ).toHaveCount(0);
  await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);

  const hrefs = await page
    .locator("main.solutions-page a[href]")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(hrefs.length).toBeGreaterThan(0);
  expect(hrefs.every((href) => href?.startsWith("/"))).toBe(true);
  expect(hrefs).toContain(
    "/solutions?view=industries&industry=government#industry-solutions-list",
  );
  expect(hrefs).toContain("/solutions/knowledge-service");
  expect(hrefs).toContain("/solutions?view=cases&mode=all#practice-cases-hero");

  const internalHrefs = await page
    .locator("main.solutions-page a[href]")
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).href),
    );
  const internalLinks = internalHrefs.map((href) => new URL(href));
  const requestTargets = [
    ...new Set(internalLinks.map((url) => `${url.pathname}${url.search}`)),
  ];
  for (const href of requestTargets) {
    const response = await page.request.get(href);
    expect(response.status(), href).toBeLessThan(400);
  }
  for (const url of internalLinks.filter(
    (url) => url.pathname === "/solutions" && url.hash,
  )) {
    await expect(
      page.locator(url.hash),
      `${url.pathname}${url.search}${url.hash}`,
    ).toBeVisible();
  }
});

test("桌面目录支持搜索、清空和折叠", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 900, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await gotoSolutions(page);

    const search = page.getByRole("searchbox", {
      name: "在解决方案目录中筛选",
    });
    await search.fill("政务知识问答");
    await expect(
      page.getByRole("link", { name: "政务知识问答与政策服务" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "金融文档理解与合规辅助审核" }),
    ).toHaveCount(0);

    await search.fill("不存在的方案");
    await page.getByRole("button", { name: "清除筛选" }).click();
    await expect(search).toHaveValue("");

    const branchToggle = page.getByRole("button", {
      name: "展开或收起基础设施与模型工程",
    });
    await branchToggle.click();
    await expect(branchToggle).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("link", { name: "元启私有化部署方案" }),
    ).toHaveCount(0);
    await search.fill("元启私有化部署");
    await expect(branchToggle).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByRole("link", { name: "元启私有化部署方案" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "收起解决方案目录" }).click();
    await expect(page.locator(".solution-shell")).toHaveAttribute(
      "data-directory-collapsed",
      "true",
    );
    await expect(
      page.getByRole("button", { name: "展开解决方案目录" }),
    ).toBeVisible();
  }
});

test("批准的列表 query 与 hash 被真实页面读取并落到精确目录状态", async ({
  page,
}) => {
  for (const route of [
    {
      href: "/solutions?view=scenarios&category=infrastructure#solution-scenarios-directory",
      view: "scenarios",
      filter: "infrastructure",
      current: "基础设施与模型工程",
      anchor: "#solution-scenarios-directory",
    },
    {
      href: "/solutions?view=industries&industry=finance#industry-solutions-list",
      view: "industries",
      filter: "finance",
      current: "金融",
      anchor: "#industry-solutions-list",
    },
    {
      href: "/solutions?view=cases&mode=all#practice-cases-hero",
      view: "cases",
      filter: "all",
      current: "实践案例",
      anchor: "#practice-cases-hero",
    },
  ]) {
    const response = await page.goto(route.href, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status(), route.href).toBe(200);
    await expect(page.locator("main.solutions-page")).toHaveAttribute(
      "data-solution-view",
      route.view,
    );
    await expect(page.locator("main.solutions-page")).toHaveAttribute(
      "data-solution-filter",
      route.filter,
    );
    await expect(
      page
        .locator('a[aria-current="location"]')
        .filter({ hasText: route.current }),
    ).toBeVisible();
    await expect(page.locator(route.anchor)).toBeVisible();
  }
});

test("390px 抽屉隔离背景、双向循环焦点并在 Escape 后恢复", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoSolutions(page);

  const trigger = page.getByRole("button", {
    exact: true,
    name: "解决方案目录",
  });
  const directory = page.locator(
    `#${await trigger.getAttribute("aria-controls")}`,
  );
  await expect(directory).toBeHidden();
  await expect(directory).toHaveAttribute("aria-hidden", "true");
  await expect(directory).toHaveAttribute("inert", "");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const dialog = page.getByRole("dialog", { name: "解决方案目录" });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.locator(".solution-content")).toHaveAttribute("inert", "");
  await expect(trigger).toHaveAttribute("inert", "");
  await expect(
    dialog.getByRole("button", { name: "收起解决方案目录" }),
  ).toHaveCount(0);

  const focusables = dialog.locator(
    'a[href]:visible, button:not([disabled]):visible, input:not([disabled]):visible, [tabindex]:not([tabindex="-1"]):visible',
  );
  const first = focusables.first();
  const last = focusables.last();
  await expect(first).toBeFocused();
  await last.focus();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await expect(directory).toBeHidden();
  await expect(directory).toHaveAttribute("inert", "");
  await expect(page.locator(".solution-content")).not.toHaveAttribute("inert");
});

test("方法 tab 支持键盘切换且 reduced-motion 不保留过渡", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoSolutions(page);

  const assessment = page.getByRole("tab", { name: "02 能力与数据评估" });
  await assessment.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tabpanel")).toContainText(
    "能力与数据评估结果、风险清单和建设前提。",
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "03 方案设计" })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText(
    "解决方案说明、总体架构图和场景建设清单。",
  );

  await expect
    .poll(() =>
      page
        .locator(".solution-button")
        .first()
        .evaluate((element) => getComputedStyle(element).transitionDuration),
    )
    .toBe("0s");
});

test("1440、900 与 390px 无横向溢出并保存截图", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(120_000);
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/solution-overview",
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const viewport of [
    { name: "1440", width: 1440, height: 1000 },
    { name: "900", width: 900, height: 900 },
    { name: "390", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await gotoSolutions(page);
    await expectNoHorizontalOverflow(page);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: resolve(outputDirectory, `solutions-${viewport.name}.png`),
    });
  }
});
