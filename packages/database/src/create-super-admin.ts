import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline/promises";

import { Pool, type PoolClient } from "pg";

import { hashPassword as sharedHashPassword } from "./credentials/password";
import {
  normalizeIdentityEmail,
  normalizeWorkforceUsername,
} from "./schema/identity";

export interface SuperAdminBootstrapRepository {
  transaction<T>(
    work: (repository: SuperAdminBootstrapRepository) => Promise<T>,
  ): Promise<T>;
  countSuperAdmins(): Promise<number>;
  findSuperAdminRoleId(): Promise<string | null>;
  createUser(input: {
    name: string;
    email: string;
    username: string;
    identityRealm: "workforce";
    status: "active";
    mustChangePassword: true;
  }): Promise<string>;
  createCredentialAccount(userId: string, passwordHash: string): Promise<void>;
  assignRole(userId: string, roleId: string): Promise<void>;
  writeAudit(event: {
    action: "bootstrap.super_admin_created";
    targetType: "user";
    targetId: string;
  }): Promise<void>;
}

export async function bootstrapSuperAdmin(input: {
  input: { email: string; username: string; password: string };
  repository: SuperAdminBootstrapRepository;
  hashPassword(password: string): Promise<string>;
}): Promise<void> {
  const email = normalizeIdentityEmail(input.input.email);
  const username = normalizeWorkforceUsername(input.input.username);
  if (!email || !username || !input.input.password) {
    throw new Error("Email, username, and password are required");
  }

  await input.repository.transaction(async (repository) => {
    if ((await repository.countSuperAdmins()) > 0) {
      throw new Error("A super administrator already exists");
    }
    const roleId = await repository.findSuperAdminRoleId();
    if (!roleId)
      throw new Error("super_admin role is missing; run access seed first");

    const passwordHash = await input.hashPassword(input.input.password);
    const userId = await repository.createUser({
      name: username,
      email,
      username,
      identityRealm: "workforce",
      status: "active",
      mustChangePassword: true,
    });
    await repository.createCredentialAccount(userId, passwordHash);
    await repository.assignRole(userId, roleId);
    await repository.writeAudit({
      action: "bootstrap.super_admin_created",
      targetType: "user",
      targetId: userId,
    });
  });
}

export interface BootstrapPrompt {
  readVisible(label: string): Promise<string>;
  readHidden(label: string): Promise<string>;
}

export async function runCreateSuperAdminCli(input: {
  isTTY: boolean;
  prompt: BootstrapPrompt;
  repository: SuperAdminBootstrapRepository;
  hashPassword(password: string): Promise<string>;
  log(message: string): void;
}): Promise<void> {
  if (!input.isTTY) throw new Error("Super-admin bootstrap requires a TTY");
  const email = await input.prompt.readVisible("Email: ");
  const username = await input.prompt.readVisible("Username: ");
  const password = await input.prompt.readHidden("Password: ");
  const confirmation = await input.prompt.readHidden("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords do not match");
  await bootstrapSuperAdmin({
    input: { email, username, password },
    repository: input.repository,
    hashPassword: input.hashPassword,
  });
  input.log("Super administrator created.");
}

function repositoryFor(
  client: PoolClient,
  pool?: Pool,
): SuperAdminBootstrapRepository {
  return {
    async transaction<T>(
      work: (repository: SuperAdminBootstrapRepository) => Promise<T>,
    ) {
      if (!pool) return work(repositoryFor(client));
      const transaction = await pool.connect();
      try {
        await transaction.query("BEGIN");
        await transaction.query("SELECT pg_advisory_xact_lock(72134879)");
        const result = await work(repositoryFor(transaction));
        await transaction.query("COMMIT");
        return result;
      } catch (error) {
        await transaction.query("ROLLBACK");
        throw error;
      } finally {
        transaction.release();
      }
    },
    async countSuperAdmins() {
      const result = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE r.name = 'super_admin' AND r.realm_scope = 'workforce'`,
      );
      return Number(result.rows[0]?.count ?? "0");
    },
    async findSuperAdminRoleId() {
      const result = await client.query<{ id: string }>(
        "SELECT id FROM roles WHERE name = 'super_admin' AND realm_scope = 'workforce' LIMIT 1",
      );
      return result.rows[0]?.id ?? null;
    },
    async createUser(value) {
      const id = randomUUID();
      await client.query(
        `INSERT INTO users (id, name, email, email_verified, identity_realm, status,
          email_verification_status, username, display_username, must_change_password)
         VALUES ($1, $2, $3, true, $4, $5, 'verified', $6, $6, $7)`,
        [
          id,
          value.name,
          value.email,
          value.identityRealm,
          value.status,
          value.username,
          value.mustChangePassword,
        ],
      );
      return id;
    },
    async createCredentialAccount(userId, passwordHash) {
      await client.query(
        `INSERT INTO accounts (id, account_id, provider_id, user_id, password)
         VALUES ($1, $2, 'credential', $3::uuid, $4)`,
        [randomUUID(), userId, userId, passwordHash],
      );
    },
    async assignRole(userId, roleId) {
      await client.query(
        "INSERT INTO user_roles (id, user_id, role_id) VALUES ($1, $2, $3)",
        [randomUUID(), userId, roleId],
      );
    },
    async writeAudit(event) {
      await client.query(
        `INSERT INTO audit_logs (id, actor_realm, action, target_type, target_id, metadata)
         VALUES ($1, 'workforce', $2, $3, $4, '{}'::jsonb)`,
        [randomUUID(), event.action, event.targetType, event.targetId],
      );
    },
  };
}

export async function readHiddenInput(label: string): Promise<string> {
  const input = process.stdin;
  const output = process.stdout;
  if (!input.isTTY || !output.isTTY || !input.setRawMode) {
    throw new Error("Hidden input requires a TTY");
  }
  output.write(label);
  input.setRawMode(true);
  input.resume();
  let onData: (chunk: Buffer | string) => void = () => undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      let value = "";
      onData = (chunk: Buffer | string) => {
        for (const character of String(chunk)) {
          if (character === "\r" || character === "\n") {
            output.write("\n");
            resolve(value);
            return;
          }
          if (character === "\u0003") {
            reject(new Error("Bootstrap cancelled"));
            return;
          }
          if (character === "\u007f" || character === "\b")
            value = value.slice(0, -1);
          else value += character;
        }
      };
      input.on("data", onData);
    });
  } finally {
    input.off("data", onData);
    input.setRawMode(false);
    input.pause();
  }
}

async function readVisibleInput(label: string): Promise<string> {
  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await prompt.question(label);
  } finally {
    prompt.close();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl });
  const control = await pool.connect();
  try {
    await runCreateSuperAdminCli({
      isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      prompt: {
        readVisible: readVisibleInput,
        readHidden: readHiddenInput,
      },
      repository: repositoryFor(control, pool),
      hashPassword: sharedHashPassword,
      log: console.log,
    });
  } finally {
    control.release();
    await pool.end();
  }
}

const entryPoint = process.argv[1];
if (entryPoint && fileURLToPath(import.meta.url) === path.resolve(entryPoint)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Bootstrap failed");
    process.exitCode = 1;
  });
}
