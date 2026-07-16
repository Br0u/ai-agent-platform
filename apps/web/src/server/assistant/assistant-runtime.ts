import "server-only";

import {
  createAgentOSClient,
  resolveAgentOSClientSettings,
} from "./agentos-client";
import {
  AgentOSAssistantProvider,
  type AgentOSCleanupRecorder,
} from "./agentos-assistant-provider";
import {
  createAgentOSExecutionCircuit,
  type AgentOSExecutionCircuit,
  type AgentOSExecutionCircuitInspection,
} from "./agentos-execution-circuit";
import {
  createAgentOSProbe,
  createAgentOSReadinessCircuit,
  resolveAgentOSReadinessSettings,
  type AgentOSReadinessSettings,
  type AgentOSReadinessSnapshot,
} from "./agentos-readiness";
import {
  createAgentOSRunClient,
  resolveAgentOSRunSettings,
  type AgentOSRunClient,
} from "./agentos-run-client";
import { createAnonymousSessionManager } from "./anonymous-session";
import { resolveAnonymousSessionSettings } from "./anonymous-session-config";
import { resolveAssistantActor, type AssistantActor } from "./assistant-actor";
import {
  resolveAssistantProviderSettings,
  selectAssistantProvider,
  type AssistantProviderMode,
} from "./assistant-provider-selector";
import type { AssistantProvider } from "./assistant-provider";
import {
  createDatabaseAssistantRateLimiter,
  type AssistantRateLimiter,
} from "./assistant-rate-limit";
import { placeholderAssistantProvider } from "./placeholder-assistant-provider";
import { resolveTrustedClientIp } from "./trusted-client-ip";

type AssistantRuntimeEnvironment = {
  ASSISTANT_PUBLIC_ORIGIN?: string;
  ASSISTANT_SESSION_SECRET?: string;
  ASSISTANT_RATE_LIMIT_SECRET?: string;
  ASSISTANT_PROVIDER_MODE?: string;
  ASSISTANT_AGENTOS_READINESS_TTL_MS?: string;
  ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS?: string;
  ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD?: string;
  ASSISTANT_AGENTOS_CIRCUIT_RESET_MS?: string;
  ASSISTANT_AGENTOS_RUN_TIMEOUT_MS?: string;
  AGENTOS_INTERNAL_URL?: string;
  OS_SECURITY_KEY?: string;
  TRUST_NGINX_PROXY?: string;
};

function readRuntimeEnvironment(
  source: AssistantRuntimeEnvironment | NodeJS.ProcessEnv,
): AssistantRuntimeEnvironment {
  return {
    ASSISTANT_PUBLIC_ORIGIN: source.ASSISTANT_PUBLIC_ORIGIN,
    ASSISTANT_SESSION_SECRET: source.ASSISTANT_SESSION_SECRET,
    ASSISTANT_RATE_LIMIT_SECRET: source.ASSISTANT_RATE_LIMIT_SECRET,
    ASSISTANT_PROVIDER_MODE: source.ASSISTANT_PROVIDER_MODE,
    ASSISTANT_AGENTOS_READINESS_TTL_MS:
      source.ASSISTANT_AGENTOS_READINESS_TTL_MS,
    ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS:
      source.ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS,
    ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD:
      source.ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD,
    ASSISTANT_AGENTOS_CIRCUIT_RESET_MS:
      source.ASSISTANT_AGENTOS_CIRCUIT_RESET_MS,
    ASSISTANT_AGENTOS_RUN_TIMEOUT_MS: source.ASSISTANT_AGENTOS_RUN_TIMEOUT_MS,
    AGENTOS_INTERNAL_URL: source.AGENTOS_INTERNAL_URL,
    OS_SECURITY_KEY: source.OS_SECURITY_KEY,
    TRUST_NGINX_PROXY: source.TRUST_NGINX_PROXY,
  };
}

export type AssistantRuntimeStatus = AgentOSReadinessSnapshot & {
  message: string;
};

