export function assertSafeIdentityMigrationTestDatabaseUrl(
  databaseUrl: string,
): string {
  const refusal = (detail: string): never => {
    throw new Error(`Refusing destructive identity migration test: ${detail}`);
  };

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return refusal("TEST_DATABASE_URL is not a valid URL");
  }

  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    return refusal("TEST_DATABASE_URL must use PostgreSQL");
  }

  const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (!localHosts.has(parsed.hostname)) {
    return refusal("host must be localhost, 127.0.0.1, or ::1");
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    return refusal("database name is malformed");
  }

  const dedicatedTestDatabase =
    /^ai_agent_platform_identity_test(?:_[a-z0-9][a-z0-9-]{0,63})?$/u;
  if (!dedicatedTestDatabase.test(databaseName)) {
    return refusal(
      "database name must be ai_agent_platform_identity_test or an approved nonce-suffixed variant",
    );
  }

  return databaseUrl;
}
