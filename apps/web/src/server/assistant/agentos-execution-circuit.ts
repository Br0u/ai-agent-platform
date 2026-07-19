import "server-only";

import { performance } from "node:perf_hooks";

import { AgentOSRunClientError } from "./agentos-run-client";

export type AgentOSExecutionCircuitInspection = {
  state: "closed" | "open" | "half-open";
  consecutiveFailures: number;
};

export type AgentOSExecutionCircuit = {
  execute<T>(operation: () => Promise<T>): Promise<T>;
  inspect(): AgentOSExecutionCircuitInspection;
};

export class AgentOSExecutionUnavailableError extends Error {
  readonly code = "ASSISTANT_EXECUTION_UNAVAILABLE";

  constructor() {
    super("Assistant execution unavailable");
    Object.defineProperty(this, "name", {
      value: "AgentOSExecutionUnavailableError",
      configurable: true,
    });
  }
}

function countedFailure(error: unknown): boolean {
  if (!(error instanceof AgentOSRunClientError)) return false;
  switch (error.code) {
    case "timeout":
    case "transport_error":
    case "redirect_rejected":
    case "authentication":
    case "not_found":
    case "server_error":
    case "unexpected_status":
    case "invalid_content_type":
    case "response_too_large":
    case "invalid_response":
      return true;
    case "external_abort":
    case "invalid_request":
    case "rate_limited":
    case "other_client_error":
      return false;
  }
}

export function createAgentOSExecutionCircuit(options: {
  failureThreshold: number;
  resetAfterMs: number;
  now?: () => number;
}): AgentOSExecutionCircuit {
  for (const [name, value] of Object.entries({
    failureThreshold: options.failureThreshold,
    resetAfterMs: options.resetAfterMs,
  })) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`${name} must be a positive integer`);
    }
  }

  const now = options.now ?? (() => performance.now());
  let lastMonotonicTime: number | null = null;
  let consecutiveFailures = 0;
  let openedAt: number | null = null;
  let halfOpen = false;
  let generation = Symbol("execution-circuit-generation");

  function clock(): number {
    const value = now();
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError(
        "AgentOS execution clock must return finite monotonic milliseconds",
      );
    }
    lastMonotonicTime =
      lastMonotonicTime === null ? value : Math.max(lastMonotonicTime, value);
    return lastMonotonicTime;
  }

  return {
    async execute<T>(operation: () => Promise<T>): Promise<T> {
      const currentTime = clock();
      const isHalfOpenProbe =
        openedAt !== null && currentTime >= openedAt + options.resetAfterMs;
      if (openedAt !== null && (!isHalfOpenProbe || halfOpen)) {
        throw new AgentOSExecutionUnavailableError();
      }
      if (isHalfOpenProbe) {
        halfOpen = true;
        generation = Symbol("execution-circuit-half-open");
      }
      const operationGeneration = generation;

      try {
        const result = await operation();
        if (operationGeneration !== generation) return result;
        consecutiveFailures = 0;
        openedAt = null;
        halfOpen = false;
        if (isHalfOpenProbe) {
          generation = Symbol("execution-circuit-closed");
        }
        return result;
      } catch (error) {
        const counted = countedFailure(error);
        if (operationGeneration !== generation) {
          if (counted) throw new AgentOSExecutionUnavailableError();
          throw error;
        } else if (isHalfOpenProbe) {
          if (counted) {
            consecutiveFailures = Math.min(
              options.failureThreshold,
              consecutiveFailures + 1,
            );
            openedAt = clock();
            generation = Symbol("execution-circuit-reopened");
          }
          halfOpen = false;
        } else if (counted) {
          consecutiveFailures = Math.min(
            options.failureThreshold,
            consecutiveFailures + 1,
          );
          if (consecutiveFailures >= options.failureThreshold) {
            openedAt = clock();
            generation = Symbol("execution-circuit-opened");
          }
        }

        if (counted) throw new AgentOSExecutionUnavailableError();
        throw error;
      }
    },

    inspect(): AgentOSExecutionCircuitInspection {
      return {
        state: halfOpen ? "half-open" : openedAt === null ? "closed" : "open",
        consecutiveFailures,
      };
    },
  };
}
