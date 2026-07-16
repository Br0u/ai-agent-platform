export type DatabaseProbe = () => Promise<void>;

export const DATABASE_READINESS_TIMEOUT_MS = 3_000;

export type LivenessResult = {
  status: "ok";
};

export type ReadinessResult =
  | {
      status: "ready";
      database: "up";
    }
  | {
      status: "not_ready";
      database: "down";
      errorCode: "DATABASE_UNAVAILABLE";
    };

export function getLiveness(): LivenessResult {
  return { status: "ok" };
}

function databaseUnavailable(): ReadinessResult {
  return {
    status: "not_ready",
    database: "down",
    errorCode: "DATABASE_UNAVAILABLE",
  };
}

export async function getReadiness(
  probe: DatabaseProbe,
): Promise<ReadinessResult> {
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const probeResult = Promise.resolve()
    .then(probe)
    .then<ReadinessResult, ReadinessResult>(
      () => ({ status: "ready", database: "up" }),
      () => databaseUnavailable(),
    );
  const deadlineResult = new Promise<ReadinessResult>((resolve) => {
    deadlineTimer = setTimeout(
      () => resolve(databaseUnavailable()),
      DATABASE_READINESS_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([probeResult, deadlineResult]);
  } catch {
    return databaseUnavailable();
  } finally {
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
  }
}
