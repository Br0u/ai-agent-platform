import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const pages = [
  {
    key: "products",
    path: "/product",
    title: "独立产品中心：成熟企业级 AI 产品，独立安装、下载即用",
    sections: [
      "独立产品中心：面向明确场景、即装即用的企业级 AI 产品",
      "三个独立产品，各自解决一类问题",
      "关于独立产品，你可能关心的问题",
      "需要为业务引入成熟 AI 产品？",
    ],
    texts: [
      "点击卡片查看产品详情。",
      "如需了解或采购码多多 2.0、AIPPT、AISHREK，欢迎与华鲲团队联系，获取产品详情与选型建议。",
    ],
    absentTexts: ["产品｜独立产品中心", "01｜产品矩阵"],
    counts: {
      "standalone-value-card": 2,
      "standalone-product-card": 3,
      "standalone-faq-card": 3,
    },
  },
  {
    key: "key-products",
    path: "/product/standalone",
    title: "独立产品中心：成熟企业级 AI 产品，独立安装、下载即用",
    sections: [
      "独立产品中心：面向明确场景、即装即用的企业级 AI 产品",
      "三个独立产品，各自解决一类问题",
      "关于独立产品，你可能关心的问题",
      "需要为业务引入成熟 AI 产品？",
    ],
    texts: [
      "点击卡片查看产品详情。",
      "如需了解或采购码多多 2.0、AIPPT、AISHREK，欢迎与华鲲团队联系，获取产品详情与选型建议。",
    ],
    absentTexts: ["产品｜独立产品中心", "01｜产品矩阵"],
    counts: {
      "standalone-value-card": 2,
      "standalone-product-card": 3,
      "standalone-faq-card": 3,
    },
  },
  {
    key: "mdd-2",
    path: "/product/code-agent",
    title: "码里奥：让每一位企业工作者，都有 AI 搭档。",
    sections: [
      "码里奥：自然语言驱动工程落地的企业级 AI 编程软件",
      "Skill 技能生态：可复用技能，随需调用与编排",
      "MCP 工具集成：打破工具边界，连接企业系统",
      "自然语言开发：描述需求，直接生成工程文件",
      "研发生态协同：多模型集成，融入企业研发体系",
      "让企业 AI 编程真正落地，持续创造价值",
    ],
    absentSections: [
      "Skill 技能生态、MCP 工具集成、自然语言开发与研发生态协同",
      "说需求 → 分析项目上下文 → 生成代码 → 运行验证",
    ],
    counts: {
      "detail-hero-tag": 4,
      "detail-introduction-card": 2,
      "detail-capability": 4,
      "detail-capability-step": 12,
      "detail-capability-note": 4,
      "detail-security-item": 0,
      "detail-scene": 0,
    },
  },
  {
    key: "aippt",
    path: "/product/aippt",
    title: "AIPPT：一站式智能演示文稿创作平台",
    sections: [
      "AIPPT：从内容梳理到版式生成的一站式智能创作",
      "参考资料驱动：内容有据可依，贴合原始材料",
      "三种渲染模式：按需成稿，从简约到臻制",
      "自然语言微调：对话调整，所见即所得",
      "人机双写内容：AI 生成初稿，逐字逐图可编辑",
      "开启高效智能的演示文稿创作体验",
    ],
    absentSections: [
      "参考资料驱动、三种渲染模式、自然语言微调与人机双写",
      "内容、模式、微调与编辑一条链路完成",
    ],
    counts: {
      "detail-hero-tag": 5,
      "detail-introduction-card": 2,
      "detail-capability": 4,
      "detail-capability-step": 12,
      "detail-capability-note": 4,
      "detail-security-item": 0,
      "detail-scene": 0,
    },
  },
  {
    key: "aishrek",
    path: "/product/aishrek",
    title: "AISHREK：AI 机械设计工作台，导入即解读、文生即改型",
    sections: [
      "AISHREK：自然语言驱动改型的机械设计工作台",
      "自然语言 CAD：以自然语言描述需求，直接驱动参数改型",
      "原生精密联动：原生改参数，精密动装配",
      "多维仿真 CAE：结构仿真与动力学分析一体",
      "开启智能机械设计体验",
    ],
    absentSections: [
      "自然语言 CAD、原生精密联动与多维仿真 CAE",
      "自然语言驱动改型，联动仿真验证",
    ],
    counts: {
      "detail-hero-tag": 3,
      "detail-introduction-card": 2,
      "detail-capability": 3,
      "detail-capability-step": 9,
      "detail-capability-note": 3,
      "detail-security-item": 0,
      "detail-scene": 0,
    },
  },
] as const;