export type AssistantRuntimeReadinessStatus = AgentOSReadinessSnapshot & {
  probed: boolean;
};

export type AssistantRuntimeProvider = {
  provider: AssistantProvider;
  mode: AssistantProviderMode;
};

type SafeCircuitInspection = Pick<
  AgentOSExecutionCircuitInspection,
  "state" | "consecutiveFailures"
>;

export type AssistantRuntimeInspection = {
  providerMode: AssistantProviderMode;
  persistence: "disabled" | "agentos";
  circuits: {
    readiness: SafeCircuitInspection;
    execution: SafeCircuitInspection;
  };
  readiness: {
    cacheTtlMs: number;
    probeTimeoutMs: number;
    failureThreshold: number;
  };
};

export type AssistantRuntimeSession = {
  publicSession: { temporary: true; expiresAt: string };
  internalSessionId: string;
  actor: AssistantActor;
  setCookie?: string;
};

export class AssistantRuntimeUnavailableError extends Error {
  readonly code = "ASSISTANT_RUNTIME_UNAVAILABLE";

  constructor() {
    super("Assistant runtime unavailable");
    Object.defineProperty(this, "name", {
      value: "AssistantRuntimeUnavailableError",
      configurable: true,
    });
  }
}

const PLACEHOLDER_MESSAGE = "模型尚未配置，当前为安全占位模式。";
const AVAILABLE_MESSAGE = "AI 助理基础服务已就绪。";
const DEGRADED_MESSAGE = "助手基础服务暂不可用。";
const CLOSED_CIRCUIT: SafeCircuitInspection = {
  state: "closed",
  consecutiveFailures: 0,
};

function placeholderStatus(): AssistantRuntimeStatus {
  return {
    live: true,
    ready: true,
    capability: "placeholder",
    message: PLACEHOLDER_MESSAGE,
  };
}

function degradedStatus(live = false): AssistantRuntimeStatus {
  return {
    live,
    ready: false,
    capability: "degraded",
    message: DEGRADED_MESSAGE,
  };
}

function parseTrustNginxProxy(value: string | undefined): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("TRUST_NGINX_PROXY must be true or false");
}

export function normalizeAssistantRuntimeStatus(
  snapshot: AgentOSReadinessSnapshot,
): AssistantRuntimeStatus {
  if (!snapshot.live) return degradedStatus();
  if (!snapshot.ready || snapshot.capability === "degraded") {
    return degradedStatus(true);
  }
  return {
    ...snapshot,
    message:
      snapshot.capability === "available"
        ? AVAILABLE_MESSAGE
        : PLACEHOLDER_MESSAGE,
  };
}

export function deriveAssistantRuntimeStatus(
  snapshot: AgentOSReadinessSnapshot,
  context: {
    providerMode: AssistantProviderMode;
    executionState: SafeCircuitInspection["state"];
  },
): AssistantRuntimeStatus {
  if (context.providerMode === "placeholder") return placeholderStatus();
  if (context.executionState !== "closed") {
    return degradedStatus(snapshot.live);
  }
  return normalizeAssistantRuntimeStatus(snapshot);
}

type RuntimeOptions = {
  environment?: AssistantRuntimeEnvironment;
  fetcher?: typeof fetch;
  createRateLimiter?: (secret: string | undefined) => AssistantRateLimiter;
  resolveActor?: (request: Request) => Promise<AssistantActor>;
  createHealthClient?: typeof createAgentOSClient;
  createRunClient?: typeof createAgentOSRunClient;
  createExecutionCircuit?: typeof createAgentOSExecutionCircuit;
  cleanupRecorder?: AgentOSCleanupRecorder;
};

type AgentOSComposition = {
  runClient: AgentOSRunClient;
  readiness: ReturnType<typeof createAgentOSReadinessCircuit>;
  execution: AgentOSExecutionCircuit;
  provider: AgentOSAssistantProvider;
  readinessSettings: AgentOSReadinessSettings;
};

