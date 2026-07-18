import { describe, expect, it, vi } from "vitest";

import type { AdminModelConfigSaveInput } from "@/features/assistant/admin-model-config-contract";
import type { WorkforceActor } from "../auth/access";
import type { AuditWriteInput } from "../auth/audit";
import { SensitiveActionError } from "../auth/sensitive-action";
import { MutationRequestError } from "../http/require-trusted-mutation";
import {
  AdminModelConfigCommandError,
  createAdminModelConfigCommands,
  type AuthorizedModelCommand,
} from "./admin-model-config-commands";
import {
  AssistantRateLimitExceededError,
  AssistantRateLimitUnavailableError,
} from "./assistant-rate-limit";
import {
  AgentModelControlClientError,
  type AgentModelConfigMetadata,
  type AgentModelControlClient,
} from "./agent-model-control-client";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const API_KEY = "sk-task14-secret-never-audit";
const actor: WorkforceActor = {
  userId: ACTOR_ID,
  realm: "workforce",
  status: "active",
  displayName: "Admin",
  mustChangePassword: false,
  twoFactorEnabled: true,
  permissions: ["admin:assistant:configure", "admin:assistant:secret:reveal"],
};
const savedConfig: AgentModelConfigMetadata = {
  provider: "openai",
  modelId: "gpt-5-mini",
  endpointId: "openai-official",
  apiKeyLastFour: "udit",
  revision: 4,
  testStatus: "untested",
};
const saveInput: AdminModelConfigSaveInput = {
  modelId: savedConfig.modelId,
  endpointId: savedConfig.endpointId,
  apiKey: API_KEY,
  expectedRevision: 3,
};

