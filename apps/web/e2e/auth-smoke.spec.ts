import { expect, test } from "@playwright/test";

test("customer authentication is reachable and accepts the seeded identity", async ({
  page,
}) => {
  const password = process.env.E2E_CUSTOMER_PASSWORD;
  if (!password) throw new Error("E2E_CUSTOMER_PASSWORD is required");
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "登录客户控制台" }),
  ).toBeVisible();
  await page.getByLabel("邮箱").fill("customer.fixture@example.invalid");
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录客户控制台" }).click();
  await expect(page).toHaveURL(/\/console(?:\/|$)/u);
});

test("invalid staff credentials return the generic error", async ({ page }) => {
  await page.goto("/staff/login");
  await page
    .getByLabel("员工用户名或邮箱")
    .fill("missing.fixture@example.invalid");
  await page.getByLabel("密码").fill("not-the-password");
  await page.getByRole("button", { name: "登录运营后台" }).click();
  await expect(page.getByRole("status")).toContainText("不正确");
});
