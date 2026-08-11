import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const pages = [
  {
    key: "products",
    path: "/product",
    title: "让企业 AI 落地，深度建设与快速使用双路径",
    sections: [
      "企业 AI 落地，元启回答三个核心问题",
      "从模型到应用，一条链路走通",
      "元启平台六大中心，覆盖企业 AI 全生命周期",
      "独立产品中心：每个产品，单独可用",
      "深度建设与快速使用，两条路都值得走",
      "从你的目标出发，继续了解",
    ],
    counts: {
      "product-challenge": 3,
      "product-chain-node": 4,
      "product-center": 6,
      "independent-product": 3,
    },
  },
  {
    key: "key-products",
    path: "/product/standalone",
    title: "独立产品中心：成熟企业级 AI 产品，开箱即用",
    sections: [
      "三个独立产品，各自解决一类问题",
      "按你的岗位与目标选择产品",
      "既可独立使用，也可与元启平台组合",
      "想先试用某个独立产品？",
    ],
    counts: { "standalone-product-card": 3, "platform-relation": 2 },
  },
  {
    key: "mdd-2",
    path: "/product/code-agent",
    title: "企业级的智能编码产品，代码不出域、说需求就落地",
    sections: [
      "不是又一个 AI 工具，而是企业级智能编码产品",
      "它怎么帮企业，把 AI 编程真正落地",
      "安全与部署保障，高密级代码资产也能放心用",
      "说需求 → 分析项目上下文 → 生成代码 → 运行验证",
      "让企业 AI 编程，从能用变成好用",
      "开启企业级 AI 编程体验",
    ],
    counts: {
      "detail-hero-tag": 4,
      "detail-introduction-card": 3,
      "detail-capability": 4,
      "detail-security-item": 4,
      "detail-scene": 3,
    },
  },
  {
    key: "aippt",
    path: "/product/aippt",
    title: "一站式智能演示文稿创作平台，需求直达、分钟级成稿",
    sections: [
      "从模板套用到智能创作，覆盖内容、结构与版式的完整链路",
      "四大核心能力，覆盖演示文稿创作全链路",
      "从需求到成稿，分钟级完成",
      "让演示文稿创作，从耗时繁琐走向高效专业",
      "开启分钟级演示文稿创作体验",
    ],
    counts: {
      "detail-hero-tag": 4,
      "detail-introduction-card": 3,
      "detail-capability": 4,
      "detail-security-item": 0,
      "detail-scene": 3,
    },
  },
  {
    key: "aishrek",
    path: "/product/aishrek",
    title: "AI 机械设计工作台，导入即解读、对话改参数",
    sections: [
      "从 3D 查看器到 AI 建模工作台，覆盖设计修改全流程",
      "四大核心能力，覆盖设计、联动、仿真与交付全链路",
      "导入即解读，对话即改型",
      "让机械设计修改，从繁琐操作走向高效交付",
      "开启对话式机械设计体验",
    ],
    counts: {
      "detail-hero-tag": 4,
      "detail-introduction-card": 3,
      "detail-capability": 4,
      "detail-security-item": 0,
      "detail-scene": 3,
    },
  },
] as const;

async function gotoProduct(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  return response;
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

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

test("捕获产品总览、码多多和 AISHREK 的响应式视觉证据", async ({
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
      ["code-agent", "/product/code-agent"],
      ["aishrek", "/product/aishrek"],
    ] as const) {
      await gotoProduct(page, path);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(outputDirectory, `${name}-${viewport.name}.png`),
      });
    }
  }
});