function mutationRequest(): Request {
  return new Request("https://admin.example.test/model-configs/openai", {
    method: "PUT",
    headers: {
      origin: "https://admin.example.test",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    body: JSON.stringify(saveInput),
  });
}

function fixture() {
  const operations: string[] = [];
  const requireTrustedMutation = vi.fn(() => {
    operations.push("trusted");
  });
  const requireSensitiveAction = vi.fn(async () => {
    operations.push("sensitive");
    return actor;
  });
  const audit = {
    write: vi.fn(async (input: AuditWriteInput) => {
      operations.push(`audit:${input.event}`);
    }),
  };
  const limiter = {
    consume: vi.fn(async () => {
      operations.push("limit");
    }),
  };
  const client: AgentModelControlClient = {
    listModelConfigs: vi.fn(async () => {
      operations.push("agent:list");
      return {
        version: "1" as const,
        configs: [
          {
            ...savedConfig,
            testStatus: "passed" as const,
          },
        ],
        endpoints: [],
        bootstrap: null,
        controlEnabled: true,
      };
    }),
    runtimeStatus: vi.fn(),
    saveModelConfig: vi.fn(async () => {
      operations.push("agent:save");
      return { version: "1" as const, config: savedConfig };
    }),
    testAndActivate: vi.fn(async () => {
      operations.push("agent:activate");
      return {
        version: "1" as const,
        provider: "openai" as const,
        configRevision: 4,
        activationVersion: 7,
      };
    }),
    revealKey: vi.fn(async () => {
      operations.push("agent:reveal");
      return { key: API_KEY };
    }),
  };
  const requestIdFactory = vi.fn(() => REQUEST_ID);
  const commands = createAdminModelConfigCommands({
    requireTrustedMutation,
    requireSensitiveAction,
    audit,
    limiter,
    client,
    requestIdFactory,
  });
  return {
    operations,
    requireTrustedMutation,
    requireSensitiveAction,
    audit,
    limiter,
    client,
    requestIdFactory,
    commands,
  };
}

async function authorize(
  commands: ReturnType<typeof createAdminModelConfigCommands>,
  action: "save" | "test_and_activate" | "reveal" = "save",
) {
  return commands.authorize(mutationRequest(), action);
}

function auditPayloads(audit: ReturnType<typeof fixture>["audit"]): unknown[] {
  return audit.write.mock.calls.map(([input]) => input);
}

describe("admin model command authorization", () => {
  it.each([
    ["save", "admin:assistant:configure"],
    ["test_and_activate", "admin:assistant:configure"],
    ["reveal", "admin:assistant:secret:reveal"],
  ] as const)(
    "authorizes %s with trusted mutation first and exact recent MFA permission",
    async (action, permission) => {
      const current = fixture();

      const context = await authorize(current.commands, action);

      expect(current.operations).toEqual(["trusted", "sensitive"]);
      expect(current.requireSensitiveAction).toHaveBeenCalledWith(permission, {
        recentWithinSeconds: 600,
        mfaRequired: true,
      });
      expect(current.requestIdFactory).toHaveBeenCalledOnce();
      expect(context).toMatchObject({ actor, requestId: REQUEST_ID, action });
      expect(Object.isFrozen(context)).toBe(true);
    },
  );

  it("stops before authentication, request ID, audit or Agent work when trust fails", async () => {
    const current = fixture();
    current.requireTrustedMutation.mockImplementation(() => {
      throw new MutationRequestError();
    });

    await expect(authorize(current.commands)).rejects.toBeInstanceOf(
      MutationRequestError,
    );
    expect(current.operations).toEqual([]);
    expect(current.requireSensitiveAction).not.toHaveBeenCalled();
    expect(current.requestIdFactory).not.toHaveBeenCalled();
    expect(current.audit.write).not.toHaveBeenCalled();
    expect(current.client.saveModelConfig).not.toHaveBeenCalled();
  });

  it("stops before request ID, audit or Agent work when recent assurance fails", async () => {
    const current = fixture();
    current.requireSensitiveAction.mockRejectedValueOnce(
      new SensitiveActionError("AUTH_MFA_REQUIRED"),
    );

    await expect(authorize(current.commands, "reveal")).rejects.toEqual(
      new SensitiveActionError("AUTH_MFA_REQUIRED"),
    );
    expect(current.operations).toEqual(["trusted"]);
    expect(current.requestIdFactory).not.toHaveBeenCalled();
    expect(current.audit.write).not.toHaveBeenCalled();
    expect(current.client.revealKey).not.toHaveBeenCalled();
  });

  it("rejects an unsupported action after trust but before authentication", async () => {
    const current = fixture();

    await expect(
      authorize(current.commands, "delete" as never),
    ).rejects.toEqual(new AdminModelConfigCommandError("validation_error"));
    expect(current.operations).toEqual(["trusted"]);
    expect(current.requireSensitiveAction).not.toHaveBeenCalled();
    expect(current.requestIdFactory).not.toHaveBeenCalled();
  });

  it("rejects an externally forged context before audit or Agent work", async () => {
    const current = fixture();
    // @ts-expect-error The module-private brand makes this context opaque.
    const forged: AuthorizedModelCommand = {
      actor,
      requestId: REQUEST_ID,
      action: "save",
    };

    await expect(
      current.commands.save(forged, "openai", saveInput),
    ).rejects.toEqual(new AdminModelConfigCommandError("authorization_failed"));
    expect(current.audit.write).not.toHaveBeenCalled();
    expect(current.client.saveModelConfig).not.toHaveBeenCalled();
  });
});

describe("admin model save command", () => {
  it("writes requested audit, calls Agent once, then writes completed success", async () => {
    const current = fixture();
    const context = await authorize(current.commands);
    current.operations.length = 0;

    const result = await current.commands.save(context, "openai", saveInput);

    expect(result).toEqual({ requestId: REQUEST_ID, config: savedConfig });
    expect(current.operations).toEqual([
      "audit:assistant.model_config_save_requested",
      "agent:save",
      "audit:assistant.model_config_saved",
    ]);
    expect(current.client.saveModelConfig).toHaveBeenCalledOnce();
    expect(current.client.saveModelConfig).toHaveBeenCalledWith({
      actor: ACTOR_ID,
      provider: "openai",
      requestId: REQUEST_ID,
      input: saveInput,
    });
    expect(auditPayloads(current.audit)).toEqual([
      {
        event: "assistant.model_config_save_requested",
        actor: { realm: "workforce", userId: ACTOR_ID },
        target: { type: "assistant_model_config", id: "openai" },
        metadata: {
          provider: "openai",
          modelId: "gpt-5-mini",
          endpointId: "openai-official",
          revision: 4,
          result: "requested",
          requestId: REQUEST_ID,
        },
      },
      {
        event: "assistant.model_config_saved",
        actor: { realm: "workforce", userId: ACTOR_ID },
        target: { type: "assistant_model_config", id: "openai" },
        metadata: {
          provider: "openai",
          modelId: "gpt-5-mini",
          endpointId: "openai-official",
          revision: 4,
          result: "success",
          requestId: REQUEST_ID,
        },
      },
    ]);
    expect(JSON.stringify(auditPayloads(current.audit))).not.toMatch(
      /sk-task14|apiKey|lastFour|https?:|assertion|raw error/iu,
    );
  });

  it("does not call Agent when requested audit persistence fails", async () => {
    const current = fixture();
    const context = await authorize(current.commands);
    current.audit.write.mockRejectedValueOnce(new Error("database DSN secret"));

    await expect(
      current.commands.save(context, "openai", saveInput),
    ).rejects.toEqual(new AdminModelConfigCommandError("storage_unavailable"));
    expect(current.client.saveModelConfig).not.toHaveBeenCalled();
  });

  it("audits a fixed failure after a safe Agent error without retaining raw error", async () => {
    const current = fixture();
    const context = await authorize(current.commands);
    current.client.saveModelConfig = vi.fn(async () => {
      current.operations.push("agent:save");
      throw new AgentModelControlClientError("configuration_conflict");
    });

    await expect(
      current.commands.save(context, "openai", saveInput),
    ).rejects.toEqual(
      new AdminModelConfigCommandError("configuration_conflict"),
    );
    expect(current.operations.slice(-3)).toEqual([
      "audit:assistant.model_config_save_requested",
      "agent:save",
      "audit:assistant.model_config_saved",
    ]);
    expect(auditPayloads(current.audit).at(-1)).toMatchObject({
      event: "assistant.model_config_saved",
      metadata: { result: "failure" },
    });
    expect(JSON.stringify(auditPayloads(current.audit))).not.toContain(API_KEY);
  });

  it("returns storage_unavailable when completed audit fails without rolling back the remote result", async () => {
    const current = fixture();
    const context = await authorize(current.commands);
    let remoteRevision = 3;
    current.client.saveModelConfig = vi.fn(async () => {
      remoteRevision = 4;
      return { version: "1" as const, config: savedConfig };
    });
    current.audit.write
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("audit storage unavailable"));

    await expect(
      current.commands.save(context, "openai", saveInput),
    ).rejects.toEqual(new AdminModelConfigCommandError("storage_unavailable"));
    expect(remoteRevision).toBe(4);
    expect(current.client.saveModelConfig).toHaveBeenCalledOnce();
  });

  it("snapshots Task13 input and rejects accessors before audit or Agent work", async () => {
    const current = fixture();
    const context = await authorize(current.commands);
    const accessed = vi.fn(() => API_KEY);
    const hostile = {
      modelId: "gpt-5-mini",
      endpointId: "openai-official",
      expectedRevision: 3,
      get apiKey() {
        return accessed();
      },
    };

    await expect(
      current.commands.save(context, "openai", hostile as never),
    ).rejects.toEqual(new AdminModelConfigCommandError("validation_error"));
    expect(accessed).not.toHaveBeenCalled();
    expect(current.audit.write).not.toHaveBeenCalled();
    expect(current.client.saveModelConfig).not.toHaveBeenCalled();
  });
});

