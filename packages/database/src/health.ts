export type DatabaseProbe = () => Promise<void>;

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

export async function getReadiness(
  probe: DatabaseProbe,
): Promise<ReadinessResult> {
  try {
    await probe();
    return { status: "ready", database: "up" };
  } catch {
    return {
      status: "not_ready",
      database: "down",
      errorCode: "DATABASE_UNAVAILABLE",
    };
  }
}
