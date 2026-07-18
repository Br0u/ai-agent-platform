import {
  ADMIN_MODEL_PROVIDERS,
  isAdminModelConfigSnapshot,
  parseAdminModelConfigRevisionInput,
  parseAdminModelConfigSaveInput,
  type AdminModelConfigRevisionInput,
  type AdminModelConfigSaveInput,
  type AdminModelConfigItem,
  type AdminModelConfigSnapshot,
  type AdminModelEndpointOption,
  type AdminModelProvider,
} from "@/features/assistant/admin-model-config-contract";
import {
  AuthAccessError,
  requirePermission,
  type AccessService,
  type WorkforceActor,
} from "@/server/auth/access";
import { createAuditWriter } from "@/server/auth/audit";
import {
  SensitiveActionError,
  requireSensitiveWorkforceAction,
} from "@/server/auth/sensitive-action";
import {
  AdminModelConfigCommandError,
  createAdminModelConfigCommands,
  type AuthorizedModelCommand,
} from "@/server/assistant/admin-model-config-commands";
import {
  createAgentModelControlClient,
  resolveAgentModelControlSettings,
  type AgentModelControlClient,
} from "@/server/assistant/agent-model-control-client";
import {
  AssistantRateLimitExceededError,
  AssistantRateLimitUnavailableError,
  createDatabaseAssistantRateLimiter,
} from "@/server/assistant/assistant-rate-limit";
import { resolveAssistantRequestId } from "@/server/assistant/assistant-request-id";
import {
  MutationRequestError,
  requireTrustedJsonMutation,
} from "@/server/http/require-trusted-mutation";
import {
  readBoundedJson,
  type JsonReadResult,
} from "@/server/http/read-bounded-json";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
};

const DISPLAY_NAMES: Readonly<Record<AdminModelProvider, string>> = {
  openai: "OpenAI",
  anthropic: "Claude",
  google: "Gemini",
  dashscope: "Qwen / DashScope",
  deepseek: "DeepSeek",
  minimax: "MiniMax",
};

type ModelConfigListDependencies = {
  access: Pick<AccessService, "requirePermission">;
  loadSnapshot(actor: WorkforceActor): Promise<AdminModelConfigSnapshot>;
  requestIdFactory(): string;
};

type SnapshotOptions = {
  client?: AgentModelControlClient;
  requestIdFactory?: () => string;
};

type AdminModelConfigCommands = ReturnType<
  typeof createAdminModelConfigCommands
>;

type DynamicRouteContext = {
  params: Promise<{ provider: string }>;
};

type SaveDependencies = {
  commands?: Pick<AdminModelConfigCommands, "authorize" | "save">;
  readJson(request: Request, maximumBytes: number): Promise<JsonReadResult>;
  requestIdFactory(): string;
};

type TestAndActivateDependencies = {
  commands?: Pick<AdminModelConfigCommands, "authorize" | "testAndActivate">;
  readJson(request: Request, maximumBytes: number): Promise<JsonReadResult>;
  requestIdFactory(): string;
};

type RevealDependencies = {
  commands?: Pick<AdminModelConfigCommands, "authorize" | "reveal">;
  readJson(request: Request, maximumBytes: number): Promise<JsonReadResult>;
  requestIdFactory(): string;
};

type PublicModelConfigErrorCode =
  | "authentication_required"
  | "permission_denied"
  | "reauth_required"
  | "validation_error"
  | "endpoint_not_allowed"
  | "configuration_conflict"
  | "credential_rejected"
  | "model_not_found"
  | "provider_unreachable"
  | "provider_timeout"
  | "control_disabled"
  | "storage_unavailable"
  | "encryption_unavailable"
  | "assistant_unavailable"
  | "rate_limited";

function defaultModelControlClient(): AgentModelControlClient {
  return createAgentModelControlClient({
    settings: resolveAgentModelControlSettings({
      AGENTOS_INTERNAL_URL: process.env.AGENTOS_INTERNAL_URL,
      OS_SECURITY_KEY: process.env.OS_SECURITY_KEY,
      AGENT_CONFIG_CONTROL_KEY: process.env.AGENT_CONFIG_CONTROL_KEY,
    }),
  });
}

