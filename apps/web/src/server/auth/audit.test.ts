import { describe, expect, it, vi } from "vitest";

import {
  AUDIT_EVENT_SCHEMAS,
  createAuditWriter,
  type AuditRepository,
} from "./audit";

function fixture() {
  const repository: AuditRepository = {
    insert: vi.fn().mockResolvedValue(undefined),
  };
  return { repository, writer: createAuditWriter(repository) };
}

describe("audit writer", () => {
  it("exports the complete current event schema and stores valid typed values", async () => {
    expect(Object.keys(AUDIT_EVENT_SCHEMAS).sort()).toEqual([
      "auth.login_failure",
      "auth.login_success",
      "auth.logout",
      "auth.password_changed",
      "auth.recovery_code_used",
      "auth.totp_disabled",
      "auth.totp_enabled",
      "bootstrap.super_admin_created",
      "registration.approved",
      "registration.rejected",
      "registration.submitted",
      "workforce.user_created",
      "workforce.user_updated",
    ]);
    const { repository, writer } = fixture();

    await writer.write({
      event: "auth.login_failure",
      actor: { realm: "workforce", userId: "staff-1" },
      target: { type: "user", id: "target-1" },
      ipAddress: "192.0.2.10",
      userAgent: "browser",
      metadata: { reason: "invalid_credentials" },
    });

    expect(repository.insert).toHaveBeenCalledWith({
      action: "auth.login_failure",
      actorRealm: "workforce",
      actorUserId: "staff-1",
      targetType: "user",
      targetId: "target-1",
      ipAddress: "192.0.2.10",
      userAgent: "browser",
      metadata: { reason: "invalid_credentials" },
    });
  });

  it.each([
    {
      event: "auth.login_failure",
      target: { type: "user" },
      metadata: { reason: "free text review note" },
    },
    {
      event: "registration.rejected",
      target: { type: "registration" },
      metadata: { reason: "private review note" },
    },
    {
      event: "auth.login_failure",
      target: { type: "user" },
      metadata: { reason: { password: "nested" } },
    },
    {
      event: "auth.login_success",
      target: { type: "user" },
      metadata: { method: "oauth" },
    },
  ])(
    "rejects a missing or invalid event-allowed metadata value %#",
    async (input) => {
      const { repository, writer } = fixture();

      await expect(writer.write(input as never)).rejects.toMatchObject({
        code: "AUDIT_INPUT_INVALID",
      });
      expect(repository.insert).not.toHaveBeenCalled();
    },
  );

  it("drops unknown, sensitive, and nested unknown keys while keeping the allowed value", async () => {
    const { repository, writer } = fixture();

    await writer.write({
      event: "auth.login_failure",
      target: { type: "user" },
      metadata: {
        reason: "invalid_credentials",
        password: "secret",
        passwordHash: "hash",
        sessionToken: "session-token",
        tokenHash: "token-hash",
        totpSecret: "totp-secret",
        unknown: "drop",
        nested: { token: "hidden" },
      },
    } as never);

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { reason: "invalid_credentials" } }),
    );
  });

  it("never reads an inherited allowed metadata key", async () => {
    const { repository, writer } = fixture();
    const metadata = Object.create({ reason: "invalid_credentials" }) as Record<
      string,
      unknown
    >;
    metadata.password = "secret";

    await expect(
      writer.write({
        event: "auth.login_failure",
        target: { type: "user" },
        metadata,
      } as never),
    ).rejects.toMatchObject({ code: "AUDIT_INPUT_INVALID" });
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it("drops own prototype-named metadata keys without throwing", async () => {
    const { repository, writer } = fixture();
    const metadata: Record<string, unknown> = {
      reason: "invalid_credentials",
      constructor: { password: "secret" },
      toString: "secret",
    };
    Object.defineProperty(metadata, "__proto__", {
      value: { token: "hidden" },
      enumerable: true,
    });

    await writer.write({
      event: "auth.login_failure",
      target: { type: "user" },
      metadata,
    } as never);

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { reason: "invalid_credentials" } }),
    );
  });

  it.each([NaN, Infinity, -1, 1.5, 10_001])(
    "rejects unsafe sessionsRevoked value %s",
    async (sessionsRevoked) => {
      const { repository, writer } = fixture();
      await expect(
        writer.write({
          event: "auth.password_changed",
          target: { type: "user" },
          metadata: { sessionsRevoked },
        }),
      ).rejects.toMatchObject({ code: "AUDIT_INPUT_INVALID" });
      expect(repository.insert).not.toHaveBeenCalled();
    },
  );

  it.each([
    { target: { type: "anything" } },
    { target: { type: "user", id: "x".repeat(129) } },
    { target: { type: "user", id: "bad\nvalue" } },
    { target: { type: "user" }, userAgent: "x".repeat(513) },
    { target: { type: "user" }, userAgent: "bad\u0000agent" },
    { target: { type: "user" }, ipAddress: "x".repeat(65) },
    {
      target: { type: "user" },
      actor: { realm: "workforce", userId: "x".repeat(129) },
    },
    {
      target: { type: "user" },
      actor: { realm: "external", userId: "actor-1" },
    },
    { target: { type: "user", password: "secret" } },
    { target: { type: "user" }, password: "secret" },
  ])("rejects invalid envelope values %#", async (overrides) => {
    const { repository, writer } = fixture();
    await expect(
      writer.write({
        event: "auth.logout",
        ...overrides,
      } as never),
    ).rejects.toMatchObject({ code: "AUDIT_INPUT_INVALID" });
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it.each(["constructor", "toString", "__proto__"])(
    "rejects inherited schema-map event %s",
    async (event) => {
      const { repository, writer } = fixture();
      await expect(
        writer.write({
          event,
          target: { type: "user" },
          metadata: { password: "secret", nested: { token: "hidden" } },
        } as never),
      ).rejects.toMatchObject({ code: "AUDIT_INPUT_INVALID" });
      expect(repository.insert).not.toHaveBeenCalled();
    },
  );

  it("stores a rejection category but never a free-text review note", async () => {
    const { repository, writer } = fixture();

    await writer.write({
      event: "registration.rejected",
      target: { type: "registration", id: "registration-1" },
      metadata: { category: "ineligible" },
    });

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { category: "ineligible" } }),
    );
  });

  it("stores an exact role_changed transition", async () => {
    const { repository, writer } = fixture();
    await writer.write({
      event: "workforce.user_updated",
      target: { type: "user", id: "staff-1" },
      metadata: {
        change: "role_changed",
        fromRole: "employee",
        toRole: "admin",
      },
    });
    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          change: "role_changed",
          fromRole: "employee",
          toRole: "admin",
        },
      }),
    );
  });

  it("propagates database failures", async () => {
    const writer = createAuditWriter({
      insert: vi.fn().mockRejectedValue(new Error("database unavailable")),
    });

    await expect(
      writer.write({
        event: "auth.logout",
        target: { type: "session" },
      }),
    ).rejects.toThrow("database unavailable");
  });
});
