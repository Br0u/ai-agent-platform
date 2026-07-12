import { expect, test } from "@playwright/test";

import {
  addSignedSession,
  adminStatePath,
  beginAdminChallenge,
  fixtureCredentials,
  identities,
  loginCustomer,
  totpFromUri,
  writeRecoveryCode,
  writeAdminState,
} from "./auth-fixtures";

test("public auth pages are accessible and responsive", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  for (const [url, heading] of [
    ["/login", "登录客户控制台"],
    ["/register", "申请客户账号"],
    ["/staff/login", "员工安全登录"],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  expect(consoleErrors).toEqual([]);
});

test("anonymous users cannot enter customer or admin workspaces", async ({
  page,
}) => {
  await page.goto("/console");
  await expect(page).toHaveURL(/\/login/u);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/staff\/login/u);
});

test("health endpoints are public", async ({ request }) => {
  await expect((await request.get("/api/health/live")).status()).toBe(200);
  await expect((await request.get("/api/health/ready")).status()).toBe(200);
  const resend = await request.post("/api/v1/email-verification/resend");
  expect(resend.status()).toBe(501);
  await expect(resend.json()).resolves.toEqual({
    error: { code: "EMAIL_VERIFICATION_DISABLED" },
  });
});

test.describe("shared authorization state", () => {
  test.describe.configure({ mode: "serial" });

  test("@security-state pending customer gets onboarding but not Console", async ({
    page,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    await addSignedSession(
      page.context(),
      baseURL,
      "customer",
      fixtureCredentials().pendingCustomerSessionToken,
    );
    await page.goto("/console/onboarding");
    await expect(page.getByRole("heading", { name: /审核/u })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "重新发送验证邮件" }),
    ).toBeDisabled();
    await page.goto("/console");
    await expect(page).toHaveURL(/\/console\/onboarding/u);
  });

  test("@security-state active customer enters Console and is denied Admin", async ({
    page,
  }) => {
    await loginCustomer(page);
    await expect(page).toHaveURL(/\/console(?:\/|$)/u);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/staff\/login/u);
  });

  test("@security-state disabled user and wrong-realm cookies are rejected on the next request", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    const disabled = await browser.newContext();
    await addSignedSession(
      disabled,
      baseURL,
      "customer",
      fixtureCredentials().disabledCustomerSessionToken,
    );
    expect(
      (await disabled.request.get("/api/v1/session/customer")).status(),
    ).toBe(403);
    await disabled.close();

    const wrongRealm = await browser.newContext();
    await addSignedSession(
      wrongRealm,
      baseURL,
      "workforce",
      fixtureCredentials().staffSessionToken,
    );
    expect(
      (await wrongRealm.request.get("/api/v1/session/customer")).status(),
    ).toBe(401);
    await wrongRealm.close();
  });

  test("@security-state employee enters shell but restricted user administration is denied", async ({
    page,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    await addSignedSession(
      page.context(),
      baseURL,
      "workforce",
      fixtureCredentials().staffSessionToken,
    );
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/u);
    await page.goto("/admin/users");
    await expect(
      page.getByRole("heading", { name: "This page couldn’t load" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "用户管理" }),
    ).not.toBeVisible();
  });

  test("@security-state @totp-enroll admin enrolls TOTP, stores one recovery code, and revokes only the selected session", async ({
    page,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    await addSignedSession(
      page.context(),
      baseURL,
      "workforce",
      fixtureCredentials().adminSessionToken,
    );
    const incomplete = await page
      .context()
      .request.get("/api/v1/session/staff");
    expect(incomplete.status()).toBe(403);
    await expect(incomplete.json()).resolves.toMatchObject({
      error: { code: "AUTH_TOTP_SETUP_REQUIRED" },
    });
    const deniedPage = await page.context().request.get("/admin/users");
    expect(await deniedPage.text()).not.toContain("替换临时密码");

    await page.goto("/staff/two-factor?returnTo=%2Fadmin%2Fusers");
    await page.getByLabel("当前密码").fill(fixtureCredentials().adminPassword);
    await page.getByRole("button", { name: "开始设置" }).click();
    const uri = (
      await page.locator("code").filter({ hasText: "otpauth://" }).textContent()
    )?.trim();
    if (!uri) throw new Error("TOTP URI was not rendered");
    const recoveryCodes = await page.locator("li code").allTextContents();
    expect(recoveryCodes.length).toBeGreaterThan(0);
    await writeRecoveryCode(recoveryCodes[0]!);
    await page.getByLabel("六位验证码").fill(totpFromUri(uri));
    await page.getByRole("button", { name: "验证并启用" }).click();
    await expect(page).toHaveURL(/\/admin\/users/u);

    const revoked = await page.context().browser()!.newContext();
    await addSignedSession(
      revoked,
      baseURL,
      "workforce",
      fixtureCredentials().revokedSessionToken,
    );
    expect((await revoked.request.get("/api/v1/session/staff")).status()).toBe(
      200,
    );
    await writeAdminState(page.context());

    const revokedForm = page.locator(
      `form:has(input[name="sessionId"][value="${identities.admin.revokedSessionId}"])`,
    );
    await revokedForm.getByRole("button", { name: "撤销此会话" }).click();
    await expect
      .poll(async () =>
        (await revoked.request.get("/api/v1/session/staff")).status(),
      )
      .toBe(401);
    const revokedResponse = await revoked.request.get("/api/v1/session/staff");
    await expect(revokedResponse.json()).resolves.toMatchObject({
      error: { code: "AUTH_SESSION_REQUIRED" },
    });
    expect(
      (await page.context().request.get("/api/v1/session/staff")).status(),
    ).toBe(200);
    await revoked.close();
    await page.context().clearCookies();
  });

  test("@security-state employee and no-TOTP admin cannot replay a real administrator mutation", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    const admin = await browser.newContext({ storageState: adminStatePath });
    const adminPage = await admin.newPage();
    await adminPage.goto(
      `/admin/users?search=${encodeURIComponent(identities.staff.email)}`,
    );
    const row = adminPage
      .getByRole("row")
      .filter({ hasText: identities.staff.email });
    const form = row.locator("form").filter({
      has: adminPage.getByRole("button", { name: "撤销此会话" }),
    });
    await adminPage.route("**/admin/users**", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        await route.abort();
        return;
      }
      await route.continue();
    });
    const capturedPromise = adminPage.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        typeof request.headers()["next-action"] === "string",
    );
    await form.getByRole("button", { name: "撤销此会话" }).click();
    const captured = await capturedPromise;
    const capturedHeaders = captured.headers();
    const actionHeaders = Object.fromEntries(
      ["accept", "content-type", "next-action", "next-router-state-tree"]
        .filter((name) => capturedHeaders[name])
        .map((name) => [name, capturedHeaders[name]!]),
    );
    const actionBody = captured.postDataBuffer();
    if (!actionBody) throw new Error("Captured Server Action has no body");

    const employee = await browser.newContext();
    await addSignedSession(
      employee,
      baseURL,
      "workforce",
      fixtureCredentials().staffSessionToken,
    );
    expect((await employee.request.get("/api/v1/session/staff")).status()).toBe(
      200,
    );
    const attempted = await employee.request.post(captured.url(), {
      data: actionBody,
      headers: actionHeaders,
      maxRedirects: 0,
    });
    expect(attempted.status()).toBe(200);
    expect(await attempted.text()).toContain("AUTH_PERMISSION_DENIED");
    expect((await employee.request.get("/api/v1/session/staff")).status()).toBe(
      200,
    );
    const noTotpAdmin = await browser.newContext();
    await addSignedSession(
      noTotpAdmin,
      baseURL,
      "workforce",
      fixtureCredentials().noTotpAdminSessionToken,
    );
    const noTotpAttempt = await noTotpAdmin.request.post(captured.url(), {
      data: actionBody,
      headers: actionHeaders,
      maxRedirects: 0,
    });
    expect(noTotpAttempt.status()).toBe(200);
    expect(await noTotpAttempt.text()).toContain("AUTH_TOTP_SETUP_REQUIRED");
    expect((await employee.request.get("/api/v1/session/staff")).status()).toBe(
      200,
    );
    await noTotpAdmin.close();
    await employee.close();
    await admin.close();
  });

  test("@security-state @recovery-consume recovery code completes the challenge once and reuse fails", async ({
    browser,
  }) => {
    const { readFile } = await import("node:fs/promises");
    const { recoveryCodePath } = await import("./auth-fixtures");
    const recoveryCode = (await readFile(recoveryCodePath, "utf8")).trim();
    const first = await browser.newContext();
    const firstPage = await first.newPage();
    await beginAdminChallenge(firstPage);
    await expect(firstPage).toHaveURL(/\/staff\/two-factor/u);
    await firstPage.getByLabel("恢复码").fill(recoveryCode);
    await firstPage.getByRole("button", { name: "使用恢复码" }).click();
    await expect(firstPage).toHaveURL(/\/admin(?:\/|$)/u);
    await first.close();

    const reuse = await browser.newContext();
    const reusePage = await reuse.newPage();
    await beginAdminChallenge(reusePage);
    await reusePage.getByLabel("恢复码").fill(recoveryCode);
    const deniedPromise = reusePage.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        typeof response.request().headers()["next-action"] === "string",
    );
    await reusePage.getByRole("button", { name: "使用恢复码" }).click();
    const denied = await deniedPromise;
    expect(denied.status()).toBe(200);
    expect(await denied.text()).toContain("AUTH_INVALID_CREDENTIALS");
    await reuse.close();
  });

  test("@security-state role removal is effective on the next authorization check", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    const admin = await browser.newContext({ storageState: adminStatePath });
    const page = await admin.newPage();
    await page.goto("/admin/roles");
    const form = page.locator("form").filter({
      has: page.getByRole("button", { name: "移除角色" }),
    });
    await form.getByLabel("用户 ID").fill(identities.roleTarget.id);
    await form.getByLabel("角色").selectOption("employee");
    await form.getByRole("button", { name: "移除角色" }).click();
    await expect(form.getByRole("status")).toContainText("操作已完成");

    const employee = await page.context().browser()!.newContext();
    await addSignedSession(
      employee,
      baseURL,
      "workforce",
      fixtureCredentials().roleTargetSessionToken,
    );
    expect((await employee.request.get("/api/v1/session/staff")).status()).toBe(
      401,
    );
    await employee.close();
    await admin.close();
  });

  test("@security-state repeated invalid registration is rate limited", async ({
    request,
  }) => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      statuses.push(
        (
          await request.post("/register", {
            form: { email: "invalid", password: "invalid" },
            maxRedirects: 0,
          })
        ).status(),
      );
    }
    expect(statuses).toContain(429);
  });

  test("@security-state administrative password replacement revokes old staff sessions", async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    const admin = await browser.newContext({ storageState: adminStatePath });
    const page = await admin.newPage();
    await page.goto(
      `/admin/users?search=${encodeURIComponent(identities.staff.email)}`,
    );
    const row = page
      .getByRole("row")
      .filter({ hasText: identities.staff.email });
    const form = row.locator("form").filter({
      has: page.getByRole("button", { name: "替换临时密码" }),
    });
    await form
      .getByLabel("新临时密码")
      .fill(fixtureCredentials().replacementPassword);
    await form.getByRole("button", { name: "替换临时密码" }).click();
    await expect(form.getByRole("status")).toContainText("操作已完成");

    const oldStaff = await browser.newContext();
    await addSignedSession(
      oldStaff,
      baseURL,
      "workforce",
      fixtureCredentials().staffSessionToken,
    );
    expect((await oldStaff.request.get("/api/v1/session/staff")).status()).toBe(
      401,
    );
    await oldStaff.close();
    await admin.close();
  });

  test("@security-state saved administrator session is still valid", async ({
    browser,
  }) => {
    const admin = await browser.newContext({ storageState: adminStatePath });
    expect((await admin.request.get("/api/v1/session/staff")).status()).toBe(
      200,
    );
    await admin.close();
  });

  test("@security-state saved administrator session can be revoked", async ({
    browser,
  }) => {
    const admin = await browser.newContext({ storageState: adminStatePath });
    const page = await admin.newPage();
    await page.goto(
      `/admin/users?search=${encodeURIComponent(identities.admin.email)}`,
    );
    const row = page
      .getByRole("row")
      .filter({ hasText: identities.admin.email });
    const form = row.locator("form").filter({
      has: page.getByRole("button", { name: "撤销全部会话" }),
    });
    await form.getByRole("button", { name: "撤销全部会话" }).click();
    await expect
      .poll(async () =>
        (await admin.request.get("/api/v1/session/staff")).status(),
      )
      .toBe(401);
    await admin.close();
  });

  test("@security-state saved administrator session remains rejected", async ({
    browser,
  }) => {
    const admin = await browser.newContext({ storageState: adminStatePath });
    expect((await admin.request.get("/api/v1/session/staff")).status()).toBe(
      401,
    );
    await admin.close();
  });
});
