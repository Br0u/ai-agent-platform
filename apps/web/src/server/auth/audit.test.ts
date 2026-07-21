import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  AUDIT_EVENT_SCHEMAS,
  createDatabaseAuditRepository,
  createAuditWriter,
  type AuditEvent,
  type AuditRepository,
  type AuditWriteInput,
} from "./audit";

function fixture() {
  const repository: AuditRepository = {
    insert: vi.fn().mockResolvedValue(undefined),
  };
  return { repository, writer: createAuditWriter(repository) };
}

function runtimeAuditInput(input: unknown): AuditWriteInput {
  return input as AuditWriteInput;
}

const requestedAssistantModelAuditEvents = [
  "assistant.model_config_save_requested",
  "assistant.model_config_test_requested",
  "assistant.model_config_activation_requested",
  "assistant.model_key_reveal_requested",
] as const satisfies readonly AuditEvent[];

const completedAssistantModelAuditEvents = [
  "assistant.model_config_saved",
  "assistant.model_config_tested",
  "assistant.model_config_activated",
  "assistant.model_key_revealed",
] as const satisfies readonly AuditEvent[];

const assistantModelAuditMetadataBase = {
  provider: "openai",
  modelId: "gpt-5-mini",
  endpointId: "openai-primary",
  revision: 1,
  requestId: "request-1",
} as const;

const completedAssistantModelAuditMetadata = {
  ...assistantModelAuditMetadataBase,
  result: "success",
} as const;

const requestedAssistantSkillAuditEvents = [
  "assistant.skill_upload_requested",
  "assistant.skill_review_requested",
] as const satisfies readonly AuditEvent[];

const completedAssistantSkillAuditEvents = [
  "assistant.skill_upload_completed",
  "assistant.skill_review_completed",
] as const satisfies readonly AuditEvent[];

const assistantSkillAuditMetadataBase = {
  skillId: "11111111-1111-4111-8111-111111111111",
  revisionId: "22222222-2222-4222-8222-222222222222",
  revisionNo: 3,
  digest: "0123456789ab",
  requestId: "33333333-3333-4333-8333-333333333333",
} as const;

const assistantModelAuditInputs = [
  ...requestedAssistantModelAuditEvents.map((event) => ({
    event,
    actor: { realm: "workforce" as const, userId: "super-1" },
    target: {
      type: "assistant_model_config" as const,
      id: "openai:1",
    },
    metadata: {
      ...assistantModelAuditMetadataBase,
      result: "requested" as const,
    },
  })),
  ...completedAssistantModelAuditEvents.map((event) => ({
    event,
    actor: { realm: "workforce" as const, userId: "super-1" },
    target: {
      type: "assistant_model_config" as const,
      id: "openai:1",
    },
    metadata: completedAssistantModelAuditMetadata,
  })),
] satisfies readonly AuditWriteInput[];

const administrationAuditInputs = [
  {
    event: "session.revoked",
    actor: { realm: "workforce", userId: "admin-1" },
    target: { type: "session", id: "target-1" },
    metadata: { revokedCount: 2 },
  },
  {
    event: "role.permissions_changed",
    actor: { realm: "workforce", userId: "admin-1" },
    target: { type: "role", id: "target-1" },
    metadata: { permissionCount: 3 },
  },
  {
    event: "site.config_changed",
    actor: { realm: "workforce", userId: "admin-1" },
    target: { type: "system", id: "target-1" },
    metadata: { field: "supportMessage" },
  },
] as const satisfies readonly AuditWriteInput[];

