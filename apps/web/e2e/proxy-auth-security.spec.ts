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
  const uniqueUserAgent = `audit-e2e-${Date.now()}-${process.pid}`;
  const attacker = await browser.newContext({
    extraHTTPHeaders: { "X-Real-IP": spoofedAddress },
    userAgent: uniqueUserAgent,
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

  const token = process.env.E2E_ADMIN_SESSION_TOKEN;
  if (!token) throw new Error("E2E_ADMIN_SESSION_TOKEN is required");
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
  const eventRow = page
    .getByTestId(/^audit-row-/u)
    .filter({ hasText: uniqueUserAgent });
  await expect(eventRow).toHaveCount(1);
  await expect(eventRow).toContainText("auth.login_failure");
  const storedIp = (
    await eventRow.getByTestId("audit-source-ip").textContent()
  )?.trim();
  expect(storedIp).toBeTruthy();
  expect(storedIp).not.toBe("—");
  expect(storedIp).not.toBe(spoofedAddress);
  expect(storedIp).toMatch(/^(?:(?:\d{1,3}\.){3}\d{1,3}|[a-f0-9:]+)$/iu);
  await audit.close();
});

test("proxy returns HTTP 429 after the auth POST burst is exhausted", async ({
  request,
}) => {
  const responses: Array<{ status: number; limiter: string | undefined }> = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await request.post("/staff/login", {
      form: {
        identifier: "rate.fixture@example.invalid",
        password: "invalid-password",
      },
      maxRedirects: 0,
    });
    responses.push({
      status: response.status(),
      limiter: response.headers()["x-auth-rate-limit"],
    });
  }
  expect(responses).toContainEqual({ status: 429, limiter: "REJECTED" });
});

test("proxy rejects an unknown Host before forwarding", async ({ request }) => {
  const response = await request.get("/api/health/live", {
    headers: { Host: "unknown-host.example" },
  });
  expect(response.status()).toBe(421);
});