function errorBody(requestId: string, code: PublicModelConfigErrorCode) {
  const messages = {
    authentication_required: "Authentication required",
    permission_denied: "Permission denied",
    reauth_required: "Recent password and MFA verification required",
    validation_error: "Invalid model configuration request",
    endpoint_not_allowed: "Model endpoint is not allowed",
    configuration_conflict: "Model configuration has changed",
    credential_rejected: "Model credential was rejected",
    model_not_found: "Model was not found",
    provider_unreachable: "Model provider is unavailable",
    provider_timeout: "Model provider timed out",
    control_disabled: "Model configuration control is disabled",
    storage_unavailable: "Model configuration storage is unavailable",
    encryption_unavailable: "Model credential encryption is unavailable",
    assistant_unavailable: "Assistant configuration is unavailable",
    rate_limited: "Too many model key reveal attempts",
  } as const;
  return {
    version: "1" as const,
    requestId,
    error: {
      code,
      message: messages[code],
      retryable:
        code === "assistant_unavailable" ||
        code === "provider_unreachable" ||
        code === "provider_timeout" ||
        code === "storage_unavailable" ||
        code === "rate_limited",
    },
    ...(code === "reauth_required" ? { redirectTo: "/staff/re-auth" } : {}),
  };
}

function isProvider(value: string): value is AdminModelProvider {
  return (ADMIN_MODEL_PROVIDERS as readonly string[]).includes(value);
}

function createDefaultCommands(): AdminModelConfigCommands {
  let client: AgentModelControlClient | undefined;
  let audit: ReturnType<typeof createAuditWriter> | undefined;
  let limiter:
    | ReturnType<typeof createDatabaseAssistantRateLimiter>
    | undefined;
  const lazyClient: AgentModelControlClient = {
    listModelConfigs: (input) =>
      (client ??= defaultModelControlClient()).listModelConfigs(input),
    runtimeStatus: (input) =>
      (client ??= defaultModelControlClient()).runtimeStatus(input),
    saveModelConfig: (input) =>
      (client ??= defaultModelControlClient()).saveModelConfig(input),
    testAndActivate: (input) =>
      (client ??= defaultModelControlClient()).testAndActivate(input),
    revealKey: (input) =>
      (client ??= defaultModelControlClient()).revealKey(input),
  };
  return createAdminModelConfigCommands({
    requireTrustedMutation: requireTrustedJsonMutation,
    requireSensitiveAction: requireSensitiveWorkforceAction,
    audit: {
      write: (input) => (audit ??= createAuditWriter()).write(input),
    },
    limiter: {
      consume: (input) =>
        (limiter ??= createDatabaseAssistantRateLimiter()).consume(input),
    },
    client: lazyClient,
  });
}

function commandErrorResponse(
  error: unknown,
  requestId: string,
  headers: Record<string, string> = NO_STORE_HEADERS,
): Response {
  let code: PublicModelConfigErrorCode = "assistant_unavailable";
  let status = 503;
  let retryAfter: number | undefined;
  if (error instanceof MutationRequestError) {
    code = "validation_error";
    status = 400;
  } else if (error instanceof AuthAccessError) {
    code =
      error.status === 401 ? "authentication_required" : "permission_denied";
    status = error.status;
  } else if (error instanceof SensitiveActionError) {
    code = "reauth_required";
    status = 401;
  } else if (error instanceof AssistantRateLimitExceededError) {
    code = "rate_limited";
    status = 429;
    retryAfter = error.retryAfterSeconds;
  } else if (error instanceof AssistantRateLimitUnavailableError) {
    code = "storage_unavailable";
  } else if (error instanceof AdminModelConfigCommandError) {
    if (
      error.code === "validation_error" ||
      error.code === "endpoint_not_allowed"
    ) {
      code = error.code;
      status = 400;
    } else if (error.code === "configuration_conflict") {
      code = error.code;
      status = 409;
    } else if (
      error.code === "credential_rejected" ||
      error.code === "model_not_found"
    ) {
      code = error.code;
      status = 422;
    } else if (
      error.code === "provider_unreachable" ||
      error.code === "provider_timeout" ||
      error.code === "control_disabled" ||
      error.code === "storage_unavailable" ||
      error.code === "encryption_unavailable" ||
      error.code === "assistant_unavailable"
    ) {
      code = error.code;
    }
  }
  return Response.json(errorBody(requestId, code), {
    status,
    headers: {
      ...headers,
      ...(retryAfter === undefined
        ? {}
        : { "Retry-After": String(retryAfter) }),
    },
  });
}