async function gotoProduct(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main.product-portal")).toBeVisible();
  return response;
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function scrollWithinOnePixelOfBottom(page: Page) {
  await page.evaluate((distance) => {
    const scrollRange =
      Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      ) - window.innerHeight;
    window.scrollTo(0, Math.max(0, scrollRange - distance));
  }, 0.5);
}

async function openMobileProductDirectory(page: Page) {
  const trigger = page.locator(".product-directory-mobile-trigger");
  const dialog = page.getByRole("dialog", { name: "产品目录" });

  await expect(trigger).toBeVisible();
  await expect
    .poll(async () => {
      if ((await trigger.getAttribute("aria-expanded")) !== "true") {
        await trigger.click();
      }
      return trigger.getAttribute("aria-expanded");
    })
    .toBe("true");
  await expect(dialog).toBeVisible();

  return dialog;
}

async function expectMobileProductDirectoryContract(page: Page) {
  const trigger = page.locator(".product-directory-mobile-trigger");
  await expectNoHorizontalOverflow(page);
  const dialog = await openMobileProductDirectory(page);
  const search = dialog.getByRole("searchbox", {
    name: "在产品目录中筛选",
  });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("hidden");

  const first = dialog.getByRole("button", { name: "关闭产品目录" });
  const focusables = dialog.locator(
    "a[href]:visible, button:not([disabled]):visible, input:not([disabled]):visible",
  );
  const last = focusables.last();
  await last.focus();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("");
  await expectNoHorizontalOverflow(page);
  await expect(search).toHaveCount(0);
}

const detailVisualContracts = [
  { path: "/product/code-agent", imageCount: 5 },
  { path: "/product/aippt", imageCount: 5 },
  { path: "/product/aishrek", imageCount: 4 },
] as const;

const centerContracts = [
  {
    path: "/product/model",
    title: "模型中心：覆盖模型全生命周期的企业模型工程",
    capabilities: 4,
    images: 5,
  },
  {
    path: "/product/agents",
    title: "智能体中心：零代码快速搭建，低代码灵活编排",
    capabilities: 4,
    images: 8,
  },
  {
    path: "/product/applications",
    title: "行业应用中心：高频业务场景，成熟应用开箱即用",
    capabilities: 3,
    images: 3,
  },
  {
    path: "/product/skills",
    title: "技能中心：专业能力标准封装，统一管理、随取随用",
    capabilities: 3,
    images: 1,
  },
  {
    path: "/product/coding",
    title: "码多多：自然语言驱动开发，双模式执行与工具链落地",
    capabilities: 3,
    images: 2,
  },
  {
    path: "/product/governance",
    title: "权限中心：用户角色授权统一管理，权限边界清晰可控",
    capabilities: 1,
    images: 1,
  },
] as const;

