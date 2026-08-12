import { expect, test, type Page } from "@playwright/test";

const solutions = [
  ["knowledge-service", "企业知识问答与知识服务"],
  ["process-automation", "业务流程自动化与智能协同"],
  ["government-knowledge", "政务知识问答与政策服务"],
  ["finance-data", "经营数据问答与业务分析"],
  ["healthcare-knowledge", "医院知识与制度问答"],
  ["enterprise-multi-agent", "多智能体复杂任务处理"],
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test("六个首页方案详情都返回原型标题", async ({ page }) => {
  for (const [slug, title] of solutions) {
    const response = await page.goto(`/solutions/${slug}`, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
    await expect(
      page.locator("main.solution-detail .floating-assistant"),
    ).toHaveCount(0);
    await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
  }
});

test("体验页完成原型校验、演示码和成功态", async ({ page }) => {
  const response = await page.goto("/trial", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);

  await expect(
    page.getByRole("heading", { level: 1, name: "开启企业 AI 落地体验" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "立即填写申请" }).click();
  const dialog = page.getByRole("dialog", { name: "开启企业 AI 落地体验" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "提交申请" }).click();
  await expect(dialog.getByRole("status")).toHaveText("请填写姓名");
  await dialog.getByLabel("姓名").fill("测试用户");
  await dialog.getByLabel("所属公司").fill("测试公司");
  await dialog.getByLabel("联系方式（手机号或邮箱）").fill("test@example.com");
  await dialog.getByRole("button", { name: "获取验证码" }).click();

  const codeMessage = await dialog.getByRole("status").textContent();
  const code = codeMessage?.match(/\d{6}/u)?.[0];
  expect(code).toMatch(/^\d{6}$/u);
  await dialog.getByLabel("验证码", { exact: true }).fill(code!);
  await dialog.getByRole("button", { name: "提交申请" }).click();
  const successDialog = page.getByRole("dialog", { name: "提交成功" });
  await expect(
    successDialog.getByRole("heading", { name: "提交成功" }),
  ).toBeVisible();
  await successDialog.getByRole("button", { name: "完成" }).click();
  await expect(successDialog).toHaveCount(0);
});

test("新页面在桌面、平板和移动宽度无横向溢出", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of [
      "/solutions/knowledge-service",
      "/solutions/finance-data",
      "/trial",
    ]) {
      await page.goto(path, { waitUntil: "load" });
      await expectNoHorizontalOverflow(page);
    }
  }
});

test("新页面继续使用 shell 的唯一 Agent 聊天入口", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/solutions/knowledge-service", "/trial"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await expect(page.locator(".floating-assistant__launcher")).toHaveCount(1);
    await page.getByRole("button", { name: "打开码多多" }).click();
    await expect(page.getByRole("dialog", { name: "码多多" })).toBeVisible();
    await page.getByRole("button", { name: "关闭码多多", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "码多多" })).toHaveCount(0);
  }
});
