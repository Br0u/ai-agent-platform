import "server-only";

import {
  createAgentOSClient,
  resolveAgentOSClientSettings,
} from "./agentos-client";
import { AgentOSAssistantProvider } from "./agentos-assistant-provider";
import {
  createAgentOSProbe,
  createAgentOSReadinessCircuit,
  resolveAgentOSReadinessSettings,
  type AgentOSReadinessSnapshot,
} from "./agentos-readiness";
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
  ASSISTANT_AGENTOS_DEFAULT_AGENT_ID?: string;
  ASSISTANT_AGENTOS_READINESS_TTL_MS?: string;
  ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS?: string;
  ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD?: string;
  ASSISTANT_AGENTOS_CIRCUIT_RESET_MS?: string;
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
    ASSISTANT_AGENTOS_DEFAULT_AGENT_ID:
      source.ASSISTANT_AGENTOS_DEFAULT_AGENT_ID,
    ASSISTANT_AGENTOS_READINESS_TTL_MS:
      source.ASSISTANT_AGENTOS_READINESS_TTL_MS,
    ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS:
      source.ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS,
    ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD:
      source.ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD,
    ASSISTANT_AGENTOS_CIRCUIT_RESET_MS:
      source.ASSISTANT_AGENTOS_CIRCUIT_RESET_MS,
    AGENTOS_INTERNAL_URL: source.AGENTOS_INTERNAL_URL,
    OS_SECURITY_KEY: source.OS_SECURITY_KEY,
    TRUST_NGINX_PROXY: source.TRUST_NGINX_PROXY,
  };
}

export type AssistantRuntimeStatus = AgentOSReadinessSnapshot & {
  message: string;
};

export type AssistantRuntimeProvider = {
  provider: AssistantProvider;
  mode: AssistantProviderMode;
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
  }
}

const PLACEHOLDER_MESSAGE = "模型尚未配置，当前为安全占位模式。";
const AVAILABLE_MESSAGE = "AI 助理基础服务已就绪。";
const DEGRADED_MESSAGE = "助手基础服务暂不可用。";

function parseTrustNginxProxy(value: string | undefined): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("TRUST_NGINX_PROXY must be true or false");
}

function safeStatus(
  snapshot: AgentOSReadinessSnapshot,
): AssistantRuntimeStatus {
  if (!snapshot.live || !snapshot.ready || snapshot.capability === "degraded") {
    return {
      live: false,
      ready: false,
      capability: "degraded",
      message: DEGRADED_MESSAGE,
    };
  }
  return {
    ...snapshot,
    message:
      snapshot.capability === "available"
        ? AVAILABLE_MESSAGE
        : PLACEHOLDER_MESSAGE,
  };
}

export function createAssistantRuntime(
  options: {
    environment?: AssistantRuntimeEnvironment;
    fetcher?: typeof fetch;
    createRateLimiter?: (secret: string | undefined) => AssistantRateLimiter;
    resolveActor?: (request: Request) => Promise<AssistantActor>;
  } = {},
) {
  const environment = readRuntimeEnvironment(
    options.environment ?? process.env,
  );
  const providerSettings = resolveAssistantProviderSettings({
    ...environment,
    ASSISTANT_PROVIDER_MODE:
      environment.ASSISTANT_PROVIDER_MODE ?? "placeholder",
  });
  const rateLimitSecret = environment.ASSISTANT_RATE_LIMIT_SECRET;
  const trustNginxProxy = parseTrustNginxProxy(environment.TRUST_NGINX_PROXY);
  const agentosProvider = new AgentOSAssistantProvider();
  const actorResolver = options.resolveActor ?? resolveAssistantActor;
  let sessionManager:
    | ReturnType<typeof createAnonymousSessionManager>
    | undefined;
  let sharedRateLimiter: AssistantRateLimiter | undefined;
  let readiness: ReturnType<typeof createAgentOSReadinessCircuit> | undefined;

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

  function getReadiness() {
    if (readiness) return readiness;
    const readinessSettings = resolveAgentOSReadinessSettings(environment);
    const client = createAgentOSClient({
      settings: resolveAgentOSClientSettings(environment),
      fetcher: options.fetcher,
      timeoutMs: readinessSettings.probeTimeoutMs,
    });
    readiness = createAgentOSReadinessCircuit({
      probe: createAgentOSProbe(client),
      cacheTtlMs: readinessSettings.cacheTtlMs,
      failureThreshold: readinessSettings.failureThreshold,
      resetAfterMs: readinessSettings.resetAfterMs,
    });
    return readiness;
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
      return safeStatus(await getReadiness().status());
    },
    async resolveProvider(): Promise<AssistantRuntimeProvider> {
      if (providerSettings.mode === "placeholder") {
        return { provider: placeholderAssistantProvider, mode: "placeholder" };
      }

      const snapshot = await getReadiness().status();
      if (
        !snapshot.live ||
        !snapshot.ready ||
        snapshot.capability === "degraded"
      ) {
        throw new AssistantRuntimeUnavailableError();
      }
      const provider = selectAssistantProvider({
        ...providerSettings,
        ready: snapshot.ready,
        capability: snapshot.capability,
        placeholder: placeholderAssistantProvider,
        agentos: agentosProvider,
      });
      return {
        provider,
        mode: provider === agentosProvider ? "agentos" : "placeholder",
      };
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
