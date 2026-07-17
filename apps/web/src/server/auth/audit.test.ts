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

const assistantModelAuditEvents = [
  "assistant.model_config_save_requested",
  "assistant.model_config_saved",
  "assistant.model_config_test_requested",
  "assistant.model_config_tested",
  "assistant.model_config_activation_requested",
  "assistant.model_config_activated",
  "assistant.model_key_reveal_requested",
  "assistant.model_key_revealed",
] as const;

const assistantModelAuditMetadata = {
  provider: "openai",
  modelId: "gpt-5-mini",
  endpointId: "openai-primary",
  revision: 1,
  requestId: "request-1",
  result: "success",
} as const;

function expectInvalidAssistantModelAuditMetadata(
  metadata: Record<string, unknown>,
): void {
  const schema = (
    AUDIT_EVENT_SCHEMAS as Record<
      string,
      (value: unknown) => Record<string, unknown>
    >
  )["assistant.model_config_saved"];
  try {
    schema(metadata);
  } catch (error) {
    expect(error).toMatchObject({ code: "AUDIT_INPUT_INVALID" });
    return;
  }
  throw new Error("Expected assistant model audit metadata to be rejected");
}

describe("audit writer", () => {
  it("exports the complete current event schema and stores valid typed values", async () => {
    expect(Object.keys(AUDIT_EVENT_SCHEMAS).sort()).toEqual([
      "assistant.model_config_activated",
      "assistant.model_config_activation_requested",
      "assistant.model_config_save_requested",
      "assistant.model_config_saved",
      "assistant.model_config_test_requested",
      "assistant.model_config_tested",
      "assistant.model_key_reveal_requested",
      "assistant.model_key_revealed",
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
      "role.permissions_changed",
      "session.revoked",
      "site.config_changed",
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

  it.each(assistantModelAuditEvents)(
    "stores exact bounded model metadata for %s",
    async (event) => {
      const { repository, writer } = fixture();

      await writer.write({
        event,
        actor: { realm: "workforce", userId: "super-1" },
        target: { type: "assistant_model_config", id: "openai:1" },
        metadata: assistantModelAuditMetadata,
      } as never);

      expect(repository.insert).toHaveBeenCalledWith({
        action: event,
        actorRealm: "workforce",
        actorUserId: "super-1",
        targetType: "assistant_model_config",
        targetId: "openai:1",
        metadata: assistantModelAuditMetadata,
        ipAddress: null,
        userAgent: null,
      });
    },
  );

  it.each([
    "openai",
    "anthropic",
    "google",
    "dashscope",
    "deepseek",
    "minimax",
  ] as const)("accepts model audit provider %s", async (provider) => {
    const { repository, writer } = fixture();
    await writer.write({
      event: "assistant.model_config_saved",
      target: { type: "assistant_model_config" },
      metadata: { ...assistantModelAuditMetadata, provider },
    } as never);
    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { ...assistantModelAuditMetadata, provider },
      }),
    );
  });

  it.each(["requested", "success", "failure"] as const)(
    "accepts model audit result %s",
    async (result) => {
      const { repository, writer } = fixture();
      await writer.write({
        event: "assistant.model_config_tested",
        target: { type: "assistant_model_config" },
        metadata: { ...assistantModelAuditMetadata, result },
      } as never);
      expect(repository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { ...assistantModelAuditMetadata, result },
        }),
      );
    },
  );

  it.each([
    "apiKey",
    "lastFour",
    "ciphertext",
    "baseUrl",
    "prompt",
    "response",
    "nonce",
    "assertion",
    "error",
    "rawError",
    "errorMessage",
    "errorBody",
  ])("rejects model audit metadata field %s", (field) => {
    expectInvalidAssistantModelAuditMetadata({
      ...assistantModelAuditMetadata,
      [field]: "must-not-be-stored",
    });
  });

  it.each([
    ["provider", { ...assistantModelAuditMetadata, provider: "other" }],
    ["modelId", { ...assistantModelAuditMetadata, modelId: "" }],
    ["modelId", { ...assistantModelAuditMetadata, modelId: "x".repeat(129) }],
    ["modelId", { ...assistantModelAuditMetadata, modelId: "bad\nmodel" }],
    ["endpointId", { ...assistantModelAuditMetadata, endpointId: "" }],
    [
      "endpointId",
      { ...assistantModelAuditMetadata, endpointId: "x".repeat(65) },
    ],
    [
      "endpointId",
      { ...assistantModelAuditMetadata, endpointId: "bad\u0000endpoint" },
    ],
    ["revision", { ...assistantModelAuditMetadata, revision: -1 }],
    ["revision", { ...assistantModelAuditMetadata, revision: 1.5 }],
    ["revision", { ...assistantModelAuditMetadata, revision: Infinity }],
    ["requestId", { ...assistantModelAuditMetadata, requestId: "" }],
    [
      "requestId",
      { ...assistantModelAuditMetadata, requestId: "x".repeat(129) },
    ],
    [
      "requestId",
      { ...assistantModelAuditMetadata, requestId: "bad\u007frequest" },
    ],
    ["result", { ...assistantModelAuditMetadata, result: "unknown" }],
  ])("rejects invalid model audit metadata %s", (_field, metadata) => {
    expectInvalidAssistantModelAuditMetadata(metadata);
  });

  it.each([
    "provider",
    "modelId",
    "endpointId",
    "revision",
    "requestId",
    "result",
  ])("rejects model audit metadata missing %s", (field) => {
    const metadata: Record<string, unknown> = {
      ...assistantModelAuditMetadata,
    };
    delete metadata[field];

    expectInvalidAssistantModelAuditMetadata(metadata);
  });

  it.each([
    ["session.revoked", { revokedCount: 2 }, "session"],
    ["role.permissions_changed", { permissionCount: 3 }, "role"],
    ["site.config_changed", { field: "supportMessage" }, "system"],
  ] as const)(
    "accepts required administration event %s",
    async (event, metadata, targetType) => {
      const { repository, writer } = fixture();
      await writer.write({
        event,
        actor: { realm: "workforce", userId: "admin-1" },
        target: { type: targetType, id: "target-1" },
        metadata,
      } as never);
      expect(repository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ action: event, metadata }),
      );
    },
  );

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

  it.each(["role_added", "role_removed"] as const)(
    "stores exact actor, target, and role metadata for %s",
    async (change) => {
      const { repository, writer } = fixture();
      await writer.write({
        event: "workforce.user_updated",
        actor: { realm: "workforce", userId: "super-1" },
        target: { type: "user", id: "staff-1" },
        metadata: { change, role: "support_operator" },
      });
      expect(repository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: "super-1",
          targetId: "staff-1",
          metadata: { change, role: "support_operator" },
        }),
      );
    },
  );

  it("rejects role add/remove audit events without an exact role", async () => {
    const { repository, writer } = fixture();
    await expect(
      writer.write({
        event: "workforce.user_updated",
        target: { type: "user", id: "staff-1" },
        metadata: { change: "role_added" },
      } as never),
    ).rejects.toMatchObject({ code: "AUDIT_INPUT_INVALID" });
    expect(repository.insert).not.toHaveBeenCalled();
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