const productDirectoryContract = [
  ["独立产品中心", "/product"],
  ["码里奥", "/product/code-agent"],
  ["Skill 技能生态", "/product/code-agent#mdd2-skill"],
  ["MCP 工具集成", "/product/code-agent#mdd2-mcp"],
  ["自然语言开发", "/product/code-agent#mdd2-dev"],
  ["研发生态协同", "/product/code-agent#mdd2-eco"],
  ["AIPPT", "/product/aippt"],
  ["参考资料驱动", "/product/aippt#aippt-ref"],
  ["三种渲染模式", "/product/aippt#aippt-mode"],
  ["自然语言微调", "/product/aippt#aippt-gen"],
  ["人机双写内容", "/product/aippt#aippt-export"],
  ["AISHREK", "/product/aishrek"],
  ["自然语言 CAD", "/product/aishrek#aishrek-import"],
  ["原生精密联动", "/product/aishrek#aishrek-chat"],
  ["多维仿真 CAE", "/product/aishrek#aishrek-link"],
  ["智能体中心", "/product/agents"],
  ["知识智能体", "/product/agent-knowledge"],
  ["数据智能体", "/product/data-agent"],
  ["视频智能体", "/product/agent-video"],
  ["流程编排智能体", "/product/agent-orchestration"],
  ["行业应用中心", "/product/applications"],
  ["通用文本写作", "/product/app-writing"],
  ["投标智能助手", "/product/app-bidding"],
  ["合同智能审查", "/product/app-contract"],
  ["技能中心", "/product/skills"],
  ["研发类技能", "/product/skills-programming"],
  ["应用类技能", "/product/skills-application"],
  ["办公类技能", "/product/skills-office"],
  ["模型中心", "/product/model"],
  ["模型资产管理", "/product/model-assets"],
  ["模型部署与服务", "/product/model-deploy"],
  ["模型训练", "/product/model-training"],
  ["模型评估", "/product/model-evaluation"],
  ["编程中心", "/product/coding"],
  ["自然语言开发", "/product/coding-session"],
  ["双模式工作流", "/product/coding-project"],
  ["内置工具链", "/product/coding-standard"],
  ["权限中心", "/product/governance"],
  ["权限管理", "/product/governance#gov-caps"],
  ["行级权限", "/product/governance#gov-permission"],
] as const;

test("产品路由族延续首页导航和 Logo", async ({ page }) => {
  await gotoProduct(page, "/product");

  await expect(page.locator(".site-header")).toHaveCSS("min-height", "64px");
  await expect(page.locator(".site-wordmark")).toHaveCSS(
    "background-image",
    /logo\.png/u,
  );
  await expect(page.locator(".site-brand-name")).toBeHidden();
  await expect(page.locator(".portal-footer__main")).toBeHidden();
  await expect(page.locator(".portal-footer__meta span:visible")).toHaveText(
    "备案信息（占位）",
  );

  await gotoProduct(page, "/product/code-agent");
  await expect(page.locator(".site-wordmark")).toHaveCSS(
    "background-image",
    /logo\.png/u,
  );
  await expect(page.locator(".site-brand-name")).toBeHidden();
});

test("产品 Hero 单独承载渐隐极光且不影响站点外层", async ({
  page,
}, testInfo) => {
  await gotoProduct(page, "/product/agents");

  const portal = page.locator("main.product-portal");
  const hero = portal.locator(":scope > .product-portal-hero");
  await expect(portal).not.toHaveCSS(
    "background-image",
    /product-aurora-field-v1\.png/u,
  );
  await expect(hero).toHaveCSS(
    "background-image",
    /product-aurora-field-v1\.png/u,
  );

  const card = portal.locator(".product-portal-card").first();
  await expect(card).not.toHaveCSS("box-shadow", "none");
  await expect(card).not.toHaveCSS("backdrop-filter", "none");

  if (testInfo.project.name !== "mobile") {
    await page.getByRole("button", { name: "展开产品目录" }).click();
  }
  const currentDirectoryLink =
    testInfo.project.name === "mobile"
      ? page.getByRole("button", { name: "打开产品目录" })
      : page
          .getByRole("complementary", { name: "产品目录" })
          .getByRole("link", { name: "智能体中心" });
  await expect(currentDirectoryLink).not.toHaveCSS("box-shadow", "none");

  await expect(page.locator(".site-header")).toHaveCSS("min-height", "64px");
  await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.locator(".product-directory > .product-directory-tools button"),
  ).toHaveCSS("transition-duration", "0s");
});