describe("admin model test-and-activate command", () => {
  it("preflights once and writes the exact requested and completed audit order", async () => {
    const current = fixture();
    const context = await authorize(current.commands, "test_and_activate");
    current.operations.length = 0;

    const result = await current.commands.testAndActivate(context, "openai", {
      revision: 4,
    });

    expect(result).toEqual({
      requestId: REQUEST_ID,
      activation: {
        version: "1",
        provider: "openai",
        configRevision: 4,
        activationVersion: 7,
      },
    });
    expect(current.operations).toEqual([
      "agent:list",
      "audit:assistant.model_config_test_requested",
      "audit:assistant.model_config_activation_requested",
      "agent:activate",
      "audit:assistant.model_config_tested",
      "audit:assistant.model_config_activated",
    ]);
    expect(current.client.listModelConfigs).toHaveBeenCalledOnce();
    expect(current.client.testAndActivate).toHaveBeenCalledOnce();
    expect(current.client.testAndActivate).toHaveBeenCalledWith({
      actor: ACTOR_ID,
      provider: "openai",
      requestId: REQUEST_ID,
      input: { revision: 4 },
    });
    expect(auditPayloads(current.audit)).toEqual(
      [
        "assistant.model_config_test_requested",
        "assistant.model_config_activation_requested",
        "assistant.model_config_tested",
        "assistant.model_config_activated",
      ].map((event, index) => ({
        event,
        actor: { realm: "workforce", userId: ACTOR_ID },
        target: { type: "assistant_model_config", id: "openai" },
        metadata: {
          provider: "openai",
          modelId: "gpt-5-mini",
          endpointId: "openai-official",
          revision: 4,
          requestId: REQUEST_ID,
          result: index < 2 ? "requested" : "success",
        },
      })),
    );
    expect(JSON.stringify(auditPayloads(current.audit))).not.toMatch(
      /apiKey|lastFour|udit|https?:|assertion|raw error/iu,
    );
  });

  it.each([
    ["missing", [], 4],
    ["stale", [{ ...savedConfig, testStatus: "passed" as const }], 3],
  ] as const)(
    "returns a fixed conflict for %s metadata without auditing or mutating",
    async (_case, configs, revision) => {
      const current = fixture();
      const context = await authorize(current.commands, "test_and_activate");
      vi.mocked(current.client.listModelConfigs).mockResolvedValueOnce({
        version: "1",
        configs: [...configs],
        endpoints: [],
        bootstrap: null,
        controlEnabled: true,
      });

      await expect(
        current.commands.testAndActivate(context, "openai", { revision }),
      ).rejects.toEqual(
        new AdminModelConfigCommandError("configuration_conflict"),
      );
      expect(current.client.listModelConfigs).toHaveBeenCalledOnce();
      expect(current.audit.write).not.toHaveBeenCalled();
      expect(current.client.testAndActivate).not.toHaveBeenCalled();
    },
  );

  it("maps unavailable preflight to one fixed error without audit or mutation", async () => {
    const current = fixture();
    const context = await authorize(current.commands, "test_and_activate");
    vi.mocked(current.client.listModelConfigs).mockRejectedValueOnce(
      new AgentModelControlClientError("transport_error"),
    );

    await expect(
      current.commands.testAndActivate(context, "openai", { revision: 4 }),
    ).rejects.toEqual(
      new AdminModelConfigCommandError("assistant_unavailable"),
    );
    expect(current.audit.write).not.toHaveBeenCalled();
    expect(current.client.testAndActivate).not.toHaveBeenCalled();
  });

  it("does not cache metadata preflight across commands", async () => {
    const current = fixture();
    const first = await authorize(current.commands, "test_and_activate");
    const second = await authorize(current.commands, "test_and_activate");

    await current.commands.testAndActivate(first, "openai", { revision: 4 });
    await current.commands.testAndActivate(second, "openai", { revision: 4 });

    expect(current.client.listModelConfigs).toHaveBeenCalledTimes(2);
    expect(current.client.testAndActivate).toHaveBeenCalledTimes(2);
  });

  it("prevents mutation when either requested audit cannot persist", async () => {
    const current = fixture();
    const context = await authorize(current.commands, "test_and_activate");
    current.audit.write.mockImplementation(async (input) => {
      current.operations.push(`audit:${input.event}`);
      if (input.event === "assistant.model_config_activation_requested") {
        throw new Error("audit unavailable");
      }
    });

    await expect(
      current.commands.testAndActivate(context, "openai", { revision: 4 }),
    ).rejects.toEqual(new AdminModelConfigCommandError("storage_unavailable"));
    expect(current.client.testAndActivate).not.toHaveBeenCalled();
    expect(current.client.saveModelConfig).not.toHaveBeenCalled();
  });

  it("writes both completed failures with the same fixed category after one Agent failure", async () => {
    const current = fixture();
    const context = await authorize(current.commands, "test_and_activate");
    current.client.testAndActivate = vi.fn(async () => {
      current.operations.push("agent:activate");
      throw new AgentModelControlClientError("provider_timeout");
    });

    await expect(
      current.commands.testAndActivate(context, "openai", { revision: 4 }),
    ).rejects.toEqual(new AdminModelConfigCommandError("provider_timeout"));
    const completed = auditPayloads(current.audit).slice(-2) as Array<{
      event: string;
      metadata: { result: string };
    }>;
    expect(completed).toEqual([
      expect.objectContaining({
        event: "assistant.model_config_tested",
        metadata: expect.objectContaining({ result: "failure" }),
      }),
      expect.objectContaining({
        event: "assistant.model_config_activated",
        metadata: expect.objectContaining({ result: "failure" }),
      }),
    ]);
    expect(current.client.testAndActivate).toHaveBeenCalledOnce();
    expect(current.client.saveModelConfig).not.toHaveBeenCalled();
  });

  it("fails closed on completed audit loss without rollback or fallback", async () => {
    const current = fixture();
    const context = await authorize(current.commands, "test_and_activate");
    let remotelyActive = false;
    current.client.testAndActivate = vi.fn(async () => {
      remotelyActive = true;
      return {
        version: "1" as const,
        provider: "openai" as const,
        configRevision: 4,
        activationVersion: 7,
      };
    });
    current.audit.write.mockImplementation(async (input) => {
      if (input.event === "assistant.model_config_activated") {
        throw new Error("completed audit unavailable");
      }
    });

    await expect(
      current.commands.testAndActivate(context, "openai", { revision: 4 }),
    ).rejects.toEqual(new AdminModelConfigCommandError("storage_unavailable"));
    expect(remotelyActive).toBe(true);
    expect(current.client.testAndActivate).toHaveBeenCalledOnce();
    expect(current.client.saveModelConfig).not.toHaveBeenCalled();
    expect(current.client.revealKey).not.toHaveBeenCalled();
  });

  it("rejects revision accessors without invoking them", async () => {
    const current = fixture();
    const context = await authorize(current.commands, "test_and_activate");
    const accessed = vi.fn(() => 4);
    const hostile = {
      get revision() {
        return accessed();
      },
    };

    await expect(
      current.commands.testAndActivate(context, "openai", hostile as never),
    ).rejects.toEqual(new AdminModelConfigCommandError("validation_error"));
    expect(accessed).not.toHaveBeenCalled();
    expect(current.client.listModelConfigs).not.toHaveBeenCalled();
  });
});

