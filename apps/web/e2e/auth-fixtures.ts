import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";

import { makeSignature } from "better-auth/crypto";
import type { BrowserContext, Page } from "@playwright/test";

export const identities = {
  customer: {
    id: "10000000-0000-4000-8000-000000000001",
    email: "customer.fixture@example.invalid",
  },
  pendingCustomer: {
    id: "10000000-0000-4000-8000-000000000004",
    email: "pending.fixture@example.invalid",
  },
  disabledCustomer: {
    id: "10000000-0000-4000-8000-000000000005",
    email: "disabled.fixture@example.invalid",
  },
  staff: {
    id: "10000000-0000-4000-8000-000000000002",
    email: "staff.fixture@example.invalid",
    username: "staff.fixture",
  },
  roleTarget: {
    id: "10000000-0000-4000-8000-000000000006",
  },
  admin: {
    id: "10000000-0000-4000-8000-000000000003",
    email: "admin.fixture@example.invalid",
    username: "admin.fixture",
    revokedSessionId: "10000000-0000-4000-8000-000000000021",
  },
  modelAdmin: {
    id: "10000000-0000-4000-8000-000000000008",
    email: "model-admin.fixture@example.invalid",
    username: "model-admin.fixture",
  },
} as const;

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function fixtureCredentials() {
  return {
    customerPassword: requiredEnvironment("E2E_CUSTOMER_PASSWORD"),
    staffPassword: requiredEnvironment("E2E_STAFF_PASSWORD"),
    adminPassword: requiredEnvironment("E2E_ADMIN_PASSWORD"),
    pendingCustomerSessionToken: requiredEnvironment(
      "E2E_PENDING_CUSTOMER_SESSION_TOKEN",
    ),
    disabledCustomerSessionToken: requiredEnvironment(
      "E2E_DISABLED_CUSTOMER_SESSION_TOKEN",
    ),
    staffSessionToken: requiredEnvironment("E2E_STAFF_SESSION_TOKEN"),
    roleTargetSessionToken: requiredEnvironment(
      "E2E_ROLE_TARGET_SESSION_TOKEN",
    ),
    adminSessionToken: requiredEnvironment("E2E_ADMIN_SESSION_TOKEN"),
    modelAdminSessionToken: requiredEnvironment(
      "E2E_MODEL_ADMIN_SESSION_TOKEN",
    ),
    revokedSessionToken: requiredEnvironment("E2E_REVOKED_SESSION_TOKEN"),
    replacementPassword: requiredEnvironment("E2E_REPLACEMENT_PASSWORD"),
  };
}

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value || value.length < 32)
    throw new Error("BETTER_AUTH_SECRET is required");
  return value;
}

export async function addSignedSession(
  context: BrowserContext,
  baseURL: string,
  realm: "customer" | "workforce",
  token: string,
) {
  const url = new URL(baseURL);
  const signature = await makeSignature(token, secret());
  await context.addCookies([
    {
      name: realm === "customer" ? "aap_customer_session" : "aap_staff_session",
      value: `${token}.${signature}`,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);
}

export async function loginCustomer(page: Page) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(identities.customer.email);
  await page.getByLabel("密码").fill(fixtureCredentials().customerPassword);
  await page.getByRole("button", { name: "登录客户控制台" }).click();
}

export const adminStatePath = path.resolve(
  process.cwd(),
  "../../artifacts/playwright/auth/admin-state.json",
);

export async function writeAdminState(context: BrowserContext) {
  await mkdir(path.dirname(adminStatePath), { recursive: true });
  await context.storageState({ path: adminStatePath });
  await chmod(adminStatePath, 0o600);
}