test("产品目录在桌面静默折叠并在移动断点移除进度轨", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  for (const viewport of [
    { width: 1440, height: 980 },
    { width: 901, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await gotoProduct(page, "/product/code-agent");
    await page.mouse.move(viewport.width - 1, 1);

    const directory = page.getByRole("complementary", { name: "产品目录" });
    const toggle = page.getByRole("button", { name: "展开产品目录" });
    const content = page.locator(".product-directory-content");
    const contentX = await content.evaluate(
      (element) => element.getBoundingClientRect().x,
    );
    expect(contentX).toBe(0);
    await expect(directory).toHaveCSS("width", "44px");
    await expect(directory).toHaveCSS("height", `${viewport.height - 104}px`);
    await expect(directory).toHaveCSS("border-radius", "18px");
    await expect(directory).toHaveCSS("margin-top", "20px");
    await expect(directory).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
    await expect(directory).toHaveCSS("background-image", "none");
    await expect(directory).toHaveCSS("backdrop-filter", "none");
    await expect(directory).toHaveCSS("box-shadow", "none");
    await expect(page.locator(".product-directory-tools")).toHaveCSS(
      "backdrop-filter",
      "none",
    );
    await expect(toggle).toHaveCSS("width", "28px");
    await expect(toggle).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(toggle).toHaveCSS("box-shadow", "none");
    await expect(toggle).toHaveCSS("opacity", "0.62");
    await expect(page.getByTestId("directory-progress-rail")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expectNoHorizontalOverflow(page);

    await directory.hover();
    await expect(directory).toHaveCSS("width", "240px");
    await expect(directory).toHaveCSS("backdrop-filter", /blur\(28px\)/u);
    await expect(directory.getByRole("searchbox")).toBeVisible();
    await expect(page.getByTestId("directory-progress-rail")).toHaveCSS(
      "opacity",
      "0",
    );
    expect(
      await content.evaluate((element) => element.getBoundingClientRect().x),
    ).toBe(contentX);

    await content.hover({ position: { x: 320, y: 200 } });
    await expect(directory).toHaveCSS("width", "44px");

    await toggle.focus();
    await expect(directory).toHaveCSS("width", "240px");
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await expect(directory).toHaveCSS("width", "44px");

    await expectNoHorizontalOverflow(page);
  }

  for (const width of [900, 800, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await gotoProduct(page, "/product/code-agent");
    await expect(page.getByTestId("directory-progress-rail")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "打开产品目录" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (width !== 390) await expectMobileProductDirectoryContract(page);
  }
});

test("产品路由族使用 V2 目录，联系与试用页不加该目录", async ({
  page,
}, testInfo) => {
  await gotoProduct(page, "/product/code-agent");
  if (testInfo.project.name === "mobile") {
    const drawer = await openMobileProductDirectory(page);
    await expect(
      drawer.getByRole("link", { name: "Skill 技能生态" }),
    ).toHaveAttribute("aria-current", "location");
  } else {
    await page.getByRole("button", { name: "展开产品目录" }).click();
    const directory = page.getByRole("complementary", { name: "产品目录" });
    await expect(directory).toBeVisible();
    await expect(
      directory.getByRole("link", { name: "Skill 技能生态" }),
    ).toHaveAttribute("aria-current", "location");
  }

  for (const path of ["/contact", "/trial"]) {
    await page.goto(path);
    await expect(page.locator(".product-directory-layout")).toHaveCount(0);
  }
});

test("产品目录严格使用 V2 层级、真实路由和详情锚点", async ({
  page,
}, testInfo) => {
  await gotoProduct(page, "/product/code-agent");
  const directory =
    testInfo.project.name === "mobile"
      ? page.getByRole("dialog", { name: "产品目录" })
      : page.getByRole("complementary", { name: "产品目录" });
  if (testInfo.project.name === "mobile") {
    await openMobileProductDirectory(page);
  } else {
    await page.getByRole("button", { name: "展开产品目录" }).click();
  }

  const links = await directory
    .getByRole("link")
    .evaluateAll((items) =>
      items.map((item) => [
        item.textContent,
        new URL((item as HTMLAnchorElement).href).pathname +
          new URL((item as HTMLAnchorElement).href).hash,
      ]),
    );
  expect(links).toEqual(productDirectoryContract);

  await directory.getByRole("link", { name: "MCP 工具集成" }).click();
  await expect(page).toHaveURL(/\/product\/code-agent#mdd2-mcp$/u);
  await expect(page.locator("#mdd2-mcp")).toBeVisible();

  if (testInfo.project.name === "mobile") {
    await openMobileProductDirectory(page);
  }
  const currentDirectory =
    testInfo.project.name === "mobile"
      ? page.getByRole("dialog", { name: "产品目录" })
      : page.getByRole("complementary", { name: "产品目录" });
  await expect(
    currentDirectory.getByRole("link", { name: "MCP 工具集成" }),
  ).toHaveAttribute("aria-current", "location");
});

test("产品能力滚动同步目录位置且不改写地址", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 1440, height: 980 });
  await gotoProduct(page, "/product/code-agent");
  await page.getByRole("button", { name: "展开产品目录" }).click();

  const directory = page.getByRole("complementary", { name: "产品目录" });
  const initialUrl = page.url();
  await page.locator("#mdd2-mcp").scrollIntoViewIfNeeded();
  await expect(
    directory.getByRole("link", { name: "MCP 工具集成" }),
  ).toHaveAttribute("aria-current", "location");
  expect(page.url()).toBe(initialUrl);

  await scrollWithinOnePixelOfBottom(page);
  await expect(
    directory.getByRole("link", { name: "研发生态协同" }),
  ).toHaveAttribute("aria-current", "location");
  expect(page.url()).toBe(initialUrl);
});

test("移动产品目录通过真实链接导航并更新当前项", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoProduct(page, "/product/code-agent");

  const drawer = await openMobileProductDirectory(page);
  await drawer.getByRole("link", { name: "AIPPT" }).click();

  await expect(page).toHaveURL(/\/product\/aippt$/u);
  await expect(page.getByRole("dialog", { name: "产品目录" })).toHaveCount(0);
  const currentDrawer = await openMobileProductDirectory(page);
  await expect(
    currentDrawer.getByRole("link", { name: "参考资料驱动" }),
  ).toHaveAttribute("aria-current", "location");
  await currentDrawer.getByRole("button", { name: "关闭产品目录" }).click();
  await expect(currentDrawer).toHaveCount(0);
});

test("移动产品目录跨到桌面断点后释放页面状态", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoProduct(page, "/product/code-agent");

  const content = page.locator(".product-directory-content");
  await openMobileProductDirectory(page);
  await expect(content).toHaveAttribute("aria-hidden", "true");
  await expect(content).toHaveAttribute("inert", "");
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("hidden");

  await page.setViewportSize({ width: 1200, height: 900 });

  await expect(page.getByRole("dialog", { name: "产品目录" })).toHaveCount(0);
  await expect(content).not.toHaveAttribute("aria-hidden", "true");
  await expect(content).not.toHaveAttribute("inert", "");
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("");
});