function safeInspection(inspection: {
  state: "closed" | "open" | "half-open";
  consecutiveFailures: number;
}): SafeCircuitInspection {
  return {
    state: inspection.state,
    consecutiveFailures: inspection.consecutiveFailures,
  };
}

function uncomposedInspection(
  providerMode: AssistantProviderMode,
): AssistantRuntimeInspection {
  return {
    providerMode,
    persistence: providerMode === "agentos" ? "agentos" : "disabled",
    circuits: {
      readiness: { ...CLOSED_CIRCUIT },
      execution: { ...CLOSED_CIRCUIT },
    },
    readiness: {
      cacheTtlMs: 0,
      probeTimeoutMs: 0,
      failureThreshold: 0,
    },
  };
}

export function createAssistantRuntime(options: RuntimeOptions = {}) {
  const environment = readRuntimeEnvironment(
    options.environment ?? process.env,
  );
  const providerSettings = resolveAssistantProviderSettings({
    ASSISTANT_PROVIDER_MODE:
      environment.ASSISTANT_PROVIDER_MODE ?? "placeholder",
  });
  const rateLimitSecret = environment.ASSISTANT_RATE_LIMIT_SECRET;
  const trustNginxProxy = parseTrustNginxProxy(environment.TRUST_NGINX_PROXY);
  const actorResolver = options.resolveActor ?? resolveAssistantActor;
  let sessionManager:
    | ReturnType<typeof createAnonymousSessionManager>
    | undefined;
  let sharedRateLimiter: AssistantRateLimiter | undefined;
  let agentos: AgentOSComposition | undefined;

  function getSessionManager() {
    sessionManager ??= createAnonymousSessionManager({
      settings: resolveAnonymousSessionSettings(environment),
    });
    return sessionManager;
  }

  function getRateLimiter() {
    sharedRateLimiter ??=
      options.createRateLimiter?.(rateLimitSecret) ??
      createDatabaseAssistantRateLimiter(undefined, {
        secret: rateLimitSecret,
      });
    return sharedRateLimiter;
  }

  function getAgentOSComposition(): AgentOSComposition {
    if (agentos) return agentos;
    const readinessSettings = resolveAgentOSReadinessSettings(environment);
    const healthSettings = resolveAgentOSClientSettings(environment);
    const runSettings = resolveAgentOSRunSettings(environment);
    const healthClient = (options.createHealthClient ?? createAgentOSClient)({
      settings: healthSettings,
      fetcher: options.fetcher,
      timeoutMs: readinessSettings.probeTimeoutMs,
    });
    const runClient = (options.createRunClient ?? createAgentOSRunClient)({
      settings: runSettings,
      fetcher: options.fetcher,
    });
    const readiness = createAgentOSReadinessCircuit({
      probe: createAgentOSProbe(healthClient),
      cacheTtlMs: readinessSettings.cacheTtlMs,
      failureThreshold: readinessSettings.failureThreshold,
      resetAfterMs: readinessSettings.resetAfterMs,
    });
    const execution = (
      options.createExecutionCircuit ?? createAgentOSExecutionCircuit
    )({
      failureThreshold: readinessSettings.failureThreshold,
      resetAfterMs: readinessSettings.resetAfterMs,
    });
    const provider = new AgentOSAssistantProvider({
      runClient,
      circuit: execution,
      cleanupRecorder: options.cleanupRecorder,
    });
    agentos = {
      runClient,
      readiness,
      execution,
      provider,
      readinessSettings,
    };
    return agentos;
  }

  return {
    rateLimiter: {
      consume(input) {
        return getRateLimiter().consume(input);
      },
    } satisfies AssistantRateLimiter,

    async resolveSession(request: Request): Promise<AssistantRuntimeSession> {
      const actor = await actorResolver(request);
      const session = getSessionManager().resolve(request.headers, actor);
      return {
        publicSession: session.publicSession,
        internalSessionId: session.internalSessionId,
        actor,
        setCookie: session.setCookie,
      };
    },

    resolveTrustedClientIp(request: Request): string | undefined {
      return resolveTrustedClientIp(request.headers, trustNginxProxy);
    },

    async status(): Promise<AssistantRuntimeStatus> {
      if (providerSettings.mode === "placeholder") {
        return deriveAssistantRuntimeStatus(
          { live: false, ready: false, capability: "placeholder" },
          { providerMode: "placeholder", executionState: "closed" },
        );
      }
      const composition = getAgentOSComposition();
      const snapshot = await composition.readiness.status();
      return deriveAssistantRuntimeStatus(snapshot, {
        providerMode: "agentos",
        executionState: composition.execution.inspect().state,
      });
    },

    async readinessStatus(): Promise<AssistantRuntimeReadinessStatus> {
      if (providerSettings.mode === "placeholder") {
        return {
          probed: false,
          live: false,
          ready: false,
          capability: "placeholder",
        };
      }
      return {
        probed: true,
        ...(await getAgentOSComposition().readiness.status()),
      };
    },

    inspect(): AssistantRuntimeInspection {
      if (providerSettings.mode === "placeholder") {
        return uncomposedInspection("placeholder");
      }
      let composition: AgentOSComposition;
      try {
        composition = getAgentOSComposition();
      } catch {
        return uncomposedInspection("agentos");
      }
      return {
        providerMode: "agentos",
        persistence: "agentos",
        circuits: {
          readiness: safeInspection(composition.readiness.inspect()),
          execution: safeInspection(composition.execution.inspect()),
        },
        readiness: {
          cacheTtlMs: composition.readinessSettings.cacheTtlMs,
          probeTimeoutMs: composition.readinessSettings.probeTimeoutMs,
          failureThreshold: composition.readinessSettings.failureThreshold,
        },
      };
    },

    async resolveProvider(): Promise<AssistantRuntimeProvider> {
      if (providerSettings.mode === "placeholder") {
        return { provider: placeholderAssistantProvider, mode: "placeholder" };
      }

      const composition = getAgentOSComposition();
      const snapshot = await composition.readiness.status();
      if (
        !snapshot.live ||
        !snapshot.ready ||
        snapshot.capability !== "available"
      ) {
        throw new AssistantRuntimeUnavailableError();
      }
      if (composition.execution.inspect().state === "half-open") {
        throw new AssistantRuntimeUnavailableError();
      }
      const provider = selectAssistantProvider({
        mode: "agentos",
        ready: snapshot.ready,
        capability: snapshot.capability,
        placeholder: placeholderAssistantProvider,
        agentos: composition.provider,
      });
      if (provider !== composition.provider) {
        throw new AssistantRuntimeUnavailableError();
      }
      return { provider, mode: "agentos" };
    },

    async deleteSession(internalSessionId: string): Promise<void> {
      if (providerSettings.mode === "placeholder") return;
      await getAgentOSComposition().runClient.deleteSession(internalSessionId);
    },
  };
}

export type AssistantRuntime = ReturnType<typeof createAssistantRuntime>;

const RUNTIME_KEY = Symbol.for("ai-agent-platform:assistant:runtime:v1");

function runtimeStore(): Record<symbol, AssistantRuntime | undefined> {
  return globalThis as typeof globalThis &
    Record<symbol, AssistantRuntime | undefined>;
}

export function getAssistantRuntime(): AssistantRuntime {
  const store = runtimeStore();
  store[RUNTIME_KEY] ??= createAssistantRuntime();
  return store[RUNTIME_KEY];
}

export async function readSafeAssistantRuntimeStatus(
  runtime?: Pick<AssistantRuntime, "status">,
): Promise<AssistantRuntimeStatus> {
  try {
    const resolvedRuntime = runtime ?? getAssistantRuntime();
    return normalizeAssistantRuntimeStatus(await resolvedRuntime.status());
  } catch {
    return degradedStatus();
  }
}