export async function loadAdminModelConfigSnapshot(
  actor: WorkforceActor,
  options: SnapshotOptions = {},
): Promise<AdminModelConfigSnapshot> {
  const client = options.client ?? defaultModelControlClient();
  const requestId = (options.requestIdFactory ?? crypto.randomUUID)();
  const [listed, runtime] = await Promise.all([
    client.listModelConfigs({ requestId }),
    client.runtimeStatus({ requestId }),
  ]);
  const byProvider = new Map(
    listed.configs.map((config) => [config.provider, config]),
  );
  const configs: AdminModelConfigItem[] = ADMIN_MODEL_PROVIDERS.map(
    (provider) => {
      const config = byProvider.get(provider);
      if (config === undefined) {
        return {
          provider,
          displayName: DISPLAY_NAMES[provider],
          modelId: null,
          endpointId: null,
          revision: null,
          testStatus: "not_configured",
          lastTestedAt: null,
          apiKey: null,
          activeRevision: null,
        };
      }
      return {
        provider,
        displayName: DISPLAY_NAMES[provider],
        modelId: config.modelId,
        endpointId: config.endpointId,
        revision: config.revision,
        testStatus: config.testStatus,
        lastTestedAt: null,
        apiKey: { configured: true, lastFour: config.apiKeyLastFour },
        activeRevision:
          runtime.source === "dynamic" && runtime.provider === provider
            ? runtime.configRevision
            : null,
      };
    },
  );
  const endpoints: Record<AdminModelProvider, AdminModelEndpointOption[]> = {
    openai: [],
    anthropic: [],
    google: [],
    dashscope: [],
    deepseek: [],
    minimax: [],
  };
  for (const endpoint of listed.endpoints) {
    endpoints[endpoint.provider].push({
      id: endpoint.id,
      label: endpoint.label,
    });
  }
  const snapshot: AdminModelConfigSnapshot = {
    version: "1",
    configs,
    endpoints,
    runtime: {
      capability: runtime.capability,
      source: runtime.source,
      provider: runtime.provider,
      modelId: runtime.modelId,
      configRevision: runtime.configRevision,
      activationVersion: runtime.activationVersion,
    },
    canConfigure: actor.permissions.includes("admin:assistant:configure"),
    canReveal: actor.permissions.includes("admin:assistant:secret:reveal"),
    controlEnabled: listed.controlEnabled,
  };
  if (!isAdminModelConfigSnapshot(snapshot)) {
    throw new TypeError("Invalid model configuration snapshot");
  }
  return snapshot;
}

const defaultListDependencies: ModelConfigListDependencies = {
  access: { requirePermission },
  loadSnapshot: loadAdminModelConfigSnapshot,
  requestIdFactory: () => crypto.randomUUID(),
};

export function createAdminModelConfigListHandler(
  overrides: Partial<ModelConfigListDependencies> = {},
) {
  const dependencies = { ...defaultListDependencies, ...overrides };
  return async function GET(request: Request): Promise<Response> {
    const requestId = resolveAssistantRequestId(
      request,
      dependencies.requestIdFactory,
    );
    let actor: WorkforceActor;
    try {
      actor = await dependencies.access.requirePermission("admin:assistant");
    } catch (error) {
      if (error instanceof AuthAccessError) {
        const code =
          error.status === 401
            ? "authentication_required"
            : "permission_denied";
        return Response.json(errorBody(requestId, code), {
          status: error.status,
          headers: NO_STORE_HEADERS,
        });
      }
      return Response.json(errorBody(requestId, "assistant_unavailable"), {
        status: 503,
        headers: NO_STORE_HEADERS,
      });
    }

    try {
      const snapshot = await dependencies.loadSnapshot(actor);
      return Response.json(
        { ...snapshot, requestId },
        { headers: NO_STORE_HEADERS },
      );
    } catch {
      return Response.json(errorBody(requestId, "assistant_unavailable"), {
        status: 503,
        headers: NO_STORE_HEADERS,
      });
    }
  };
}