test("移动产品目录隔离并恢复真实站点外层交互", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await gotoProduct(page, "/product");

  const backgrounds = [
    page.locator(".site-header"),
    page.locator(".portal-footer"),
    page.locator(".floating-assistant"),
    page.locator(".product-directory-content"),
  ];
  for (const background of backgrounds) {
    await expect(background).not.toHaveAttribute("aria-hidden");
    await expect(background).not.toHaveAttribute("inert");
  }

  const dialog = await openMobileProductDirectory(page);
  for (const background of backgrounds) {
    await expect(background).toHaveAttribute("aria-hidden", "true");
    await expect(background).toHaveAttribute("inert", "");
  }

  await dialog.getByRole("button", { name: "关闭产品目录" }).click();
  await expect(dialog).toHaveCount(0);
  for (const background of backgrounds) {
    await expect(background).not.toHaveAttribute("aria-hidden");
    await expect(background).not.toHaveAttribute("inert");
  }
  await expect(
    page.getByRole("button", { name: "打开产品目录" }),
  ).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("");
});

test("五个产品页面返回原型标题并只使用 shell 聊天入口", async ({ page }) => {
  for (const { path, title } of pages) {
    const response = await gotoProduct(page, path);

    expect(response?.status(), path).toBe(200);
    const heading = page.getByRole("heading", {
      exact: true,
      level: 1,
      name: title,
    });
    await expect(heading).toHaveCount(1);
    await expect(heading).toBeVisible();
    await expect(
      page.locator("main.product-portal .floating-assistant"),
    ).toHaveCount(0);
    await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
  }
});

