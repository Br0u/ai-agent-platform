import "server-only";

import type { AgentOSCapability, AgentOSClient } from "./agentos-client";

export type AgentOSReadinessSnapshot = {
  live: boolean;
  ready: boolean;
  capability: AgentOSCapability;
};

export type AgentOSCircuitInspection = {
  state: "closed" | "open" | "half-open";
  consecutiveFailures: number;
  openedAt: number | null;
};

export type AgentOSReadinessEnvironment = {
  ASSISTANT_AGENTOS_READINESS_TTL_MS?: string;
  ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS?: string;
  ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD?: string;
  ASSISTANT_AGENTOS_CIRCUIT_RESET_MS?: string;
};

export type AgentOSReadinessSettings = {
  cacheTtlMs: number;
  probeTimeoutMs: number;
  failureThreshold: number;
  resetAfterMs: number;
};

const DEGRADED: AgentOSReadinessSnapshot = {
  live: false,
  ready: false,
  capability: "degraded",
};

function boundedInteger(
  raw: string | undefined,
  name: string,
  maximum: number,
): number {
  if (!raw || !/^[1-9]\d*$/u.test(raw)) {
    throw new Error(`${name} must be a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) {
    throw new Error(`${name} is outside the supported range`);
  }
  return value;
}

export function resolveAgentOSReadinessSettings(
  environment: AgentOSReadinessEnvironment,
): AgentOSReadinessSettings {
  return {
    cacheTtlMs: boundedInteger(
      environment.ASSISTANT_AGENTOS_READINESS_TTL_MS,
      "ASSISTANT_AGENTOS_READINESS_TTL_MS",
      60_000,
    ),
    probeTimeoutMs: boundedInteger(
      environment.ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS,
      "ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS",
      30_000,
    ),
    failureThreshold: boundedInteger(
      environment.ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD,
      "ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD",
      10,
    ),
    resetAfterMs: boundedInteger(
      environment.ASSISTANT_AGENTOS_CIRCUIT_RESET_MS,
      "ASSISTANT_AGENTOS_CIRCUIT_RESET_MS",
      300_000,
    ),
  };
}

function isSnapshot(value: unknown): value is AgentOSReadinessSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    keys.length === 3 &&
    keys[0] === "capability" &&
    keys[1] === "live" &&
    keys[2] === "ready" &&
    typeof record.live === "boolean" &&
    typeof record.ready === "boolean" &&
    (record.capability === "placeholder" ||
      record.capability === "available" ||
      record.capability === "degraded") &&
    !(record.ready && record.capability === "degraded")
  );
}

export function createAgentOSProbe(client: AgentOSClient) {
  return async (): Promise<AgentOSReadinessSnapshot> => {
    const [live, ready] = await Promise.all([client.live(), client.ready()]);
    return {
      live: live.live,
      ready: ready.ready,
      capability: ready.capability,
    };
  };
}

export function createAgentOSReadinessCircuit(options: {
  probe: () => Promise<AgentOSReadinessSnapshot>;
  now?: () => number;
  cacheTtlMs: number;
  failureThreshold: number;
  resetAfterMs: number;
}) {
  const now = options.now ?? Date.now;
  for (const [name, value] of Object.entries({
    cacheTtlMs: options.cacheTtlMs,
    failureThreshold: options.failureThreshold,
    resetAfterMs: options.resetAfterMs,
  })) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`${name} must be a positive integer`);
    }
  }

  let cache: { value: AgentOSReadinessSnapshot; expiresAt: number } | null =
    null;
  let inFlight: Promise<AgentOSReadinessSnapshot> | null = null;
  let consecutiveFailures = 0;
  let openedAt: number | null = null;
  let halfOpen = false;

  function clock(): number {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError("AgentOS readiness clock must return epoch ms");
    }
    return value;
  }

  function startProbe(isHalfOpen: boolean): Promise<AgentOSReadinessSnapshot> {
    halfOpen = isHalfOpen;
    const operation = (async () => {
      let snapshot: AgentOSReadinessSnapshot;
      try {
        const result = await options.probe();
        if (!isSnapshot(result)) throw new Error("invalid readiness snapshot");
        snapshot = result;
      } catch {
        snapshot = DEGRADED;
      }

      const completedAt = clock();
      if (snapshot.live && snapshot.ready) {
        consecutiveFailures = 0;
        openedAt = null;
        halfOpen = false;
      } else {
        consecutiveFailures = Math.min(
          options.failureThreshold,
          consecutiveFailures + 1,
        );
        if (isHalfOpen || consecutiveFailures >= options.failureThreshold) {
          openedAt = completedAt;
        }
        halfOpen = false;
      }
      cache = { value: snapshot, expiresAt: completedAt + options.cacheTtlMs };
      return snapshot;
    })();
    const current = operation.finally(() => {
      inFlight = null;
    });
    inFlight = current;
    return current;
  }

  return {
    status(): Promise<AgentOSReadinessSnapshot> {
      const currentTime = clock();
      if (openedAt !== null) {
        if (currentTime < openedAt + options.resetAfterMs) {
          return Promise.resolve(DEGRADED);
        }
        return inFlight ?? startProbe(true);
      }
      if (cache && currentTime < cache.expiresAt) {
        return Promise.resolve(cache.value);
      }
      return inFlight ?? startProbe(false);
    },
    inspect(): AgentOSCircuitInspection {
      return {
        state: halfOpen ? "half-open" : openedAt === null ? "closed" : "open",
        consecutiveFailures,
        openedAt,
      };
    },
  };
}