describe("admin model Key reveal command", () => {
  it("executes limiter, preflight, dual audit, one reveal and final delivery in exact order", async () => {
    const current = fixture();
    const context = await authorize(current.commands, "reveal");
    current.operations.length = 0;
    const deliver = vi.fn((value: { requestId: string; key: string }) => {
      current.operations.push("deliver");
      return value;
    });

    const result = await current.commands.reveal(
      context,
      "openai",
      { revision: 4 },
      deliver,
    );

    expect(result).toEqual({ requestId: REQUEST_ID, key: API_KEY });
    expect(current.operations).toEqual([
      "limit",
      "agent:list",
      "audit:assistant.model_key_reveal_requested",
      "agent:reveal",
      "audit:assistant.model_key_revealed",
      "deliver",
    ]);
    expect(current.limiter.consume).toHaveBeenCalledWith({
      scope: "admin-key-reveal",
      actorId: ACTOR_ID,
    });
    expect(current.client.listModelConfigs).toHaveBeenCalledOnce();
    expect(current.client.revealKey).toHaveBeenCalledOnce();
    expect(current.client.revealKey).toHaveBeenCalledWith({
      actor: ACTOR_ID,
      provider: "openai",
      requestId: REQUEST_ID,
      input: { revision: 4 },
    });
    expect(auditPayloads(current.audit)).toEqual([
      {
        event: "assistant.model_key_reveal_requested",
        actor: { realm: "workforce", userId: ACTOR_ID },
        target: { type: "assistant_model_config", id: "openai" },
        metadata: {
          provider: "openai",
          modelId: "gpt-5-mini",
          endpointId: "openai-official",
          revision: 4,
          requestId: REQUEST_ID,
          result: "requested",
        },
      },
      {
        event: "assistant.model_key_revealed",
        actor: { realm: "workforce", userId: ACTOR_ID },
        target: { type: "assistant_model_config", id: "openai" },
        metadata: {
          provider: "openai",
          modelId: "gpt-5-mini",
          endpointId: "openai-official",
          revision: 4,
          requestId: REQUEST_ID,
          result: "success",
        },
      },
    ]);
    expect(JSON.stringify(auditPayloads(current.audit))).not.toContain(API_KEY);
  });

  it("stops at limiter failure before preflight, audit or decrypt", async () => {
    const current = fixture();
    const context = await authorize(current.commands, "reveal");
    current.limiter.consume.mockRejectedValueOnce(new Error("rate DB secret"));
    const deliver = vi.fn();

    await expect(
      current.commands.reveal(context, "openai", { revision: 4 }, deliver),
    ).rejects.toEqual(
      new AdminModelConfigCommandError("assistant_unavailable"),
    );
    expect(current.client.listModelConfigs).not.toHaveBeenCalled();
    expect(current.audit.write).not.toHaveBeenCalled();
    expect(current.client.revealKey).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it.each([
    new AssistantRateLimitExceededError(37),
    new AssistantRateLimitUnavailableError(),
  ])("preserves the typed reveal limiter error %s", async (limiterError) => {
    const current = fixture();
    const context = await authorize(current.commands, "reveal");
    current.limiter.consume.mockRejectedValueOnce(limiterError);

    await expect(
      current.commands.reveal(context, "openai", { revision: 4 }, vi.fn()),
    ).rejects.toBe(limiterError);
    if (limiterError instanceof AssistantRateLimitExceededError) {
      expect(limiterError.retryAfterSeconds).toBe(37);
    }
    expect(current.client.listModelConfigs).not.toHaveBeenCalled();
    expect(current.audit.write).not.toHaveBeenCalled();
    expect(current.client.revealKey).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", [], 4, "configuration_conflict"],
    [
      "stale",
      [{ ...savedConfig, testStatus: "passed" as const }],
      3,
      "configuration_conflict",
    ],
  ] as const)(
    "fails closed for %s metadata preflight",
    async (_case, configs, revision, code) => {
      const current = fixture();
      const context = await authorize(current.commands, "reveal");
      vi.mocked(current.client.listModelConfigs).mockResolvedValueOnce({
        version: "1",
        configs: [...configs],
        endpoints: [],
        bootstrap: null,
        controlEnabled: true,
      });
      const deliver = vi.fn();

      await expect(
        current.commands.reveal(context, "openai", { revision }, deliver),
      ).rejects.toEqual(new AdminModelConfigCommandError(code));
      expect(current.audit.write).not.toHaveBeenCalled();
      expect(current.client.revealKey).not.toHaveBeenCalled();
      expect(deliver).not.toHaveBeenCalled();
    },
  );

  it("prevents decrypt when requested audit cannot persist", async () => {
    const current = fixture();
    const context = await authorize(current.commands, "reveal");
    current.audit.write.mockRejectedValueOnce(new Error("audit unavailable"));
    const deliver = vi.fn();

    await expect(
      current.commands.reveal(context, "openai", { revision: 4 }, deliver),
    ).rejects.toEqual(new AdminModelConfigCommandError("storage_unavailable"));
    expect(current.client.revealKey).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it("audits a fixed failure after one reveal error without leaking raw detail", async () => {
    const current = fixture();
    const context = await authorize(current.commands, "reveal");
    current.client.revealKey = vi.fn(async () => {
      current.operations.push("agent:reveal");
      throw new Error(`provider echoed ${API_KEY}`);
    });
    const deliver = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const caught = await current.commands
      .reveal(context, "openai", { revision: 4 }, deliver)
      .catch((error: unknown) => error);

    expect(caught).toEqual(
      new AdminModelConfigCommandError("assistant_unavailable"),
    );
    expect(JSON.stringify(caught)).not.toContain(API_KEY);
    expect(auditPayloads(current.audit).at(-1)).toMatchObject({
      event: "assistant.model_key_revealed",
      metadata: { result: "failure" },
    });
    expect(JSON.stringify(auditPayloads(current.audit))).not.toContain(API_KEY);
    expect(consoleError).not.toHaveBeenCalled();
    expect(current.client.revealKey).toHaveBeenCalledOnce();
    expect(deliver).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("discards plaintext and returns storage_unavailable when completed audit fails", async () => {
    const current = fixture();
    const context = await authorize(current.commands, "reveal");
    current.audit.write
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("audit unavailable"));
    const deliver = vi.fn();

    const caught = await current.commands
      .reveal(context, "openai", { revision: 4 }, deliver)
      .catch((error: unknown) => error);

    expect(caught).toEqual(
      new AdminModelConfigCommandError("storage_unavailable"),
    );
    expect(JSON.stringify(caught)).not.toContain(API_KEY);
    expect(current.client.revealKey).toHaveBeenCalledOnce();
    expect(deliver).not.toHaveBeenCalled();
  });

  it("discards plaintext and returns a fixed error when final serialization fails", async () => {
    const current = fixture();
    const context = await authorize(current.commands, "reveal");
    const deliver = vi.fn(() => {
      throw new Error("serializer unavailable");
    });

    const caught = await current.commands
      .reveal(context, "openai", { revision: 4 }, deliver)
      .catch((error: unknown) => error);

    expect(caught).toEqual(
      new AdminModelConfigCommandError("assistant_unavailable"),
    );
    expect(JSON.stringify(caught)).not.toContain(API_KEY);
    expect(current.client.revealKey).toHaveBeenCalledOnce();
    expect(deliver).toHaveBeenCalledOnce();
    expect(JSON.stringify(auditPayloads(current.audit))).not.toContain(API_KEY);
  });

  it("rejects a save context before limiter or secret-bearing work", async () => {
    const current = fixture();
    const context = await authorize(current.commands, "save");

    await expect(
      current.commands.reveal(context, "openai", { revision: 4 }, vi.fn()),
    ).rejects.toEqual(new AdminModelConfigCommandError("authorization_failed"));
    expect(current.limiter.consume).not.toHaveBeenCalled();
    expect(current.client.revealKey).not.toHaveBeenCalled();
  });
});