test("五个原型 key 在正式路由执行完整页面合同", async ({ page }) => {
  for (const contract of pages) {
    await gotoProduct(page, contract.path);

    for (const title of contract.sections) {
      await expect(
        page.getByRole("heading", { exact: true, level: 2, name: title }),
        `${contract.key} section: ${title}`,
      ).toHaveCount(1);
    }
    for (const title of "absentSections" in contract
      ? contract.absentSections
      : []) {
      await expect(
        page.getByRole("heading", { exact: true, level: 2, name: title }),
        `${contract.key} absent section: ${title}`,
      ).toHaveCount(0);
    }
    for (const copy of "texts" in contract ? contract.texts : []) {
      await expect(page.getByText(copy, { exact: true })).toHaveCount(1);
    }
    for (const copy of "absentTexts" in contract ? contract.absentTexts : []) {
      await expect(page.getByText(copy, { exact: true })).toHaveCount(0);
    }
    for (const [testId, count] of Object.entries(contract.counts)) {
      await expect(
        page.getByTestId(testId),
        `${contract.key} ${testId}`,
      ).toHaveCount(count);
    }
  }
});

test("五个产品页面内部链接没有 404 或服务端错误", async ({ page }) => {
  for (const { path } of pages) {
    await gotoProduct(page, path);
    const hrefs = await page
      .locator("main.product-portal a")
      .evaluateAll((links) => [
        ...new Set(
          links
            .map((link) => new URL((link as HTMLAnchorElement).href))
            .filter((url) => url.origin === window.location.origin)
            .map((url) => `${url.pathname}${url.search}`),
        ),
      ]);

    for (const href of hrefs) {
      const response = await page.request.get(href);
      expect(response.status(), `${path} → ${href}`).toBeLessThan(400);
    }
  }
});

test("六个产品中心按 V2 原型渲染并加载全部本地素材", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");

  for (const contract of centerContracts) {
    await gotoProduct(page, contract.path);

    const portal = page.locator("main.platform-center");
    const hero = portal.locator(":scope > .product-portal-hero");
    const images = portal.getByRole("img");

    await expect(
      portal.getByRole("heading", {
        exact: true,
        level: 1,
        name: contract.title,
      }),
    ).toHaveCount(1);
    await expect(portal.getByTestId("platform-center-section")).toHaveCount(1);
    await expect(portal.getByTestId("platform-center-capability")).toHaveCount(
      contract.capabilities,
    );
    await expect(images).toHaveCount(contract.images);
    await expect(portal.getByTestId("platform-center-business")).toHaveCount(0);
    await expect(portal.getByTestId("platform-center-cta")).toHaveCount(1);
    expect((await hero.boundingBox())?.height).toBeLessThan(720);

    for (let index = 0; index < contract.images; index += 1) {
      await images.nth(index).scrollIntoViewIfNeeded();
    }
    await expect
      .poll(() =>
        images.evaluateAll((items) =>
          items.every(
            (item) =>
              (item as HTMLImageElement).complete &&
              (item as HTMLImageElement).naturalWidth > 0,
          ),
        ),
      )
      .toBe(true);
  }

  await gotoProduct(page, "/product/agents");
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "知识智能体：将企业文档、制度与经验沉淀为可问答、可溯源的知识服务",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("让企业拥有懂知识、懂业务、懂流程的 AI 助手", {
      exact: true,
    }),
  ).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  expect(
    await page
      .getByTestId("platform-center-capability")
      .evaluateAll((items) =>
        items.every(
          (item) =>
            getComputedStyle(item).gridTemplateColumns.split(" ").length === 1,
        ),
      ),
  ).toBe(true);
});