export const adminModelConfigListHandler = createAdminModelConfigListHandler();

const defaultSaveDependencies: SaveDependencies = {
  readJson: readBoundedJson,
  requestIdFactory: () => crypto.randomUUID(),
};

export function createAdminModelConfigSaveHandler(
  overrides: Partial<SaveDependencies> = {},
) {
  const dependencies = { ...defaultSaveDependencies, ...overrides };
  return async function PUT(
    request: Request,
    routeContext: DynamicRouteContext,
  ): Promise<Response> {
    const fallbackRequestId = resolveAssistantRequestId(
      request,
      dependencies.requestIdFactory,
    );
    let commands: Pick<AdminModelConfigCommands, "authorize" | "save">;
    let context: AuthorizedModelCommand;
    try {
      commands = dependencies.commands ?? createDefaultCommands();
      context = await commands.authorize(request, "save");
    } catch (error) {
      return commandErrorResponse(error, fallbackRequestId);
    }

    let provider: string;
    try {
      provider = (await routeContext.params).provider;
    } catch {
      return commandErrorResponse(
        new AdminModelConfigCommandError("validation_error"),
        context.requestId,
      );
    }
    if (!isProvider(provider)) {
      return commandErrorResponse(
        new AdminModelConfigCommandError("validation_error"),
        context.requestId,
      );
    }

    let read: JsonReadResult;
    try {
      read = await dependencies.readJson(request, 8 * 1024);
    } catch {
      read = { ok: false };
    }
    if (!read.ok) {
      const length = request.headers.get("content-length");
      const oversized =
        length !== null && /^\d+$/u.test(length) && Number(length) > 8 * 1024;
      return Response.json(errorBody(context.requestId, "validation_error"), {
        status: oversized ? 413 : 400,
        headers: NO_STORE_HEADERS,
      });
    }
    let input: AdminModelConfigSaveInput | null =
      parseAdminModelConfigSaveInput(read.value);
    if (input === null) {
      return Response.json(errorBody(context.requestId, "validation_error"), {
        status: 400,
        headers: NO_STORE_HEADERS,
      });
    }

    try {
      const result = await commands.save(context, provider, input);
      const config = result.config;
      return Response.json(
        {
          version: "1",
          requestId: result.requestId,
          config: {
            provider: config.provider,
            displayName: DISPLAY_NAMES[config.provider],
            modelId: config.modelId,
            endpointId: config.endpointId,
            revision: config.revision,
            testStatus: config.testStatus,
            lastTestedAt: null,
            apiKey: {
              configured: true,
              lastFour: config.apiKeyLastFour,
            },
            activeRevision: null,
          },
        },
        { headers: NO_STORE_HEADERS },
      );
    } catch (error) {
      return commandErrorResponse(error, context.requestId);
    } finally {
      input = null;
    }
  };
}

export const adminModelConfigSaveHandler = createAdminModelConfigSaveHandler();

const defaultTestAndActivateDependencies: TestAndActivateDependencies = {
  readJson: readBoundedJson,
  requestIdFactory: () => crypto.randomUUID(),
};

