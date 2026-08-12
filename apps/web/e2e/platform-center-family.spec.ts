import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const pages = [
  [
    "/product/model",
    "企业模型工程，从资产管理到上线服务",
    "围绕企业最关心的三件事组织模型能力",
  ],
  [
    "/product/knowledge",
    "企业知识库：让企业文档变成 AI 能用的知识",
    "通用模型看不懂你的文档，知识库让它「懂」",
  ],
  [
    "/product/agents",
    "让企业拥有懂知识、懂业务、懂流程的 AI 助手",
    "智能体，是 AI 能力真正落到业务上的最后一公里",
  ],
  [
    "/product/applications",
    "成熟业务 AI 应用，拿来即用",
    "成熟业务 AI 应用，拿来即用",
  ],
  [
    "/product/skills",
    "可复用的业务技能，拿来即用",
    "可复用的业务技能，能力标准化",
  ],
  [
    "/product/coding",
    "码多多：让智能编程走进企业日常开发",
    "研发提效的三个核心问题",
  ],
  [
    "/product/governance",
    "平台用得安全，权限管得清楚",
    "让平台权限，边界清晰、管得清楚",
  ],
] as const;

async function gotoCenter(page: Page, path: string) {
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

test("七个元启平台中心返回原型标题并只使用 shell 聊天入口", async ({
  page,
}) => {
  test.setTimeout(60_000);

  for (const [path, title, bodyTitle] of pages) {
    const response = await gotoCenter(page, path);

    expect(response?.status(), path).toBe(200);
    const heading = page.getByRole("heading", {
      level: 1,
      name: title,
      exact: true,
    });
    await expect(heading).toHaveCount(1);
    await expect(heading).toBeVisible();
    const bodyHeading = page.getByRole("heading", {
      level: 2,
      name: bodyTitle,
      exact: true,
    });
    await expect(bodyHeading).toHaveCount(1);
    await expect(bodyHeading).toBeVisible();

    if (path === "/product/coding") {
      const demo = page
        .getByTestId("platform-page-demo")
        .filter({ hasText: "码多多 · 对话式开发" });
      await expect(demo).toHaveCount(1);
      await expect(demo).toBeVisible();
      const messages = demo.getByTestId("platform-demo-message");
      await expect(messages).toHaveCount(3);
      await expect(messages.nth(0)).toHaveAttribute(
        "data-message-role",
        "user",
      );
      await expect(messages.nth(1)).toHaveAttribute(
        "data-message-role",
        "assistant",
      );
      await expect(messages.nth(2)).toHaveAttribute(
        "data-message-role",
        "assistant",
      );
      for (const copy of [
        "给这个接口补上参数校验和单元测试",
        "正在分析代码并生成修改方案……",
        "已生成修改后的代码与单元测试，并检查通过。｜Build 模式 · 修改已落地",
      ]) {
        await expect(demo.getByText(copy, { exact: true })).toBeVisible();
      }
      await expect(demo.getByPlaceholder("输入你的开发需求…")).toBeDisabled();
      await expect(
        demo.getByRole("button", { name: "发送", exact: true }),
      ).toBeDisabled();
    }

    if (path === "/product/agents") {
      const demo = page
        .getByTestId("platform-page-demo")
        .filter({ hasText: "智能体中心 · 能力演示" });
      await expect(demo.getByPlaceholder("输入你的需求…")).toBeDisabled();
    }

    if (path === "/product/governance") {
      for (const id of [
        "gov-users",
        "gov-roles",
        "gov-menu",
        "gov-permission",
      ]) {
        const anchor = page.locator(`#${id}`);
        await expect(anchor).toHaveCount(1);
        await expect(anchor).toBeVisible();
      }
    }

    await expect(
      page.locator("main.platform-center .floating-assistant"),
    ).toHaveCount(0);
    await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
  }
});

test("七个元启平台中心内部链接没有 404 或服务端错误", async ({ page }) => {
  test.setTimeout(60_000);

  for (const [path] of pages) {
    await gotoCenter(page, path);
    const links = await page
      .locator("main.platform-center a")
      .evaluateAll((links) => [
        ...new Map(
          links
            .map((link) => new URL((link as HTMLAnchorElement).href))
            .filter((url) => url.origin === window.location.origin)
            .map((url) => [
              `${url.pathname}${url.search}${url.hash}`,
              {
                hash: url.hash,
                navigationTarget: `${url.pathname}${url.search}${url.hash}`,
                requestTarget: `${url.pathname}${url.search}`,
              },
            ]),
        ).values(),
      ]);

    for (const link of links) {
      const response = await page.request.get(link.requestTarget);
      expect(response.status(), `${path} → ${link.requestTarget}`).toBeLessThan(
        400,
      );
      if (!link.hash) continue;

      await gotoCenter(page, link.navigationTarget);
      const currentUrl = new URL(page.url());
      expect(`${currentUrl.pathname}${currentUrl.search}`).toBe(
        link.requestTarget,
      );
      expect(currentUrl.hash).toBe(link.hash);
      expect(
        await page.evaluate((hash) => {
          const id = decodeURIComponent(hash.slice(1));
          return document.getElementById(id) !== null;
        }, link.hash),
        `${path} → ${link.navigationTarget}`,
      ).toBe(true);
    }
  }
});

test("七个元启平台中心在桌面、平板和移动宽度无横向溢出", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(60_000);

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1024, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [path] of pages) {
      await gotoCenter(page, path);
      await expectNoHorizontalOverflow(page);
    }
  }
});

test("元启平台中心保留现有 Agent 聊天的打开与关闭行为", async ({ page }) => {
  for (const path of ["/product/model", "/product/agents", "/product/coding"]) {
    await gotoCenter(page, path);
    await page.getByRole("button", { name: "打开码多多" }).click();
    await expect(page.getByRole("dialog", { name: "码多多" })).toBeVisible();
    await page.getByRole("button", { name: "关闭码多多", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "码多多" })).toHaveCount(0);
  }
});

test("捕获五个产品页面族中心的响应式视觉证据", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(120_000);
  const outputDirectory = resolve(
    process.cwd(),
    "../../artifacts/playwright/platform-centers",
  );
  await mkdir(outputDirectory, { recursive: true });

  for (const viewport of [
    { name: "1440", width: 1440, height: 1000 },
    { name: "1024", width: 1024, height: 900 },
    { name: "390", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [name, path] of [
      ["agents", "/product/agents"],
      ["applications", "/product/applications"],
      ["skills", "/product/skills"],
      ["coding", "/product/coding"],
      ["governance", "/product/governance"],
    ] as const) {
      await gotoCenter(page, path);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(outputDirectory, `${name}-${viewport.name}.png`),
      });
    }
  }
});