test("三款产品详情加载全部原型图片并保持 premium 交替布局", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");

  for (const contract of detailVisualContracts) {
    await page.setViewportSize({ width: 1200, height: 900 });
    await gotoProduct(page, contract.path);

    const portal = page.locator("main.product-detail");
    const images = portal.locator(
      ".product-detail-hero-image img, .product-detail-capability-media img",
    );
    const capabilities = portal.getByTestId("detail-capability");

    await expect(images).toHaveCount(contract.imageCount);
    for (let index = 0; index < contract.imageCount; index += 1) {
      await images.nth(index).scrollIntoViewIfNeeded();
    }
    await expect
      .poll(() =>
        images.evaluateAll((items) =>
          items.every(
            (item) =>
              (item as HTMLImageElement).complete &&
              (item as HTMLImageElement).naturalWidth > 0,
          ),
        ),
      )
      .toBe(true);

    const premium = await portal.evaluate((node) => {
      const portalStyle = getComputedStyle(node);
      const card = node.querySelector<HTMLElement>(
        ".product-detail-capability",
      );
      const cardStyle = card ? getComputedStyle(card) : null;
      return {
        blue: portalStyle.getPropertyValue("--portal-blue").trim(),
        violet: portalStyle.getPropertyValue("--portal-violet").trim(),
        radius: cardStyle?.borderRadius,
        shadow: cardStyle?.boxShadow,
      };
    });
    expect(premium).toMatchObject({
      blue: "#286cff",
      violet: "#7358ea",
      radius: "30px",
    });
    expect(premium.shadow).not.toBe("none");

    const desktopLayout = await capabilities.evaluateAll((items) =>
      items.map((item) => {
        const copy = item.querySelector<HTMLElement>(
          ".product-detail-capability-copy",
        );
        const media = item.querySelector<HTMLElement>(
          ".product-detail-capability-media",
        );
        return {
          columns: getComputedStyle(item).gridTemplateColumns.split(" ").length,
          copyX: copy?.getBoundingClientRect().x ?? 0,
          mediaX: media?.getBoundingClientRect().x ?? 0,
        };
      }),
    );
    expect(desktopLayout.every((item) => item.columns === 2)).toBe(true);
    expect(desktopLayout[0]?.copyX).toBeLessThan(desktopLayout[0]?.mediaX ?? 0);
    if (desktopLayout.length > 1) {
      expect(desktopLayout[1]?.copyX).toBeGreaterThan(
        desktopLayout[1]?.mediaX ?? 0,
      );
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileLayout = await capabilities.evaluateAll((items) =>
      items.map((item) => {
        const copy = item.querySelector<HTMLElement>(
          ".product-detail-capability-copy",
        );
        const media = item.querySelector<HTMLElement>(
          ".product-detail-capability-media",
        );
        const copyBox = copy?.getBoundingClientRect();
        const mediaBox = media?.getBoundingClientRect();
        return {
          columns: getComputedStyle(item).gridTemplateColumns.split(" ").length,
          aligned: Math.abs((copyBox?.x ?? 0) - (mediaBox?.x ?? 0)) < 2,
          stacked: (copyBox?.bottom ?? 0) <= (mediaBox?.top ?? 0),
        };
      }),
    );
    expect(
      mobileLayout.every(
        (item) => item.columns === 1 && item.aligned && item.stacked,
      ),
    ).toBe(true);
  }
});

test("产品页面在桌面、平板和移动宽度无横向溢出", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1024, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const { path } of pages) {
      await gotoProduct(page, path);
      await expectNoHorizontalOverflow(page);
    }
  }
});

test("产品页面保留现有 Agent 聊天的打开与关闭行为", async ({ page }) => {
  for (const path of ["/product", "/product/code-agent", "/product/aishrek"]) {
    await gotoProduct(page, path);
    await page.getByRole("button", { name: "打开码多多" }).click();
    await expect(page.getByRole("dialog", { name: "码多多" })).toBeVisible();
    await page.getByRole("button", { name: "关闭码多多", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "码多多" })).toHaveCount(0);
  }
});

test("捕获产品总览、智能体中心、码里奥和 AISHREK 的响应式视觉证据", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(120_000);
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/product-portal",
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const viewport of [
    { name: "1440", width: 1440, height: 1000 },
    { name: "1024", width: 1024, height: 900 },
    { name: "390", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [name, path] of [
      ["overview", "/product"],
      ["agents", "/product/agents"],
      ["code-agent", "/product/code-agent"],
      ["aishrek", "/product/aishrek"],
    ] as const) {
      await gotoProduct(page, path);
      await page.evaluate(() => document.fonts.ready);
      const images = page.locator("main img");
      for (let index = 0; index < (await images.count()); index += 1) {
        await images.nth(index).scrollIntoViewIfNeeded();
      }
      await page
        .locator(".platform-center-gallery")
        .evaluateAll((galleries) => {
          for (const gallery of galleries) gallery.scrollLeft = 0;
        });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(outputDirectory, `${name}-${viewport.name}.png`),
      });
    }
  }
});
