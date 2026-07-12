import { createHash, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { Pool } from "pg";

type AssertionMode = "--expect-present-hashed" | "--expect-consumed";

export function parseAssertionMode(args: string[]): AssertionMode {
  const mode = args.find((value) =>
    ["--expect-present-hashed", "--expect-consumed"].includes(value),
  ) as AssertionMode | undefined;
  if (!mode)
    throw new Error("Expected --expect-present-hashed or --expect-consumed");
  return mode;
}

export function recoveryCodeDigest(code: string): string {
  return createHash("sha256")
    .update(code.normalize("NFKC").trim(), "utf8")
    .digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyAtRestState(
  mode: AssertionMode,
  plaintext: string,
  serializedHashes: string | null,
  revokedFixtureSessionExists: boolean,
): true {
  if (serializedHashes?.includes(plaintext)) {
    throw new Error("Recovery code plaintext is stored");
  }
  let values: unknown = [];
  try {
    values = JSON.parse(serializedHashes ?? "[]");
  } catch {
    throw new Error("Recovery code storage is malformed");
  }
  if (!Array.isArray(values))
    throw new Error("Recovery code storage is malformed");
  const digest = recoveryCodeDigest(plaintext);
  const exists = values.some(
    (value) => typeof value === "string" && safeEqual(value, digest),
  );
  if (mode === "--expect-present-hashed" && !exists) {
    throw new Error("Matching hashed recovery code is absent");
  }
  if (mode === "--expect-consumed" && exists) {
    throw new Error("Consumed recovery hash still exists");
  }
  if (mode === "--expect-consumed" && revokedFixtureSessionExists) {
    throw new Error("The revoked fixture session still exists");
  }
  return true;
}

async function stdinText(): Promise<string> {
  let value = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) value += chunk;
  return value.trim();
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== "test")
    throw new Error("At-rest assertion is test-only");
  const mode = parseAssertionMode(process.argv.slice(2));
  const email = process.env.E2E_ADMIN_EMAIL;
  const databaseUrl = process.env.DATABASE_URL;
  if (!email || !databaseUrl)
    throw new Error("E2E_ADMIN_EMAIL and DATABASE_URL are required");
  const code = await stdinText();
  if (!code) throw new Error("Recovery code is required on stdin");
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query<{
      backup_codes: string | null;
      revoked_session_exists: boolean;
    }>(
      `SELECT tf.backup_codes,
        EXISTS(SELECT 1 FROM sessions s WHERE s.token = 'e2e-revoked-session' AND s.user_id = u.id) AS revoked_session_exists
       FROM users u LEFT JOIN two_factors tf ON tf.user_id = u.id
       WHERE lower(u.email) = lower($1)`,
      [email],
    );
    if (!result.rows[0]) throw new Error("Fixture user not found");
    verifyAtRestState(
      mode,
      code,
      result.rows[0].backup_codes,
      result.rows[0].revoked_session_exists,
    );
    console.log("At-rest assertion passed.");
  } finally {
    await pool.end();
  }
}

const entryPoint = process.argv[1];
if (entryPoint && fileURLToPath(import.meta.url) === path.resolve(entryPoint)) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "At-rest assertion failed",
    );
    process.exitCode = 1;
  });
}
