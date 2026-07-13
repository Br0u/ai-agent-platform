import { describe, expect, it, vi } from "vitest";

import {
  ASSISTANT_ABSOLUTE_TTL_MS,
  ASSISTANT_IDLE_TTL_MS,
  createAnonymousSessionManager,
  getAnonymousSessionManager,
} from "./anonymous-session";
import {
  resolveAnonymousSessionSettings,
  validateAnonymousSessionRuntimeConfig,
} from "./anonymous-session-config";

const SECRET = "0123456789abcdef0123456789abcdef";
const START = Date.parse("2026-07-13T11:30:00.000Z");

function settings(
  overrides: Partial<
    Record<"ASSISTANT_PUBLIC_ORIGIN" | "ASSISTANT_SESSION_SECRET", string>
  > = {},
) {
  return resolveAnonymousSessionSettings({
    ASSISTANT_PUBLIC_ORIGIN: "https://portal.example.com",
    ASSISTANT_SESSION_SECRET: SECRET,
    ...overrides,
  });
}

function fixture(options?: { origin?: string; now?: number }) {
  let now = options?.now ?? START;
  let seed = 0;
  const manager = createAnonymousSessionManager({
    settings: settings(
      options?.origin ? { ASSISTANT_PUBLIC_ORIGIN: options.origin } : undefined,
    ),
    now: () => now,
    randomBytes: (length) => {
      seed += 1;
      return Uint8Array.from({ length }, (_, index) => (seed + index) % 256);
    },
  });

  return {
    manager,
    setNow(value: number) {
      now = value;
    },
  };
}

function cookieHeader(name: string, value: string) {
  return new Headers({ cookie: `${name}=${value}` });
}

describe("assistant anonymous session settings", () => {
  it("validates runtime settings once and lets the request manager reuse them", () => {
    const first = validateAnonymousSessionRuntimeConfig({
      ASSISTANT_PUBLIC_ORIGIN: "https://cached.example.com",
      ASSISTANT_SESSION_SECRET: SECRET,
    });
    const second = validateAnonymousSessionRuntimeConfig({
      ASSISTANT_PUBLIC_ORIGIN: "http://unsafe.example.com",
      ASSISTANT_SESSION_SECRET: "short",
    });

    expect(second).toBe(first);
    expect(first.publicOrigin).toBe("https://cached.example.com");
    expect(() => getAnonymousSessionManager()).not.toThrow();
  });

  it("uses a secure __Host cookie for an exact HTTPS public origin", () => {
    const resolved = settings();

    expect(resolved.publicOrigin).toBe("https://portal.example.com");
    expect(resolved.cookie).toEqual({
      name: "__Host-aap_assistant_sid",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
      },
    });
    expect(resolved.cookie.options).not.toHaveProperty("domain");
  });

  it.each([
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://[::1]:3000",
  ])("uses the explicit development cookie for loopback HTTP: %s", (origin) => {
    const resolved = settings({ ASSISTANT_PUBLIC_ORIGIN: origin });

    expect(resolved.cookie.name).toBe("aap_assistant_sid_dev");
    expect(resolved.cookie.options.secure).toBe(false);
  });

  it.each([
    "http://portal.example.com",
    "http://0.0.0.0:3000",
    "http://127.0.0.2:3000",
    "ftp://127.0.0.1:3000",
    "https://user:pass@portal.example.com",
    "https://portal.example.com/path",
    "https://portal.example.com?query=1",
    "https://portal.example.com#fragment",
    " https://portal.example.com",
    "https://portal.example.com/",
  ])("rejects a non-canonical or unsafe public origin: %s", (origin) => {
    expect(() => settings({ ASSISTANT_PUBLIC_ORIGIN: origin })).toThrow(
      "ASSISTANT_PUBLIC_ORIGIN",
    );
  });

  it("requires at least 32 encoded secret bytes", () => {
    expect(() =>
      settings({ ASSISTANT_SESSION_SECRET: "a".repeat(31) }),
    ).toThrow("ASSISTANT_SESSION_SECRET");
    expect(() =>
      settings({ ASSISTANT_SESSION_SECRET: "😀".repeat(8) }),
    ).not.toThrow();
  });

  it("fails closed when required settings are absent", () => {
    expect(() => resolveAnonymousSessionSettings({})).toThrow(
      "ASSISTANT_PUBLIC_ORIGIN",
    );
    expect(() =>
      resolveAnonymousSessionSettings({
        ASSISTANT_PUBLIC_ORIGIN: "https://portal.example.com",
      }),
    ).toThrow("ASSISTANT_SESSION_SECRET");
  });
});

