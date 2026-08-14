import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const prototypePages = [
  ["home", "/"],
  ["products", "/product"],
  ["key-products", "/product/standalone"],
  ["mdd-2", "/product/code-agent"],
  ["aippt", "/product/aippt"],
  ["aishrek", "/product/aishrek"],
  ["model-optimization", "/product/model-optimization"],
  ["model-task-center", "/product/model-task-center"],
  ["model", "/product/model"],
  ["model-assets", "/product/model-assets"],
  ["model-training", "/product/model-training"],
  ["model-evaluation", "/product/model-evaluation"],
  ["agent-knowledge-base", "/product/agent-knowledge-base"],
  ["knowledge", "/product/knowledge"],
  ["knowledge-metrics", "/product/knowledge-metrics"],
  ["model-data", "/product/model-data"],
  ["model-deploy", "/product/model-deploy"],
  ["coding", "/product/coding"],
  ["coding-project", "/product/coding-project"],
  ["coding-session", "/product/coding-session"],
  ["coding-mobile", "/product/coding-mobile"],
  ["coding-standard", "/product/coding-standard"],
  ["agents", "/product/agents"],
  ["agent-knowledge", "/product/agent-knowledge"],
  ["agent-data", "/product/data-agent"],
  ["agent-video", "/product/agent-video"],
  ["agent-orchestration", "/product/agent-orchestration"],
  ["applications", "/product/applications"],
  ["app-writing", "/product/app-writing"],
  ["app-bidding", "/product/app-bidding"],
  ["app-contract", "/product/app-contract"],
  ["skills", "/product/skills"],
  ["skills-programming", "/product/skills-programming"],
  ["skills-application", "/product/skills-application"],
  ["skills-office", "/product/skills-office"],
  ["governance", "/product/governance"],
  ["solutions", "/solutions/finance-compliance"],
  ["solution-detail", "/solutions/finance-aml"],
  ["downloads", "/downloads"],
  ["partners", "/partners"],
  ["pricing", "/pricing"],
  ["contact", "/contact"],
  ["trial", "/trial"],
] as const;

const partnerTargets = [
  ["overview", "overview", "po-hero"],
  ["business", "business", "pb-hero"],
  ["business-modes", "business", "pb-modes"],
  ["business-tiers", "business", "pb-tiers"],
  ["business-benefits", "business", "pb-benefits"],
  ["policy", "policy", "pp-hero"],
  ["policy-types", "policy", "pp-types"],
  ["policy-cert", "policy", "pp-cert"],
  ["policy-resources", "policy", "pp-resources"],
  ["training", "training", "pt-hero"],
  ["training-system", "training", "pt-system"],
  ["training-courses", "training", "pt-courses"],
  ["training-path", "training", "pt-path"],
  ["training-resources", "training", "pt-resources"],
  ["become", "become", "pbc-hero"],
] as const;

const downloadKeys = [
  "yuanqi-intro",
  "yuanqi-features",
  "yuanqi-arch",
  "mdd2-intro",
  "mdd2-features",
  "mdd2-env",
  "mdd2-client",
  "mdd2-deploy",
  "mdd2-usage",
  "yuanqi-deploy",
  "wp-ai",
  "wp-llm",
  "wp-agent",
] as const;

const deletedPublicRoutes = [
  "/releases",
  "/releases/2.0.0",
  "/roadmap",
  "/openlab",
  "/compatibility",
  "/marketplace",
  "/marketplace/example",
  "/blog",
  "/blog/platform-release",
  "/cases",
  "/product/hci",
  "/product/knowledge-agent",
  "/product/office-agent",
  "/product/tgdataxai",
  "/product/video-agent",
  "/product/agent-studio",
  "/unregistered-public-placeholder",
] as const;

const reviewChrome = [
  "华鲲官网首期｜低保真评审原型｜已确认内容以结构、内容范围与交互逻辑为准",
  "官网首期低保真原型",
  "华鲲官网首期低保真评审原型｜当前模块按已确认结构与交互逻辑制作",
  "智能问答浮窗",
  "全站接口预留",
] as const;

const viewports = [
  { name: "1440", width: 1440, height: 1000 },
  { name: "900", width: 900, height: 900 },
  { name: "390", width: 390, height: 844 },
] as const;

async function gotoPublicPage(page: Page, href: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(href, { waitUntil: "domcontentloaded" });
  const current = new URL(page.url());
  const target = new URL(href, current);
  if (response) {
    expect(response.status(), href).toBe(200);
  }
  expect(`${current.pathname}${current.search}`, href).toBe(
    `${target.pathname}${target.search}`,
  );
  return response;
}

async function expectNoHorizontalOverflow(page: Page, context: string) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll, context).toBeLessThanOrEqual(widths.client);
}

async function expectProductionShell(page: Page) {
  await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
  await expect(page.locator("body .float")).toHaveCount(0);
  for (const text of reviewChrome) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  }
}

