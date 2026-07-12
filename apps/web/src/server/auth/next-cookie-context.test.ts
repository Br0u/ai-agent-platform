import { createRequire } from "node:module";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import type { RequestStore } from "next/dist/server/app-render/work-unit-async-storage.external";
import type { ImplicitTags } from "next/dist/server/lib/implicit-tags";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { hashPassword } from "@ai-agent-platform/database";

import {
  AUTH_ACTION_INITIAL_STATE,
  createAuthActions,
  type AuthActionDependencies,
  type LoginUser,
} from "./actions";
import { createCustomerAuth } from "./customer-auth";

const require = createRequire(import.meta.url);
const { createRequestStoreForAPI } =
  require("next/dist/server/async-storage/request-store.js") as typeof import("next/dist/server/async-storage/request-store");
const { workUnitAsyncStorage } =
  require("next/dist/server/app-render/work-unit-async-storage.external.js") as typeof import("next/dist/server/app-render/work-unit-async-storage.external");
const { ResponseCookies } =
  require("next/dist/server/web/spec-extension/cookies.js") as typeof import("next/dist/server/web/spec-extension/cookies");

const BASE_URL = "http://127.0.0.1:3000";
const TEST_SECRET = "test-only-better-auth-secret-32-characters";
const activeCustomer: LoginUser = {
  id: "customer-user-id",
  realm: "customer",
  status: "active",
  mustChangePassword: false,
  twoFactorEnabled: false,
  permissions: [],
};

async function customerDatabase(): Promise<MemoryDB> {
  const now = new Date();
  return {
    user: [
      {
        id: activeCustomer.id,
        name: "Customer",
        email: "customer@example.test",
        emailVerified: true,
        image: null,
        createdAt: now,
        updatedAt: now,
        twoFactorEnabled: false,
        identityRealm: "customer",
        status: "active",
        emailVerificationStatus: "verified",
        username: null,
        displayUsername: null,
        mustChangePassword: false,
        lastLoginAt: null,
      },
    ],
    account: [
      {
        id: "customer-account-id",
        accountId: activeCustomer.id,
        providerId: "credential",
        userId: activeCustomer.id,
        password: await hashPassword("ValidPass#12"),
        createdAt: now,
        updatedAt: now,
      },
    ],
    session: [],
    verification: [],
    rateLimit: [],
    twoFactor: [],
  };
}

async function inNextActionContext<T>(
  cookie: string | undefined,
  callback: (store: RequestStore) => Promise<T>,
): Promise<{ result: T; updates: string[] }> {
  const request = new NextRequest(`${BASE_URL}/login`, {
    headers: {
      origin: BASE_URL,
      "next-action": "test-action",
      ...(cookie ? { cookie } : {}),
    },
  });
  const updates: string[] = [];
  const implicitTags: ImplicitTags = {
    tags: [],
    expirationsByCacheKind: new Map(),
  };
  const store = createRequestStoreForAPI(
    request,
    request.nextUrl,
    implicitTags,
    (values) => updates.push(...values),
    {
      previewModeId: "preview-mode-id",
      previewModeSigningKey: "preview-signing-key",
      previewModeEncryptionKey: "preview-encryption-key",
    },
  );

  const result = await workUnitAsyncStorage.run(store, () => callback(store));
  return { result, updates };
}

function forwardResponseCookies(responseHeaders: Headers, store: RequestStore) {
  for (const cookie of new ResponseCookies(responseHeaders).getAll()) {
    store.userspaceMutableCookies.set(cookie);
  }
}

describe("Server Action cookie context", () => {
  it("sets and clears only the customer cookie through real Next and Better Auth adapters", async () => {
    const database = await customerDatabase();
    const auth = createCustomerAuth({
      env: {
        NODE_ENV: "test",
        BETTER_AUTH_SECRET: TEST_SECRET,
        BETTER_AUTH_URL: BASE_URL,
        BETTER_AUTH_TRUSTED_ORIGINS: BASE_URL,
      },
      adapter: memoryAdapter(database),
    });
    const staffSignOut = vi.fn();
    const actionsForStore = (store: RequestStore) => {
      const dependencies: AuthActionDependencies = {
        customer: {
          async signInEmail(input) {
            const result = await auth.api.signInEmail({
              body: {
                email: input.email,
                password: input.password,
                rememberMe: true,
              },
              headers: input.headers,
              returnHeaders: true,
            });
            forwardResponseCookies(result.headers, store);
            return result.response;
          },
          async signOut({ headers: requestHeaders }) {
            const result = await auth.api.signOut({
              headers: requestHeaders,
              returnHeaders: true,
            });
            forwardResponseCookies(result.headers, store);
            return result.response;
          },
          async revokeNewSession(token) {
            (await auth.$context).internalAdapter.deleteSession(token);
          },
        },
        staff: {
          signInEmail: vi.fn(),
          signInUsername: vi.fn(),
          signOut: staffSignOut,
          revokeNewSession: vi.fn(),
        },
        users: {
          findByIdentifier: vi.fn().mockResolvedValue(activeCustomer),
          findById: vi.fn().mockResolvedValue(activeCustomer),
        },
        audit: { write: vi.fn().mockResolvedValue(undefined) },
        reportInternalError: vi.fn(),
        getHeaders: async () => new Headers(store.headers),
        getCookieStore: async () => store.userspaceMutableCookies,
      };
      return createAuthActions(dependencies);
    };
    const formData = new FormData();
    formData.set("email", "customer@example.test");
    formData.set("password", "ValidPass#12");

    const signedIn = await inNextActionContext(undefined, async (store) => {
      const result = await actionsForStore(store).customerLogin(
        AUTH_ACTION_INITIAL_STATE,
        formData,
      );
      return {
        result,
        cookie: store.userspaceMutableCookies.get("aap_customer_session")
          ?.value,
        staffCookie:
          store.userspaceMutableCookies.get("aap_staff_session")?.value,
      };
    });

    expect(signedIn.result.result).toEqual({
      kind: "success",
      redirectTo: "/console",
    });
    expect(signedIn.result.cookie).toBeTruthy();
    expect(signedIn.result.staffCookie).toBeUndefined();
    expect(signedIn.updates.join("\n")).toContain("aap_customer_session=");
    expect(signedIn.updates.join("\n")).not.toContain("aap_staff_session=");
    expect(database.session).toHaveLength(1);

    const signedOut = await inNextActionContext(
      `aap_customer_session=${signedIn.result.cookie}`,
      async (store) => actionsForStore(store).customerLogout(),
    );

    expect(signedOut.result).toEqual({ kind: "success", redirectTo: "/login" });
    expect(database.session).toEqual([]);
    expect(staffSignOut).not.toHaveBeenCalled();
    expect(signedOut.updates.join("\n")).toMatch(
      /aap_customer_session=;.*(?:Max-Age=0|Expires=Thu, 01 Jan 1970)/u,
    );
    expect(signedOut.updates.join("\n")).not.toContain("aap_staff_session=");
  });
});
