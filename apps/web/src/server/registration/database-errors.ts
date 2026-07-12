type PostgresErrorDetails = {
  code: string;
  constraint?: string;
};

export function findPostgresError(error: unknown): PostgresErrorDetails | null {
  const seen = new Set<object>();
  let current = error;
  let fallback: PostgresErrorDetails | null = null;

  while (typeof current === "object" && current !== null) {
    if (seen.has(current)) return fallback;
    seen.add(current);
    const record = current as Record<string, unknown>;
    if (typeof record.code === "string") {
      const details = {
        code: record.code,
        ...(typeof record.constraint === "string"
          ? { constraint: record.constraint }
          : {}),
      };
      if (details.constraint) return details;
      fallback ??= details;
    }
    current = record.cause;
  }

  return fallback;
}

export function matchesPostgresConstraint(
  error: unknown,
  code: string,
  constraints: readonly string[],
): boolean {
  const details = findPostgresError(error);
  return (
    details?.code === code &&
    details.constraint !== undefined &&
    constraints.includes(details.constraint)
  );
}