test("桌面 Header 与 390px 移动导航执行 V2 公开入口", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoPublicPage(page, "/");

  await expect(page.locator(".mega-menu__trigger")).toHaveText([
    "首页",
    "产品",
    "解决方案",
    "下载中心",
    "合作伙伴",
  ]);
  await expect(page.locator(".site-actions > .site-contact")).toHaveAttribute(
    "href",
    "/contact",
  );
  await expect(page.locator(".site-actions > .site-trial")).toHaveAttribute(
    "href",
    "/trial",
  );
  await expect(
    page.getByRole("banner").getByRole("link", { name: /登录/u }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("banner").getByRole("link", { name: "文档" }),
  ).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoPublicPage(page, "/");
  const drawer = page.getByRole("dialog", { name: "全站导航" });
  await expect(async () => {
    await page.getByRole("button", { name: "打开导航" }).click();
    await expect(drawer).toBeVisible();
  }).toPass();
  await expect(drawer.getByText("首页", { exact: true })).toBeVisible();
  for (const label of ["产品", "解决方案", "下载中心", "合作伙伴"]) {
    await expect(
      drawer.getByRole("button", { name: new RegExp(`^${label}`) }),
    ).toBeVisible();
  }
  const productAccordion = drawer.getByRole("button", { name: /^产品/u });
  await productAccordion.click();
  const productPanelId = await productAccordion.getAttribute("aria-controls");
  expect(productPanelId).not.toBeNull();
  const productPanel = drawer.locator(`#${productPanelId}`);
  await expect(productPanel).toBeVisible();
  await expect(
    productPanel.getByRole("link", { name: "产品概览" }),
  ).toBeVisible();
  expect(
    await productPanel.evaluate(
      (element) => getComputedStyle(element).borderRadius,
    ),
  ).toBe("12px");
  await expect(drawer.getByText("价格与服务", { exact: true })).toHaveCount(0);
  await expect(
    drawer.getByRole("link", { name: "联系我们", exact: true }),
  ).toHaveAttribute("href", "/contact");
  await expect(
    drawer.getByRole("link", { name: "申请体验", exact: true }),
  ).toHaveAttribute("href", "/trial");
  await expect(drawer.getByRole("link", { name: /登录/u })).toHaveCount(0);
  await expect(drawer.getByRole("link", { name: "文档" })).toHaveCount(0);
});

test("全站公开页 Navbar 与 Product 保持同一尺寸和 Logo", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const href of [
      "/product",
      "/",
      "/solutions/finance-compliance",
      "/downloads",
      "/partners",
      "/pricing",
      "/contact",
      "/trial",
    ]) {
      await gotoPublicPage(page, href);
      await expect(page.locator(".site-header"), href).toHaveCSS(
        "min-height",
        "64px",
      );
      await expect(page.locator(".site-wordmark"), href).toHaveCSS(
        "background-image",
        /logo\.png/u,
      );
      await expect(page.locator(".site-brand-name"), href).toBeHidden();
    }
  }
});

test("1296px 桌面导航下拉完整落在视口内", async ({ page }) => {
  await page.setViewportSize({ width: 1296, height: 768 });
  await gotoPublicPage(page, "/product/agents");

  for (const label of ["产品", "解决方案", "下载中心", "合作伙伴"]) {
    const trigger = page
      .getByRole("banner")
      .getByRole("link", { name: label, exact: true });
    await expect(async () => {
      await trigger.focus();
      await trigger.press("ArrowDown");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
    }).toPass();

    const panelId = await trigger.getAttribute("aria-controls");
    expect(panelId, label).not.toBeNull();
    const panel = page.locator(`#${panelId}`);
    await expect(panel, label).toBeVisible();
    const panelBox = await panel.boundingBox();
    expect(panelBox, label).not.toBeNull();
    expect(panelBox!.x, label).toBeGreaterThanOrEqual(24);
    expect(panelBox!.x + panelBox!.width, label).toBeLessThanOrEqual(1272);

    await page.keyboard.press("Escape");
    await expect(panel, label).toBeHidden();
  }
});

test("桌面 Mega Menu 使用简介栏与产品能力地图布局", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoPublicPage(page, "/product");

  const trigger = page
    .getByRole("banner")
    .getByRole("link", { name: "产品", exact: true });
  await trigger.hover();

  const panel = page.locator('.mega-menu__panel[data-menu-label="产品"]');
  await expect(panel).toBeVisible();
  const intro = panel.getByRole("complementary", { name: "产品简介" });
  const sections = panel.locator(".mega-menu__sections");
  const featured = panel
    .getByRole("heading", { name: "独立产品中心", level: 3 })
    .locator("..");

  const [panelStyle, introBox, sectionsBox, firstBox, featuredBox] =
    await Promise.all([
      panel.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          backdropFilter: style.backdropFilter,
          borderRadius: style.borderRadius,
          display: style.display,
        };
      }),
      intro.boundingBox(),
      sections.boundingBox(),
      panel.locator(".mega-menu__section").first().boundingBox(),
      featured.boundingBox(),
    ]);

  expect(panelStyle.display).toBe("grid");
  expect(panelStyle.borderRadius).toBe("18px");
  expect(panelStyle.backdropFilter).toContain("blur");
  expect(introBox).not.toBeNull();
  expect(sectionsBox).not.toBeNull();
  expect(firstBox).not.toBeNull();
  expect(featuredBox).not.toBeNull();
  expect(introBox!.x + introBox!.width).toBeLessThan(sectionsBox!.x);
  expect(featuredBox!.x).toBeGreaterThan(firstBox!.x);
  expect(featuredBox!.height).toBeGreaterThan(firstBox!.height);
});