function expectInvalidAssistantModelAuditMetadata(
  metadata: Record<string, unknown>,
): void {
  try {
    AUDIT_EVENT_SCHEMAS["assistant.model_config_saved"](metadata);
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
      "assistant.skill_review_completed",
      "assistant.skill_review_requested",
      "assistant.skill_upload_completed",
      "assistant.skill_upload_requested",
      "auth.login_failure",
      "auth.login_success",
      "auth.logout",
      "auth.password_changed",
      "auth.recovery_code_used",
      "auth.totp_disabled",
      "auth.totp_enabled",
      "bootstrap.super_admin_created",
      "document.archived",
      "document.created",
      "document.deleted",
      "document.draft_saved",
      "document.published",
      "document.restored",
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

  it("writes database audit records through the supplied transaction", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const transaction = { insert } as unknown as Parameters<
      typeof createDatabaseAuditRepository
    >[0];

    await createDatabaseAuditRepository(transaction).insert({
      action: "document.created",
      actorRealm: "workforce",
      actorUserId: "admin-1",
      targetType: "document",
      targetId: "doc-1",
      metadata: { slug: "quick-start", revision: 1, result: "success" },
      ipAddress: null,
      userAgent: null,
    });

    expect(insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.created" }),
    );
  });

  it.each([
    "document.created",
    "document.draft_saved",
    "document.published",
    "document.archived",
    "document.deleted",
    "document.restored",
  ] as const)("stores exact bounded metadata for %s", async (event) => {
    const { repository, writer } = fixture();

    await writer.write({
      event,
      actor: { realm: "workforce", userId: "admin-1" },
      target: { type: "document", id: "doc-1" },
      metadata: { slug: "quick-start", revision: 2, result: "success" },
    });

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: event,
        targetType: "document",
        metadata: { slug: "quick-start", revision: 2, result: "success" },
      }),
    );
  });

  it.each(["source", "renderModel", "title", "summary"])(
    "rejects document metadata field %s",
    (field) => {
      expect(() =>
        AUDIT_EVENT_SCHEMAS["document.created"]({
          slug: "quick-start",
          revision: 1,
          result: "success",
          [field]: "must-not-be-stored",
        }),
      ).toThrow(expect.objectContaining({ code: "AUDIT_INPUT_INVALID" }));
    },
  );

  it.each([
    { slug: "x".repeat(97), revision: 1, result: "success" },
    { slug: "bad\nslug", revision: 1, result: "success" },
    { slug: "quick-start", revision: 0, result: "success" },
    { slug: "quick-start", revision: 1.5, result: "success" },
    { slug: "quick-start", revision: 1, result: "failure" },
    { slug: "quick-start", revision: { value: 1 }, result: "success" },
  ])("rejects unbounded document metadata %#", (metadata) => {
    expect(() => AUDIT_EVENT_SCHEMAS["document.created"](metadata)).toThrow(
      expect.objectContaining({ code: "AUDIT_INPUT_INVALID" }),
    );
  });

  it.each(assistantModelAuditInputs)(
    "stores exact bounded model metadata for $event",
    async (input) => {
      const { repository, writer } = fixture();

      await writer.write(input);

      expect(repository.insert).toHaveBeenCalledWith({
        action: input.event,
        actorRealm: "workforce",
        actorUserId: "super-1",
        targetType: "assistant_model_config",
        targetId: "openai:1",
        metadata: input.metadata,
        ipAddress: null,
        userAgent: null,
      });
    },
  );

  it.each([
    ...requestedAssistantSkillAuditEvents.map((event) => ({
      event,
      result: "requested" as const,
    })),
    ...completedAssistantSkillAuditEvents.map((event) => ({
      event,
      result: "success" as const,
    })),
  ])(
    "stores exact bounded Skill metadata for $event",
    async ({ event, result }) => {
      const { repository, writer } = fixture();
      const metadata = { ...assistantSkillAuditMetadataBase, result };

      await writer.write({
        event,
        actor: { realm: "workforce", userId: "admin-1" },
        target: {
          type: "assistant_skill_revision",
          id: assistantSkillAuditMetadataBase.revisionId,
        },
        metadata,
      } as AuditWriteInput);

      expect(repository.insert).toHaveBeenCalledWith({
        action: event,
        actorRealm: "workforce",
        actorUserId: "admin-1",
        targetType: "assistant_skill_revision",
        targetId: assistantSkillAuditMetadataBase.revisionId,
        metadata,
        ipAddress: null,
        userAgent: null,
      });
    },
  );

  it("exposes phase-specific Skill audit results", () => {
    type Requested = Extract<
      AuditWriteInput,
      { event: "assistant.skill_upload_requested" }
    >;
    type Completed = Extract<
      AuditWriteInput,
      { event: "assistant.skill_upload_completed" }
    >;

    expectTypeOf<
      Requested["metadata"]["result"]
    >().toEqualTypeOf<"requested">();
    expectTypeOf<Completed["metadata"]["result"]>().toEqualTypeOf<
      "success" | "failure"
    >();
  });

  it.each([
    "filename",
    "archive",
    "zip",
    "source",
    "reason",
    "rejectReason",
    "scan",
    "findings",
    "message",
  ])("rejects sensitive Skill audit metadata field %s", (field) => {
    expect(() =>
      AUDIT_EVENT_SCHEMAS["assistant.skill_upload_completed"]({
        ...assistantSkillAuditMetadataBase,
        result: "failure",
        [field]: "must-not-be-stored",
      }),
    ).toThrow(expect.objectContaining({ code: "AUDIT_INPUT_INVALID" }));
  });

  it.each([
    { ...assistantSkillAuditMetadataBase, result: "requested" },
    {
      ...assistantSkillAuditMetadataBase,
      skillId: "not-a-uuid",
      result: "success",
    },
    { ...assistantSkillAuditMetadataBase, revisionNo: 0, result: "success" },
    {
      ...assistantSkillAuditMetadataBase,
      digest: "0123456789AB",
      result: "success",
    },
    {
      ...assistantSkillAuditMetadataBase,
      digest: "0123456789abcdef",
      result: "success",
    },
  ])("rejects invalid completed Skill metadata %#", (metadata) => {
    expect(() =>
      AUDIT_EVENT_SCHEMAS["assistant.skill_upload_completed"](metadata),
    ).toThrow(expect.objectContaining({ code: "AUDIT_INPUT_INVALID" }));
  });

  it("rejects Skill metadata prototype, accessors, hidden and symbol keys without executing getters", () => {
    const getter = vi.fn(() => assistantSkillAuditMetadataBase.digest);
    const accessor = { ...assistantSkillAuditMetadataBase, result: "success" };
    Object.defineProperty(accessor, "digest", {
      get: getter,
      enumerable: true,
    });
    const hidden = { ...assistantSkillAuditMetadataBase, result: "success" };
    Object.defineProperty(hidden, "filename", {
      value: "private.zip",
      enumerable: false,
    });
    const symbol = { ...assistantSkillAuditMetadataBase, result: "success" };
    Reflect.set(symbol, Symbol("source"), "private source");
    const inherited = Object.assign(
      Object.create({ source: "private source" }),
      assistantSkillAuditMetadataBase,
      { result: "success" },
    );

    for (const metadata of [accessor, hidden, symbol, inherited]) {
      expect(() =>
        AUDIT_EVENT_SCHEMAS["assistant.skill_upload_completed"](metadata),
      ).toThrow(expect.objectContaining({ code: "AUDIT_INPUT_INVALID" }));
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it("exposes phase-specific model audit result types", () => {
    type RequestedInput = Extract<
      AuditWriteInput,
      { event: "assistant.model_config_save_requested" }
    >;
    type CompletedInput = Extract<
      AuditWriteInput,
      { event: "assistant.model_config_saved" }
    >;

    expectTypeOf<
      RequestedInput["metadata"]["result"]
    >().toEqualTypeOf<"requested">();
    expectTypeOf<CompletedInput["metadata"]["result"]>().toEqualTypeOf<
      "success" | "failure"
    >();
  });

  it.each(requestedAssistantModelAuditEvents)(
    "rejects completed results for requested event %s",
    (event) => {
      for (const result of ["success", "failure"] as const) {
        expect(() =>
          AUDIT_EVENT_SCHEMAS[event]({
            ...assistantModelAuditMetadataBase,
            result,
          }),
        ).toThrow(expect.objectContaining({ code: "AUDIT_INPUT_INVALID" }));
      }
    },
  );

  it.each(completedAssistantModelAuditEvents)(
    "rejects requested result for completed event %s",
    (event) => {
      expect(() =>
        AUDIT_EVENT_SCHEMAS[event]({
          ...assistantModelAuditMetadataBase,
          result: "requested",
        }),
      ).toThrow(expect.objectContaining({ code: "AUDIT_INPUT_INVALID" }));
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
    const input = {
      event: "assistant.model_config_saved",
      target: { type: "assistant_model_config" },
      metadata: { ...completedAssistantModelAuditMetadata, provider },
    } satisfies AuditWriteInput;
    await writer.write(input);
    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { ...completedAssistantModelAuditMetadata, provider },
      }),
    );
  });

  it.each(["success", "failure"] as const)(
    "accepts completed model audit result %s",
    async (result) => {
      const { repository, writer } = fixture();
      const input = {
        event: "assistant.model_config_tested",
        target: { type: "assistant_model_config" },
        metadata: { ...completedAssistantModelAuditMetadata, result },
      } satisfies AuditWriteInput;
      await writer.write(input);
      expect(repository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { ...completedAssistantModelAuditMetadata, result },
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
      ...completedAssistantModelAuditMetadata,
      [field]: "must-not-be-stored",
    });
  });

  it.each([
    [
      "provider",
      { ...completedAssistantModelAuditMetadata, provider: "other" },
    ],
    ["modelId", { ...completedAssistantModelAuditMetadata, modelId: "" }],
    [
      "modelId",
      { ...completedAssistantModelAuditMetadata, modelId: "x".repeat(129) },
    ],
    [
      "modelId",
      { ...completedAssistantModelAuditMetadata, modelId: "bad\nmodel" },
    ],
    ["endpointId", { ...completedAssistantModelAuditMetadata, endpointId: "" }],
    [
      "endpointId",
      { ...completedAssistantModelAuditMetadata, endpointId: "x".repeat(65) },
    ],
    [
      "endpointId",
      {
        ...completedAssistantModelAuditMetadata,
        endpointId: "bad\u0000endpoint",
      },
    ],
    ["revision", { ...completedAssistantModelAuditMetadata, revision: -1 }],
    ["revision", { ...completedAssistantModelAuditMetadata, revision: 1.5 }],
    [
      "revision",
      { ...completedAssistantModelAuditMetadata, revision: Infinity },
    ],
    ["requestId", { ...completedAssistantModelAuditMetadata, requestId: "" }],
    [
      "requestId",
      { ...completedAssistantModelAuditMetadata, requestId: "x".repeat(129) },
    ],
    [
      "requestId",
      {
        ...completedAssistantModelAuditMetadata,
        requestId: "bad\u007frequest",
      },
    ],
    ["result", { ...completedAssistantModelAuditMetadata, result: "unknown" }],
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
      ...completedAssistantModelAuditMetadata,
    };
    delete metadata[field];

    expectInvalidAssistantModelAuditMetadata(metadata);
  });

  it.each(administrationAuditInputs)(
    "accepts required administration event $event",
    async (input) => {
      const { repository, writer } = fixture();
      await writer.write(input);
      expect(repository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: input.event,
          metadata: input.metadata,
        }),
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

      await expect(
        writer.write(runtimeAuditInput(input)),
      ).rejects.toMatchObject({
        code: "AUDIT_INPUT_INVALID",
      });
      expect(repository.insert).not.toHaveBeenCalled();
    },
  );

  it("drops unknown, sensitive, and nested unknown keys while keeping the allowed value", async () => {
    const { repository, writer } = fixture();

    await writer.write(
      runtimeAuditInput({
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
      }),
    );

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
      writer.write(
        runtimeAuditInput({
          event: "auth.login_failure",
          target: { type: "user" },
          metadata,
        }),
      ),
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

    await writer.write(
      runtimeAuditInput({
        event: "auth.login_failure",
        target: { type: "user" },
        metadata,
      }),
    );

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
      writer.write(
        runtimeAuditInput({
          event: "auth.logout",
          ...overrides,
        }),
      ),
    ).rejects.toMatchObject({ code: "AUDIT_INPUT_INVALID" });
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it.each(["constructor", "toString", "__proto__"])(
    "rejects inherited schema-map event %s",
    async (event) => {
      const { repository, writer } = fixture();
      await expect(
        writer.write(
          runtimeAuditInput({
            event,
            target: { type: "user" },
            metadata: { password: "secret", nested: { token: "hidden" } },
          }),
        ),
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
      writer.write(
        runtimeAuditInput({
          event: "workforce.user_updated",
          target: { type: "user", id: "staff-1" },
          metadata: { change: "role_added" },
        }),
      ),
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