describe("assistant anonymous session lifecycle", () => {
  it("issues a signed 256-bit session without exposing credentials in public metadata", () => {
    const { manager } = fixture();
    const resolved = manager.resolve(new Headers(), { kind: "anonymous" });

    expect(resolved.cookie.name).toBe("__Host-aap_assistant_sid");
    expect(resolved.cookie.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
    });
    expect(resolved.cookie.value).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    expect(resolved.publicSession).toEqual({
      temporary: true,
      expiresAt: "2026-07-13T12:00:00.000Z",
    });
    expect(resolved.rotated).toBe(true);
    expect(resolved.internalSessionId).not.toBe(resolved.cookie.value);
    expect(JSON.stringify(resolved.publicSession)).not.toContain(
      resolved.cookie.value,
    );
    expect(JSON.stringify(resolved.safeMetadata)).not.toContain(
      resolved.cookie.value,
    );
    expect(JSON.stringify(resolved.safeMetadata)).not.toContain(
      resolved.internalSessionId,
    );
  });

  it("refreshes the idle window without exceeding the absolute expiry", () => {
    const { manager, setNow } = fixture();
    const first = manager.resolve(new Headers(), { kind: "anonymous" });

    setNow(START + 20 * 60 * 1000);
    const refreshed = manager.resolve(
      cookieHeader(first.cookie.name, first.cookie.value),
      { kind: "anonymous" },
    );
    expect(refreshed.rotated).toBe(false);
    expect(refreshed.refreshed).toBe(true);
    expect(refreshed.publicSession.expiresAt).toBe("2026-07-13T12:20:00.000Z");

    let active = refreshed;
    for (
      let elapsed = 40 * 60 * 1000;
      elapsed < ASSISTANT_ABSOLUTE_TTL_MS - 10 * 60 * 1000;
      elapsed += 20 * 60 * 1000
    ) {
      setNow(START + elapsed);
      active = manager.resolve(
        cookieHeader(active.cookie.name, active.cookie.value),
        { kind: "anonymous" },
      );
    }
    setNow(START + ASSISTANT_ABSOLUTE_TTL_MS - 10 * 60 * 1000);
    const nearAbsolute = manager.resolve(
      cookieHeader(active.cookie.name, active.cookie.value),
      { kind: "anonymous" },
    );
    expect(nearAbsolute.publicSession.expiresAt).toBe(
      new Date(START + ASSISTANT_ABSOLUTE_TTL_MS).toISOString(),
    );
  });

  it("rotates at the idle and absolute boundaries", () => {
    const idle = fixture();
    const first = idle.manager.resolve(new Headers(), { kind: "anonymous" });
    idle.setNow(START + ASSISTANT_IDLE_TTL_MS);
    const idleRotated = idle.manager.resolve(
      cookieHeader(first.cookie.name, first.cookie.value),
      { kind: "anonymous" },
    );
    expect(idleRotated.rotated).toBe(true);
    expect(idleRotated.cookie.value).not.toBe(first.cookie.value);

    const absolute = fixture();
    const initial = absolute.manager.resolve(new Headers(), {
      kind: "anonymous",
    });
    let current = initial;
    for (
      let elapsed = 20 * 60 * 1000;
      elapsed < ASSISTANT_ABSOLUTE_TTL_MS;
      elapsed += 20 * 60 * 1000
    ) {
      absolute.setNow(START + elapsed);
      current = absolute.manager.resolve(
        cookieHeader(current.cookie.name, current.cookie.value),
        { kind: "anonymous" },
      );
    }
    absolute.setNow(START + ASSISTANT_ABSOLUTE_TTL_MS);
    const absoluteRotated = absolute.manager.resolve(
      cookieHeader(current.cookie.name, current.cookie.value),
      { kind: "anonymous" },
    );
    expect(absoluteRotated.rotated).toBe(true);
  });

  it.each([
    ["malformed", "not-a-session"],
    ["non-canonical base64url", "abc=.def"],
  ])("rotates a %s cookie", (_name, value) => {
    const { manager } = fixture();
    const rotated = manager.resolve(
      cookieHeader("__Host-aap_assistant_sid", value),
      { kind: "anonymous" },
    );
    expect(rotated.rotated).toBe(true);
    expect(rotated.cookie.value).not.toBe(value);
  });

  it("rotates a modified signature", () => {
    const { manager } = fixture();
    const first = manager.resolve(new Headers(), { kind: "anonymous" });
    const changed = `${first.cookie.value.slice(0, -1)}${first.cookie.value.endsWith("A") ? "B" : "A"}`;

    const rotated = manager.resolve(cookieHeader(first.cookie.name, changed), {
      kind: "anonymous",
    });
    expect(rotated.rotated).toBe(true);
    expect(rotated.cookie.value).not.toBe(changed);
  });

  it("rejects ambiguous duplicate environment cookie names", () => {
    const { manager } = fixture();
    const first = manager.resolve(new Headers(), { kind: "anonymous" });
    const headers = new Headers({
      cookie: `${first.cookie.name}=${first.cookie.value}; ${first.cookie.name}=${first.cookie.value}`,
    });

    expect(manager.inspect(headers, { kind: "anonymous" })).toEqual({
      kind: "invalid",
    });
    expect(manager.resolve(headers, { kind: "anonymous" }).rotated).toBe(true);
  });

  it("rotates across anonymous/customer and customer identity changes", () => {
    const { manager } = fixture();
    const anonymous = manager.resolve(new Headers(), { kind: "anonymous" });
    const customer = manager.resolve(
      cookieHeader(anonymous.cookie.name, anonymous.cookie.value),
      { kind: "customer", userId: "customer-1" },
    );
    const anotherCustomer = manager.resolve(
      cookieHeader(customer.cookie.name, customer.cookie.value),
      { kind: "customer", userId: "customer-2" },
    );
    const anonymousAgain = manager.resolve(
      cookieHeader(anotherCustomer.cookie.name, anotherCustomer.cookie.value),
      { kind: "anonymous" },
    );

    expect(customer.rotated).toBe(true);
    expect(anotherCustomer.rotated).toBe(true);
    expect(anonymousAgain.rotated).toBe(true);
    expect(
      new Set([
        anonymous.cookie.value,
        customer.cookie.value,
        anotherCustomer.cookie.value,
        anonymousAgain.cookie.value,
      ]).size,
    ).toBe(4);
  });

  it("refreshes the same customer binding without serializing the customer ID", () => {
    const { manager } = fixture();
    const customerId = "customer-private-identifier";
    const first = manager.resolve(new Headers(), {
      kind: "customer",
      userId: customerId,
    });
    const refreshed = manager.resolve(
      cookieHeader(first.cookie.name, first.cookie.value),
      { kind: "customer", userId: customerId },
    );
    const [payload = ""] = first.cookie.value.split(".");
    const decodedPayload = Buffer.from(payload, "base64url").toString("utf8");

    expect(refreshed.rotated).toBe(false);
    expect(decodedPayload).not.toContain(customerId);
    expect(JSON.stringify(first.safeMetadata)).not.toContain(customerId);
  });

  it("rotates a cookie issued in the future instead of accepting clock rollback", () => {
    const { manager, setNow } = fixture();
    const first = manager.resolve(new Headers(), { kind: "anonymous" });
    setNow(START - 1);

    const rotated = manager.resolve(
      cookieHeader(first.cookie.name, first.cookie.value),
      { kind: "anonymous" },
    );
    expect(rotated.rotated).toBe(true);
    expect(rotated.cookie.value).not.toBe(first.cookie.value);
  });

  it("derives a stable domain-separated internal ID without exposing the credential", () => {
    const { manager } = fixture();
    const first = manager.resolve(new Headers(), { kind: "anonymous" });
    const inspected = manager.inspect(
      cookieHeader(first.cookie.name, first.cookie.value),
      { kind: "anonymous" },
    );

    expect(inspected).toEqual({
      kind: "valid",
      internalSessionId: first.internalSessionId,
    });
    expect(first.internalSessionId).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(first.cookie.value).not.toContain(first.internalSessionId);
  });

  it("does not let request headers downgrade the configured HTTPS policy", () => {
    const { manager } = fixture();
    const result = manager.resolve(
      new Headers({
        host: "127.0.0.1:3000",
        "x-forwarded-proto": "http",
      }),
      { kind: "anonymous" },
    );

    expect(result.cookie.name).toBe("__Host-aap_assistant_sid");
    expect(result.cookie.options.secure).toBe(true);
    expect(result.setCookie).toContain("; Secure");
    expect(result.setCookie).not.toMatch(/; Domain=/iu);
  });

  it("serializes exact environment cookie attributes and deletion", () => {
    const secure = fixture().manager;
    expect(
      secure.resolve(new Headers(), { kind: "anonymous" }).setCookie,
    ).toMatch(
      /^__Host-aap_assistant_sid=.*; Path=\/; Expires=.*; HttpOnly; Secure; SameSite=Lax$/u,
    );
    expect(secure.clearCookie()).toBe(
      "__Host-aap_assistant_sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    );

    const local = fixture({ origin: "http://127.0.0.1:3000" }).manager;
    expect(local.clearCookie()).toBe(
      "aap_assistant_sid_dev=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax",
    );
  });

  it("uses the injected cryptographic random source for a full 32 bytes", () => {
    const randomBytes = vi.fn((length: number) => new Uint8Array(length));
    const manager = createAnonymousSessionManager({
      settings: settings(),
      now: () => START,
      randomBytes,
    });

    manager.resolve(new Headers(), { kind: "anonymous" });
    expect(randomBytes).toHaveBeenCalledExactlyOnceWith(32);
  });
});