export function createAdminModelConfigTestAndActivateHandler(
  overrides: Partial<TestAndActivateDependencies> = {},
) {
  const dependencies = {
    ...defaultTestAndActivateDependencies,
    ...overrides,
  };
  return async function POST(
    request: Request,
    routeContext: DynamicRouteContext,
  ): Promise<Response> {
    const fallbackRequestId = resolveAssistantRequestId(
      request,
      dependencies.requestIdFactory,
    );
    let commands: Pick<
      AdminModelConfigCommands,
      "authorize" | "testAndActivate"
    >;
    let context: AuthorizedModelCommand;
    try {
      commands = dependencies.commands ?? createDefaultCommands();
      context = await commands.authorize(request, "test_and_activate");
    } catch (error) {
      return commandErrorResponse(error, fallbackRequestId);
    }

    let provider: string;
    try {
      provider = (await routeContext.params).provider;
    } catch {
      return commandErrorResponse(
        new AdminModelConfigCommandError("validation_error"),
        context.requestId,
      );
    }
    if (!isProvider(provider)) {
      return commandErrorResponse(
        new AdminModelConfigCommandError("validation_error"),
        context.requestId,
      );
    }

    let read: JsonReadResult;
    try {
      read = await dependencies.readJson(request, 8 * 1024);
    } catch {
      read = { ok: false };
    }
    if (!read.ok) {
      const length = request.headers.get("content-length");
      const oversized =
        length !== null && /^\d+$/u.test(length) && Number(length) > 8 * 1024;
      return Response.json(errorBody(context.requestId, "validation_error"), {
        status: oversized ? 413 : 400,
        headers: NO_STORE_HEADERS,
      });
    }
    let input: AdminModelConfigRevisionInput | null =
      parseAdminModelConfigRevisionInput(read.value);
    if (input === null) {
      return Response.json(errorBody(context.requestId, "validation_error"), {
        status: 400,
        headers: NO_STORE_HEADERS,
      });
    }

    try {
      const result = await commands.testAndActivate(context, provider, input);
      return Response.json(
        {
          version: "1",
          requestId: result.requestId,
          activation: {
            provider: result.activation.provider,
            configRevision: result.activation.configRevision,
            activationVersion: result.activation.activationVersion,
          },
        },
        { headers: NO_STORE_HEADERS },
      );
    } catch (error) {
      return commandErrorResponse(error, context.requestId);
    } finally {
      input = null;
    }
  };
}

export const adminModelConfigTestAndActivateHandler =
  createAdminModelConfigTestAndActivateHandler();

const defaultRevealDependencies: RevealDependencies = {
  readJson: readBoundedJson,
  requestIdFactory: () => crypto.randomUUID(),
};

export function createAdminModelConfigRevealHandler(
  overrides: Partial<RevealDependencies> = {},
) {
  const dependencies = { ...defaultRevealDependencies, ...overrides };
  return async function POST(
    request: Request,
    routeContext: DynamicRouteContext,
  ): Promise<Response> {
    const fallbackRequestId = resolveAssistantRequestId(
      request,
      dependencies.requestIdFactory,
    );
    let commands: Pick<AdminModelConfigCommands, "authorize" | "reveal">;
    let context: AuthorizedModelCommand;
    try {
      commands = dependencies.commands ?? createDefaultCommands();
      context = await commands.authorize(request, "reveal");
    } catch (error) {
      return commandErrorResponse(
        error,
        fallbackRequestId,
        PRIVATE_NO_STORE_HEADERS,
      );
    }

    let provider: string;
    try {
      provider = (await routeContext.params).provider;
    } catch {
      return commandErrorResponse(
        new AdminModelConfigCommandError("validation_error"),
        context.requestId,
        PRIVATE_NO_STORE_HEADERS,
      );
    }
    if (!isProvider(provider)) {
      return commandErrorResponse(
        new AdminModelConfigCommandError("validation_error"),
        context.requestId,
        PRIVATE_NO_STORE_HEADERS,
      );
    }

    let read: JsonReadResult;
    try {
      read = await dependencies.readJson(request, 8 * 1024);
    } catch {
      read = { ok: false };
    }
    if (!read.ok) {
      const length = request.headers.get("content-length");
      const oversized =
        length !== null && /^\d+$/u.test(length) && Number(length) > 8 * 1024;
      return Response.json(errorBody(context.requestId, "validation_error"), {
        status: oversized ? 413 : 400,
        headers: PRIVATE_NO_STORE_HEADERS,
      });
    }
    let input: AdminModelConfigRevisionInput | null =
      parseAdminModelConfigRevisionInput(read.value);
    if (input === null) {
      return Response.json(errorBody(context.requestId, "validation_error"), {
        status: 400,
        headers: PRIVATE_NO_STORE_HEADERS,
      });
    }

    try {
      return await commands.reveal(context, provider, input);
    } catch (error) {
      return commandErrorResponse(
        error,
        context.requestId,
        PRIVATE_NO_STORE_HEADERS,
      );
    } finally {
      input = null;
    }
  };
}

export const adminModelConfigRevealHandler =
  createAdminModelConfigRevealHandler();
