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
  ["solutions", "/solutions"],
  ["solution-detail", "/solutions/knowledge-service"],
  ["downloads", "/downloads"],
  ["partners", "/partners"],
  ["pricing", "/pricing"],
  ["contact", "/contact"],
  ["trial", "/trial"],
] as const;

const commonSolutionKeys = [
  "private-yuanqi",
  "cluster-planning",
  "compute-monitoring",
  "model-evaluation",
  "model-deployment",
  "knowledge-service",
  "document-intelligence",
  "data-insight",
  "knowledge-assets",
  "unstructured-data",
  "process-automation",
  "enterprise-assistant",
  "multi-agent",
  "video-intelligence",
] as const;

const industrySolutionKeys = [
  "government-knowledge",
  "government-data",
  "government-document",
  "government-process",
  "finance-knowledge",
  "finance-data",
  "finance-document",
  "finance-assistant",
  "healthcare-knowledge",
  "healthcare-data",
  "healthcare-document",
  "healthcare-process",
  "enterprise-knowledge",
  "enterprise-data",
  "enterprise-document",
  "enterprise-process",
  "enterprise-multi-agent",
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
  if (response) {
    expect(response.status(), href).toBe(200);
  } else {
    const current = new URL(page.url());
    const target = new URL(href, current);
    expect(`${current.pathname}${current.search}`, href).toBe(
      `${target.pathname}${target.search}`,
    );
  }
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

test("桌面 Header 与 390px 移动导航执行批准的八个公开入口", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoPublicPage(page, "/");

  await expect(page.locator(".mega-menu__trigger")).toHaveText([
    "首页",
    "产品",
    "解决方案",
    "下载中心",
    "合作伙伴",
    "价格与服务",
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
  await page.getByRole("button", { name: "打开导航" }).click();
  const drawer = page.getByRole("dialog", { name: "全站导航" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("首页", { exact: true })).toBeVisible();
  for (const label of ["产品", "解决方案", "下载中心", "合作伙伴"]) {
    await expect(
      drawer.getByRole("button", { name: new RegExp(`^${label}`) }),
    ).toBeVisible();
  }
  await expect(
    drawer.getByRole("link", { name: "价格与服务", exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByRole("link", { name: "联系我们", exact: true }),
  ).toHaveAttribute("href", "/contact");
  await expect(
    drawer.getByRole("link", { name: "申请体验", exact: true }),
  ).toHaveAttribute("href", "/trial");
  await expect(drawer.getByRole("link", { name: /登录/u })).toHaveCount(0);
  await expect(drawer.getByRole("link", { name: "文档" })).toHaveCount(0);
});

test("代表公开页的唯一 Agent launcher 可打开关闭并恢复焦点", async ({
  page,
}) => {
  for (const path of ["/", "/product/model-task-center", "/solutions"]) {
    await gotoPublicPage(page, path);
    const launcher = page.getByRole("button", { name: "打开码多多" });
    await expect(launcher, path).toHaveCount(1);
    await launcher.click();
    const dialog = page.getByRole("dialog", { name: "码多多" });
    await expect(dialog).toBeVisible();
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

test("14 个通用、17 个行业与 1 个案例详情全部真实承接", async ({ page }) => {
  test.setTimeout(180_000);
  for (const key of [
    ...commonSolutionKeys,
    ...industrySolutionKeys,
    "case-pending-enterprise-knowledge",
  ]) {
    await gotoPublicPage(page, `/solutions/${key}`);
    await expect(page.locator("main.solution-detail h1")).toHaveCount(1);
    await expect(page.locator("main.solution-detail h1")).toBeVisible();
    await expectProductionShell(page);
  }
});

test("七种 solution view 均由真实列表或详情状态承接", async ({ page }) => {
  const views = [
    ["overview", "/solutions", "main.solutions-page", "overview"],
    [
      "list",
      "/solutions?view=scenarios&category=knowledge#solution-scenarios-directory",
      "main.solutions-page",
      "scenarios",
    ],
    ["detail", "/solutions/private-yuanqi", "main.solution-detail", null],
    [
      "industry-list",
      "/solutions?view=industries&industry=finance#industry-solutions-list",
      "main.solutions-page",
      "industries",
    ],
    [
      "industry-detail",
      "/solutions/government-knowledge",
      "main.solution-detail",
      null,
    ],
    [
      "case-list",
      "/solutions?view=cases&mode=scenario#practice-cases-list",
      "main.solutions-page",
      "cases",
    ],
    [
      "case-detail",
      "/solutions/case-pending-enterprise-knowledge?mode=scenario",
      "main.solution-detail",
      null,
    ],
  ] as const;

  for (const [key, path, selector, view] of views) {
    await gotoPublicPage(page, path);
    const main = page.locator(selector);
    await expect(main, key).toHaveCount(1);
    await expect(main.locator("h1")).toBeVisible();
    if (view) await expect(main).toHaveAttribute("data-solution-view", view);
  }
});

test("全部 solution list filter query key 读取目录状态并落到批准锚点", async ({
  page,
}) => {
  const filters = [
    {
      key: "scenarios-all",
      href: "/solutions?view=scenarios#solution-scenarios-directory",
      view: "scenarios",
      filter: "all",
      current: "通用场景方案",
      target: "#solution-scenarios-directory",
    },
    {
      key: "scenarios-infrastructure",
      href: "/solutions?view=scenarios&category=infrastructure#solution-scenarios-directory",
      view: "scenarios",
      filter: "infrastructure",
      current: "基础设施与模型工程",
      target: "#solution-scenarios-directory",
    },
    {
      key: "scenarios-knowledge",
      href: "/solutions?view=scenarios&category=knowledge#solution-scenarios-directory",
      view: "scenarios",
      filter: "knowledge",
      current: "知识与数据智能",
      target: "#solution-scenarios-directory",
    },
    {
      key: "scenarios-agents",
      href: "/solutions?view=scenarios&category=agents#solution-scenarios-directory",
      view: "scenarios",
      filter: "agents",
      current: "智能体与业务应用",
      target: "#solution-scenarios-directory",
    },
    {
      key: "industries-all",
      href: "/solutions?view=industries#industry-solutions-list",
      view: "industries",
      filter: "all",
      current: "行业解决方案",
      target: "#industry-solutions-list",
    },
    {
      key: "industries-government",
      href: "/solutions?view=industries&industry=government#industry-solutions-list",
      view: "industries",
      filter: "government",
      current: "政务",
      target: "#industry-solutions-list",
    },
    {
      key: "industries-finance",
      href: "/solutions?view=industries&industry=finance#industry-solutions-list",
      view: "industries",
      filter: "finance",
      current: "金融",
      target: "#industry-solutions-list",
    },
    {
      key: "industries-healthcare",
      href: "/solutions?view=industries&industry=healthcare#industry-solutions-list",
      view: "industries",
      filter: "healthcare",
      current: "医疗",
      target: "#industry-solutions-list",
    },
    {
      key: "industries-enterprise",
      href: "/solutions?view=industries&industry=enterprise#industry-solutions-list",
      view: "industries",
      filter: "enterprise",
      current: "企业智能化",
      target: "#industry-solutions-list",
    },
    {
      key: "cases-all",
      href: "/solutions?view=cases&mode=all#practice-cases-hero",
      view: "cases",
      filter: "all",
      current: "实践案例",
      target: "#practice-cases-hero",
    },
    {
      key: "cases-industry",
      href: "/solutions?view=cases&mode=industry#practice-cases-list",
      view: "cases",
      filter: "industry",
      current: "按行业查看",
      target: "#practice-cases-list",
    },
    {
      key: "cases-scenario",
      href: "/solutions?view=cases&mode=scenario#practice-cases-list",
      view: "cases",
      filter: "scenario",
      current: "按业务场景查看",
      target: "#practice-cases-list",
    },
  ] as const;

  for (const contract of filters) {
    await gotoPublicPage(page, contract.href);
    const currentUrl = new URL(page.url());
    expect(
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
      contract.key,
    ).toBe(contract.href);

    const main = page.locator("main.solutions-page");
    await expect(main).toHaveAttribute("data-solution-view", contract.view);
    await expect(main).toHaveAttribute("data-solution-filter", contract.filter);
    await expect(page.locator(contract.target), contract.key).toBeVisible();
    await expect(
      page
        .locator('a[aria-current="location"]')
        .filter({ hasText: contract.current }),
      contract.key,
    ).toHaveAttribute("href", contract.href);
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