test("代表公开页的唯一 Agent launcher 可打开关闭并恢复焦点", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/product/model-task-center",
    "/solutions/finance-compliance",
  ]) {
    await gotoPublicPage(page, path);
    const launcher = page.getByRole("button", { name: "打开码多多" });
    await expect(launcher, path).toHaveCount(1);
    const dialog = page.getByRole("dialog", { name: "码多多" });
    await expect(async () => {
      await launcher.click();
      await expect(dialog).toBeVisible();
    }).toPass();
    await dialog
      .getByRole("button", { name: "关闭码多多", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(launcher).toBeFocused();
  }
});

test("43 个 prototype page key 在三档宽度承接、无横溢且同源内链可达", async ({
  page,
}) => {
  test.setTimeout(600_000);
  const requestTargets = new Set<string>();
  const screenshotDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/full-public-site-overlay",
  );
  await mkdir(screenshotDirectory, { recursive: true });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const [key, path] of prototypePages) {
      await gotoPublicPage(page, path);
      await expect(page.locator("main h1").first(), key).toBeVisible();
      await expectNoHorizontalOverflow(page, `${key} at ${viewport.width}px`);
      await expectProductionShell(page);

      if (viewport.width === 1440) {
        const hrefs = await page
          .locator("main a[href]")
          .evaluateAll((links) =>
            links.map((link) =>
              (link as HTMLAnchorElement).getAttribute("href"),
            ),
          );
        const currentOrigin = new URL(page.url()).origin;
        for (const href of hrefs) {
          if (!href) continue;
          const url = new URL(href, currentOrigin);
          if (url.origin === currentOrigin) {
            requestTargets.add(`${url.pathname}${url.search}`);
          }
        }
      }

      if (
        (viewport.width === 1440 || viewport.width === 390) &&
        ["home", "model-task-center", "solutions"].includes(key)
      ) {
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          animations: "disabled",
          fullPage: true,
          path: resolve(screenshotDirectory, `${key}-${viewport.name}.png`),
        });
      }
    }
  }

  for (const href of requestTargets) {
    const response = await page.request.get(href);
    expect(response.status(), href).toBeLessThan(400);
  }
});

test("15 个 partner key 均由 query 与 hash 对应的真实目标承接", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const [key, view, hash] of partnerTargets) {
    await gotoPublicPage(page, `/partners?view=${view}#${hash}`);
    await expect(page.locator(".partner-main")).toHaveAttribute(
      "data-partner-view",
      view,
    );
    await expect(page.locator(`#${hash}`), key).toHaveAttribute(
      "data-partner-target",
      key,
    );
  }
});

test("13 个 download key 均由真实资源锚点承接", async ({ page }) => {
  test.setTimeout(120_000);
  for (const key of downloadKeys) {
    await gotoPublicPage(page, `/downloads#dl-${key}`);
    const resource = page.locator(`[data-download-key="${key}"]`);
    await expect(resource).toHaveCount(1);
    await expect(resource).toBeVisible();
  }
});

test("原型外公开路由全部返回 404", async ({ request }) => {
  for (const path of deletedPublicRoutes) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test("保留 support、help、docs 与无数据库依赖的 auth 页面壳", async ({
  page,
}) => {
  for (const [path, heading] of [
    ["/support", "客户支持"],
    ["/help", "帮助中心"],
  ] as const) {
    await gotoPublicPage(page, path);
    await expect(
      page.getByRole("heading", { level: 1, name: heading, exact: true }),
    ).toBeVisible();
  }

  await gotoPublicPage(page, "/docs");
  await expect(page.locator(".public-docs-chrome__navbar")).toHaveCount(1);
  await expect(
    page.locator(".doc-reader__title, .doc-reader__unavailable"),
  ).toHaveCount(1);

  for (const [path, heading] of [
    ["/login", "登录客户控制台"],
    ["/staff/login", "员工安全登录"],
  ] as const) {
    await gotoPublicPage(page, path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("数据库可用时保持 register 与匿名 console/admin 原访问行为", async ({
  page,
}) => {
  test.skip(
    !process.env.DATABASE_URL && !process.env.RUNTIME_DATABASE_URL,
    "retained access routes require the isolated identity E2E database",
  );

  await gotoPublicPage(page, "/register");
  await expect(
    page.getByRole("heading", { name: "申请客户账号" }),
  ).toBeVisible();

  await page.goto("/console");
  await expect(page).toHaveURL(/\/login(?:\?|$)/u);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/staff\/login(?:\?|$)/u);
});
