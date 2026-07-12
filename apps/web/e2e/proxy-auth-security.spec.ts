import { expect, test } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";

const spoofedAddress = "203.0.113.77";

test("proxy overwrites spoofed client IP before the failed-login audit", async ({
  browser,
  baseURL,
}) => {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || !baseURL)
    throw new Error("BETTER_AUTH_SECRET and baseURL are required");
  const attacker = await browser.newContext({
    extraHTTPHeaders: { "X-Real-IP": spoofedAddress },
  });
  const login = await attacker.newPage();
  await login.goto("/staff/login");
  await login
    .getByLabel("员工用户名或邮箱")
    .fill("missing.fixture@example.invalid");
  await login.getByLabel("密码").fill("not-the-password");
  await login.getByRole("button", { name: "登录运营后台" }).click();
  await expect(login.getByRole("status")).toContainText("不正确");
  await attacker.close();

  const token = "e2e-admin-session";
  const signature = await makeSignature(token, secret);
  const audit = await browser.newContext({
    extraHTTPHeaders: { "X-Real-IP": spoofedAddress },
    storageState: {
      cookies: [
        {
          name: "aap_staff_session",
          value: `${token}.${signature}`,
          domain: new URL(baseURL).hostname,
          path: "/",
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
          expires: Math.floor(Date.now() / 1000) + 3600,
        },
      ],
      origins: [],
    },
  });
  const page = await audit.newPage();
  await page.goto("/admin/audit-logs?action=auth.login_failure");
  await expect(page.getByText("auth.login_failure").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(spoofedAddress);
  await audit.close();
});

test("proxy returns HTTP 429 after the auth POST burst is exhausted", async ({
  request,
}) => {
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await request.post("/staff/login", {
      form: {
        identifier: "rate.fixture@example.invalid",
        password: "invalid-password",
      },
      maxRedirects: 0,
    });
    statuses.push(response.status());
  }
  expect(statuses).toContain(429);
});
