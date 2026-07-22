import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const composeSecretKeys = [
  "POSTGRES_PASSWORD",
  "MIGRATOR_DATABASE_PASSWORD",
  "RUNTIME_DATABASE_PASSWORD",
  "BACKUP_DATABASE_PASSWORD",
  "BACKUP_ENCRYPTION_KEY",
  "AGNO_MIGRATOR_DATABASE_PASSWORD",
  "AGNO_DATABASE_PASSWORD",
  "MIGRATOR_DATABASE_URL",
  "RUNTIME_DATABASE_URL",
  "BACKUP_DATABASE_URL",
  "AGNO_MIGRATOR_DATABASE_URL",
  "AGNO_DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "OS_SECURITY_KEY",
  "ASSISTANT_SESSION_SECRET",
  "ASSISTANT_RATE_LIMIT_SECRET",
  "MODEL_API_KEY",
  "AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD",
  "AGENT_CONTROL_DATABASE_PASSWORD",
  "AGENT_CONTROL_MIGRATOR_DATABASE_URL",
  "AGENT_CONTROL_DATABASE_URL",
  "MODEL_CONFIG_ENCRYPTION_KEY",
  "AGENT_CONFIG_CONTROL_KEY",
  "SKILL_REGISTRY_MIGRATOR_DATABASE_PASSWORD",
  "SKILL_REGISTRY_DATABASE_PASSWORD",
  "SKILL_REGISTRY_RUNTIME_DATABASE_PASSWORD",
  "SKILL_REGISTRY_MIGRATOR_DATABASE_URL",
  "SKILL_REGISTRY_DATABASE_URL",
  "SKILL_REGISTRY_CONTROL_KEY",
] as const;

type RenderedSecretAttachment = string | { source?: string; target?: string };

type RenderedNetworkAttachment = null | { gw_priority?: number };
type RenderedVolumeAttachment =
  | string
  | {
      type?: string;
      source?: string;
      target?: string;
      read_only?: boolean;
    };

type RenderedService = {
  build?: { target?: string };
  cap_add?: string[];
  cap_drop?: string[];
  command?: string[];
  cpus?: number | string;
  depends_on?: Record<string, { condition?: string }>;
  entrypoint?: string[];
  environment?: Record<string, string | null>;
  healthcheck?: { test?: string[] };
  mem_limit?: number | string;
  networks?: Record<string, RenderedNetworkAttachment>;
  pids_limit?: number;
  ports?: unknown[];
  read_only?: boolean;
  secrets?: RenderedSecretAttachment[];
  security_opt?: string[];
  tmpfs?: string[];
  user?: string;
  volumes?: RenderedVolumeAttachment[];
};

type RenderedCompose = {
  networks: Record<string, { internal?: boolean }>;
  secrets?: Record<string, { file?: string }>;
  services: Record<string, RenderedService>;
};

const renderComposeFixture = (
  composeFiles = ["compose.yaml"],
  options: { bootstrapModel?: boolean } = {},
): RenderedCompose => {
  const bootstrapModel = options.bootstrapModel ?? true;
  const sentinels = Object.fromEntries(
    composeSecretKeys.map((key, index) => [
      key,
      `compose-secret-${index}-sentinel`,
    ]),
  );
  sentinels.MODEL_API_KEY =
    "protected-model-api-key-sentinel:/credential/path-content";
  const sandbox = mkdtempSync(path.join(tmpdir(), "compose-secrets-"));
  const secretFileEnv: Record<string, string> = {};

  try {
    for (const key of composeSecretKeys) {
      const secretFile = path.join(sandbox, key.toLowerCase());
      writeFileSync(secretFile, sentinels[key], { mode: 0o600 });
      chmodSync(secretFile, 0o600);
      secretFileEnv[`${key}_FILE`] =
        key === "MODEL_API_KEY" && !bootstrapModel ? "" : secretFile;
    }

    const execution = spawnSync(
      "docker",
      [
        "compose",
        ...composeFiles.flatMap((file) => ["-f", file]),
        "config",
        "--format",
        "json",
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          ...secretFileEnv,
          E2E_CUSTOMER_PASSWORD: "compose-e2e-customer",
          E2E_STAFF_PASSWORD: "compose-e2e-staff",
          E2E_ADMIN_PASSWORD: "compose-e2e-admin",
          E2E_PENDING_CUSTOMER_SESSION_TOKEN: "compose-e2e-pending",
          E2E_DISABLED_CUSTOMER_SESSION_TOKEN: "compose-e2e-disabled",
          E2E_STAFF_SESSION_TOKEN: "compose-e2e-staff-session",
          E2E_ROLE_TARGET_SESSION_TOKEN: "compose-e2e-role-target",
          E2E_ADMIN_SESSION_TOKEN: "compose-e2e-admin-session",
          E2E_NO_TOTP_ADMIN_SESSION_TOKEN: "compose-e2e-no-totp",
          E2E_MODEL_ADMIN_SESSION_TOKEN: "compose-e2e-model-admin",
          E2E_MODEL_ADMIN_STALE_SESSION_TOKEN: "compose-e2e-model-admin-stale",
          E2E_REVOKED_SESSION_TOKEN: "compose-e2e-revoked",
          E2E_REPLACEMENT_PASSWORD: "compose-e2e-replacement",
          BETTER_AUTH_URL: "http://127.0.0.1:3000",
          BETTER_AUTH_TRUSTED_ORIGINS: "http://127.0.0.1:3000",
          ASSISTANT_PUBLIC_ORIGIN: "https://portal.example.com",
          PUBLIC_HOST: "127.0.0.1",
          MODEL_PROVIDER: bootstrapModel ? "openai" : "",
          MODEL_ID: bootstrapModel ? "provider-smoke-model" : "",
          MODEL_BASE_URL: "",
          MODEL_RUN_TIMEOUT_SECONDS: "25",
        },
      },
    );

    const exposedProtectedFixture = Object.values(sentinels).some(
      (sentinel) =>
        execution.stdout.includes(sentinel) ||
        execution.stderr.includes(sentinel),
    );
    if (exposedProtectedFixture) {
      throw new Error("rendered Compose output exposed protected fixture data");
    }
    if (execution.status !== 0) {
      throw new Error("fixture-backed Docker Compose rendering failed");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(execution.stdout);
    } catch {
      throw new Error("rendered Docker Compose output was not valid JSON");
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("services" in parsed) ||
      !("networks" in parsed)
    ) {
      throw new Error("rendered Docker Compose model was incomplete");
    }
    return parsed as RenderedCompose;
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
};

const secretSource = (
  attachment: RenderedSecretAttachment,
): string | undefined =>
  typeof attachment === "string" ? attachment : attachment.source;

describe("production deployment security contracts", () => {
  it("keeps runtime and backup roles on separate least-privilege matrices", () => {
    const sql = `${read("infra/postgres/01-roles.sql")}\n${read("infra/postgres/02-runtime-grants.sql")}`;
    expect(sql).toContain("ai_agent_migrator");
    expect(sql).toContain("ai_agent_runtime");
    expect(sql).toContain("ai_agent_backup");
    expect(sql).toMatch(/GRANT CREATE ON DATABASE .* TO ai_agent_migrator/);
    expect(sql).toMatch(
      /ALTER DEFAULT PRIVILEGES[\s\S]*GRANT SELECT, INSERT, UPDATE, DELETE/,
    );
    expect(sql).toMatch(
      /REVOKE UPDATE, DELETE ON TABLE public\.audit_logs FROM ai_agent_runtime/,
    );
    expect(sql).toMatch(
      /REVOKE DELETE, TRUNCATE ON TABLE public\.content FROM ai_agent_runtime/,
    );
    expect(sql).toMatch(
      /REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public\.content_revisions FROM ai_agent_runtime/,
    );
    expect(sql).toMatch(
      /REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public\.content_routes FROM ai_agent_runtime/,
    );
    expect(sql).toMatch(
      /GRANT UPDATE \(state\) ON TABLE public\.content_routes TO ai_agent_runtime/,
    );
    expect(sql).not.toMatch(/GRANT (CREATE|ALL).*ai_agent_runtime/);
    expect(sql).toMatch(
      /GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_agent_backup/,
    );
    expect(sql).toMatch(
      /ALTER DEFAULT PRIVILEGES[\s\S]*GRANT SELECT ON TABLES TO ai_agent_backup/,
    );
    expect(sql).toContain("GRANT USAGE ON SCHEMA drizzle TO ai_agent_backup");
    expect(sql).toContain(
      "GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO ai_agent_backup",
    );
    expect(sql).toContain(
      "GRANT SELECT ON ALL SEQUENCES IN SCHEMA drizzle TO ai_agent_backup",
    );
    expect(sql).toMatch(
      /REVOKE (?:ALL|INSERT, UPDATE, DELETE)[\s\S]*FROM ai_agent_backup/,
    );
    expect(sql).not.toMatch(
      /GRANT (?:CREATE|INSERT|UPDATE|DELETE|ALL)[^;]*ai_agent_backup/,
    );
  });

  it("enforces immutable document revisions and permanent route transitions", () => {
    const migration = read("packages/database/drizzle/0006_cms_documents.sql");
    const permissionMutationLock = read(
      "packages/database/src/access-control-locks.ts",
    );
    const adminRoles = read("apps/web/src/server/admin/roles.ts");
    const accessSeed = read("packages/database/src/seed-access-control.ts");
    const childGrantGuard = migration.match(
      /CREATE FUNCTION "enforce_admin_docs_delete_grant"\(\)[\s\S]*?\$\$ LANGUAGE plpgsql/u,
    )?.[0];
    const permissionIdentityGuard = migration.match(
      /CREATE FUNCTION "guard_admin_docs_delete_permission_key"\(\)[\s\S]*?\$\$ LANGUAGE plpgsql/u,
    )?.[0];
    const roleIdentityGuard = migration.match(
      /CREATE FUNCTION "guard_admin_docs_delete_role_identity"\(\)[\s\S]*?\$\$ LANGUAGE plpgsql/u,
    )?.[0];

    expect(migration).toContain(
      'LOCK TABLE "permissions", "roles", "role_permissions" IN SHARE ROW EXCLUSIVE MODE',
    );
    expect(migration).toContain("existing admin:docs:delete grant is invalid");
    expect(migration).toContain("FOR SHARE OF");
    expect(migration).toContain('CREATE TRIGGER "content_revisions_immutable"');
    expect(migration).toMatch(
      /BEFORE UPDATE OR DELETE ON "content_revisions"/u,
    );
    expect(migration).toContain(
      'CREATE TRIGGER "content_routes_state_machine"',
    );
    expect(migration).toMatch(
      /BEFORE INSERT OR UPDATE OR DELETE ON "content_routes"/u,
    );
    expect(migration).toContain("NEW.state <> 'reserved'");
    expect(migration).toContain(
      "OLD.state = 'reserved' AND NEW.state = 'canonical'",
    );
    expect(migration).toContain(
      "OLD.state = 'canonical' AND NEW.state = 'alias'",
    );
    expect(migration).not.toContain("NEW.state = OLD.state");
    expect(migration).toContain(
      "NEW.content_id IS DISTINCT FROM OLD.content_id",
    );
    expect(migration).toContain(
      'CREATE TRIGGER "role_permissions_admin_docs_delete_guard"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "permissions_admin_docs_delete_key_guard"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "roles_admin_docs_delete_grant_guard"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "roles_super_admin_delete_guard"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "permissions_admin_docs_delete_delete_guard"',
    );
    expect(migration).toMatch(
      /BEFORE INSERT OR UPDATE OR DELETE ON "role_permissions"/u,
    );
    expect(permissionIdentityGuard).not.toContain('FROM "role_permissions"');
    expect(roleIdentityGuard).not.toContain('FROM "role_permissions"');
    expect(childGrantGuard?.indexOf('FROM "roles"')).toBeGreaterThan(-1);
    expect(childGrantGuard?.indexOf('FROM "permissions"')).toBeGreaterThan(
      childGrantGuard?.indexOf('FROM "roles"') ?? Number.MAX_SAFE_INTEGER,
    );
    expect(permissionMutationLock).toContain(
      "ACCESS_CONTROL_PERMISSION_MUTATION_LOCK_KEY = 72_134_878",
    );
    expect(adminRoles).toContain("ACCESS_CONTROL_PERMISSION_MUTATION_LOCK_KEY");
    expect(accessSeed).toContain("ACCESS_CONTROL_PERMISSION_MUTATION_LOCK_KEY");
    expect(adminRoles).not.toContain("72134878");
    expect(accessSeed).not.toContain("72134878");
  });

  it("runs role bootstrap as the configured PostgreSQL owner", () => {
    const script = read("infra/postgres/01-roles.sh");
    expect(script).toContain('--username="$POSTGRES_USER"');
    expect(script).toContain('--dbname="$POSTGRES_DB"');
  });

  it("isolates Agno migrations and runtime behind owner-executed role bootstrap", () => {
    const platformRoles = read("infra/postgres/01-roles.sql");
    const agnoRoles = read("infra/postgres/03-agno-roles.sql");
    const wrapper = read("infra/postgres/03-agno-roles.sh");
    const env = read(".env.example");

    expect(agnoRoles).toContain("ai_agent_agno_migrator");
    expect(agnoRoles).toContain("ai_agent_agno");
    expect(agnoRoles).toMatch(
      /CREATE SCHEMA IF NOT EXISTS agno AUTHORIZATION ai_agent_agno_migrator/u,
    );
    expect(agnoRoles).toContain("REVOKE USAGE ON SCHEMA public FROM PUBLIC");
    expect(platformRoles).toContain(
      "REVOKE USAGE ON SCHEMA public FROM PUBLIC",
    );
    expect(agnoRoles).toContain("REVOKE ALL ON SCHEMA agno FROM PUBLIC");
    expect(agnoRoles).toMatch(
      /GRANT USAGE, CREATE ON SCHEMA agno TO ai_agent_agno_migrator/u,
    );
    expect(agnoRoles).toMatch(
      /GRANT USAGE ON SCHEMA agno TO ai_agent_agno, ai_agent_backup/u,
    );
    expect(agnoRoles).toMatch(
      /SET ROLE ai_agent_agno_migrator;[\s\S]*ALTER DEFAULT PRIVILEGES IN SCHEMA agno[\s\S]*GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ai_agent_agno/u,
    );
    expect(agnoRoles).toMatch(
      /ALTER DEFAULT PRIVILEGES IN SCHEMA agno[\s\S]*REVOKE USAGE, UPDATE ON SEQUENCES FROM ai_agent_backup/u,
    );
    expect(agnoRoles).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA agno TO ai_agent_agno",
    );
    expect(agnoRoles).toContain(
      "REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA agno FROM ai_agent_backup",
    );
    expect(agnoRoles).toContain(
      "GRANT SELECT ON ALL SEQUENCES IN SCHEMA agno TO ai_agent_backup",
    );

    expect(wrapper).toContain(
      'require_nonblank AGNO_MIGRATOR_DATABASE_PASSWORD \\\n  "${AGNO_MIGRATOR_DATABASE_PASSWORD-}"',
    );
    expect(wrapper).toContain(
      'require_nonblank AGNO_DATABASE_PASSWORD "${AGNO_DATABASE_PASSWORD-}"',
    );
    expect(wrapper).toContain('--username="$POSTGRES_USER"');
    expect(wrapper).toContain('--dbname="$POSTGRES_DB"');
    expect(wrapper).toContain("03-agno-roles.sql");
    expect(wrapper).not.toContain("01-roles.sh");
    expect(wrapper).not.toMatch(
      /(?:--set|-v|--variable)[^\n]*(?:password|secret)/iu,
    );
    expect(wrapper).not.toMatch(/set\s+-[^\n]*x/iu);
    expect(wrapper).toContain("--single-transaction");
    expect(wrapper).toContain("require_nonblank");
    expect(agnoRoles).toContain(
      "\\getenv agno_migrator_password AGNO_MIGRATOR_DATABASE_PASSWORD",
    );
    expect(agnoRoles).toContain(
      "\\getenv agno_runtime_password AGNO_DATABASE_PASSWORD",
    );
    expect(agnoRoles).toContain('GRANT CONNECT ON DATABASE :"DBNAME"');
    expect(agnoRoles).toContain('REVOKE CREATE ON DATABASE :"DBNAME"');

    for (const key of [
      "AGNO_MIGRATOR_DATABASE_PASSWORD",
      "AGNO_DATABASE_PASSWORD",
      "AGNO_MIGRATOR_DATABASE_URL",
      "AGNO_DATABASE_URL",
      "AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD",
      "AGENT_CONTROL_DATABASE_PASSWORD",
      "AGENT_CONTROL_MIGRATOR_DATABASE_URL",
      "AGENT_CONTROL_DATABASE_URL",
    ]) {
      expect(env).toContain(`${key}=`);
    }
    expect(env).not.toMatch(
      /(?:AGNO_MIGRATOR_DATABASE_PASSWORD|AGNO_DATABASE_PASSWORD)=(?!replace-with-)/u,
    );
  });

  it("keeps Agno role passwords out of psql argv and rejects blank values", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "agno-bootstrap-argv-"));
    const psql = path.join(sandbox, "psql");
    writeFileSync(psql, '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o700 });
    chmodSync(psql, 0o700);
    const wrapper = path.join(root, "infra/postgres/03-agno-roles.sh");
    const secrets = {
      POSTGRES_PASSWORD: `owner ' " $ \\ secret`,
      AGNO_MIGRATOR_DATABASE_PASSWORD: `migrator ' " $ \\ secret`,
      AGNO_DATABASE_PASSWORD: `runtime ' " $ \\ secret`,
    };
    const baseEnv = {
      PATH: `${sandbox}:${process.env.PATH ?? ""}`,
      POSTGRES_HOST: "127.0.0.1",
      POSTGRES_PORT: "5432",
      POSTGRES_USER: "owner",
      POSTGRES_DB: "ai_agent_platform_identity_test",
      AGNO_ROLE_SQL_FILE: path.join(root, "infra/postgres/03-agno-roles.sql"),
      ...secrets,
    };

    try {
      const captured = spawnSync("sh", [wrapper], {
        encoding: "utf8",
        env: baseEnv,
      });
      expect(captured.status).toBe(0);
      const argv = `${captured.stdout}${captured.stderr}`;
      for (const secret of Object.values(secrets)) {
        expect(argv).not.toContain(secret);
      }
      expect(argv).not.toMatch(/(?:password|secret)=/iu);

      for (const invalid of [undefined, "", " \t\n"]) {
        const env = { ...baseEnv } as Record<string, string | undefined>;
        env.AGNO_DATABASE_PASSWORD = invalid;
        const rejected = spawnSync("sh", [wrapper], {
          encoding: "utf8",
          env: env as NodeJS.ProcessEnv,
        });
        expect(rejected.status).not.toBe(0);
        expect(rejected.stderr).toContain("AGNO_DATABASE_PASSWORD");
        for (const secret of Object.values(secrets)) {
          expect(rejected.stderr).not.toContain(secret);
        }
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("limits only POST requests on exact authentication routes", () => {
    const serverTemplate = read("infra/nginx/default.conf.template");
    const nginx = `${read("infra/nginx/nginx.conf")}\n${serverTemplate}`;
    const authLocation = serverTemplate
      .split(
        "location ~ ^/(?:login|register|staff/login|staff/two-factor|staff/re-auth)$ {",
      )[1]
      ?.split("\n  }")[0];
    expect(nginx).toContain(
      "limit_req_zone $auth_post_key zone=auth_post_per_ip:10m rate=5r/m;",
    );
    expect(nginx).toContain("limit_req zone=auth_post_per_ip burst=5 nodelay;");
    expect(nginx).toContain("limit_req_status 429;");
    expect(nginx).toContain(
      "add_header X-Auth-Rate-Limit $limit_req_status always;",
    );
    expect(nginx).toMatch(/map \$request_method \$auth_post_method/);
    expect(nginx).toMatch(/POST\s+\$binary_remote_addr/);
    expect(nginx).toContain(
      "location ~ ^/(?:login|register|staff/login|staff/two-factor|staff/re-auth)$",
    );
    expect(nginx).toContain("proxy_set_header X-Real-IP $remote_addr;");
    expect(nginx).toContain("proxy_set_header X-Forwarded-For $remote_addr;");
    expect(authLocation).toContain(
      "add_header X-Content-Type-Options nosniff always;",
    );
    expect(authLocation).toContain(
      "add_header X-Frame-Options SAMEORIGIN always;",
    );
    expect(authLocation).toContain(
      "add_header Referrer-Policy strict-origin-when-cross-origin always;",
    );
    expect(
      nginx.match(/proxy_set_header X-Forwarded-Host \$http_host;/g),
    ).toHaveLength(4);
  });

  it("rate-limits only the exact public pricing and assistant POST APIs", () => {
    const nginx = read("infra/nginx/default.conf.template");
    const pricingLocation = nginx
      .split("location = /api/v1/pricing/estimate {")[1]
      ?.split("\n  }")[0];
    const assistantLocation = nginx
      .split("location = /api/v1/assistant/chat {")[1]
      ?.split("\n  }")[0];
    const catchAllLocation = nginx.split("location / {")[1]?.split("\n  }")[0];

    expect(nginx).toContain(
      "limit_req_zone $public_api_post_key zone=pricing_estimate_per_ip:10m rate=10r/m;",
    );
    expect(nginx).toContain(
      "limit_req_zone $public_api_post_key zone=assistant_chat_per_ip:10m rate=30r/m;",
    );
    expect(nginx).toMatch(/map \$request_method \$public_api_post_key/u);
    expect(nginx).toMatch(/POST\s+\$binary_remote_addr/u);

    expect(pricingLocation).toContain(
      "limit_req zone=pricing_estimate_per_ip burst=5 nodelay;",
    );
    expect(assistantLocation).toContain(
      "limit_req zone=assistant_chat_per_ip burst=10 nodelay;",
    );
    expect(assistantLocation).toContain("proxy_buffering off;");
    expect(assistantLocation).toContain("proxy_cache off;");
    for (const location of [pricingLocation, assistantLocation]) {
      expect(location).toContain("limit_req_status 429;");
      expect(location).toContain("error_page 429 = @public_api_rate_limited;");
    }
    expect(nginx).toMatch(
      /location @public_api_rate_limited \{[\s\S]*default_type application\/json;[\s\S]*add_header Retry-After "60" always;[\s\S]*return 429 '\{"version":"1","requestId":"\$request_id","error":\{"code":"rate_limited","message":"请求过于频繁，请稍后再试。","retryable":true\}\}';/u,
    );

    expect(catchAllLocation).toBeDefined();
    expect(catchAllLocation).not.toContain("limit_req");
    expect(nginx).not.toMatch(
      /location\s+=?\s*\/(?:api\/health|api\/v1\/session)[^{]*\{[\s\S]*?limit_req/u,
    );
  });

  it("wires the private AgentOS runtime into Web with external secret files", () => {
    const compose = read("compose.yaml");
    const webService = compose.split("\n  web:\n")[1]?.split("\n  proxy:\n")[0];
    const agentService = compose
      .split("\n  agent:\n")[1]
      ?.split("\n  web:\n")[0];
    const proxyService = compose
      .split("\n  proxy:\n")[1]
      ?.split("\n  backup:\n")[0];

    expect(webService).toBeDefined();
    expect(webService).toContain(
      "DATABASE_URL=/run/secrets/runtime_database_url",
    );
    expect(webService).toContain(
      "BETTER_AUTH_SECRET=/run/secrets/better_auth_secret",
    );
    expect(webService).toContain(
      "OS_SECURITY_KEY=/run/secrets/os_security_key",
    );
    expect(webService).toContain(
      "ASSISTANT_SESSION_SECRET=/run/secrets/assistant_session_secret",
    );
    expect(webService).toContain(
      "ASSISTANT_RATE_LIMIT_SECRET=/run/secrets/assistant_rate_limit_secret",
    );
    for (const secret of [
      "runtime_database_url",
      "better_auth_secret",
      "os_security_key",
      "assistant_session_secret",
      "assistant_rate_limit_secret",
    ]) {
      expect(webService).toContain(`- ${secret}`);
      expect(compose).toContain(`  ${secret}:`);
    }
    expect(webService).not.toContain("migrator_database_url");
    expect(webService).not.toContain("postgres_password");
    expect(webService).not.toContain("agno_database_url");
    expect(webService).toContain("AGENTOS_INTERNAL_URL: http://agent:7777");
    expect(webService).toContain(
      "ASSISTANT_PUBLIC_ORIGIN: ${ASSISTANT_PUBLIC_ORIGIN:?Set ASSISTANT_PUBLIC_ORIGIN in .env}",
    );
    expect(webService).toContain('TRUST_NGINX_PROXY: "true"');
    for (const name of [
      "ASSISTANT_PROVIDER_MODE",
      "ASSISTANT_AGENTOS_RUN_TIMEOUT_MS",
      "ASSISTANT_AGENTOS_READINESS_TTL_MS",
      "ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS",
      "ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD",
      "ASSISTANT_AGENTOS_CIRCUIT_RESET_MS",
    ]) {
      expect(webService).toContain(`${name}:`);
    }
    expect(webService).not.toContain("ASSISTANT_AGENTOS_DEFAULT_AGENT_ID");
    expect(webService).not.toContain("MODEL_API_KEY");
    expect(webService).not.toContain(
      "      agent:\n        condition: service_healthy",
    );
    expect(webService).not.toMatch(/^\s{4}ports:/mu);
    expect(agentService).not.toMatch(/^\s{4}ports:/mu);
    expect(proxyService).toMatch(/^\s{4}ports:/mu);
  });

  it("documents HTTPS production origin and exact loopback-only E2E origin", () => {
    const example = read(".env.example");
    const runbook = read("docs/deployment/server-readiness.md");
    const runner = read("docs/testing/run-assistant-runtime-e2e.sh");

    expect(example).toContain(
      "ASSISTANT_PUBLIC_ORIGIN=https://ai-agent.example.com",
    );
    expect(runbook).toContain(
      "ASSISTANT_PUBLIC_ORIGIN=https://ai-agent.example.com",
    );
    expect(runner).toContain("ASSISTANT_PUBLIC_ORIGIN=http://127.0.0.1:8080");
    expect(runner).toContain(
      '[ "$ASSISTANT_PUBLIC_ORIGIN" = "http://127.0.0.1:8080" ]',
    );
  });

  it("documents assistant secret files and current images in first deployment", () => {
    const runbook = read("docs/deployment/server-readiness.md");
    const firstDeployment = runbook
      .split("## 首次部署\n")[1]
      ?.split("\n## ")[0];

    expect(firstDeployment).toBeDefined();
    expect(firstDeployment).toContain("assistant_session_secret");
    expect(firstDeployment).toContain("assistant_rate_limit_secret");
    expect(firstDeployment).toContain(
      "export ASSISTANT_PUBLIC_ORIGIN=https://ai-agent.example.com",
    );
    expect(firstDeployment).toContain(
      "export ASSISTANT_SESSION_SECRET_FILE=/secure/secrets/assistant_session_secret",
    );
    expect(firstDeployment).toContain(
      "export ASSISTANT_RATE_LIMIT_SECRET_FILE=/secure/secrets/assistant_rate_limit_secret",
    );
    expect(firstDeployment).toContain("写入`.env`中的同名键");
    expect(firstDeployment).toContain("不要追加重复键");
    expect(firstDeployment).toMatch(/独立随机[^\n]*至少 32 (?:bytes|字节)/u);
    expect(firstDeployment).toContain("0600");
    expect(firstDeployment).toContain("不得复用 Better Auth 或 AgentOS 密钥");
    expect(firstDeployment).toContain("不要提交");
    expect(firstDeployment).toContain(
      "docker compose build web agent migrate agent-migrate backup",
    );
  });

  it("defines a failure-safe isolated assistant runtime acceptance", () => {
    const script = read("docs/testing/run-assistant-runtime-e2e.sh");
    const browserAcceptance = read("apps/web/e2e/assistant-runtime.spec.ts");
    const acceptanceCompose = read("compose.e2e.yaml");
    const productionCompose = read("compose.yaml");
    const acceptanceAgentApp = read("apps/agent/tests/e2e_agent/app.py");

    expect(script).toContain('[ "${RUN_ASSISTANT_RUNTIME_E2E:-}" = true ]');
    expect(script).toContain(
      "project=${AAP_ASSISTANT_RUNTIME_E2E_PROJECT:-aap-assistant-runtime-e2e}",
    );
    expect(script).toContain('docker compose -p "$project"');
    expect(script).toContain("down --rmi local -v --remove-orphans");
    expect(script).toContain("trap cleanup EXIT");
    expect(script).toContain("trap 'on_signal 130' INT");
    expect(script).toContain("trap 'on_signal 143' TERM");
    expect(script.indexOf("trap cleanup EXIT")).toBeLessThan(
      script.indexOf("mktemp"),
    );
    expect(script).toContain('chmod 600 "$env_file"');
    expect(script).toContain('stat -f %Lp "$env_file"');
    expect(script).toContain('stat -c %a "$env_file"');
    expect(script).toContain('[ "$env_permissions" = "600" ]');
    expect(script).toContain("config --quiet");
    for (const serviceName of [
      "migrate",
      "agent-migrate",
      "agent-control-migrate",
      "agent",
      "backup",
      "web",
    ]) {
      expect(script).toContain(`build_service ${serviceName}`);
    }
    expect(script).toContain('compose build "$service"');
    expect(script).toContain('run_compose_job "migrate-1" migrate');
    expect(script).toContain('run_compose_job "migrate-2" migrate');
    expect(script).toContain(
      'run_compose_job "agno-bootstrap-1" agno-bootstrap',
    );
    expect(script).toContain(
      'run_compose_job "agno-bootstrap-2" agno-bootstrap',
    );
    expect(script).toContain(
      'run_compose_job "agent-migrate-1" --no-deps agent-migrate',
    );
    expect(script).toContain(
      'run_compose_job "agent-migrate-2" --no-deps agent-migrate',
    );
    expect(script.match(/compose run --rm/g)).toHaveLength(1);
    expect(script).toContain("run_compose_job() {");
    expect(script).toContain(
      'if compose run --rm "$@" >"$transcript_file" 2>&1; then',
    );
    expect(script).toContain('chmod 600 "$transcript_file"');
    for (const patternsFile of [
      "protected_patterns_file",
      "placeholder_dynamic_patterns_file",
      "agentos_dynamic_patterns_file",
      "model_keys_file",
      "model_key_last4_file",
    ]) {
      expect(script).toContain(
        `scan_pattern_file "$${patternsFile}" "$transcript_file"`,
      );
    }
    expect(script).not.toMatch(/(?:cat|sed|tail|head)[^\n]*transcript_file/u);
    expect(script).toContain("HostConfig.PortBindings");
    expect(script).toContain("e2e/assistant-runtime.spec.ts");
    expect(script).toContain("--workers=1");
    expect(script).not.toMatch(/ports?:[^\n]*7777/u);
    expect(script).toContain("owns_project=false");
    expect(script).toContain("lock_acquired=false");
    expect(script).toContain("run_token=");
    expect(script).toContain('if ! mkdir "$lock_dir"');
    expect(script).toContain(
      'docker volume ls -q --filter "label=com.docker.compose.project=$project"',
    );
    expect(script).toContain(
      'docker network ls -q --filter "label=com.docker.compose.project=$project"',
    );
    expect(script).toContain(
      'docker image ls -q --filter "label=com.docker.compose.project=$project"',
    );
    expect(script).toContain('docker image ls -q "$project-*"');
    expect(script).toContain('[ "$owns_project" = true ]');
    expect(script.indexOf("owns_project=true")).toBeLessThan(
      script.indexOf("build_service migrate"),
    );
    expect(script).toContain('--grep-invert "@agentos|@guard|@control"');
    expect(script).toContain("--grep @guard");
    expect(script).toContain("--grep @agentos");
    expect(
      script.indexOf('--grep-invert "@agentos|@guard|@control"'),
    ).toBeLessThan(script.indexOf("--grep @agentos"));
    expect(script).toContain("export ASSISTANT_PROVIDER_MODE=placeholder");
    expect(script).toContain("export AGENT_ENABLED=true");
    expect(script).toContain(
      "bootstrap_model_api_key_file=$MODEL_API_KEY_FILE",
    );
    expect(script).toContain("unset MODEL_API_KEY_FILE");
    expect(script).toContain("unset MODEL_PROVIDER MODEL_ID MODEL_BASE_URL");
    expect(script).toContain(
      'export MODEL_API_KEY_FILE="$bootstrap_model_api_key_file"',
    );
    expect(script).toContain("export MODEL_PROVIDER=openai");
    expect(script).toContain("export MODEL_ID=e2e-deterministic");
    expect(script).toContain("unset MODEL_BASE_URL");
    expect(script).toContain("export MODEL_RUN_TIMEOUT_SECONDS=1");
    expect(script).toContain("export ASSISTANT_PROVIDER_MODE=agentos");
    expect(script).toContain("export ASSISTANT_AGENTOS_RUN_TIMEOUT_MS=51000");
    expect(script).toContain(
      "export ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD=1",
    );
    expect(script).toContain("--force-recreate --wait proxy");
    expect(script).toContain('scan_logs "placeholder"');
    expect(script).toContain('scan_logs "agentos-bootstrap"');
    expect(script).toContain('scan_logs "dynamic-control"');
    expect(script).toContain('compose logs --no-color >"$logs_file" 2>&1');
    expect(script).not.toContain("compose logs --no-color web agent proxy");
    const controlReset = script.slice(
      script.indexOf('scan_logs "agentos-bootstrap"'),
      script.indexOf("--grep @control"),
    );
    expect(controlReset).toContain(
      "compose up -d --no-deps --force-recreate --wait agent",
    );
    expect(controlReset).toContain(
      "compose up -d --no-deps --force-recreate --wait web",
    );
    expect(controlReset).toContain(
      "compose up -d --no-deps --force-recreate --wait proxy",
    );
    expect(script.indexOf("export AGENT_ENABLED=true")).toBeLessThan(
      script.indexOf('echo "Assistant runtime E2E phase: validate compose"'),
    );
    expect(script.indexOf("unset MODEL_API_KEY_FILE")).toBeLessThan(
      script.indexOf('echo "Assistant runtime E2E phase: validate compose"'),
    );
    expect(script.indexOf('scan_logs "placeholder"')).toBeLessThan(
      script.indexOf(
        'export MODEL_API_KEY_FILE="$bootstrap_model_api_key_file"',
      ),
    );
    expect(script).toContain(
      'scan_pattern_file "$protected_patterns_file" "$logs_file"',
    );
    expect(script).toContain('chmod 600 "$protected_patterns_file"');
    expect(script).not.toContain('grep -F "$protected_value"');
    expect(script).toContain("scan_pattern_file() {");
    expect(script).toContain(
      'if grep -F -f "$patterns_file" "$logs_file" >/dev/null 2>&1; then',
    );
    expect(script).toContain("scan_status=$?");
    expect(script).toContain('case "$scan_status" in');
    expect(script).toContain("1) ;;");
    expect(script).toContain('echo "runtime log scanner failed" >&2');
    expect(script).toContain(
      'placeholder_dynamic_patterns_file="$temp_dir/placeholder-dynamic-patterns"',
    );
    expect(script).toContain(
      'agentos_dynamic_patterns_file="$temp_dir/agentos-dynamic-patterns"',
    );
    expect(script).toContain(
      'create_dynamic_patterns_file "$placeholder_dynamic_patterns_file"',
    );
    expect(script).toContain(
      'create_dynamic_patterns_file "$agentos_dynamic_patterns_file"',
    );
    expect(script.match(/AAP_RUNTIME_DYNAMIC_PATTERNS_FILE=/gu)).toHaveLength(
      2,
    );
    expect(script).toContain(
      'export AAP_RUNTIME_DYNAMIC_PATTERNS_FILE="$placeholder_dynamic_patterns_file"',
    );
    expect(script).toContain(
      'export AAP_RUNTIME_DYNAMIC_PATTERNS_FILE="$agentos_dynamic_patterns_file"',
    );
    expect(script).toContain(
      'scan_logs "placeholder" "$placeholder_dynamic_patterns_file"',
    );
    expect(script).toContain(
      'scan_logs "agentos-bootstrap" "$agentos_dynamic_patterns_file"',
    );
    expect(script).toContain(
      'scan_logs "dynamic-control" "$agentos_dynamic_patterns_file"',
    );
    expect(acceptanceCompose).toContain(
      "AAP_SESSION_IDENTITY_AUDIT_FILE: /tmp/aap-session-identity-audit",
    );
    expect(productionCompose).not.toContain("AAP_SESSION_IDENTITY_AUDIT_FILE");
    expect(acceptanceAgentApp).toContain(
      'os.environ.get("AAP_SESSION_IDENTITY_AUDIT_FILE")',
    );
    expect(script).toContain("collect_agent_session_identities() {");
    expect(script).toContain(
      'compose exec -T agent python -c "$identity_audit_collector" >>"$agentos_dynamic_patterns_file"',
    );
    expect(script).toContain(
      "compose exec -T agent /opt/aap/run-agent-with-secret-env.sh",
    );
    expect(script).not.toContain(
      "compose exec -T agent /opt/aap/run-with-secret-env.sh",
    );
    expect(script.match(/reset_assistant_rate_limits/gu)?.length).toBe(3);
    expect(script).toContain(
      `--command="DELETE FROM public.rate_limits WHERE key LIKE 'assistant:%'"`,
    );
    expect(script).toContain(
      'identity_audit_path = "/tmp/aap-session-identity-audit"',
    );
    const collectorMatch = script.match(
      /identity_audit_collector=\$\(cat <<'PY'\n(?<source>[\s\S]*?)\nPY\n\)/u,
    );
    expect(collectorMatch?.groups?.source).toBeDefined();
    const collectorSandbox = mkdtempSync(
      path.join(tmpdir(), "identity-audit-collector-"),
    );
    try {
      const fifo = path.join(collectorSandbox, "fifo");
      const makeFifo = spawnSync(
        "python3",
        ["-c", "import os, sys; os.mkfifo(sys.argv[1])", fifo],
        { encoding: "utf8" },
      );
      expect(makeFifo.status).toBe(0);
      const collector = (collectorMatch?.groups?.source ?? "").replace(
        'identity_audit_path = "/tmp/aap-session-identity-audit"',
        `identity_audit_path = ${JSON.stringify(fifo)}`,
      );
      const execution = spawnSync("python3", ["-c", collector], {
        encoding: "utf8",
        timeout: 500,
      });
      expect(execution.error).toBeUndefined();
      expect(execution.status).toBe(1);
      expect(execution.stdout).toBe("");
      expect(execution.stderr).toBe("identity audit collection failed\n");
    } finally {
      rmSync(collectorSandbox, { recursive: true, force: true });
    }
    expect(script).toContain('getattr(os, "O_NOFOLLOW", 0)');
    expect(script).toContain('getattr(os, "O_NONBLOCK", 0)');
    expect(script).toContain("stat.S_ISREG(metadata.st_mode)");
    expect(script).toContain("stat.S_IMODE(metadata.st_mode) != 0o600");
    expect(script).toContain("if not identities:");
    expect(script).toContain("identity_pattern.fullmatch(identity)");
    expect(script).toContain(
      'raise SystemExit("identity audit collection failed")',
    );
    expect(script).not.toContain('echo "$identity"');
    const agentosRunIndex = script.indexOf("--grep @agentos");
    const identityCollectionIndex = script.indexOf(
      "collect_agent_session_identities",
      agentosRunIndex,
    );
    const agentosScanIndex = script.indexOf(
      'scan_logs "agentos-bootstrap"',
      identityCollectionIndex,
    );
    expect(identityCollectionIndex).toBeGreaterThan(agentosRunIndex);
    expect(agentosScanIndex).toBeGreaterThan(identityCollectionIndex);
    expect(browserAcceptance).toContain('"AAP_RUNTIME_DYNAMIC_PATTERNS_FILE"');
    expect(browserAcceptance).toContain("appendFileSync(");
    expect(browserAcceptance).toContain("(stats.mode & 0o777) !== 0o600");
    expect(browserAcceptance).toContain('value.includes("\\n")');
    expect(browserAcceptance).toContain('value.includes("\\r")');
    expect(browserAcceptance).toContain('totp.searchParams.get("secret")');
    expect(browserAcceptance).toContain("appendDynamicProtectedValue(uri)");
    expect(browserAcceptance).toContain(
      "appendDynamicProtectedValue(totpSecret)",
    );
    expect(browserAcceptance).toContain(
      "appendDynamicProtectedValue(sessionId)",
    );
    expect(browserAcceptance).toContain(
      "appendDynamicProtectedValue(cookieValue)",
    );
    expect(browserAcceptance).toContain(
      "appendDynamicProtectedValue(parsed.credential)",
    );
    expect(browserAcceptance).toContain(
      "expectNoProtectedValue(first, [firstSessionId])",
    );
    expect(browserAcceptance).toContain(
      "const newSessionId = replacementCandidates[0]",
    );
    expect(browserAcceptance).toContain(
      "expectNoProtectedValue(third, [newSessionId])",
    );
    const invalidResponseIndex = browserAcceptance.indexOf(
      "const invalidResponse =",
    );
    const blockedResponseIndex = browserAcceptance.indexOf(
      "const blockedResponse =",
      invalidResponseIndex,
    );
    const circuitAdminAuthIndex = browserAcceptance.indexOf(
      "const credentials = fixtureCredentials();",
      invalidResponseIndex,
    );
    expect(invalidResponseIndex).toBeGreaterThanOrEqual(0);
    expect(blockedResponseIndex).toBeGreaterThan(invalidResponseIndex);
    expect(blockedResponseIndex).toBeLessThan(circuitAdminAuthIndex);
    const degradedStatusIndex = browserAcceptance.indexOf(
      "const status = await readSafeJson",
      invalidResponseIndex,
    );
    const finalSessionSnapshotIndex = browserAcceptance.indexOf(
      "agentSessionIds();",
      degradedStatusIndex,
    );
    const finalContextCloseIndex = browserAcceptance.indexOf(
      "await context.close();",
      degradedStatusIndex,
    );
    expect(finalSessionSnapshotIndex).toBeGreaterThan(degradedStatusIndex);
    expect(finalSessionSnapshotIndex).toBeLessThan(finalContextCloseIndex);
    for (const variable of [
      "POSTGRES_PASSWORD",
      "MIGRATOR_DATABASE_PASSWORD",
      "RUNTIME_DATABASE_PASSWORD",
      "BACKUP_DATABASE_PASSWORD",
      "BETTER_AUTH_SECRET",
      "E2E_CUSTOMER_PASSWORD",
      "E2E_STAFF_PASSWORD",
      "E2E_ADMIN_PASSWORD",
      "E2E_PENDING_CUSTOMER_SESSION_TOKEN",
      "E2E_DISABLED_CUSTOMER_SESSION_TOKEN",
      "E2E_STAFF_SESSION_TOKEN",
      "E2E_ROLE_TARGET_SESSION_TOKEN",
      "E2E_ADMIN_SESSION_TOKEN",
      "E2E_NO_TOTP_ADMIN_SESSION_TOKEN",
      "E2E_MODEL_ADMIN_SESSION_TOKEN",
      "E2E_MODEL_ADMIN_STALE_SESSION_TOKEN",
      "E2E_REVOKED_SESSION_TOKEN",
      "E2E_REPLACEMENT_PASSWORD",
    ]) {
      expect(script).toContain(`\"$${variable}\"`);
    }
    expect(script).toContain(
      "guard, placeholder, AgentOS bootstrap, dynamic control, recovery, reveal and zero-residue cleanup",
    );
    expect(script).toContain("db_port_bindings=");
  });

  it("injects only the offline managed-model builder into the real acceptance control plane", () => {
    const acceptanceAgent = read("apps/agent/tests/e2e_agent/app.py");
    const deterministicModel = read(
      "apps/agent/tests/e2e_agent/deterministic_model.py",
    );

    expect(acceptanceAgent).toContain(
      "create_app(model_builder=build_acceptance_managed_model)",
    );
    expect(acceptanceAgent).not.toContain("catalog_builder=");
    expect(acceptanceAgent).not.toContain("build_acceptance_catalog");
    expect(deterministicModel).toContain("ManagedModel");
    expect(deterministicModel).toContain('self.id.startswith("e2e-fail-")');
    expect(deterministicModel).toContain("build_acceptance_managed_model");
    expect(deterministicModel).toContain("async def close_model() -> None:");
  });

  it("wires isolated model control secrets, protected ledgers, phases and cleanup", () => {
    const script = read("docs/testing/run-assistant-runtime-e2e.sh");
    const browserAcceptance = read("apps/web/e2e/assistant-runtime.spec.ts");

    for (const materialized of [
      "AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD_FILE",
      "AGENT_CONTROL_DATABASE_PASSWORD_FILE",
      "AGENT_CONTROL_MIGRATOR_DATABASE_URL_FILE",
      "AGENT_CONTROL_DATABASE_URL_FILE",
      "MODEL_CONFIG_ENCRYPTION_KEY_FILE",
      "AGENT_CONFIG_CONTROL_KEY_FILE",
    ]) {
      expect(script).toContain(`materialize_secret ${materialized}`);
      expect(script).toContain(`"$${materialized}"`);
    }
    expect(script).toContain("model_config_encryption_key=$(secret)");
    expect(script).toContain("agent_config_control_key=$(secret)");
    expect(script).toContain("model-key-full-patterns");
    expect(script).toContain("model-key-last4-patterns");
    expect(script).toContain(
      'export AAP_RUNTIME_MODEL_KEYS_FILE="$model_keys_file"',
    );
    expect(script).toContain(
      'export AAP_RUNTIME_MODEL_KEY_LAST4_FILE="$model_key_last4_file"',
    );
    expect(script).toContain(
      'run_compose_job "agent-control-bootstrap-1" agent-control-bootstrap',
    );
    expect(script).toContain(
      'run_compose_job "agent-control-migrate-1" --no-deps agent-control-migrate',
    );
    expect(script).toContain("--grep @control");
    expect(script).toContain("assert_zero_residue");
    expect(browserAcceptance).toContain("@control deterministic model control");
    expect(browserAcceptance).toContain("AAP_RUNTIME_MODEL_KEYS_FILE");
    expect(browserAcceptance).toContain("AAP_RUNTIME_MODEL_KEY_LAST4_FILE");
    expect(browserAcceptance).toContain("e2e-fail-openai-rev2");
    expect(browserAcceptance).toContain("page.clock.fastForward(30_000)");
    expect(browserAcceptance).toContain("recreateAgent(false)");
    expect(browserAcceptance).toContain(
      "function collectAgentSessionIdentityAudit(): void",
    );
    expect(browserAcceptance).toMatch(
      /function recreateAgent\(enabled: boolean\): void \{\s*collectAgentSessionIdentityAudit\(\);/u,
    );
    expect(browserAcceptance).toContain(
      "await context.request.delete(SESSION_PATH)",
    );
    expect(browserAcceptance).toContain(
      "action IN ('assistant.model_key_reveal_requested', 'assistant.model_key_revealed')",
    );
    expect(browserAcceptance).toContain(
      'expect(webAuditText).toContain("assistant.model_key_reveal_requested:")',
    );
    expect(browserAcceptance).toContain(
      'expect(webAuditText).toContain("assistant.model_key_revealed:")',
    );
    expect(browserAcceptance).toContain(
      "expect(webAuditText).not.toContain(key)",
    );
    expect(browserAcceptance).toContain(
      "expect(webAuditText).not.toContain(lastFour)",
    );
    expect(browserAcceptance).toContain("credentials.modelAdminSessionToken");
    expect(browserAcceptance).toContain(
      "credentials.modelAdminStaleSessionToken",
    );
    expect(browserAcceptance).toContain("const controlResponseLedger:");
    expect(browserAcceptance).toContain("const pendingControlResponses:");
    expect(browserAcceptance).toContain("function trackControlResponses(");
    expect(browserAcceptance).toContain(
      "async function drainControlResponses(",
    );
    expect(
      browserAcceptance.match(/await drainControlResponses\(\)/gu),
    ).toHaveLength(5);
    expect(browserAcceptance).toContain('context.route("**/api/v1/**"');
    expect(browserAcceptance).toContain("await route.fetch()");
    expect(browserAcceptance).toContain(
      "await route.fulfill({ response: upstream, body: rawJson })",
    );
    expect(browserAcceptance).not.toContain('page.on("response"');
    expect(browserAcceptance).not.toContain('context.on("response"');
    expect(browserAcceptance).toContain('exposure = "model-config-list"');
    expect(browserAcceptance).toContain('exposure = "model-config-page"');
    expect(browserAcceptance).toContain('exposure = "model-key-reveal"');
    expect(browserAcceptance).toContain(
      "pathname: new URL(response.url()).pathname",
    );
    expect(browserAcceptance).toContain(
      "expect(response.pathname).toBe(MODEL_CONFIG_PATH)",
    );
    expect(browserAcceptance).toContain('expect(response.method).toBe("PUT")');
    expect(browserAcceptance).toContain('expect(response.method).toBe("POST")');
    expect(browserAcceptance).toContain("expect(response.status).toBe(200)");
    expect(browserAcceptance).not.toContain(
      "expect(response.status).toBeLessThan(400)",
    );
    expect(browserAcceptance).toContain("const expectedListLastFour =");
    expect(browserAcceptance).toContain(
      "expect([...response.allowedLastFour].sort()).toEqual(",
    );
    const routeCaptureStartIndex = browserAcceptance.indexOf(
      'await context.route("**/api/v1/**"',
    );
    const routeCaptureEndIndex = browserAcceptance.indexOf(
      "async function drainControlResponses(",
      routeCaptureStartIndex,
    );
    const routeCaptureSource = browserAcceptance.slice(
      routeCaptureStartIndex,
      routeCaptureEndIndex,
    );
    const routeFetchIndex = routeCaptureSource.indexOf("await route.fetch()");
    const routeBodyIndex = routeCaptureSource.indexOf("await upstream.text()");
    const routeLedgerIndex = routeCaptureSource.indexOf(
      "controlResponseLedger.push(",
    );
    const routeFulfillIndex = routeCaptureSource.indexOf(
      "await route.fulfill({ response: upstream, body: rawJson })",
    );
    expect(routeCaptureStartIndex).toBeGreaterThan(-1);
    expect(routeCaptureEndIndex).toBeGreaterThan(routeCaptureStartIndex);
    expect(routeCaptureSource).not.toContain("const isApiError");
    expect(routeCaptureSource).not.toContain("const isAssistantApi");
    expect(routeCaptureSource).not.toContain("return;");
    expect(routeCaptureSource.match(/status === 200/gu)).toHaveLength(3);
    expect(routeBodyIndex).toBeGreaterThan(routeFetchIndex);
    expect(routeLedgerIndex).toBeGreaterThan(routeBodyIndex);
    expect(routeFulfillIndex).toBeGreaterThan(routeLedgerIndex);
    const routeRevealIndex = routeCaptureSource.indexOf(
      'exposure = "model-key-reveal"',
    );
    expect(routeRevealIndex).toBeGreaterThan(-1);
    expect(
      routeCaptureSource.slice(routeRevealIndex, routeLedgerIndex),
    ).not.toContain("allowedLastFour =");
    const directRevealStartIndex = browserAcceptance.indexOf(
      "const revealBody = await readControlJson(revealResponse",
    );
    const directRevealEndIndex = browserAcceptance.indexOf(
      "const bootstrapReveal",
      directRevealStartIndex,
    );
    expect(directRevealStartIndex).toBeGreaterThan(-1);
    expect(directRevealEndIndex).toBeGreaterThan(directRevealStartIndex);
    expect(
      browserAcceptance.slice(directRevealStartIndex, directRevealEndIndex),
    ).not.toContain("allowedLastFour");
    expect(
      browserAcceptance.match(
        /expect\(response\.allowedLastFour\)\.toEqual\(\[\]\)/gu,
      ),
    ).toHaveLength(2);
    expect(browserAcceptance).toContain(
      "expect(capabilityRequests).toEqual([])",
    );
    expect(browserAcceptance).not.toContain("capabilityRequests.some");
    const finalChatIndex = browserAcceptance.indexOf(
      "const finalAuditChatResponse",
    );
    const terminalResponseScanIndex = browserAcceptance.indexOf(
      "for (const response of controlResponseLedger)",
    );
    const pendingResponseWaitIndex = browserAcceptance.lastIndexOf(
      "await Promise.all(pendingControlResponses)",
    );
    const terminalConsoleScanIndex = browserAcceptance.indexOf(
      "const terminalConsoleText",
    );
    const fullKeyScanTextIndex = browserAcceptance.indexOf(
      "let fullKeyScanText = response.rawJson",
      terminalResponseScanIndex,
    );
    const revealPlaintextRemovalIndex = browserAcceptance.indexOf(
      "fullKeyScanText = fullKeyScanText.replaceAll(",
      terminalResponseScanIndex,
    );
    const fullKeyScanIndex = browserAcceptance.indexOf(
      "for (const key of Object.values(submittedKeys))",
      terminalResponseScanIndex,
    );
    const lastFourScanTextIndex = browserAcceptance.indexOf(
      "let lastFourScanText = fullKeyScanText",
      terminalResponseScanIndex,
    );
    const allowedLastFourRemovalIndex = browserAcceptance.indexOf(
      "lastFourScanText = lastFourScanText.replaceAll(",
      terminalResponseScanIndex,
    );
    const lastFourScanIndex = browserAcceptance.indexOf(
      "for (const lastFour of Object.values(submittedLastFour))",
      terminalResponseScanIndex,
    );
    expect(finalChatIndex).toBeGreaterThan(-1);
    expect(pendingResponseWaitIndex).toBeGreaterThan(finalChatIndex);
    expect(terminalResponseScanIndex).toBeGreaterThan(pendingResponseWaitIndex);
    expect(fullKeyScanTextIndex).toBeGreaterThan(terminalResponseScanIndex);
    expect(revealPlaintextRemovalIndex).toBeGreaterThan(fullKeyScanTextIndex);
    expect(fullKeyScanIndex).toBeGreaterThan(revealPlaintextRemovalIndex);
    expect(lastFourScanTextIndex).toBeGreaterThan(fullKeyScanIndex);
    expect(allowedLastFourRemovalIndex).toBeGreaterThan(lastFourScanTextIndex);
    expect(lastFourScanIndex).toBeGreaterThan(allowedLastFourRemovalIndex);
    expect(terminalConsoleScanIndex).toBeGreaterThan(finalChatIndex);
  });

  it("owns and cleans only the isolated assistant runtime project it locked", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "aap-runtime-owner-"));
    const repo = path.join(sandbox, "repo");
    const bin = path.join(sandbox, "bin");
    const temp = path.join(sandbox, "tmp");
    const project = "aap-assistant-runtime-e2e-ownership";
    const lock = path.join(
      temp,
      "aap-assistant-runtime-e2e-locks",
      `${project}.lock`,
    );
    mkdirSync(path.join(repo, "docs/testing"), { recursive: true });
    mkdirSync(bin, { recursive: true });
    mkdirSync(temp, { recursive: true });
    copyFileSync(
      path.join(root, "docs/testing/run-assistant-runtime-e2e.sh"),
      path.join(repo, "docs/testing/run-assistant-runtime-e2e.sh"),
    );
    writeFileSync(
      path.join(repo, ".env.e2e"),
      [
        "POSTGRES_DB=test",
        "POSTGRES_USER=test",
        "POSTGRES_PASSWORD=test-postgres",
        "MIGRATOR_DATABASE_PASSWORD=test-migrator",
        "RUNTIME_DATABASE_PASSWORD=test-runtime",
        "BACKUP_DATABASE_PASSWORD=test-backup",
        "MIGRATOR_DATABASE_URL=postgresql://test:test@db/test",
        "RUNTIME_DATABASE_URL=postgresql://test:test@db/test",
        "DATABASE_URL=postgresql://test:test@db/test",
        "TEST_DATABASE_URL=postgresql://test:test@db/test_test",
        "BETTER_AUTH_SECRET=test-better-auth-secret",
        "BETTER_AUTH_URL=http://127.0.0.1:8080",
        "BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:8080",
        "E2E_CUSTOMER_PASSWORD=test-customer",
        "E2E_STAFF_PASSWORD=test-staff",
        "E2E_ADMIN_PASSWORD=test-admin",
        "E2E_PENDING_CUSTOMER_SESSION_TOKEN=test-pending",
        "E2E_DISABLED_CUSTOMER_SESSION_TOKEN=test-disabled",
        "E2E_STAFF_SESSION_TOKEN=test-staff-session",
        "E2E_ROLE_TARGET_SESSION_TOKEN=test-role-target",
        "E2E_ADMIN_SESSION_TOKEN=test-admin-session",
        "E2E_NO_TOTP_ADMIN_SESSION_TOKEN=test-no-totp",
        "E2E_MODEL_ADMIN_SESSION_TOKEN=test-model-admin",
        "E2E_MODEL_ADMIN_STALE_SESSION_TOKEN=test-model-admin-stale",
        "E2E_REVOKED_SESSION_TOKEN=test-revoked",
        "E2E_REPLACEMENT_PASSWORD=test-replacement",
      ].join("\n"),
      { mode: 0o600 },
    );
    writeFileSync(
      path.join(bin, "openssl"),
      '#!/bin/sh\nprintf "%064d\\n" 0\n',
      { mode: 0o755 },
    );
    writeFileSync(
      path.join(bin, "lsof"),
      '#!/bin/sh\n[ "${FAKE_PORT_BUSY:-false}" = true ]\n',
      { mode: 0o755 },
    );
    writeFileSync(
      path.join(bin, "docker"),
      `#!/bin/sh
printf '%s\\n' "$*" >>"$FAKE_DOCKER_LOG"
case "$1 $2" in
  "ps -aq") [ "\${FAKE_RESOURCE:-}" = container ] && echo container-id; exit 0 ;;
  "volume ls") [ "\${FAKE_RESOURCE:-}" = volume ] && echo volume-id; exit 0 ;;
  "network ls") [ "\${FAKE_RESOURCE:-}" = network ] && echo network-id; exit 0 ;;
  "image ls") [ "\${FAKE_RESOURCE:-}" = image ] && echo image-id; exit 0 ;;
esac
case " $* " in
  *" compose "*" down --rmi local -v --remove-orphans "*) exit 0 ;;
  *" compose "*" config --quiet "*) exit 0 ;;
  *" compose "*" build migrate "*) exit 42 ;;
esac
exit 0
`,
      { mode: 0o755 },
    );
    const run = (name: string, extra: NodeJS.ProcessEnv = {}) => {
      const log = path.join(sandbox, `${name}.log`);
      writeFileSync(log, "");
      const result = spawnSync(
        "sh",
        [path.join(repo, "docs/testing/run-assistant-runtime-e2e.sh")],
        {
          cwd: repo,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            TMPDIR: temp,
            RUN_ASSISTANT_RUNTIME_E2E: "true",
            AAP_ASSISTANT_RUNTIME_E2E_PROJECT: project,
            FAKE_DOCKER_LOG: log,
            ...extra,
          },
        },
      );
      const calls = readFileSync(log, "utf8");
      return { result, calls };
    };

    try {
      const disabled = run("disabled", {
        RUN_ASSISTANT_RUNTIME_E2E: "false",
      });
      expect(disabled.result.status).not.toBe(0);
      expect(disabled.calls).toBe("");

      mkdirSync(lock, { recursive: true, mode: 0o700 });
      writeFileSync(path.join(lock, "token"), "another-run\n", { mode: 0o600 });
      const locked = run("locked");
      expect(locked.result.status).not.toBe(0);
      expect(locked.calls).not.toContain("down --rmi local");
      expect(statSync(lock).isDirectory()).toBe(true);
      rmSync(lock, { recursive: true });

      const resource = run("resource", { FAKE_RESOURCE: "container" });
      expect(resource.result.status).not.toBe(0);
      expect(resource.calls).not.toContain("down --rmi local");
      expect(() => statSync(lock)).toThrow();

      const port = run("port", { FAKE_PORT_BUSY: "true" });
      expect(port.result.status).not.toBe(0);
      expect(port.calls).not.toContain("down --rmi local");
      expect(() => statSync(lock)).toThrow();

      const owned = run("owned");
      expect(owned.result.status).toBe(42);
      expect(
        owned.calls.match(/down --rmi local -v --remove-orphans/gu),
      ).toHaveLength(1);
      expect(() => statSync(lock)).toThrow();
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 15_000);

  it("keeps the first assistant credential out of every browser diagnostic and admin payload", () => {
    const spec = read("apps/web/e2e/assistant-runtime.spec.ts");

    expect(spec).toContain(
      "let firstAssistantCookieCredential: string | undefined;",
    );
    expect(spec).toContain(
      "function collectBrowserDiagnostics(context: BrowserContext)",
    );
    expect(spec).toContain('context.on("page", registerPage);');
    expect(spec).toContain('page.on("console", (message) =>');
    expect(spec).not.toContain('message.type() === "warning"');
    expect(spec).toContain("function expectConsoleExcludesCredential(");
    expect(spec).toContain("function readSafeJson(");
    expect(spec).toContain(
      "const assistantCredential = requiredAssistantCookieCredential();",
    );
    expect(spec).toMatch(
      /const protectedValues = \[[\s\S]*assistantCredential,[\s\S]*\];/u,
    );
    expect(spec).toContain(
      "await readSafeJson(adminStatusResponse, protectedValues)",
    );
    expect(spec).toContain(
      "await readSafeJson(sessionsResponse, protectedValues)",
    );
    expect(spec).toContain(
      "await readSafeJson(adminChatResponse, protectedValues)",
    );
    expect(spec).toContain(
      "expectConsoleExcludesCredential(assistantCredential);",
    );
    expect(spec).not.toMatch(
      /(?:console\.[a-z]+|attach)\([^\n]*firstAssistantCookieCredential/iu,
    );
  });

  it("uses separate migration and runtime URLs without publishing the origin", () => {
    const compose = read("compose.yaml");
    expect(compose).toContain("MIGRATOR_DATABASE_URL");
    expect(compose).toContain("RUNTIME_DATABASE_URL");
    const webService = compose.split("\n  web:\n")[1]?.split("\n  proxy:\n")[0];
    const backupService = compose
      .split("\n  backup:\n")[1]
      ?.split("\nnetworks:\n")[0];
    expect(webService).toBeDefined();
    expect(webService).not.toMatch(/^\s{4}ports:/m);
    expect(backupService).toContain("PGHOST: db");
    expect(backupService).toContain("PGUSER: ai_agent_backup");
    expect(backupService).toContain("- backup_database_password");
    expect(backupService).toContain("- backup_encryption_key");
    expect(backupService).not.toContain("BACKUP_DATABASE_URL");
    expect(backupService).not.toContain("backup_database_url");
    expect(backupService).not.toContain("RUNTIME_DATABASE_PASSWORD");
    const backupScript = read("infra/docker/backup.sh");
    expect(backupScript).not.toContain("BACKUP_DATABASE_URL");
    expect(backupScript).toContain("PGPASSFILE");
    expect(backupScript).toContain('--dbname="$PGDATABASE"');
    expect(backupScript).toContain("BACKUP_DATABASE_PASSWORD_FILE");
    expect(backupScript).toContain("BACKUP_ENCRYPTION_KEY_FILE");
    expect(backupService).toContain(
      "dockerfile: infra/docker/backup.Dockerfile",
    );
    expect(backupService).toContain("read_only: true");
    expect(backupService).toContain("cap_drop:\n      - ALL");
    expect(backupService).not.toMatch(/user:\s*(?:root|0)/u);
    const backupImage = read("infra/docker/backup.Dockerfile");
    expect(backupImage).toContain("apk add --no-cache gnupg");
    expect(backupImage).toContain("coreutils");
    expect(backupImage).toContain("USER postgres");
    expect(backupImage).toContain("ENTRYPOINT");
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain("BACKUP_ENCRYPTION_KEY_FILE");
    expect(workflow).toContain(
      'backup_encryption_key="$(openssl rand -hex 32)"',
    );
    expect(workflow).toContain('echo "::add-mask::$backup_encryption_key"');
    expect(workflow).not.toMatch(
      /echo "BACKUP_ENCRYPTION_KEY=[^\n]*" >> "\$GITHUB_ENV"/u,
    );
    expect(workflow).toContain(
      "docker build -t backup-service-ci -f infra/docker/backup.Dockerfile .",
    );
    expect(workflow).toContain(
      "docker run --rm --entrypoint gpg backup-service-ci --version",
    );
  });

  it("keeps the non-root migrator workspace writable and local env files out of Docker", () => {
    const dockerfile = read("apps/web/Dockerfile");
    const migrator = dockerfile
      .split("FROM dependencies AS migrator")[1]
      ?.split("FROM base AS builder")[0];
    expect(migrator).toBeDefined();
    expect(migrator).toContain("ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false");
    expect(migrator).toContain("RUN chown node:node /app");
    expect(migrator).toContain("USER node");
    expect(migrator?.indexOf("RUN chown node:node /app")).toBeLessThan(
      migrator?.indexOf("USER node") ?? -1,
    );
    expect(dockerfile).toContain(
      "ARG PNPM_REGISTRY=https://registry.npmmirror.com",
    );
    expect(dockerfile).toContain('PNPM_CONFIG_REGISTRY="$PNPM_REGISTRY"');
    expect(dockerfile).toContain(
      "COPY packages/document-content/package.json packages/document-content/package.json",
    );
    const builder = dockerfile
      .split("FROM base AS builder")[1]
      ?.split("FROM node:24-alpine3.24 AS runner")[0];
    expect(builder).toBeDefined();
    expect(builder).toContain(
      "ARG PNPM_REGISTRY=https://registry.npmmirror.com",
    );
    expect(builder).toContain("ENV PNPM_CONFIG_REGISTRY=$PNPM_REGISTRY");
    expect(builder).toContain("ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false");
    expect(dockerfile).toContain("pnpm install --frozen-lockfile");
    expect(read("docs/testing/run-assistant-runtime-e2e.sh")).toContain(
      "PNPM_REGISTRY=${PNPM_REGISTRY:-https://registry.npmjs.org}",
    );

    const dockerIgnore = read(".dockerignore");
    expect(dockerIgnore).toContain("**/.env");
    expect(dockerIgnore).toContain("**/.env.*");
    expect(dockerIgnore).toContain("!**/.env.example");
  });

  it("uses one bounded, persistent pnpm store for web image dependencies", () => {
    const dockerfile = read("apps/web/Dockerfile");
    const dependencies = dockerfile
      .split("FROM base AS dependencies")[1]
      ?.split("FROM dependencies AS migrator")[0];

    expect(dependencies).toBeDefined();
    expect(dependencies).toContain(
      "--mount=type=cache,id=ai-agent-platform-pnpm-store,target=/pnpm/store,sharing=locked",
    );
    expect(dependencies).toContain("PNPM_CONFIG_STORE_DIR=/pnpm/store");
    expect(dependencies).toContain("PNPM_CONFIG_FETCH_RETRIES=5");
    expect(dependencies).toContain("PNPM_CONFIG_FETCH_TIMEOUT=300000");
    expect(dependencies).toContain("PNPM_CONFIG_NETWORK_CONCURRENCY=4");
    expect(dependencies).toContain("pnpm install --frozen-lockfile");
    expect(dependencies).not.toContain("--no-verify-store-integrity");
    expect(dependencies).not.toContain("strict-ssl=false");
  });

  it("hardens the internal AgentOS container boundary and startup order", () => {
    const compose = read("compose.yaml");
    const bootstrapService = compose
      .split("\n  agno-bootstrap:\n")[1]
      ?.split("\n  agent-migrate:\n")[0];
    const migrationService = compose
      .split("\n  agent-migrate:\n")[1]
      ?.split("\n  agent-control-bootstrap:\n")[0];
    const agentService = compose
      .split("\n  agent:\n")[1]
      ?.split("\n  web:\n")[0];
    const databaseService = compose
      .split("\n  db:\n")[1]
      ?.split("\n  migrate:\n")[0];
    const backupService = compose
      .split("\n  backup:\n")[1]
      ?.split("\nnetworks:\n")[0];

    expect(bootstrapService).toBeDefined();
    expect(bootstrapService).toContain("postgres:18.3-alpine3.23");
    expect(bootstrapService).toContain("03-agno-roles.sh");
    expect(bootstrapService).toContain("03-agno-roles.sql");
    expect(bootstrapService).toContain("condition: service_healthy");
    expect(bootstrapService).toContain(
      "POSTGRES_PASSWORD=/run/secrets/postgres_password",
    );
    expect(bootstrapService).toContain("- postgres_password");
    expect(bootstrapService).toContain("- agno_migrator_database_password");
    expect(bootstrapService).toContain("- agno_database_password");
    expect(databaseService).not.toContain("03-agno-roles");

    expect(migrationService).toBeDefined();
    expect(migrationService).toContain(
      "SECRET_ENV_SPECS: AGNO_MIGRATOR_DATABASE_URL=/run/secrets/agno_migrator_database_url",
    );
    expect(migrationService).toContain(
      "secrets:\n      - agno_migrator_database_url",
    );
    expect(migrationService).not.toContain("postgres_password");
    expect(migrationService).not.toContain("agno_database_url");
    expect(migrationService).toMatch(
      /agno-bootstrap:[\s\S]*condition: service_completed_successfully/u,
    );

    expect(agentService).toBeDefined();
    expect(agentService).toContain(
      "AGNO_DATABASE_URL=/run/secrets/agno_database_url",
    );
    expect(agentService).toContain(
      "OS_SECURITY_KEY=/run/secrets/os_security_key",
    );
    expect(agentService).toContain("- agno_database_url");
    expect(agentService).toContain("- os_security_key");
    expect(agentService).not.toContain("agno_migrator_database_url");
    expect(agentService).not.toContain("postgres_password");
    expect(agentService).toMatch(
      /agent-migrate:[\s\S]*condition: service_completed_successfully/u,
    );
    expect(agentService).toContain("0.0.0.0");
    expect(agentService).toContain("7777");
    expect(agentService).toContain('expose:\n      - "7777"');
    expect(agentService).not.toMatch(/^\s{4}ports:/mu);
    expect(agentService).toContain("user: root");
    expect(agentService).toContain("read_only: true");
    expect(agentService).toContain("/tmp:rw,noexec,nosuid,size=32m");
    expect(agentService).toContain("no-new-privileges:true");
    expect(agentService).toContain("cap_drop:\n      - ALL");
    expect(agentService).toContain("/internal/health/ready");
    expect(agentService).toContain("Authorization");
    expect(agentService).toContain("os.environ['OS_SECURITY_KEY']");
    expect(agentService).not.toContain("/run/secrets/os_security_key').read");
    expect(agentService).toContain("mem_limit:");
    expect(agentService).toContain("cpus:");
    expect(agentService).toContain("pids_limit:");
    expect(agentService).toContain("networks:\n      backend:");
    expect(agentService).not.toMatch(/OS_SECURITY_KEY:\s*[A-Za-z0-9_-]{20,}/u);

    expect(backupService).toMatch(
      /migrate:[\s\S]*condition: service_completed_successfully/u,
    );
    expect(backupService).toMatch(
      /agent-migrate:[\s\S]*condition: service_completed_successfully/u,
    );
  });

  it("isolates model-control credentials by deployment role", () => {
    const rendered = renderComposeFixture();
    const services = rendered.services;
    const sources = (name: string) =>
      new Set(
        (services[name]?.secrets ?? [])
          .map(secretSource)
          .filter((source): source is string => source !== undefined),
      );
    const controlSources = new Set([
      "agent_control_migrator_database_password",
      "agent_control_database_password",
      "agent_control_migrator_database_url",
      "agent_control_database_url",
      "model_config_encryption_key",
      "agent_config_control_key",
    ]);
    const visibleControlSources = (name: string) =>
      new Set(
        [...sources(name)].filter((source) => controlSources.has(source)),
      );

    expect(sources("agent-control-bootstrap")).toEqual(
      new Set([
        "postgres_password",
        "agent_control_migrator_database_password",
        "agent_control_database_password",
      ]),
    );
    expect(sources("agent-control-migrate")).toEqual(
      new Set(["agent_control_migrator_database_url"]),
    );
    expect(visibleControlSources("agent")).toEqual(
      new Set([
        "agent_control_database_url",
        "model_config_encryption_key",
        "agent_config_control_key",
      ]),
    );
    expect(visibleControlSources("web")).toEqual(
      new Set(["agent_config_control_key"]),
    );
    for (const serviceName of [
      "db",
      "migrate",
      "agno-bootstrap",
      "agent-migrate",
      "backup",
      "proxy",
    ]) {
      expect(visibleControlSources(serviceName)).toEqual(new Set());
    }

    expect(services.agent?.environment?.SECRET_ENV_SPECS).toContain(
      "AGNO_DATABASE_URL=/run/secrets/agno_database_url",
    );
    expect(services.agent?.environment?.SECRET_ENV_SPECS).toContain(
      "OS_SECURITY_KEY=/run/secrets/os_security_key",
    );
    expect(services.agent?.environment?.SECRET_ENV_SPECS).toContain(
      "AGENT_CONTROL_DATABASE_URL=/run/secrets/agent_control_database_url",
    );
    expect(services.agent?.environment?.SECRET_ENV_SPECS).toContain(
      "MODEL_CONFIG_ENCRYPTION_KEY=/run/secrets/model_config_encryption_key",
    );
    expect(services.agent?.environment?.SECRET_ENV_SPECS).toContain(
      "AGENT_CONFIG_CONTROL_KEY=/run/secrets/agent_config_control_key",
    );
    expect(services.web?.environment?.SECRET_ENV_SPECS).toContain(
      "OS_SECURITY_KEY=/run/secrets/os_security_key",
    );
    expect(services.web?.environment?.SECRET_ENV_SPECS).toContain(
      "AGENT_CONFIG_CONTROL_KEY=/run/secrets/agent_config_control_key",
    );
    expect(
      services["agent-control-migrate"]?.environment?.SECRET_ENV_SPECS,
    ).toBe(
      "AGENT_CONTROL_MIGRATOR_DATABASE_URL=/run/secrets/agent_control_migrator_database_url",
    );

    expect(sources("agent")).toContain("os_security_key");
    expect(sources("agent")).toContain("agno_database_url");
    expect(sources("web")).toContain("os_security_key");
    const controlKeySource = services.agent?.secrets?.find(
      (attachment) =>
        typeof attachment !== "string" &&
        attachment.target === "/run/secrets/agent_config_control_key",
    );
    const osKeySource = services.agent?.secrets?.find(
      (attachment) =>
        typeof attachment !== "string" &&
        attachment.target === "/run/secrets/os_security_key",
    );
    expect(secretSource(controlKeySource as RenderedSecretAttachment)).toBe(
      "agent_config_control_key",
    );
    expect(secretSource(osKeySource as RenderedSecretAttachment)).toBe(
      "os_security_key",
    );
    expect(secretSource(controlKeySource as RenderedSecretAttachment)).not.toBe(
      secretSource(osKeySource as RenderedSecretAttachment),
    );
    expect(services.agent?.environment).not.toHaveProperty(
      "AGENT_CONTROL_MIGRATOR_DATABASE_URL",
    );
    expect(services.agent?.environment?.SECRET_ENV_SPECS).not.toContain(
      "AGENT_CONTROL_MIGRATOR_DATABASE_URL",
    );
    expect(services.web?.environment).not.toHaveProperty(
      "AGENT_CONTROL_MIGRATOR_DATABASE_URL",
    );
    expect(services.web?.environment?.SECRET_ENV_SPECS).not.toContain(
      "AGENT_CONTROL_MIGRATOR_DATABASE_URL",
    );
  });

  it("orders isolated control bootstrap and migration before Agent runtime", () => {
    const rendered = renderComposeFixture();
    const bootstrap = rendered.services["agent-control-bootstrap"];
    const migration = rendered.services["agent-control-migrate"];
    const agent = rendered.services.agent;

    expect(bootstrap?.depends_on?.db?.condition).toBe("service_healthy");
    expect(bootstrap?.depends_on?.["agno-bootstrap"]?.condition).toBe(
      "service_completed_successfully",
    );
    expect(migration?.depends_on?.["agent-control-bootstrap"]?.condition).toBe(
      "service_completed_successfully",
    );
    expect(agent?.depends_on?.["agent-control-migrate"]?.condition).toBe(
      "service_completed_successfully",
    );
    expect(agent?.depends_on?.["agent-migrate"]?.condition).toBe(
      "service_completed_successfully",
    );
    expect(migration?.command).toEqual([
      "python",
      "-m",
      "agent_service.model_config_migrate",
    ]);
    expect(Object.keys(bootstrap?.networks ?? {})).toEqual(["backend"]);
    expect(Object.keys(migration?.networks ?? {})).toEqual(["backend"]);
    expect(migration?.read_only).toBe(true);
    expect(new Set(migration?.cap_drop)).toEqual(new Set(["ALL"]));
    expect(migration?.security_opt).toContain("no-new-privileges:true");
  });

  it("ships an immutable deployment endpoint catalog only in the Agent image", () => {
    const endpointFile = JSON.parse(
      read("infra/agent/model-endpoints.json"),
    ) as unknown;
    const dockerfile = read("apps/agent/Dockerfile");
    const webDockerfile = read("apps/web/Dockerfile");
    const rendered = renderComposeFixture();
    const agent = rendered.services.agent;
    const web = rendered.services.web;

    expect(endpointFile).toEqual({ version: "1", endpoints: [] });
    expect(JSON.stringify(endpointFile)).not.toMatch(
      /localhost|127\.0\.0\.1|10\.0\.0\.1|192\.168\.|api[_-]?key|secret|password/iu,
    );
    expect(dockerfile).toContain("install -d -o root -g root -m 0755 /etc/aap");
    expect(dockerfile).toContain(
      "COPY --chown=root:root --chmod=0644 infra/agent/model-endpoints.json /etc/aap/model-endpoints.json",
    );
    expect(webDockerfile).not.toContain("model-endpoints.json");
    expect(agent?.environment?.MODEL_ENDPOINTS_FILE).toBe(
      "/etc/aap/model-endpoints.json",
    );
    expect(web?.environment).not.toHaveProperty("MODEL_ENDPOINTS_FILE");
    expect(agent?.read_only).toBe(true);
    expect(agent?.ports ?? []).toEqual([]);
    expect(Object.keys(agent?.networks ?? {})).toEqual([
      "backend",
      "model_egress",
    ]);
    expect(agent?.volumes ?? []).not.toContainEqual(
      expect.objectContaining({ target: "/etc/aap/model-endpoints.json" }),
    );
    expect(web?.volumes ?? []).not.toContainEqual(
      expect.objectContaining({ target: "/etc/aap/model-endpoints.json" }),
    );
  });

  const dockerAvailable =
    spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
      stdio: "ignore",
    }).status === 0;

  it("deploys the Skill Registry behind ordered least-privilege boundaries", () => {
    const rendered = renderComposeFixture();
    const bootstrap = rendered.services["skill-registry-bootstrap"];
    const migration = rendered.services["skill-registry-migrate"];
    const registry = rendered.services["skill-registry"];
    const web = rendered.services.web;
    const agent = rendered.services.agent;
    const registrySecretSources = new Set([
      "skill_registry_migrator_database_password",
      "skill_registry_database_password",
      "skill_registry_runtime_database_password",
      "skill_registry_migrator_database_url",
      "skill_registry_database_url",
      "skill_registry_control_key",
    ]);
    const sources = (service: RenderedService | undefined) =>
      new Set(
        (service?.secrets ?? [])
          .map(secretSource)
          .filter((source): source is string => source !== undefined),
      );
    const visibleRegistrySources = (service: RenderedService | undefined) =>
      new Set(
        [...sources(service)].filter((source) =>
          registrySecretSources.has(source),
        ),
      );
    const registrySecretHolders = Object.fromEntries(
      [...registrySecretSources].map((source) => [
        source,
        Object.entries(rendered.services)
          .filter(([, service]) => sources(service).has(source))
          .map(([name]) => name),
      ]),
    );

    expect(bootstrap).toBeDefined();
    expect(migration).toBeDefined();
    expect(registry).toBeDefined();

    const dockerfile = read("apps/skill-registry/Dockerfile");
    const runtimeImports = read("infra/agent/skill-runtime-imports.json");
    const runner = read("infra/docker/run-with-secret-env.sh");

    expect(runtimeImports).toBe(
      '{"version":1,"pythonModules":["agno","cryptography","pydantic"]}\n',
    );
    expect(JSON.parse(runtimeImports)).toEqual({
      version: 1,
      pythonModules: ["agno", "cryptography", "pydantic"],
    });

    const pinnedPythonImage =
      "python:3.13.13-slim-trixie@sha256:aa938a849bcb82dce8f49480f056ab82bf5c1c3ebc294f0430f37b6820e7f286";
    expect(
      dockerfile.match(new RegExp(`FROM ${pinnedPythonImage}`, "gu")),
    ).toHaveLength(2);
    expect(dockerfile).toContain(
      'RUN test "$(python --version)" = "Python 3.13.13"',
    );
    expect(dockerfile).toContain("uv sync --frozen --no-dev");
    expect(dockerfile).toContain(
      "groupadd --system --gid 10002 skill-registry",
    );
    expect(dockerfile).toContain(
      "useradd --system --uid 10002 --gid skill-registry",
    );
    expect(dockerfile).toContain(
      "COPY --chown=root:root --chmod=0644 infra/agent/skill-runtime-imports.json /etc/aap/skill-runtime-imports.json",
    );
    expect(dockerfile).toContain(
      "COPY --chown=root:root --chmod=0755 infra/docker/run-with-secret-env.sh /opt/aap/run-with-secret-env.sh",
    );
    expect(dockerfile).not.toContain("COPY . .");
    expect(runner).toContain("postgres|agent|node|skill-registry");

    expect(bootstrap?.depends_on?.db?.condition).toBe("service_healthy");
    expect(bootstrap?.depends_on?.["agno-bootstrap"]?.condition).toBe(
      "service_completed_successfully",
    );
    expect(bootstrap?.depends_on?.["agent-control-bootstrap"]?.condition).toBe(
      "service_completed_successfully",
    );
    expect(migration?.depends_on?.["skill-registry-bootstrap"]?.condition).toBe(
      "service_completed_successfully",
    );
    expect(registry?.depends_on?.["skill-registry-migrate"]?.condition).toBe(
      "service_completed_successfully",
    );
    expect(web?.depends_on?.["skill-registry"]?.condition).toBe(
      "service_healthy",
    );
    expect(migration?.command).toEqual([
      "python",
      "-m",
      "skill_registry.migrate",
    ]);

    expect(sources(bootstrap)).toEqual(
      new Set([
        "postgres_password",
        "skill_registry_migrator_database_password",
        "skill_registry_database_password",
        "skill_registry_runtime_database_password",
      ]),
    );
    expect(sources(migration)).toEqual(
      new Set(["skill_registry_migrator_database_url"]),
    );
    expect(sources(registry)).toEqual(
      new Set(["skill_registry_database_url", "skill_registry_control_key"]),
    );
    expect(visibleRegistrySources(web)).toEqual(
      new Set(["skill_registry_control_key"]),
    );
    expect(visibleRegistrySources(agent)).toEqual(new Set());
    expect(registrySecretHolders).toEqual({
      skill_registry_migrator_database_password: ["skill-registry-bootstrap"],
      skill_registry_database_password: ["skill-registry-bootstrap"],
      skill_registry_runtime_database_password: ["skill-registry-bootstrap"],
      skill_registry_migrator_database_url: ["skill-registry-migrate"],
      skill_registry_database_url: ["skill-registry"],
      skill_registry_control_key: ["skill-registry", "web"],
    });
    expect(web?.environment?.SECRET_ENV_SPECS).toContain(
      "SKILL_REGISTRY_CONTROL_KEY=/run/secrets/skill_registry_control_key",
    );
    expect(web?.environment?.SKILL_REGISTRY_INTERNAL_URL).toBe(
      "http://skill-registry:7788",
    );
    expect(web?.environment?.SECRET_ENV_SPECS).not.toMatch(
      /SKILL_REGISTRY_(?:MIGRATOR_)?DATABASE_URL/u,
    );
    expect(agent?.environment?.SECRET_ENV_SPECS ?? "").not.toContain(
      "SKILL_REGISTRY",
    );

    expect(registry?.user).toBe("root");
    expect(registry?.entrypoint).toEqual(["/opt/aap/run-with-secret-env.sh"]);
    expect(registry?.environment?.SECRET_RUN_AS).toBe("skill-registry");
    expect(registry?.environment?.SECRET_ENV_SPECS).toContain(
      "SKILL_REGISTRY_DATABASE_URL=/run/secrets/skill_registry_database_url",
    );
    expect(registry?.environment?.SECRET_ENV_SPECS).toContain(
      "SKILL_REGISTRY_CONTROL_KEY=/run/secrets/skill_registry_control_key",
    );
    expect(registry?.environment?.SKILL_RUNTIME_IMPORTS_FILE).toBe(
      "/etc/aap/skill-runtime-imports.json",
    );
    expect(registry?.read_only).toBe(true);
    expect(registry?.tmpfs).toEqual(["/tmp:rw,noexec,nosuid,nodev,size=64m"]);
    expect(new Set(registry?.cap_drop)).toEqual(new Set(["ALL"]));
    expect(new Set(registry?.cap_add)).toEqual(
      new Set(["DAC_OVERRIDE", "SETGID", "SETUID"]),
    );
    expect(registry?.security_opt).toContain("no-new-privileges:true");
    expect(Number(registry?.mem_limit)).toBe(512 * 1_024 * 1_024);
    expect(Number(registry?.cpus)).toBe(1);
    expect(registry?.pids_limit).toBe(256);
    expect(registry?.ports ?? []).toEqual([]);
    expect(Object.keys(registry?.networks ?? {})).toEqual(["backend"]);
    expect(registry?.volumes ?? []).toEqual([]);
    expect(registry?.healthcheck?.test).toEqual([
      "CMD",
      "/usr/sbin/gosu",
      "skill-registry",
      "python",
      "-c",
      "import json,sys,urllib.request; sys.tracebacklimit=0; response=urllib.request.urlopen('http://127.0.0.1:7788/internal/health/ready',timeout=3); raw=response.read(129); response.close(); payload=json.loads(raw) if len(raw)<=128 else None; raise SystemExit(0 if type(payload) is dict and set(payload)=={'live','ready'} and payload['live'] is True and payload['ready'] is True else 1)",
    ]);
    for (const service of [bootstrap, migration]) {
      expect(service?.read_only).toBe(true);
      expect(new Set(service?.cap_drop)).toEqual(new Set(["ALL"]));
      expect(new Set(service?.cap_add)).toEqual(
        new Set(["DAC_OVERRIDE", "SETGID", "SETUID"]),
      );
      expect(service?.security_opt).toContain("no-new-privileges:true");
      expect(Object.keys(service?.networks ?? {})).toEqual(["backend"]);
      expect(service?.ports ?? []).toEqual([]);
    }

    const databaseVolumes = rendered.services.db?.volumes ?? [];
    expect(databaseVolumes).toContainEqual(
      expect.objectContaining({
        type: "volume",
        source: "db_data",
        target: "/var/lib/postgresql",
      }),
    );
    const uploadRoute =
      "apps/web/src/app/api/v1/admin/assistant/skills/uploads/route.ts";
    const gitIgnoreProbe = spawnSync(
      "git",
      ["check-ignore", "-q", "--no-index", uploadRoute],
      { cwd: root },
    );
    expect(gitIgnoreProbe.status).toBe(1);
    expect(read(".gitignore")).toContain("/uploads/");
    expect(read(".gitignore")).toContain("/skill-registry-artifacts/");
    expect(read(".dockerignore")).toContain("/uploads");
    expect(read(".dockerignore")).toContain("/skill-registry-artifacts");
    const example = read(".env.example");
    expect(example).toContain(
      "SKILL_REGISTRY_INTERNAL_URL=http://skill-registry:7788",
    );
    for (const key of [
      "SKILL_REGISTRY_MIGRATOR_DATABASE_PASSWORD_FILE",
      "SKILL_REGISTRY_DATABASE_PASSWORD_FILE",
      "SKILL_REGISTRY_RUNTIME_DATABASE_PASSWORD_FILE",
      "SKILL_REGISTRY_MIGRATOR_DATABASE_URL_FILE",
      "SKILL_REGISTRY_DATABASE_URL_FILE",
      "SKILL_REGISTRY_CONTROL_KEY_FILE",
    ]) {
      expect(example).toMatch(new RegExp(`^${key}=`, "mu"));
    }
    expect(example).not.toMatch(
      /^SKILL_REGISTRY_(?:MIGRATOR_)?DATABASE_URL=/mu,
    );
    expect(example).not.toMatch(/^SKILL_REGISTRY_CONTROL_KEY=/mu);
  });

  it("executes a bounded Skill Registry readiness response contract", () => {
    const healthcheck =
      renderComposeFixture().services["skill-registry"]?.healthcheck?.test;
    const probe = healthcheck?.at(-1);
    expect(healthcheck?.slice(0, -1)).toEqual([
      "CMD",
      "/usr/sbin/gosu",
      "skill-registry",
      "python",
      "-c",
    ]);
    expect(probe).toBeDefined();
    const server = `
import http.server
import os
import threading

body = os.environ["HEALTH_BODY"].encode("utf-8")

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass

httpd = http.server.HTTPServer(("127.0.0.1", 7788), Handler)
threading.Thread(target=httpd.handle_request, daemon=True).start()
exec(os.environ["HEALTH_PROBE"], {})
`;
    const run = (body: string) =>
      spawnSync("python3", ["-c", server], {
        encoding: "utf8",
        env: {
          ...process.env,
          HEALTH_BODY: body,
          HEALTH_PROBE: probe,
        },
        timeout: 5_000,
      });
    const valid = run('{"live":true,"ready":true}');
    expect(valid.status, `${valid.stdout}${valid.stderr}`).toBe(0);

    for (const body of [
      '{"live":true,"ready":false}',
      "not-json",
      `${'{"live":true,"ready":true}'}${" ".repeat(200)}`,
    ]) {
      const invalid = run(body);
      const output = `${invalid.stdout}${invalid.stderr}`;
      expect(invalid.error, output).toBeUndefined();
      expect(invalid.status, output).not.toBe(0);
      expect(output).not.toContain(body);
    }
  });

  it("preflights every resolved host secret before Compose startup", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "compose-preflight-"));
    const bin = path.join(sandbox, "bin");
    const docker = path.join(bin, "docker");
    const secret = path.join(sandbox, "secret");
    const insecure = path.join(sandbox, "insecure");
    const linked = path.join(sandbox, "linked");
    const fifo = path.join(sandbox, "fifo");
    const privateValue = "preflight-private-value";
    mkdirSync(bin, { mode: 0o700 });
    writeFileSync(docker, '#!/bin/sh\nprintf "%s" "$FAKE_COMPOSE_CONFIG"\n', {
      mode: 0o700,
    });
    writeFileSync(secret, privateValue, { mode: 0o600 });
    chmodSync(secret, 0o600);
    writeFileSync(insecure, privateValue, { mode: 0o644 });
    chmodSync(insecure, 0o644);
    symlinkSync(secret, linked);
    expect(spawnSync("mkfifo", [fifo]).status).toBe(0);
    chmodSync(fifo, 0o600);

    const preflight = path.join(
      root,
      "infra/docker/validate-compose-secret-files.py",
    );
    const run = (config: object) =>
      spawnSync("python3", [preflight], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          FAKE_COMPOSE_CONFIG: JSON.stringify(config),
        },
        timeout: 5_000,
      });
    const config = (name: string, file: string, services: object = {}) => ({
      secrets: { [name]: { file } },
      services,
    });

    try {
      const valid = run(config("valid", secret));
      expect(valid.status, `${valid.stdout}${valid.stderr}`).toBe(0);

      for (const [name, source] of [
        ["insecure", insecure],
        ["linked", linked],
        ["fifo", fifo],
        ["not_model_api_key", "/dev/null"],
        ["model_api_key", fifo],
        ["embedded_nul", "\0secret-path"],
      ] as const) {
        const invalid = run(config(name, source));
        const output = `${invalid.stdout}${invalid.stderr}`;
        expect(invalid.error, `${name}: ${output}`).toBeUndefined();
        expect(invalid.status, `${name}: ${output}`).not.toBe(0);
        expect(invalid.stdout).toBe("");
        expect(invalid.stderr).toBe("Compose secret preflight failed.\n");
        expect(output).not.toContain(privateValue);
        expect(output).not.toContain(source);
      }

      const disabledModelService = {
        agent: {
          entrypoint: ["/opt/aap/run-agent-with-secret-env.sh"],
          environment: {
            MODEL_PROVIDER: "",
            MODEL_ID: "",
            SECRET_ENV_SPECS:
              "AGNO_DATABASE_URL=/run/secrets/agno_database_url MODEL_API_KEY=/run/secrets/model_api_key",
          },
          secrets: [
            {
              source: "model_api_key",
              target: "/run/secrets/model_api_key",
            },
          ],
        },
      };
      const disabledModel = run(
        config("model_api_key", "/dev/null", disabledModelService),
      );
      expect(
        disabledModel.status,
        `${disabledModel.stdout}${disabledModel.stderr}`,
      ).toBe(0);

      for (const services of [
        {
          ...disabledModelService,
          agent: {
            ...disabledModelService.agent,
            environment: {
              ...disabledModelService.agent.environment,
              MODEL_PROVIDER: "openai",
              MODEL_ID: "model",
            },
          },
        },
        {
          ...disabledModelService,
          agent: {
            ...disabledModelService.agent,
            entrypoint: ["/opt/aap/run-with-secret-env.sh"],
          },
        },
        {
          ...disabledModelService,
          agent: {
            ...disabledModelService.agent,
            secrets: null,
          },
        },
      ]) {
        const invalidException = run(
          config("model_api_key", "/dev/null", services),
        );
        expect(invalidException.stdout).toBe("");
        expect(invalidException.stderr).toBe(
          "Compose secret preflight failed.\n",
        );
        expect(invalidException.status).not.toBe(0);
      }

      const scripts = JSON.parse(read("package.json")) as {
        scripts?: Record<string, string>;
      };
      expect(scripts.scripts?.["secrets:preflight"]).toBe(
        "python3 infra/docker/validate-compose-secret-files.py",
      );
      expect(read(".env.example")).toContain(
        "pnpm secrets:preflight && docker compose up",
      );
      expect(read("README.md")).toContain(
        "pnpm secrets:preflight\ndocker compose build",
      );
      expect(read("docs/deployment/server-readiness.md")).toContain(
        "pnpm secrets:preflight\ndocker compose config",
      );
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it.skipIf(!dockerAvailable)(
    "rejects a host symlink before Compose resolves it into a regular secret mount",
    () => {
      const sandbox = mkdtempSync(path.join(tmpdir(), "compose-secret-link-"));
      const secret = path.join(sandbox, "secret");
      const linked = path.join(sandbox, "linked");
      const composeFile = path.join(sandbox, "compose.yaml");
      const project = `aap-secret-link-${process.pid}`;
      writeFileSync(secret, "private-compose-value", { mode: 0o600 });
      chmodSync(secret, 0o600);
      symlinkSync(secret, linked);
      writeFileSync(
        composeFile,
        `services:
  probe:
    image: postgres:18.3-alpine3.23
    command:
      - sh
      - -ceu
      - >-
        test "$(stat -c '%a' -- /run/secrets/direct)" = 600;
        test "$(stat -c '%a' -- /run/secrets/linked)" = 600;
        test ! -L /run/secrets/linked;
        test -f /run/secrets/linked
    secrets:
      - direct
      - linked
secrets:
  direct:
    file: ${secret}
  linked:
    file: ${linked}
`,
        { mode: 0o600 },
      );
      chmodSync(composeFile, 0o600);

      try {
        const mounted = spawnSync(
          "docker",
          ["compose", "-p", project, "-f", composeFile, "run", "--rm", "probe"],
          { encoding: "utf8", timeout: 10_000 },
        );
        expect(mounted.status, `${mounted.stdout}${mounted.stderr}`).toBe(0);

        const preflight = spawnSync(
          "python3",
          [
            path.join(root, "infra/docker/validate-compose-secret-files.py"),
            "-p",
            project,
            "-f",
            composeFile,
          ],
          { cwd: root, encoding: "utf8", timeout: 5_000 },
        );
        const output = `${preflight.stdout}${preflight.stderr}`;
        expect(preflight.error, output).toBeUndefined();
        expect(preflight.status, output).not.toBe(0);
        expect(output).not.toContain(secret);
        expect(output).not.toContain(linked);
        expect(output).not.toContain("private-compose-value");
      } finally {
        spawnSync(
          "docker",
          [
            "compose",
            "-p",
            project,
            "-f",
            composeFile,
            "down",
            "-v",
            "--remove-orphans",
          ],
          { stdio: "ignore", timeout: 5_000 },
        );
        rmSync(sandbox, { recursive: true, force: true });
      }
    },
    20_000,
  );

  it("documents control-role secrets, migrations, and dynamic precedence", () => {
    const example = read(".env.example");
    const dockerReadme = read("infra/docker/README.md");

    for (const key of [
      "AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD",
      "AGENT_CONTROL_DATABASE_PASSWORD",
      "AGENT_CONTROL_MIGRATOR_DATABASE_URL",
      "AGENT_CONTROL_DATABASE_URL",
      "AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD_FILE",
      "AGENT_CONTROL_DATABASE_PASSWORD_FILE",
      "AGENT_CONTROL_MIGRATOR_DATABASE_URL_FILE",
      "AGENT_CONTROL_DATABASE_URL_FILE",
      "MODEL_CONFIG_ENCRYPTION_KEY_FILE",
      "AGENT_CONFIG_CONTROL_KEY_FILE",
    ]) {
      expect(example).toContain(`${key}=`);
    }
    expect(example).toContain("openssl rand -hex 32");
    expect(example).toContain("control Key different from OS_SECURITY_KEY");
    expect(example).toContain(
      "AGENT_ENABLED=true 仅注册码多多并启用动态模型控制面；启动时不要求 Provider、Model ID 或模型 Key。",
    );
    expect(example).toContain(
      "MODEL_PROVIDER、MODEL_ID、MODEL_API_KEY_FILE 仅是可选、只读的部署 bootstrap source。",
    );
    expect(example).toContain(
      "动态活动配置一旦存在即优先；加载失败时 fail closed，不静默回退部署 bootstrap。",
    );
    expect(example).not.toContain("bootstrap/fallback");
    expect(example).not.toMatch(/^MODEL_CONFIG_ENCRYPTION_KEY=/mu);
    expect(example).not.toMatch(/^AGENT_CONFIG_CONTROL_KEY=/mu);

    for (const migration of [
      "migrate",
      "agno-bootstrap",
      "agent-migrate",
      "agent-control-bootstrap",
      "agent-control-migrate",
    ]) {
      expect(dockerReadme).toContain(migration);
    }
    expect(dockerReadme).toContain("动态配置优先");
    expect(dockerReadme).toContain(
      "加载失败时 fail closed，不静默回退部署 bootstrap",
    );
    expect(dockerReadme).not.toContain("bootstrap/fallback");
    expect(dockerReadme).toContain(
      "`AGENT_ENABLED=true`只负责注册码多多并启用动态模型控制面",
    );
    expect(dockerReadme).toContain("不持有 migrator 凭据");
    expect(dockerReadme).toContain("不挂载任何`agent_control`");
  });

  it("gives only AgentOS the model credential and controlled egress", () => {
    const compose = read("compose.yaml");
    const serviceNames = [
      "db",
      "migrate",
      "agno-bootstrap",
      "agent-migrate",
      "agent-control-bootstrap",
      "agent-control-migrate",
      "agent",
      "web",
      "proxy",
      "backup",
    ] as const;
    const serviceSections = Object.fromEntries(
      serviceNames.map((name, index) => {
        const nextName = serviceNames[index + 1];
        const start = `\n  ${name}:\n`;
        const end = nextName ? `\n  ${nextName}:\n` : "\nnetworks:\n";
        return [name, compose.split(start)[1]?.split(end)[0]];
      }),
    ) as Record<(typeof serviceNames)[number], string | undefined>;
    const agentService = serviceSections.agent;
    const healthcheck = agentService
      ?.split("\n    healthcheck:\n")[1]
      ?.split("\n    read_only: true\n")[0];
    const networkDefinitions = compose
      .split("\nnetworks:\n")[1]
      ?.split("\nvolumes:\n")[0];
    const secretDefinitions = compose.split("\nsecrets:\n")[1];

    expect(agentService).toBeDefined();
    expect(agentService).toContain("MODEL_API_KEY=/run/secrets/model_api_key");
    expect(agentService).toContain("- model_api_key");
    const agentSecretRunner = read("infra/docker/run-agent-with-secret-env.sh");
    expect(agentService).toContain(
      'entrypoint: ["/opt/aap/run-agent-with-secret-env.sh"]',
    );
    expect(agentService).toContain(
      "./infra/docker/run-agent-with-secret-env.sh:/opt/aap/run-agent-with-secret-env.sh:ro",
    );
    expect(agentSecretRunner).toContain(
      'if [ -z "${MODEL_PROVIDER-}" ] && [ -z "${MODEL_ID-}" ]; then',
    );
    expect(agentSecretRunner).toContain(
      "SECRET_ENV_SPECS=${SECRET_ENV_SPECS%MODEL_API_KEY=/run/secrets/model_api_key}",
    );
    expect(agentSecretRunner).toContain(
      'exec /opt/aap/run-with-secret-env.sh "$@"',
    );
    for (const [name, expected] of [
      ["AGENT_ENABLED", "${AGENT_ENABLED:-false}"],
      ["MODEL_PROVIDER", "${MODEL_PROVIDER:-}"],
      ["MODEL_ID", "${MODEL_ID:-}"],
      ["MODEL_BASE_URL", "${MODEL_BASE_URL:-}"],
      ["MODEL_RUN_TIMEOUT_SECONDS", "${MODEL_RUN_TIMEOUT_SECONDS:-50}"],
    ] as const) {
      expect(agentService).toContain(`${name}: ${expected}`);
    }
    expect(agentService).toContain(
      "networks:\n      backend:\n      model_egress:\n        gw_priority: 1",
    );
    expect(agentService).not.toMatch(/^\s{4}ports:/mu);
    expect(agentService).toContain("read_only: true");
    expect(agentService).toContain("no-new-privileges:true");
    expect(agentService).toContain("cap_drop:\n      - ALL");
    expect(agentService).toContain("mem_limit: 512m");
    expect(agentService).toContain('cpus: "1.0"');
    expect(agentService).toContain("pids_limit: 256");

    expect(healthcheck).toContain("/internal/health/ready");
    expect(healthcheck).not.toMatch(/MODEL_|model_api_key|\/v1\/|\/runs/iu);

    expect(networkDefinitions).toContain("  backend:\n    internal: true");
    expect(networkDefinitions).toMatch(/^  model_egress:\s*$/mu);
    expect(networkDefinitions).not.toMatch(
      /model_egress:\s*\n\s+internal:\s*true/u,
    );
    expect(secretDefinitions).toContain(
      "model_api_key:\n    file: ${MODEL_API_KEY_FILE:-/dev/null}",
    );

    for (const name of serviceNames.filter((name) => name !== "agent")) {
      expect(serviceSections[name]).toBeDefined();
      expect(serviceSections[name]).not.toContain("model_api_key");
      expect(serviceSections[name]).not.toContain("MODEL_API_KEY");
      expect(serviceSections[name]).not.toContain("model_egress");
    }
  });

  it("renders dynamic-only Agent startup without a bootstrap model key file", () => {
    const rendered = renderComposeFixture(["compose.yaml"], {
      bootstrapModel: false,
    });

    expect(rendered.services.agent?.environment?.MODEL_PROVIDER).toBe("");
    expect(rendered.services.agent?.environment?.MODEL_ID).toBe("");
    expect(rendered.secrets?.model_api_key?.file).toBe("/dev/null");
  });

  it("documents bounded model and AgentOS run timeout defaults", () => {
    const example = read(".env.example");
    const compose = read("compose.yaml");
    const agentSettings = read("apps/agent/src/agent_service/config.py");
    const runClient = read(
      "apps/web/src/server/assistant/agentos-run-client.ts",
    );

    for (const line of [
      "AGENT_ENABLED=false",
      "MODEL_PROVIDER=",
      "MODEL_ID=",
      "MODEL_BASE_URL=",
      "MODEL_RUN_TIMEOUT_SECONDS=50",
      "MODEL_API_KEY_FILE=",
      "ASSISTANT_AGENTOS_RUN_TIMEOUT_MS=55000",
    ]) {
      expect(example.split("\n")).toContain(line);
    }
    expect(example).not.toMatch(/^MODEL_API_KEY=/mu);
    expect(example).not.toContain("ASSISTANT_AGENTOS_DEFAULT_AGENT_ID");
    expect(compose).not.toContain("ASSISTANT_AGENTOS_DEFAULT_AGENT_ID");
    expect(compose).toContain(
      "ASSISTANT_AGENTOS_RUN_TIMEOUT_MS: ${ASSISTANT_AGENTOS_RUN_TIMEOUT_MS:-55000}",
    );
    expect(agentSettings).toMatch(
      /timeout_seconds:\s*int\s*=\s*Field\(default=50,\s*ge=1,\s*le=50\)/u,
    );
    expect(agentSettings).toContain(
      "timeout_seconds=self.model_run_timeout_seconds",
    );
    expect(runClient).toContain("const DEFAULT_RUN_TIMEOUT_MS = 55_000;");
    expect(runClient).toContain("const MIN_RUN_TIMEOUT_MS = 51_000;");
    expect(runClient).toContain("const MAX_RUN_TIMEOUT_MS = 55_000;");
    expect(runClient).toMatch(
      /runTimeoutMs < MIN_RUN_TIMEOUT_MS\s*\|\|\s*runTimeoutMs > MAX_RUN_TIMEOUT_MS/u,
    );
  });

  it("builds AgentOS from a pinned, locked, non-root multi-stage image", () => {
    const dockerfile = read("apps/agent/Dockerfile");
    const dockerIgnore = read("apps/agent/.dockerignore");
    const rootDockerIgnore = read(".dockerignore");

    const pinnedBase =
      "python:3.13.13-slim-trixie@sha256:aa938a849bcb82dce8f49480f056ab82bf5c1c3ebc294f0430f37b6820e7f286";
    expect(dockerfile).toContain(`FROM ${pinnedBase} AS builder`);
    expect(dockerfile).toContain(`FROM ${pinnedBase} AS runtime-base`);
    expect(dockerfile).toMatch(/^FROM runtime-base AS runtime$/mu);
    expect(dockerfile).toContain("uv sync --frozen --no-dev");
    expect(dockerfile).toContain("COPY apps/agent/pyproject.toml");
    expect(dockerfile).toContain("COPY apps/agent/uv.lock");
    expect(dockerfile).toContain("COPY apps/agent/src");
    expect(dockerfile).not.toContain("COPY . .");
    expect(dockerfile).toContain("USER agent");
    expect(dockerfile).toContain("app_factory");
    expect(dockerfile).toContain(
      "COPY --from=builder --chown=agent:agent /app/apps/agent/.venv /app/apps/agent/.venv",
    );
    expect(dockerfile).toContain("ENV PATH=/app/apps/agent/.venv/bin:$PATH");
    expect(dockerIgnore).toContain(".venv");
    expect(dockerIgnore).toContain("tests");
    expect(dockerIgnore).toContain(".env");
    expect(rootDockerIgnore).toContain("**/.venv");
    expect(rootDockerIgnore).toContain("**/.pytest_cache");
    expect(rootDockerIgnore).toContain("**/.mypy_cache");
    expect(rootDockerIgnore).toContain("**/.ruff_cache");
    expect(rootDockerIgnore).toContain("**/__pycache__");
    expect(rootDockerIgnore).toContain("**/dist");
  });

  it("isolates the deterministic Agent in an acceptance-only image target", () => {
    const dockerfile = read("apps/agent/Dockerfile");
    const productionCompose = read("compose.yaml");
    const acceptanceCompose = read("compose.e2e.yaml");
    const acceptanceTarget = dockerfile
      .split(" AS acceptance\n")[1]
      ?.split(" AS runtime\n")[0];
    const runtimeTarget = dockerfile.split(" AS runtime\n")[1];
    const productionAgent = productionCompose
      .split("\n  agent:\n")[1]
      ?.split("\n  web:\n")[0];
    const acceptanceAgent = acceptanceCompose
      .split("\n  agent:\n")[1]
      ?.split("\n  migrate:\n")[0];

    expect(acceptanceTarget).toBeDefined();
    expect(acceptanceTarget).toContain("tests/e2e_agent");
    expect(acceptanceTarget).toContain(
      'CMD ["uvicorn", "e2e_agent.app:app_factory", "--factory", "--host", "0.0.0.0", "--port", "7777", "--no-access-log"]',
    );
    expect(runtimeTarget).toBeDefined();
    expect(runtimeTarget).not.toContain("tests/e2e_agent");
    expect(runtimeTarget).toContain(
      'CMD ["uvicorn", "agent_service.app:app_factory", "--factory", "--host", "0.0.0.0", "--port", "7777", "--no-access-log"]',
    );
    expect(dockerfile.indexOf(" AS acceptance\n")).toBeLessThan(
      dockerfile.indexOf(" AS runtime\n"),
    );
    expect(dockerfile.trimEnd()).toMatch(/CMD \[[^\n]+\]$/u);
    expect(productionAgent).toBeDefined();
    expect(productionAgent).not.toContain("target: acceptance");
    expect(productionAgent).toContain("agent_service.app:app_factory");
    expect(productionAgent).toContain('"--no-access-log"');
    expect(productionAgent).not.toContain("AAP_SESSION_IDENTITY_AUDIT_FILE");
    expect(acceptanceAgent).toBeDefined();
    expect(acceptanceAgent).toContain("target: acceptance");
    expect(acceptanceAgent).toContain("e2e_agent.app:app_factory");
    expect(acceptanceAgent).toContain('"--no-access-log"');
    expect(acceptanceAgent).toContain(
      "AAP_SESSION_IDENTITY_AUDIT_FILE: /tmp/aap-session-identity-audit",
    );
    expect(acceptanceCompose.match(/target: acceptance/gu)).toHaveLength(1);

    const productionRendered = renderComposeFixture();
    expect(productionRendered.services.agent?.command).toEqual([
      "uvicorn",
      "agent_service.app:app_factory",
      "--factory",
      "--host",
      "0.0.0.0",
      "--port",
      "7777",
      "--no-access-log",
    ]);
    expect(productionRendered.services.agent?.environment).not.toHaveProperty(
      "AAP_SESSION_IDENTITY_AUDIT_FILE",
    );

    const rendered = renderComposeFixture(["compose.yaml", "compose.e2e.yaml"]);
    expect(rendered.services.agent?.build?.target).toBe("acceptance");
    expect(rendered.services.agent?.command).toEqual([
      "uvicorn",
      "e2e_agent.app:app_factory",
      "--factory",
      "--host",
      "0.0.0.0",
      "--port",
      "7777",
      "--no-access-log",
    ]);
    expect(
      rendered.services.agent?.environment?.AAP_SESSION_IDENTITY_AUDIT_FILE,
    ).toBe("/tmp/aap-session-identity-audit");
    expect(Object.keys(rendered.services.agent?.networks ?? {})).toEqual([
      "backend",
    ]);
    expect(
      Object.entries(rendered.services)
        .filter(([, service]) => service.build?.target === "acceptance")
        .map(([name]) => name),
    ).toEqual(["agent"]);
  });

  it("keeps every production credential out of rendered Compose config", () => {
    const runner = read("infra/docker/run-with-secret-env.sh");
    expect(runner).toContain("/run/secrets/*");
    expect(runner).toContain('exec "$gosu_path" "$run_as" "$@"');
    expect(runner).not.toMatch(/set\s+-[^\n]*x/u);
    expect(read(".gitignore")).toContain(".secrets/");
    const rendered = renderComposeFixture();
    expect(Object.keys(rendered.services).length).toBeGreaterThan(0);
  });

  it("reads file-backed secrets as root and drops every command to its runtime user", () => {
    const rendered = renderComposeFixture();
    const runAs = {
      migrate: "node",
      "agno-bootstrap": "postgres",
      "agent-migrate": "agent",
      "agent-control-bootstrap": "postgres",
      "agent-control-migrate": "agent",
      "skill-registry-bootstrap": "postgres",
      "skill-registry-migrate": "skill-registry",
      "skill-registry": "skill-registry",
      agent: "agent",
      web: "node",
    } as const;

    for (const [serviceName, runtimeUser] of Object.entries(runAs)) {
      const service = rendered.services[serviceName];
      expect(service?.user, serviceName).toBe("root");
      expect(service?.environment?.SECRET_RUN_AS, serviceName).toBe(
        runtimeUser,
      );
      expect(new Set(service?.cap_drop), serviceName).toEqual(new Set(["ALL"]));
      expect(new Set(service?.cap_add), serviceName).toEqual(
        new Set(["DAC_OVERRIDE", "SETGID", "SETUID"]),
      );
      expect(service?.security_opt, serviceName).toContain(
        "no-new-privileges:true",
      );
    }

    const runner = read("infra/docker/run-with-secret-env.sh");
    expect(runner).toContain('case "$SECRET_RUN_AS" in');
    expect(runner).toContain("postgres|agent|node");
    expect(runner).toContain('[ "$(id -u)" -eq 0 ]');
    expect(runner).toContain("/usr/local/bin/gosu");
    expect(runner).toContain("/usr/sbin/gosu");
    expect(runner).toContain("/usr/bin/gosu");
    expect(runner).toContain('exec "$gosu_path" "$run_as" "$@"');
    expect(runner).not.toContain('exec "$@"');
    expect(read("apps/agent/Dockerfile")).toContain(
      "apt-get install -y --no-install-recommends gosu=1.17-3+b4",
    );
    expect(read("apps/web/Dockerfile").match(/gosu=1\.19-r4/gu)).toHaveLength(
      2,
    );

    const agentHealthcheck =
      rendered.services.agent?.healthcheck?.test?.join(" ");
    const webHealthcheck = rendered.services.web?.healthcheck?.test?.join(" ");
    expect(agentHealthcheck).toContain("/opt/aap/run-agent-with-secret-env.sh");
    expect(agentHealthcheck).toContain("OS_SECURITY_KEY");
    expect(agentHealthcheck).not.toContain("/run/secrets/os_security_key");
    expect(webHealthcheck).toContain("gosu node");
  });

  it.skipIf(!dockerAvailable)(
    "loads a deployment-user-owned 0600 secret then executes as postgres",
    () => {
      const sandbox = mkdtempSync(path.join(tmpdir(), "aap-secret-drop-"));
      const secretFile = path.join(sandbox, "container-secret");
      const secret = "container-secret-that-must-not-leak";
      writeFileSync(secretFile, `${secret}\n`, { mode: 0o600 });
      chmodSync(secretFile, 0o600);

      try {
        expect(statSync(secretFile).mode & 0o777).toBe(0o600);
        const execution = spawnSync(
          "docker",
          [
            "run",
            "--rm",
            "--user",
            "root",
            "--cap-drop",
            "ALL",
            "--cap-add",
            "DAC_OVERRIDE",
            "--cap-add",
            "SETGID",
            "--cap-add",
            "SETUID",
            "--security-opt",
            "no-new-privileges:true",
            "--env",
            "SECRET_RUN_AS=postgres",
            "--env",
            "SECRET_ENV_SPECS=CONTAINER_TEST_SECRET=/run/secrets/container_test_secret",
            "--mount",
            `type=bind,src=${secretFile},dst=/run/secrets/container_test_secret,readonly`,
            "--mount",
            `type=bind,src=${path.join(root, "infra/docker/run-with-secret-env.sh")},dst=/opt/aap/run-with-secret-env.sh,readonly`,
            "--entrypoint",
            "/opt/aap/run-with-secret-env.sh",
            "postgres:18.3-alpine3.23",
            "sh",
            "-ceu",
            'test "$(id -u)" = 70; test "$(id -g)" = 70; test -n "$CONTAINER_TEST_SECRET"; test "$(awk \'/^CapEff:/{print $2}\' /proc/self/status)" = 0000000000000000; test "$(awk \'/^NoNewPrivs:/{print $2}\' /proc/self/status)" = 1; printf "%s\\n" "postgres:70:70:nnp=1:caps=0"',
          ],
          { encoding: "utf8" },
        );
        const output = `${execution.stdout}${execution.stderr}`;
        expect(execution.status, output).toBe(0);
        expect(execution.stdout.trim()).toBe("postgres:70:70:nnp=1:caps=0");
        expect(output).not.toContain(secret);
      } finally {
        rmSync(sandbox, { recursive: true, force: true });
      }
    },
  );

  for (const invalidType of ["insecure", "linked", "fifo"] as const) {
    it.skipIf(!dockerAvailable)(
      `rejects ${invalidType} container secrets without blocking or starting the child`,
      () => {
        const sandbox = mkdtempSync(path.join(tmpdir(), "aap-secret-types-"));
        const insecure = path.join(sandbox, "insecure");
        const target = path.join(sandbox, "target");
        const linked = path.join(sandbox, "linked");
        const fifo = path.join(sandbox, "fifo");
        const secret = "container-private-value";
        if (invalidType === "insecure") {
          writeFileSync(insecure, secret, { mode: 0o644 });
          chmodSync(insecure, 0o644);
        } else if (invalidType === "linked") {
          writeFileSync(target, secret, { mode: 0o600 });
          chmodSync(target, 0o600);
          symlinkSync("target", linked);
        } else {
          expect(spawnSync("mkfifo", [fifo]).status).toBe(0);
          chmodSync(fifo, 0o600);
        }
        const runner = path.join(root, "infra/docker/run-with-secret-env.sh");
        const containerName = `aap-secret-type-${invalidType}-${process.pid}`;

        spawnSync("docker", ["rm", "-f", containerName], {
          stdio: "ignore",
          timeout: 3_000,
        });
        try {
          const started = spawnSync(
            "docker",
            [
              "run",
              "-d",
              "--name",
              containerName,
              "--user",
              "root",
              "--cap-drop",
              "ALL",
              "--cap-add",
              "DAC_OVERRIDE",
              "--cap-add",
              "SETGID",
              "--cap-add",
              "SETUID",
              "--security-opt",
              "no-new-privileges:true",
              "--env",
              "SECRET_RUN_AS=postgres",
              "--env",
              `SECRET_ENV_SPECS=CONTAINER_TEST_SECRET=/run/secrets/${invalidType}`,
              "--mount",
              `type=bind,src=${sandbox},dst=/run/secrets,readonly`,
              "--mount",
              `type=bind,src=${runner},dst=/opt/aap/run-with-secret-env.sh,readonly`,
              "--entrypoint",
              "sh",
              "postgres:18.3-alpine3.23",
              "-ceu",
              'exec timeout -s KILL 2 /opt/aap/run-with-secret-env.sh sh -ceu \'printf "%s" "CHILD_STARTED"\'',
            ],
            { encoding: "utf8", timeout: 3_000 },
          );
          expect(started.status, `${started.stdout}${started.stderr}`).toBe(0);

          let running = true;
          let exitCode: number | null = null;
          const deadline = Date.now() + 3_000;
          while (Date.now() < deadline) {
            const inspected = spawnSync(
              "docker",
              [
                "inspect",
                "--format",
                "{{.State.Running}} {{.State.ExitCode}}",
                containerName,
              ],
              { encoding: "utf8", timeout: 1_000 },
            );
            expect(
              inspected.status,
              `${inspected.stdout}${inspected.stderr}`,
            ).toBe(0);
            const [runningValue, exitValue] = inspected.stdout
              .trim()
              .split(" ");
            running = runningValue === "true";
            exitCode = Number(exitValue);
            if (!running) break;
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
          }

          const logged = spawnSync("docker", ["logs", containerName], {
            encoding: "utf8",
            timeout: 1_000,
          });
          const output = `${logged.stdout}${logged.stderr}`;
          expect(running, output).toBe(false);
          expect([124, 137, 143], output).not.toContain(exitCode);
          expect(exitCode, output).not.toBe(0);
          expect(output).not.toContain("CHILD_STARTED");
          expect(output).not.toContain(secret);
        } finally {
          spawnSync("docker", ["rm", "-f", containerName], {
            stdio: "ignore",
            timeout: 3_000,
          });
          rmSync(sandbox, { recursive: true, force: true });
        }
      },
      10_000,
    );
  }

  it("enforces the rendered Compose model across every service", () => {
    const rendered = renderComposeFixture();
    const services = Object.entries(rendered.services);
    const agent = rendered.services.agent;
    const modelSecretHolders = services
      .filter(([, service]) =>
        service.secrets?.some(
          (attachment) => secretSource(attachment) === "model_api_key",
        ),
      )
      .map(([name]) => name);
    const modelEgressMembers = services
      .filter(([, service]) =>
        Object.hasOwn(service.networks ?? {}, "model_egress"),
      )
      .map(([name]) => name);
    const rawModelKeyEnvironmentHolders = services
      .filter(([, service]) =>
        Object.hasOwn(service.environment ?? {}, "MODEL_API_KEY"),
      )
      .map(([name]) => name);
    const publishedPortServices = services
      .filter(([, service]) => (service.ports?.length ?? 0) > 0)
      .map(([name]) => name);
    const modelSecret = agent?.secrets?.find(
      (attachment) => secretSource(attachment) === "model_api_key",
    );
    const backendAttachment = agent?.networks?.backend;
    const modelEgressAttachment = agent?.networks?.model_egress;

    expect(new Set(modelSecretHolders)).toEqual(new Set(["agent"]));
    expect(new Set(modelEgressMembers)).toEqual(new Set(["agent"]));
    expect(new Set(rawModelKeyEnvironmentHolders)).toEqual(new Set());
    expect(new Set(publishedPortServices)).toEqual(new Set(["proxy"]));

    expect(agent).toBeDefined();
    expect(agent?.ports ?? []).toHaveLength(0);
    expect(secretSource(modelSecret as RenderedSecretAttachment)).toBe(
      "model_api_key",
    );
    expect(
      typeof modelSecret === "string" ? undefined : modelSecret?.target,
    ).toBe("/run/secrets/model_api_key");
    expect(agent?.entrypoint).toEqual([
      "/opt/aap/run-agent-with-secret-env.sh",
    ]);
    expect(agent?.environment?.SECRET_ENV_SPECS).toContain(
      "MODEL_API_KEY=/run/secrets/model_api_key",
    );
    expect(Object.hasOwn(agent?.networks ?? {}, "backend")).toBe(true);
    expect(backendAttachment?.gw_priority ?? 0).toBe(0);
    expect(modelEgressAttachment?.gw_priority).toBe(1);
    expect(rendered.networks.backend?.internal).toBe(true);
    expect(rendered.networks.model_egress?.internal ?? false).toBe(false);

    expect(agent?.user).toBe("root");
    expect(agent?.read_only).toBe(true);
    expect(new Set(agent?.cap_drop)).toEqual(new Set(["ALL"]));
    expect(agent?.security_opt).toContain("no-new-privileges:true");
    expect(agent?.tmpfs).toContain("/tmp:rw,noexec,nosuid,size=32m");
    expect(Number(agent?.mem_limit)).toBe(512 * 1_024 * 1_024);
    expect(Number(agent?.cpus)).toBe(1);
    expect(agent?.pids_limit).toBe(256);
  });

  it("runs the ordered, pinned AgentOS CI gates with masked fixtures", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain(
      "astral-sh/setup-uv@08807647e7069bb48b6ef5acd8ec9567f424441b # v8.1.0",
    );
    expect(workflow).toContain('version: "0.11.19"');
    for (const key of [
      "AGNO_MIGRATOR_DATABASE_PASSWORD",
      "AGNO_DATABASE_PASSWORD",
      "AGNO_MIGRATOR_DATABASE_URL",
      "AGNO_DATABASE_URL",
      "OS_SECURITY_KEY",
      "ASSISTANT_SESSION_SECRET",
      "ASSISTANT_RATE_LIMIT_SECRET",
    ]) {
      expect(workflow).toContain(key);
    }
    expect(workflow).toContain(
      "ASSISTANT_PUBLIC_ORIGIN: http://127.0.0.1:3000",
    );
    expect(workflow).toContain("::add-mask::$value");

    const orderedGates = [
      "Generate masked authentication and AgentOS fixtures",
      "Initialize least-privilege database roles",
      "db:prepare",
      "Bootstrap Agno roles twice",
      "Bootstrap Agent control roles twice",
      "uv --directory apps/agent sync --frozen",
      "Run Agno migration twice",
      "Run Agent control migration twice",
      "agno-role-boundary.integration.test.ts",
      "uv --directory apps/agent run pytest",
      "uv --directory apps/agent run ruff check",
      "uv --directory apps/agent run mypy",
      "docker build -t agent-service-ci -f apps/agent/Dockerfile",
      "docker run --rm agent-service-ci uvicorn --version",
    ];
    for (const gate of orderedGates) {
      expect(workflow).toContain(gate);
    }
    for (const [previous, next] of orderedGates
      .slice(0, -1)
      .map((gate, index) => [gate, orderedGates[index + 1]] as const)) {
      expect(workflow.indexOf(previous)).toBeLessThan(workflow.indexOf(next));
    }
    expect(
      workflow.match(/sh infra\/postgres\/03-agno-roles\.sh/g),
    ).toHaveLength(2);
    expect(workflow.match(/python -m agent_service\.migrate/g)).toHaveLength(2);
    expect(
      workflow.match(/sh infra\/postgres\/04-agent-control-roles\.sh/g),
    ).toHaveLength(2);
    expect(
      workflow.match(/python -m agent_service\.model_config_migrate/g),
    ).toHaveLength(2);
  });

  it("runs the complete Skill Registry CI contract with isolated credentials", () => {
    const workflow = read(".github/workflows/ci.yml");
    const packageScripts = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const agentDockerfile = read("apps/agent/Dockerfile");

    expect(workflow).toContain(
      "cache-dependency-glob: |\n            apps/agent/uv.lock\n            packages/skill-core/uv.lock\n            apps/skill-registry/uv.lock",
    );
    for (const key of [
      "SKILL_REGISTRY_MIGRATOR_DATABASE_PASSWORD",
      "SKILL_REGISTRY_DATABASE_PASSWORD",
      "SKILL_REGISTRY_RUNTIME_DATABASE_PASSWORD",
      "SKILL_REGISTRY_MIGRATOR_DATABASE_URL",
      "SKILL_REGISTRY_DATABASE_URL",
      "SKILL_REGISTRY_RUNTIME_DATABASE_URL",
      "SKILL_REGISTRY_CONTROL_KEY",
    ]) {
      expect(workflow).toContain(key);
    }
    expect(
      workflow.match(/sh infra\/postgres\/05-skill-registry-roles\.sh/g),
    ).toHaveLength(2);
    expect(workflow.match(/python -m skill_registry\.migrate/g)).toHaveLength(
      2,
    );
    for (const gate of [
      "SKILL_REGISTRY_TEST_DATABASE_URL",
      "uv --directory packages/skill-core run pytest -q",
      "uv --directory packages/skill-core run ruff check .",
      "uv --directory packages/skill-core run mypy src tests",
      "uv --directory apps/skill-registry run pytest -q -rs",
      "uv --directory apps/skill-registry run ruff check .",
      "uv --directory apps/skill-registry run mypy src tests",
      "docker build -t skill-registry-ci -f apps/skill-registry/Dockerfile .",
      "docker inspect skill-registry-ci-smoke",
      "--read-only",
      "/internal/health/ready",
      "/etc/aap/skill-runtime-imports.json",
    ]) {
      expect(workflow).toContain(gate);
    }
    expect(workflow).toMatch(
      /docker run[\s\S]*--name skill-registry-ci-smoke[\s\S]*--read-only/,
    );
    expect(workflow).toMatch(
      /docker exec skill-registry-ci-smoke[\s\S]*10002:10002[\s\S]*docker inspect skill-registry-ci-smoke[\s\S]*true null/,
    );
    expect(workflow).toContain("docker run --rm agent-service-ci python -c");
    expect(workflow).toContain(
      "assert manifest == {'version': 1, 'pythonModules': ['agno', 'cryptography', 'pydantic']}",
    );
    expect(agentDockerfile).toContain(
      "infra/agent/skill-runtime-imports.json /etc/aap/skill-runtime-imports.json",
    );
    expect(packageScripts.scripts?.["skill-registry:test"]).toBe(
      "uv --directory apps/skill-registry run pytest -q -rs",
    );
    expect(packageScripts.scripts?.["skill-registry:e2e"]).toBe(
      "sh docs/testing/run-skill-registry-e2e.sh",
    );
    expect(packageScripts.scripts?.["restore:lifecycle:test"]).toContain(
      "run-restore-docker-lifecycle.sh timeout",
    );
    expect(packageScripts.scripts?.["restore:lifecycle:test"]).toContain(
      "run-restore-docker-lifecycle.sh controlled-failure",
    );
  });

  it("defines an isolated Skill Registry E2E and documents its runtime boundary", () => {
    const spec = read("apps/web/e2e/admin-skill-registry.spec.ts");
    const runner = read("docs/testing/run-skill-registry-e2e.sh");
    const testingReadme = read("docs/testing/README.md");
    const skillsReadme = read("apps/agent/src/agent_service/skills/README.md");

    for (const actor of ["workforce:admin", "workforce:super_admin"]) {
      expect(spec).toContain(actor);
    }
    for (const contract of [
      "pending_review",
      "published",
      "adminSessionToken",
      "modelAdminSessionToken",
      "artifactSha256",
      "revision",
      "self-review",
    ]) {
      expect(spec).toContain(contract);
    }
    expect(spec).toContain("SKILL.md");
    expect(spec).toContain("scripts/hello.py");
    expect(spec).toContain(".setInputFiles(archive)");
    expect(spec).toContain("AUTH_TOTP_SETUP_REQUIRED");
    expect(spec).toContain("totpFromUri(totpUri)");
    expect(spec).toContain("SKILL_REGISTRY_E2E_STORAGE_STATE_FILE");
    expect(spec).toContain("storageState: storageStatePath()");
    expect(spec.match(/browser\.newContext\(/gu)).toHaveLength(1);
    expect(spec).not.toMatch(/https?:\/\/(?:github|gitlab|gitcode)\./u);

    expect(runner).toContain("SKILL_REGISTRY_E2E_PROJECT");
    expect(runner).toContain("trap cleanup EXIT");
    expect(runner).toContain("docker compose -p");
    expect(runner).toContain("restart skill-registry");
    expect(
      runner.match(/run_job --no-deps skill-registry-migrate/g),
    ).toHaveLength(2);
    expect(runner).toContain("run --rm --no-deps backup");
    expect(runner).toContain("infra/docker/restore-drill.sh");
    expect(runner).toContain("run-restore-docker-lifecycle.sh timeout");
    expect(runner).toContain(
      "run-restore-docker-lifecycle.sh controlled-failure",
    );
    expect(runner).toContain("admin:assistant:skills:review");
    expect(runner).toContain("skill_revision_artifacts");
    expect(runner).toContain("artifact_digests_verified");
    expect(runner).toContain("SKILL_REGISTRY_E2E_STORAGE_STATE_FILE");
    expect(runner).toContain('success_message="Skill Registry E2E passed"');
    expect(runner).toContain("down --rmi local -v --remove-orphans");
    expect(runner).not.toMatch(/curl[^\n]*(github|gitlab|gitcode)/iu);

    for (const document of [testingReadme, skillsReadme]) {
      expect(document).toMatch(/库[＋+]审核|库与审核/u);
      expect(document).toMatch(/Agent[^\n]*仍[^\n]*不加载/u);
      expect(document).toContain("LocalSkills");
      expect(document).toMatch(/下一[^\n]*计划/u);
    }
  });

  it("limits isolated assistant E2E credentials to the seed migrator", () => {
    const base = read("compose.yaml");
    const override = read("compose.e2e.yaml");
    const webService = base.split("\n  web:\n")[1]?.split("\n  proxy:\n")[0];
    const seedKeys = [
      "E2E_CUSTOMER_PASSWORD",
      "E2E_STAFF_PASSWORD",
      "E2E_ADMIN_PASSWORD",
      "E2E_PENDING_CUSTOMER_SESSION_TOKEN",
      "E2E_DISABLED_CUSTOMER_SESSION_TOKEN",
      "E2E_STAFF_SESSION_TOKEN",
      "E2E_ROLE_TARGET_SESSION_TOKEN",
      "E2E_ADMIN_SESSION_TOKEN",
      "E2E_NO_TOTP_ADMIN_SESSION_TOKEN",
      "E2E_MODEL_ADMIN_SESSION_TOKEN",
      "E2E_MODEL_ADMIN_STALE_SESSION_TOKEN",
      "E2E_REVOKED_SESSION_TOKEN",
      "E2E_REPLACEMENT_PASSWORD",
    ];

    expect(webService).toBeDefined();
    expect(webService).not.toContain("env_file:");
    expect(webService).not.toContain("E2E_");
    expect(override).not.toContain("env_file:");
    expect(override).not.toMatch(/^\s{2}web:/mu);
    const configuredKeys = [
      ...override.matchAll(/^\s{6}(E2E_[A-Z_]+):/gmu),
    ].map((match) => match[1]);
    expect(configuredKeys).toEqual(seedKeys);
    for (const key of seedKeys) {
      expect(override).toContain(`${key}: \${${key}:?`);
    }
    expect(override).not.toMatch(
      /(?:BACKUP_|RUNTIME_|BETTER_AUTH_|POSTGRES_|MIGRATOR_)/u,
    );
  });

  it("enforces portable 0600 permissions for new and reused E2E env files", () => {
    const runner = read("docs/testing/run-assistant-experience-e2e.sh");
    const creationBoundary = runner.indexOf("\nfi\n");
    expect(creationBoundary).toBeGreaterThan(-1);
    const afterCreateOrReuse = runner.slice(creationBoundary + 4);
    expect(afterCreateOrReuse).toContain('chmod 600 "$env_file"');
    expect(afterCreateOrReuse).toContain('stat -f %Lp "$env_file"');
    expect(afterCreateOrReuse).toContain('stat -c %a "$env_file"');
    expect(afterCreateOrReuse).toMatch(
      /\[ "\$env_permissions" = "600" \][\s\S]*exit 1/u,
    );
    expect(afterCreateOrReuse).not.toMatch(/cat\s+"?\$env_file"?/u);
    expect(runner).toContain("BACKUP_ENCRYPTION_KEY_FILE");
    expect(runner).not.toContain("BACKUP_DATABASE_URL_FILE");
  });

  it("runs both assistant browser suites from an owned isolated project", () => {
    const runner = read("docs/testing/run-assistant-experience-e2e.sh");
    const webDockerfile = read("apps/web/Dockerfile");

    expect(runner).toContain(
      "project=${AAP_ASSISTANT_EXPERIENCE_E2E_PROJECT:-aap-assistant-e2e}",
    );
    expect(runner).toContain("aap-assistant-e2e|aap-assistant-e2e-*");
    expect(runner).toContain("project_lock_acquired=false");
    expect(runner).toContain("port_lock_acquired=false");
    expect(runner).toContain(
      'project_lock_dir="/tmp/$project.assistant-e2e.lock"',
    );
    expect(runner).toContain(
      'port_lock_dir="/tmp/aap-assistant-experience-e2e-port-8080.lock"',
    );
    expect(runner).not.toContain('lock_root="${runtime_tmp%/}');
    expect(runner).toContain('if ! mkdir "$project_lock_dir"');
    expect(runner).toContain('if ! mkdir "$port_lock_dir"');
    expect(runner).toContain("lock_is_owned");
    expect(runner).toContain("owns_project=false");
    expect(runner).toContain('if [ "$owns_project" = true ]');
    expect(runner).toContain("down --rmi local -v --remove-orphans");
    expect(runner).toContain("TCP port 8080 is already in use");
    expect(runner).toContain(
      "export ASSISTANT_PUBLIC_ORIGIN=http://127.0.0.1:8080",
    );
    expect(runner).toContain(
      "materialize_secret ASSISTANT_SESSION_SECRET_FILE",
    );
    expect(runner).toContain(
      "materialize_secret ASSISTANT_RATE_LIMIT_SECRET_FILE",
    );
    expect(runner).toContain("materialize_secret OS_SECURITY_KEY_FILE");
    expect(runner).not.toContain('rm -rf "$temp_dir"');
    expect(runner).toContain("release_owned_lock");
    expect(runner).toContain("cleanup_temp_dir");
    expect(runner).toContain("e2e/assistant-experience.spec.ts");
    expect(runner).toContain("e2e/pricing-assistant.spec.ts");
    expect(runner).toMatch(
      /playwright test[\s\\\n]+e2e\/assistant-experience\.spec\.ts[\s\\\n]+e2e\/pricing-assistant\.spec\.ts/u,
    );
    expect(runner).toContain("--workers=1");
    expect(webDockerfile).toContain(
      "--mount=type=cache,id=ai-agent-platform-pnpm-store",
    );
    expect(
      runner.indexOf("materialize_secret ASSISTANT_RATE_LIMIT_SECRET_FILE"),
    ).toBeLessThan(runner.indexOf("config --quiet"));
    expect(runner.indexOf("config --quiet")).toBeLessThan(
      runner.indexOf("owns_project=true"),
    );
  });

  it("materializes an isolated model credential in every Compose runner", () => {
    for (const file of [
      "docs/testing/run-assistant-runtime-e2e.sh",
      "docs/testing/run-assistant-experience-e2e.sh",
      "docs/testing/run-agentos-backup-restore.sh",
    ]) {
      const runner = read(file);
      const secretDirectory = runner.indexOf('secret_dir="$temp_dir/secrets"');
      const generated = runner.indexOf("model_api_key=$(secret)");
      const materialized = runner.indexOf(
        'materialize_secret MODEL_API_KEY_FILE model_api_key "$model_api_key"',
      );
      const composeConfig = runner.indexOf("config --quiet");

      expect(secretDirectory, file).toBeGreaterThan(-1);
      expect(generated, file).toBeGreaterThan(secretDirectory);
      expect(materialized, file).toBeGreaterThan(generated);
      expect(composeConfig, file).toBeGreaterThan(materialized);
      expect(runner).toMatch(/chmod 700 [^\n]*"\$secret_dir"/u);
      expect(runner).toContain('chmod 600 "$secret_path"');
      expect(runner).toContain("umask 077");
      expect(runner).toContain("trap cleanup EXIT");
      expect(runner).not.toContain('echo "$model_api_key"');
      expect(runner).not.toContain('cat "$MODEL_API_KEY_FILE"');
      expect(runner).not.toMatch(/set\s+-[^\n]*x/u);
    }
  });

  it("executes the assistant experience runner with fail-closed ownership and cleanup", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "aap-experience-owner-"));
    const repo = path.join(sandbox, "repo");
    const bin = path.join(sandbox, "bin");
    const temp = path.join(sandbox, "tmp");
    const alternateTemp = path.join(sandbox, "alternate-tmp");
    const project = `aap-assistant-e2e-${path.basename(sandbox)}`;
    const projectLock = path.join("/tmp", `${project}.assistant-e2e.lock`);
    const otherProject = `${project}-other`;
    const otherProjectLock = path.join(
      "/tmp",
      `${otherProject}.assistant-e2e.lock`,
    );
    const portLock = path.join(
      "/tmp",
      "aap-assistant-experience-e2e-port-8080.lock",
    );
    const runner = path.join(
      repo,
      "docs/testing/run-assistant-experience-e2e.sh",
    );
    mkdirSync(path.dirname(runner), { recursive: true });
    mkdirSync(bin, { recursive: true });
    mkdirSync(temp, { recursive: true });
    mkdirSync(alternateTemp, { recursive: true });
    for (const command of [
      "cat",
      "chmod",
      "dirname",
      "mkdir",
      "mktemp",
      "rm",
      "rmdir",
      "stat",
    ]) {
      const resolved = spawnSync("/bin/sh", ["-c", `command -v ${command}`], {
        encoding: "utf8",
      }).stdout.trim();
      expect(resolved).not.toBe("");
      symlinkSync(resolved, path.join(bin, command));
    }
    expect(() => statSync(projectLock)).toThrow();
    expect(() => statSync(otherProjectLock)).toThrow();
    expect(() => statSync(portLock)).toThrow();
    copyFileSync(
      path.join(root, "docs/testing/run-assistant-experience-e2e.sh"),
      runner,
    );
    writeFileSync(
      path.join(repo, ".env.e2e"),
      [
        "POSTGRES_DB=test",
        "POSTGRES_USER=test",
        "POSTGRES_PASSWORD=fixture-postgres",
        "MIGRATOR_DATABASE_PASSWORD=fixture-migrator",
        "RUNTIME_DATABASE_PASSWORD=fixture-runtime",
        "BACKUP_DATABASE_PASSWORD=fixture-backup",
        "MIGRATOR_DATABASE_URL=postgresql://fixture:fixture@db/test",
        "RUNTIME_DATABASE_URL=postgresql://fixture:fixture@db/test",
        "BACKUP_DATABASE_URL=postgresql://fixture:fixture@db/test",
        "DATABASE_URL=postgresql://fixture:fixture@db/test",
        "TEST_DATABASE_URL=postgresql://fixture:fixture@db/test_test",
        "BETTER_AUTH_SECRET=fixture-better-auth",
        "BETTER_AUTH_URL=http://127.0.0.1:8080",
        "BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:8080",
        "HTTP_PORT=8080",
        "PUBLIC_HOST=127.0.0.1",
        "ALLOW_LOCAL_VALIDATION_HOSTS=true",
        "BACKUP_INTERVAL_SECONDS=86400",
        "BACKUP_RETENTION_DAYS=14",
        "FEATURE_EMAIL_VERIFICATION=false",
        "E2E_CUSTOMER_PASSWORD=fixture-customer",
        "E2E_STAFF_PASSWORD=fixture-staff",
        "E2E_ADMIN_PASSWORD=fixture-admin",
        "E2E_PENDING_CUSTOMER_SESSION_TOKEN=fixture-pending",
        "E2E_DISABLED_CUSTOMER_SESSION_TOKEN=fixture-disabled",
        "E2E_STAFF_SESSION_TOKEN=fixture-staff-session",
        "E2E_ROLE_TARGET_SESSION_TOKEN=fixture-role-target",
        "E2E_ADMIN_SESSION_TOKEN=fixture-admin-session",
        "E2E_NO_TOTP_ADMIN_SESSION_TOKEN=fixture-no-totp",
        "E2E_REVOKED_SESSION_TOKEN=fixture-revoked",
        "E2E_REPLACEMENT_PASSWORD=fixture-replacement",
      ].join("\n"),
      { mode: 0o600 },
    );
    const openssl = path.join(bin, "openssl");
    const writeFakeOpenSsl = () =>
      writeFileSync(
        openssl,
        `#!/bin/sh
printf '%s\\n' "$*" >>"$FAKE_OPENSSL_LOG"
count=0
if [ -f "$FAKE_OPENSSL_COUNT_FILE" ]; then
  count=$(cat "$FAKE_OPENSSL_COUNT_FILE")
fi
count=$((count + 1))
printf '%s\\n' "$count" >"$FAKE_OPENSSL_COUNT_FILE"
if [ -n "\${FAKE_OPENSSL_FAIL_AFTER:-}" ] && [ "$count" -gt "$FAKE_OPENSSL_FAIL_AFTER" ]; then
  exit 45
fi
printf "%064d\\n" "$count"
`,
        { mode: 0o755 },
      );
    writeFakeOpenSsl();
    const lsof = path.join(bin, "lsof");
    const writeFakeLsof = () =>
      writeFileSync(
        lsof,
        '#!/bin/sh\nprintf "%s\\n" "$*" >>"$FAKE_LSOF_LOG"\n[ "${FAKE_PORT_BUSY:-false}" = true ]\n',
        { mode: 0o755 },
      );
    writeFakeLsof();
    writeFileSync(
      path.join(bin, "docker"),
      `#!/bin/sh
printf '%s\\n' "$*" >>"$FAKE_DOCKER_LOG"
case "$1 $2" in
  "ps -aq") [ "\${FAKE_RESOURCE:-}" = container ] && echo existing-container; exit 0 ;;
  "volume ls") [ "\${FAKE_RESOURCE:-}" = volume ] && echo existing-volume; exit 0 ;;
  "network ls") [ "\${FAKE_RESOURCE:-}" = network ] && echo existing-network; exit 0 ;;
  "image ls") [ "\${FAKE_RESOURCE:-}" = image ] && echo existing-image; exit 0 ;;
esac
case " $* " in
  *" compose "*" config --quiet "*) [ "\${FAKE_DOCKER_FAIL:-}" = config ] && exit 41; exit 0 ;;
  *" compose "*" build migrate web "*)
    if [ "\${FAKE_REPLACE_OWNER_TOKEN:-false}" = true ]; then
      printf '%s\\n' replaced-owner >"$FAKE_PROJECT_LOCK/token"
    fi
    [ "\${FAKE_DOCKER_FAIL:-}" = build ] && exit 42
    exit 0
    ;;
  *" compose "*" up -d --wait db "*) [ "\${FAKE_DOCKER_FAIL:-}" = up ] && exit 43; exit 0 ;;
  *" compose "*" down --rmi local -v --remove-orphans "*) exit 0 ;;
esac
exit 0
`,
      { mode: 0o755 },
    );
    writeFileSync(
      path.join(bin, "pnpm"),
      `#!/bin/sh
printf '%s\\n' "$*" >>"$FAKE_PNPM_LOG"
[ "\${FAKE_PNPM_FAIL:-false}" = true ] && exit 44
exit 0
`,
      { mode: 0o755 },
    );

    const run = (
      name: string,
      extra: NodeJS.ProcessEnv = {},
      selectedProject = project,
    ) => {
      const dockerLog = path.join(sandbox, `${name}.docker.log`);
      const pnpmLog = path.join(sandbox, `${name}.pnpm.log`);
      const opensslCount = path.join(sandbox, `${name}.openssl.count`);
      const opensslLog = path.join(sandbox, `${name}.openssl.log`);
      const lsofLog = path.join(sandbox, `${name}.lsof.log`);
      writeFileSync(dockerLog, "");
      writeFileSync(pnpmLog, "");
      writeFileSync(opensslLog, "");
      writeFileSync(lsofLog, "");
      const result = spawnSync("/bin/sh", [runner], {
        cwd: repo,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: bin,
          TMPDIR: temp,
          AAP_ASSISTANT_EXPERIENCE_E2E_PROJECT: selectedProject,
          FAKE_DOCKER_LOG: dockerLog,
          FAKE_DOCKER_FAIL: "",
          FAKE_OPENSSL_FAIL_AFTER: "",
          FAKE_OPENSSL_LOG: opensslLog,
          FAKE_PNPM_LOG: pnpmLog,
          FAKE_PNPM_FAIL: "false",
          FAKE_PORT_BUSY: "false",
          FAKE_PROJECT_LOCK: projectLock,
          FAKE_REPLACE_OWNER_TOKEN: "false",
          FAKE_RESOURCE: "",
          FAKE_OPENSSL_COUNT_FILE: opensslCount,
          ...extra,
        },
      });
      return {
        result,
        dockerCalls: readFileSync(dockerLog, "utf8"),
        lsofCalls: readFileSync(lsofLog, "utf8"),
        opensslCalls: readFileSync(opensslLog, "utf8"),
        pnpmCalls: readFileSync(pnpmLog, "utf8"),
      };
    };
    const downCalls = (calls: string) =>
      calls.match(/down --rmi local -v --remove-orphans/gu) ?? [];
    const expectOwnedArtifactsCleaned = () => {
      expect(() => statSync(projectLock)).toThrow();
      expect(() => statSync(portLock)).toThrow();
      for (const directory of [temp, alternateTemp]) {
        expect(
          readdirSync(directory).filter((entry) =>
            entry.startsWith("aap-assistant-e2e."),
          ),
        ).toEqual([]);
      }
    };

    const fixtureSecrets = [
      "fixture-postgres",
      "fixture-migrator",
      "fixture-runtime",
      "fixture-backup",
      "postgresql://fixture:fixture@db/test",
      "postgresql://fixture:fixture@db/test_test",
      "fixture-better-auth",
      "fixture-customer",
      "fixture-staff",
      "fixture-admin",
      "fixture-pending",
      "fixture-disabled",
      "fixture-staff-session",
      "fixture-role-target",
      "fixture-admin-session",
      "fixture-no-totp",
      "fixture-revoked",
      "fixture-replacement",
      ...Array.from({ length: 5 }, (_, index) =>
        String(index + 1).padStart(64, "0"),
      ),
    ];
    const writeFixtureLock = (directory: string, token: string) => {
      mkdirSync(directory, { mode: 0o700 });
      writeFileSync(path.join(directory, "token"), `${token}\n`, {
        mode: 0o600,
      });
    };
    const removeFixtureLock = (directory: string, allowedTokens: string[]) => {
      try {
        const tokenFile = path.join(directory, "token");
        const token = readFileSync(tokenFile, "utf8").trim();
        if (!allowedTokens.includes(token)) return;
        rmSync(tokenFile);
        rmdirSync(directory);
      } catch {
        // The runner already removed its own lock, or the directory never existed.
      }
    };

    try {
      const unsafe = run(
        "unsafe",
        {},
        "aap-assistant-e2e-../other-project;touch-pwned",
      );
      expect(unsafe.result.status).not.toBe(0);
      expect(unsafe.dockerCalls).toBe("");
      expect(() => statSync(path.join(sandbox, "touch-pwned"))).toThrow();

      writeFixtureLock(projectLock, "other-owner");
      const locked = run("locked", { TMPDIR: alternateTemp });
      expect(locked.result.status).not.toBe(0);
      expect(downCalls(locked.dockerCalls)).toHaveLength(0);
      expect(statSync(projectLock).isDirectory()).toBe(true);
      removeFixtureLock(projectLock, ["other-owner"]);

      writeFixtureLock(portLock, "other-port-owner");
      const reservedPort = run("reserved-port", {}, otherProject);
      expect(reservedPort.result.status).not.toBe(0);
      expect(downCalls(reservedPort.dockerCalls)).toHaveLength(0);
      expect(statSync(portLock).isDirectory()).toBe(true);
      expect(() => statSync(otherProjectLock)).toThrow();
      removeFixtureLock(portLock, ["other-port-owner"]);

      const resourceRuns = ["container", "volume", "network", "image"].map(
        (resource) => {
          const result = run(`resource-${resource}`, {
            FAKE_RESOURCE: resource,
          });
          expect(result.result.status).not.toBe(0);
          expect(downCalls(result.dockerCalls)).toHaveLength(0);
          expectOwnedArtifactsCleaned();
          return result;
        },
      );

      rmSync(lsof);
      const missingPortTool = run("missing-lsof");
      expect(missingPortTool.result.status).not.toBe(0);
      expect(downCalls(missingPortTool.dockerCalls)).toHaveLength(0);
      expectOwnedArtifactsCleaned();
      writeFakeLsof();

      const port = run("port", { FAKE_PORT_BUSY: "true" });
      expect(port.result.status).not.toBe(0);
      expect(downCalls(port.dockerCalls)).toHaveLength(0);
      expectOwnedArtifactsCleaned();

      const secret = run("secret", { FAKE_OPENSSL_FAIL_AFTER: "1" });
      expect(secret.result.status).toBe(45);
      expect(downCalls(secret.dockerCalls)).toHaveLength(0);
      expectOwnedArtifactsCleaned();

      const config = run("config", { FAKE_DOCKER_FAIL: "config" });
      expect(config.result.status).toBe(41);
      expect(downCalls(config.dockerCalls)).toHaveLength(0);
      expectOwnedArtifactsCleaned();

      const build = run("build", { FAKE_DOCKER_FAIL: "build" });
      expect(build.result.status).toBe(42);
      expect(downCalls(build.dockerCalls)).toHaveLength(1);
      expect(build.dockerCalls).toContain(`compose -p ${project}`);
      expect(build.dockerCalls).not.toContain("other-project");
      expectOwnedArtifactsCleaned();

      const replacedOwner = run("replaced-owner", {
        FAKE_DOCKER_FAIL: "build",
        FAKE_REPLACE_OWNER_TOKEN: "true",
      });
      expect(replacedOwner.result.status).toBe(42);
      expect(downCalls(replacedOwner.dockerCalls)).toHaveLength(0);
      expect(readFileSync(path.join(projectLock, "token"), "utf8").trim()).toBe(
        "replaced-owner",
      );
      expect(() => statSync(portLock)).toThrow();
      removeFixtureLock(projectLock, ["replaced-owner"]);
      expectOwnedArtifactsCleaned();

      const up = run("up", { FAKE_DOCKER_FAIL: "up" });
      expect(up.result.status).toBe(43);
      expect(downCalls(up.dockerCalls)).toHaveLength(1);
      expectOwnedArtifactsCleaned();

      const later = run("later", { FAKE_PNPM_FAIL: "true" });
      expect(later.result.status).toBe(44);
      expect(downCalls(later.dockerCalls)).toHaveLength(1);
      expectOwnedArtifactsCleaned();

      const success = run("success");
      expect(success.result.status).toBe(0);
      expect(downCalls(success.dockerCalls)).toHaveLength(1);
      expect(success.pnpmCalls).toContain("e2e/assistant-experience.spec.ts");
      expect(success.pnpmCalls).toContain("e2e/pricing-assistant.spec.ts");
      expectOwnedArtifactsCleaned();

      for (const runResult of [
        unsafe,
        locked,
        reservedPort,
        ...resourceRuns,
        missingPortTool,
        port,
        secret,
        config,
        build,
        replacedOwner,
        up,
        later,
        success,
      ]) {
        const combinedLogs = [
          runResult.result.stdout,
          runResult.result.stderr,
          runResult.dockerCalls,
          runResult.pnpmCalls,
          runResult.opensslCalls,
          runResult.lsofCalls,
        ].join("\n");
        for (const secret of fixtureSecrets) {
          expect(combinedLogs).not.toContain(secret);
        }
      }
    } finally {
      removeFixtureLock(projectLock, [
        "other-owner",
        "replaced-owner",
        String(1).padStart(64, "0"),
      ]);
      removeFixtureLock(otherProjectLock, [String(1).padStart(64, "0")]);
      removeFixtureLock(portLock, [
        "other-port-owner",
        String(1).padStart(64, "0"),
      ]);
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects unknown hosts before forwarding and preserves approved Host ports", () => {
    const nginx = read("infra/nginx/default.conf.template");
    const compose = read("compose.yaml");
    expect(nginx).toContain("${PUBLIC_HOST}");
    expect(nginx).toContain("return 421;");
    expect(nginx).toContain("proxy_set_header Host $http_host;");
    expect(nginx).toContain("${ALLOW_LOCAL_VALIDATION_HOSTS}");
    expect(nginx).toMatch(
      /map "\$\{ALLOW_LOCAL_VALIDATION_HOSTS\}:\$loopback_host_allowed" \$local_validation_host_allowed/u,
    );
    expect(compose).toContain(
      "ALLOW_LOCAL_VALIDATION_HOSTS: ${ALLOW_LOCAL_VALIDATION_HOSTS:-false}",
    );
    expect(compose).toContain('wget --header="Host: $${PUBLIC_HOST}"');
    expect(compose).toContain(
      "PUBLIC_HOST: ${PUBLIC_HOST:?Set PUBLIC_HOST in .env}",
    );
  });

  it("defines the pinned PostgreSQL-backed CI and browser gates", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("node-version: 24");
    expect(workflow).toContain("version: 11.5.2");
    expect(workflow).toContain("postgres:18");
    expect(workflow).toContain("ai_agent_platform_identity_test_ci");
    expect(workflow).toContain("Initialize least-privilege database roles");
    expect(workflow.indexOf("01-roles.sh")).toBeLessThan(
      workflow.indexOf("db:prepare"),
    );
    expect(workflow).not.toContain("ai_agent_platform_identity_test\n");
    expect(read("apps/web/vitest.config.ts")).toContain(
      "fileParallelism: false",
    );
    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).toContain("db:seed-auth-e2e");
    expect(workflow).toContain("playwright install --with-deps chromium");
    expect(workflow).toContain("e2e/auth-smoke.spec.ts");
    expect(workflow).toContain("docker build --target migrator");
    expect(workflow).toContain("docker build --target runner");
    expect(workflow).toContain("nginx -t");
    expect(workflow).toContain("docker network create");
    expect(workflow).toContain("--network-alias web");
    expect(workflow).toContain("-e ALLOW_LOCAL_VALIDATION_HOSTS=false");
    expect(workflow).toContain("trap cleanup EXIT");
    expect(workflow).toContain('docker network rm "$network"');
    expect(workflow).toMatch(
      /docker run --rm --network[\s\S]*nginx:1\.28\.3-alpine3\.23 nginx -t/u,
    );
    expect(workflow).toContain("::add-mask::");
    expect(workflow).not.toContain("ci-customer-fixture-passphrase");
    expect(workflow).not.toContain("ci-only-better-auth-secret");
    expect(workflow).toContain(
      "actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4",
    );
    expect(workflow).toContain(
      "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4",
    );
    expect(workflow).toContain(
      "pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4",
    );
  });

  it("generates model-admin session fixtures before seeding auth E2E data", () => {
    const workflow = read(".github/workflows/ci.yml");
    const loopStart = workflow.indexOf("for name in ");
    const loopEnd = workflow.indexOf("; do", loopStart);
    const fixtureLoop = workflow.slice(loopStart, loopEnd);

    expect(fixtureLoop).toContain("E2E_MODEL_ADMIN_SESSION_TOKEN");
    expect(fixtureLoop).toContain("E2E_MODEL_ADMIN_STALE_SESSION_TOKEN");
  });

  it("keeps browser output ignored and documents every production variable", () => {
    const ignored = read(".gitignore");
    expect(ignored).toContain("artifacts/playwright/");
    expect(ignored).toContain("playwright-report/");
    expect(ignored).toContain("test-results/");
    const env = read(".env.example");
    expect(env).not.toMatch(/^BACKUP_ENCRYPTION_KEY=/mu);
    for (const key of [
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "BETTER_AUTH_TRUSTED_ORIGINS",
      "FEATURE_EMAIL_VERIFICATION=false",
      "MIGRATOR_DATABASE_URL",
      "RUNTIME_DATABASE_URL",
      "BACKUP_DATABASE_URL",
      "BACKUP_DATABASE_PASSWORD",
      "OS_SECURITY_KEY",
      "POSTGRES_PASSWORD_FILE",
      "MIGRATOR_DATABASE_PASSWORD_FILE",
      "RUNTIME_DATABASE_PASSWORD_FILE",
      "BACKUP_DATABASE_PASSWORD_FILE",
      "BACKUP_ENCRYPTION_KEY_FILE",
      "AGNO_MIGRATOR_DATABASE_PASSWORD_FILE",
      "AGNO_DATABASE_PASSWORD_FILE",
      "MIGRATOR_DATABASE_URL_FILE",
      "RUNTIME_DATABASE_URL_FILE",
      "AGNO_MIGRATOR_DATABASE_URL_FILE",
      "AGNO_DATABASE_URL_FILE",
      "BETTER_AUTH_SECRET_FILE",
      "OS_SECURITY_KEY_FILE",
      "PUBLIC_HOST",
      "ALLOW_LOCAL_VALIDATION_HOSTS=false",
      "TEST_DATABASE_URL",
    ]) {
      expect(env).toContain(key);
    }
  });

  it("starts every production service in documented dependency order", () => {
    const runbook = read("docs/deployment/server-readiness.md");
    const rootReadme = read("README.md");
    const orderedCommands = [
      "docker compose up -d --wait db",
      "docker compose run --rm migrate",
      "docker compose run --rm agno-bootstrap",
      "docker compose run --rm --no-deps agent-migrate",
      "docker compose up -d --no-deps --wait agent",
      "docker compose up -d --wait web",
      "docker compose up -d --wait proxy backup",
    ];
    for (const command of orderedCommands) {
      expect(runbook).toContain(command);
      expect(rootReadme).toContain(command);
    }
    for (const [previous, next] of orderedCommands
      .slice(0, -1)
      .map(
        (command, index) => [command, orderedCommands[index + 1]] as const,
      )) {
      expect(runbook.indexOf(previous)).toBeLessThan(runbook.indexOf(next));
      expect(rootReadme.indexOf(previous)).toBeLessThan(
        rootReadme.indexOf(next),
      );
    }
    expect(runbook).toContain(
      "db → migrate → agno-bootstrap → agent-migrate → agent → web → proxy/backup",
    );
    expect(runbook).toContain("`backup`等待平台和 Agno 迁移都成功");
    expect(runbook).toContain("`proxy`等待`web`健康");
    expect(runbook).not.toContain("后续服务按`service_healthy`顺序启动");

    for (const file of [
      "docs/superpowers/plans/2026-07-10-project-foundation.md",
      "docs/superpowers/plans/2026-07-11-identity-access-control.md",
    ]) {
      const startupCommands = read(file)
        .split("\n")
        .filter((line) => line.includes("docker compose up"));
      expect(startupCommands.length).toBeGreaterThan(0);
      expect(startupCommands.every((line) => line.includes("backup"))).toBe(
        true,
      );
    }

    const identityPlan = read(
      "docs/superpowers/plans/2026-07-11-identity-access-control.md",
    );
    expect(identityPlan).toContain("loopback Host allowlist");
    expect(identityPlan).toContain("Origin/baseURL");
  });

  it("keeps Task 11 and Task 12 Compose validation blocks reproducible", () => {
    const plan = read(
      "docs/superpowers/plans/2026-07-11-identity-access-control.md",
    );
    const validationBlock = plan
      .split("**Step 6: Validate Compose and workflow syntax**")[1]
      ?.split("```bash")[1]
      ?.split("```")[0];
    const acceptanceBlock = plan
      .split("**Step 2: Run a clean Docker acceptance environment**")[1]
      ?.split("```bash")[1]
      ?.split("```")[0];

    for (const block of [validationBlock, acceptanceBlock]) {
      expect(block).toBeDefined();
      for (const key of [
        "POSTGRES_PASSWORD",
        "MIGRATOR_DATABASE_PASSWORD",
        "MIGRATOR_DATABASE_URL",
        "RUNTIME_DATABASE_PASSWORD",
        "RUNTIME_DATABASE_URL",
        "BACKUP_DATABASE_PASSWORD",
        "BACKUP_DATABASE_URL",
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL",
        "BETTER_AUTH_TRUSTED_ORIGINS",
        "PUBLIC_HOST",
        "ALLOW_LOCAL_VALIDATION_HOSTS",
        "FEATURE_EMAIL_VERIFICATION",
        "E2E_CUSTOMER_PASSWORD",
        "E2E_STAFF_PASSWORD",
        "E2E_ADMIN_PASSWORD",
        "E2E_PENDING_CUSTOMER_SESSION_TOKEN",
        "E2E_DISABLED_CUSTOMER_SESSION_TOKEN",
        "E2E_STAFF_SESSION_TOKEN",
        "E2E_ROLE_TARGET_SESSION_TOKEN",
        "E2E_ADMIN_SESSION_TOKEN",
        "E2E_NO_TOTP_ADMIN_SESSION_TOKEN",
        "E2E_REVOKED_SESSION_TOKEN",
        "E2E_REPLACEMENT_PASSWORD",
      ]) {
        expect(block).toContain(`export ${key}=`);
      }
      for (const key of [
        "POSTGRES_PASSWORD",
        "MIGRATOR_DATABASE_PASSWORD",
        "RUNTIME_DATABASE_PASSWORD",
        "BACKUP_DATABASE_PASSWORD",
        "BETTER_AUTH_SECRET",
        "E2E_CUSTOMER_PASSWORD",
        "E2E_STAFF_PASSWORD",
        "E2E_ADMIN_PASSWORD",
        "E2E_PENDING_CUSTOMER_SESSION_TOKEN",
        "E2E_DISABLED_CUSTOMER_SESSION_TOKEN",
        "E2E_STAFF_SESSION_TOKEN",
        "E2E_ROLE_TARGET_SESSION_TOKEN",
        "E2E_ADMIN_SESSION_TOKEN",
        "E2E_NO_TOTP_ADMIN_SESSION_TOKEN",
        "E2E_REVOKED_SESSION_TOKEN",
        "E2E_REPLACEMENT_PASSWORD",
      ]) {
        expect(block).toContain(`export ${key}="$(openssl rand -hex 32)"`);
      }
      expect(block).toMatch(
        /MIGRATOR_DATABASE_URL="postgresql:\/\/ai_agent_migrator:\$\{MIGRATOR_DATABASE_PASSWORD\}@db:5432\/ai_agent_platform"/u,
      );
      expect(block).toMatch(
        /RUNTIME_DATABASE_URL="postgresql:\/\/ai_agent_runtime:\$\{RUNTIME_DATABASE_PASSWORD\}@db:5432\/ai_agent_platform"/u,
      );
      expect(block).toMatch(
        /BACKUP_DATABASE_URL="postgresql:\/\/ai_agent_backup:\$\{BACKUP_DATABASE_PASSWORD\}@db:5432\/ai_agent_platform"/u,
      );
      expect(block).not.toContain("export DATABASE_URL=");
      expect(block).toContain("config --quiet");
    }
    expect(acceptanceBlock).toContain("db migrate web proxy backup");
  });

  it("uses a migration-safe CI database and initializes privilege roles first", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain("ai_agent_platform_identity_test_ci");
    expect(workflow).toContain("ai_agent_platform_ci");
    expect(workflow).toContain(
      "TEST_DATABASE_URL: postgresql://ai_agent_owner@127.0.0.1:5432/ai_agent_platform_identity_test_integration",
    );
    expect(workflow).toContain(
      "ROLE_BOUNDARY_DATABASE_URL: postgresql://ai_agent_owner@127.0.0.1:5432/ai_agent_platform_identity_test_ci",
    );
    expect(workflow).not.toMatch(/echo "DATABASE_URL=.*" >> "\$GITHUB_ENV"/u);
    expect(workflow).toContain(
      'DATABASE_URL="$MIGRATOR_DATABASE_URL" pnpm --filter @ai-agent-platform/database db:prepare',
    );
    expect(workflow).toContain(
      'DATABASE_URL="$MIGRATOR_DATABASE_URL" pnpm --filter @ai-agent-platform/database db:seed-auth-e2e',
    );
    expect(workflow).toContain(
      'DATABASE_URL="$RUNTIME_DATABASE_URL" pnpm --filter @ai-agent-platform/web exec playwright test e2e/auth-smoke.spec.ts',
    );
    expect(workflow).toMatch(
      /MIGRATOR_DATABASE_URL=postgresql:\/\/ai_agent_migrator:[^\n]*\/ai_agent_platform_identity_test_ci/u,
    );
    expect(workflow).toMatch(
      /RUNTIME_DATABASE_URL=postgresql:\/\/ai_agent_runtime:[^\n]*\/ai_agent_platform_identity_test_ci/u,
    );
    expect(workflow).toContain(
      "CREATE DATABASE ai_agent_platform_identity_test_ci",
    );
    expect(workflow).toContain(
      "CREATE DATABASE ai_agent_platform_identity_test_integration",
    );
    expect(workflow).toContain("name: Create isolated CI databases");
    expect(workflow).not.toContain("ai_agent_platform_test\n");
    expect(workflow).toContain("Initialize least-privilege database roles");
    expect(
      workflow.indexOf("Initialize least-privilege database roles"),
    ).toBeLessThan(workflow.indexOf("db:prepare"));
    expect(workflow).toContain("ROLE_SQL_FILE: infra/postgres/01-roles.sql");
    expect(read("apps/web/vitest.config.ts")).toContain(
      "fileParallelism: false",
    );
  });

  it("requires restore drills to verify the exact migration and schema contract", () => {
    const script = read("infra/docker/restore-drill.sh");
    const expectedRegistryTriggers = [
      [
        "skills_guard_update",
        "skills",
        "guard_skill_update",
        "skill_registry",
        19,
        false,
        false,
      ],
      [
        "skill_revisions_guard_insert",
        "skill_revisions",
        "guard_revision_insert",
        "skill_registry",
        7,
        false,
        false,
      ],
      [
        "skill_revisions_guard_update",
        "skill_revisions",
        "guard_revision_update",
        "skill_registry",
        19,
        false,
        false,
      ],
      [
        "skill_revisions_require_review_event",
        "skill_revisions",
        "require_revision_review_event",
        "skill_registry",
        17,
        true,
        true,
      ],
      [
        "skill_control_events_stamp_transaction",
        "skill_control_events",
        "stamp_control_event_transaction",
        "skill_registry",
        7,
        false,
        false,
      ],
      [
        "skill_control_events_append_only",
        "skill_control_events",
        "deny_append_only_mutation",
        "skill_registry",
        27,
        false,
        false,
      ],
      [
        "skill_revision_artifacts_append_only",
        "skill_revision_artifacts",
        "deny_append_only_mutation",
        "skill_registry",
        27,
        false,
        false,
      ],
      [
        "skill_revision_files_append_only",
        "skill_revision_files",
        "deny_append_only_mutation",
        "skill_registry",
        27,
        false,
        false,
      ],
    ] as const;
    expect(script).toContain("BACKUP_ENCRYPTION_KEY_FILE");
    expect(script).toContain("--decrypt");
    expect(script).toContain("--pinentry-mode loopback");
    expect(script).toContain("--passphrase-file");
    expect(script).toContain("RESTORE_MAX_ENCRYPTED_BYTES");
    expect(script).toContain("RESTORE_MAX_DECRYPTED_BYTES");
    expect(script).toContain("RESTORE_DECRYPT_TIMEOUT_SECONDS");
    expect(script).toContain("RESTORE_DECRYPT_KILL_AFTER_SECONDS");
    expect(script).toContain("RESTORE_DOCKER_CREATE_TIMEOUT_SECONDS");
    expect(script).toContain("RESTORE_DOCKER_CLI_TIMEOUT_SECONDS");
    expect(script).toContain("RESTORE_DOCKER_CLI_KILL_AFTER_SECONDS");
    expect(script).toContain("RESTORE_DECRYPT_RECONCILE_ATTEMPTS");
    expect(script).toContain("RESTORE_DOCKER_CREATE_SETTLE_SECONDS");
    expect(script).toContain("RESTORE_SPACE_SAFETY_BYTES");
    expect(script).toContain('decrypt_container="aap-restore-decrypt-$run_id"');
    expect(script).toContain('head -c "$2"');
    expect(script).toContain('create --name "$decrypt_container"');
    expect(script).toContain('start "$start_container"');
    expect(script).toContain('wait "$wait_container"');
    expect(script).not.toContain('docker run --name "$decrypt_container"');
    expect(script).toContain("run_bounded_docker");
    expect(script).toContain("terminate_active_docker");
    expect(script).toContain("query_docker_resource");
    expect(script).toContain("reconcile_registered_resource");
    expect(script).toContain("reconcile_ambiguous_resource");
    expect(script).toContain("resource_registry_directory");
    expect(script).toContain(
      'ps -a \\\n          --filter "name=^/$query_resource_name$"',
    );
    expect(script).toContain(
      'volume ls \\\n          --filter "name=^$query_resource_name$"',
    );
    expect(script).not.toContain(
      'docker container inspect "$decrypt_container"',
    );
    expect(script).not.toContain('docker rm -f "$container" >/dev/null');
    expect(script).not.toContain('docker volume rm "$volume" >/dev/null');
    expect(script).toContain("restore drill cleanup failed");
    expect(script).toContain("sleep 0.1");
    expect(script).toContain('rm -f "$remove_resource_name"');
    expect(script).toContain(
      "restore drill rejected oversized encrypted backup",
    );
    expect(script).toContain(
      "restore drill rejected oversized decrypted bundle",
    );
    expect(script).toContain("restore drill decryption timed out");
    expect(script).toContain(
      "restore drill temporary space budget is insufficient",
    );
    expect(script).toContain("decrypted_bundle_candidate");
    expect(script.indexOf('if wait "$gpg_pid"')).toBeLessThan(
      script.indexOf('if wait "$head_pid"'),
    );
    expect(script).toContain('kill -TERM "$head_pid"');
    expect(script).toContain('kill -KILL "$head_pid"');
    expect(script).toContain(
      'mv "$decrypted_bundle_candidate" "$decrypted_bundle"',
    );
    expect(script).toContain("skill-backup.manifest");
    expect(script).toContain("database.dump");
    expect(script).toContain("tar -tf");
    expect(script).toContain("tar -tvf");
    expect(script).toContain("manifest_format_version");
    expect(script).toContain("manifest_dump_sha256");
    expect(script).toContain("actual_dump_sha256");
    expect(script).toContain("manifest_skill_registry_schema_version");
    expect(script).toContain("manifest_skill_revision_count");
    expect(script).toContain("manifest_skill_artifact_count");
    expect(script).toContain("manifest_skill_file_count");
    expect(script).toContain('[ "$#" -ne 5 ]');
    expect(script).not.toContain("expected_skill_registry_schema_version");
    expect(script).not.toContain("expected_skill_revision_count");
    expect(script).not.toContain("expected_skill_artifact_count");
    expect(script).not.toContain("expected_skill_file_count");
    expect(script).not.toContain("aes-256-cbc");
    expect(script).not.toContain("openssl enc");
    expect(script).toContain("--env-file");
    expect(script).not.toMatch(/docker run[^\n]*-e\s+POSTGRES_/u);
    expect(script).not.toContain("POSTGRES_PASSWORD=");
    expect(script).toContain('expected_migrations="8"');
    expect(script).toContain('expected_latest_migration="1784480751832"');
    expect(script).toContain("migration_count");
    expect(script).toContain("latest_migration");
    expect(script).toContain("users_email_lower_unique");
    expect(script).toContain("sessions_identity_boundary_guard");
    expect(script).toContain("content_revisions_immutable");
    expect(script).toContain("content_routes_state_machine");
    expect(script).toContain("role_permissions_admin_docs_delete_guard");
    expect(script).toContain("permissions_admin_docs_delete_key_guard");
    expect(script).toContain("roles_admin_docs_delete_grant_guard");
    expect(script).toContain("roles_super_admin_delete_guard");
    expect(script).toContain("permissions_admin_docs_delete_delete_guard");
    expect(script).toContain(
      "to_regclass('public.content_revisions') IS NOT NULL",
    );
    expect(script).toContain(
      "to_regclass('public.content_routes') IS NOT NULL",
    );
    expect(script).toContain("audit_logs_created_id_desc_idx");
    expect(script).toContain("rate_limits_key_unique");
    expect(script).toContain("--clean --if-exists");
    expect(script).not.toContain("--no-owner");
    expect(script).not.toContain("--no-acl");
    expect(script).toContain("/bootstrap/01-roles.sh");
    expect(script).toContain("/bootstrap/03-agno-roles.sh");
    expect(script).toContain("/bootstrap/04-agent-control-roles.sh");
    expect(script).toContain("/bootstrap/05-skill-registry-roles.sh");
    expect(script).toContain("RESTORE_SKILL_REGISTRY_IMAGE");
    expect(script).toContain("python -m skill_registry.migrate");
    expect(script).toContain("ai_agent_skill_registry_manager");
    expect(script).toContain("ai_agent_backup");
    expect(script).toContain("ai_agent_skill_registry_runtime");
    expect(script).toContain("manager_insert_check_file");
    expect(script).toContain("backup_insert_denied_file");
    expect(script).toContain("--file=/restore/manager-insert-check.sql");
    expect(script).toContain("--file=/restore/backup-insert-denied.sql");
    expect(script).toContain("--set=VERBOSITY=verbose");
    expect(script).toContain('grep -q "42501"');
    expect(script).toContain('grep -q "permission denied"');
    expect(script).toContain("restore drill failed registry role checks");
    expect(script).toContain("to_regclass('agno.agno_sessions') IS NOT NULL");
    expect(script).toContain(
      "to_regclass('agno.agno_schema_versions') IS NOT NULL",
    );
    expect(script).toContain("agno_session_count");
    expect(script).toContain("agno_schema_version_count");
    expect(script).toContain("expected_user_count");
    expect(script).toContain("expected_agno_session_count");
    expect(script).toContain("expected_user_id");
    expect(script).toContain("expected_agno_session_id");
    expect(script).toContain('[ "$user_count" -le 0 ]');
    expect(script).toContain('[ "$agno_session_count" -le 0 ]');
    expect(script).toContain('[ "$user_count" != "$expected_user_count" ]');
    expect(script).toContain(
      '[ "$agno_session_count" != "$expected_agno_session_count" ]',
    );
    expect(script).toContain("restored_user_fixture_count");
    expect(script).toContain("restored_agno_session_fixture_count");
    expect(script).toContain("skill_registry.schema_versions");
    expect(script).toContain("skill_registry.skill_revisions");
    expect(script).toContain("skill_registry.skill_revision_artifacts");
    expect(script).toContain("skill_registry.skill_revision_files");
    expect(script).toContain("skill_registry_schema_version");
    expect(script).toContain("skill_revision_count");
    expect(script).toContain("skill_artifact_count");
    expect(script).toContain("skill_file_count");
    expect(script).toContain("skill_artifact_digest_mismatch_count");
    expect(script).toContain("sha256(artifact.archive_bytes)");
    expect(script).toContain("skill_registry_integrity_mismatch_count");
    expect(script).toContain("skill_registry_security_trigger_mismatch_count");
    expect(script).toContain("trigger.tgtype::integer");
    expect(script).toContain("trigger.tgdeferrable");
    expect(script).toContain("trigger.tginitdeferred");
    expect(script).toContain("trigger.tgenabled");
    expect(script).toContain("function_namespace.nspname::text");
    expect(script).toContain("function_namespace.oid = function.pronamespace");
    for (const [
      name,
      table,
      fn,
      functionSchema,
      type,
      deferrable,
      initiallyDeferred,
    ] of expectedRegistryTriggers) {
      expect(script).toContain(
        `('${name}', '${table}', '${fn}', '${functionSchema}', ${type}, ${deferrable}, ${initiallyDeferred}, 'A')`,
      );
    }
    expect(script).toContain("BEGIN TRANSACTION READ ONLY");
    expect(script).toContain("SET LOCAL search_path = pg_catalog");
    expect(script).not.toMatch(/SELECT\s+archive_bytes/iu);
    expect(script).not.toMatch(/encode\s*\(\s*artifact\.archive_bytes/iu);
    expect(script).not.toMatch(
      /(?:echo|printf)[^\n]*(?:archive_bytes|review_reason)/iu,
    );
    expect(script).not.toMatch(/SELECT\s+(?:message|messages|content|runs?)/iu);
    expect(script).not.toContain('[ "$migration_count" -lt 1 ]');
  });

  it("routes every restore Docker CLI through one bounded supervisor", () => {
    const script = read("infra/docker/restore-drill.sh");
    const literalDockerInvocations = script
      .split("\n")
      .filter((line) => /^\s*docker(?:\s|$)/u.test(line));

    expect(literalDockerInvocations).toHaveLength(1);
    expect(literalDockerInvocations[0]).toContain('docker "$@"');
  });

  it("explicitly propagates every restore lifecycle and scalar file read", () => {
    const script = read("infra/docker/restore-drill.sh");

    for (const checkedRead of [
      'if ! mkdir -p "$decrypt_work_directory" "$resource_registry_directory" >/dev/null 2>&1 ||',
      'if ! encrypted_size_raw="$(wc -c <"$backup_file" 2>/dev/null)"; then',
      'if ! decrypted_size_raw="$(wc -c <"$decrypted_bundle_candidate" 2>/dev/null)"; then',
      'if ! manifest_line_count_raw="$(wc -l <"$manifest_file" 2>/dev/null)" ||',
      'if ! actual_dump_sha256="$(cat "$dump_digest_file" 2>/dev/null)"; then',
      'if ! volume_create_output="$(cat "$docker_stdout_file" 2>/dev/null)"; then',
      'if ! docker_scalar="$(cat "$docker_stdout_file" 2>/dev/null)"; then',
      "if ! IFS='|' read -r \\",
    ]) {
      expect(script).toContain(checkedRead);
    }
    expect(script).not.toContain(
      'actual_dump_sha256="$(cat "$dump_digest_file")"',
    );
    expect(script).not.toContain(
      '[ "$(cat "$docker_stdout_file")" != "$volume" ]',
    );
    expect(script).not.toContain(
      'docker_scalar="$(cat "$docker_stdout_file")"',
    );
  });

  it("uses only exact-named create-start Docker lifecycles", () => {
    const script = read("infra/docker/restore-drill.sh");

    expect(script).not.toContain("docker run --rm");
    expect(script).not.toContain("docker run -d");
  });

  it("rejects impossible Docker reconciliation and settle settings", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "restore-config-"));
    const keyFile = path.join(sandbox, "encryption-key");
    const backupFile = path.join(sandbox, "backup.dump.gpg");
    const script = path.join(root, "infra/docker/restore-drill.sh");

    try {
      writeFileSync(keyFile, "0123456789abcdef0123456789abcdef", {
        mode: 0o600,
      });
      writeFileSync(backupFile, "cipher", { mode: 0o600 });
      const invalidCases = [
        { RESTORE_DECRYPT_RECONCILE_ATTEMPTS: "1" },
        { RESTORE_DOCKER_CREATE_SETTLE_SECONDS: "0" },
        { RESTORE_DOCKER_CREATE_SETTLE_SECONDS: "301" },
        { RESTORE_DOCKER_CREATE_SETTLE_SECONDS: "invalid" },
      ];

      for (const invalidConfig of invalidCases) {
        const result = spawnSync(
          "sh",
          [
            script,
            backupFile,
            "1",
            "1",
            "11111111-1111-1111-1111-111111111111",
            "fixture-session",
          ],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              BACKUP_ENCRYPTION_KEY_FILE: keyFile,
              RESTORE_MAX_ENCRYPTED_BYTES: "1",
              ...invalidConfig,
            },
          },
        );
        expect(result.status, JSON.stringify(invalidConfig)).toBe(64);
        expect(
          `${result.stdout}${result.stderr}`.trim(),
          JSON.stringify(invalidConfig),
        ).toBe("restore drill timeout configuration is invalid");
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("makes EXIT the only cleanup owner before repeated signals", () => {
    const script = read("infra/docker/restore-drill.sh");
    const onExit = script.match(/on_exit\(\) \{[\s\S]*?\n\}/u)?.[0];
    const onSignal = script.match(/on_signal\(\) \{[\s\S]*?\n\}/u)?.[0];

    expect(onExit).toMatch(/^on_exit\(\) \{\n  trap '' INT TERM/u);
    expect(onSignal).toMatch(/^on_signal\(\) \{\n  trap '' INT TERM/u);
    expect(onSignal).not.toContain("cleanup");
    expect(script).toContain("trap 'on_exit \"$?\"' EXIT");
  });

  it("fails closed when restore temporary-directory removal fails", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "restore-temp-cleanup-"));
    const bin = path.join(sandbox, "bin");
    const captures = path.join(sandbox, "captures");
    const restoreTmp = path.join(sandbox, "restore-tmp");
    const keyFile = path.join(sandbox, "encryption-key");
    const backupFile = path.join(sandbox, "backup.dump.gpg");
    const script = path.join(root, "infra/docker/restore-drill.sh");

    try {
      for (const directory of [bin, captures, restoreTmp]) {
        mkdirSync(directory, { recursive: true });
      }
      writeFileSync(keyFile, "0123456789abcdef0123456789abcdef", {
        mode: 0o600,
      });
      writeFileSync(backupFile, "cipher", { mode: 0o600 });
      writeFileSync(
        path.join(bin, "df"),
        `#!/bin/sh
set -eu
printf '%s\\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
printf '%s\\n' 'test 1048576 0 1048576 0% /restore'
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "rm"),
        `#!/bin/sh
set -eu
if [ "\${1:-}" = -rf ] && [ "\${2:-}" != "\${2#aap-restore-drill.}" ]; then
  exit 1
fi
case "\${2:-}" in
  "$RESTORE_TMP_ROOT"/aap-restore-drill.*) exit 1 ;;
esac
exec /bin/rm "$@"
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "docker"),
        `#!/bin/sh
set -eu
printf '%s\\n' "$*" >>"$CAPTURE_DIR/docker.calls"
case "$1" in
  create) exit 1 ;;
  rm) exit 0 ;;
  ps) exit 0 ;;
  stop) exit 0 ;;
  *) exit 1 ;;
esac
`,
        { mode: 0o700 },
      );

      const secret = "temp-cleanup-secret-sentinel";
      const result = spawnSync(
        "sh",
        [
          script,
          backupFile,
          "1",
          "1",
          "11111111-1111-1111-1111-111111111111",
          "fixture-session",
        ],
        {
          encoding: "utf8",
          timeout: 10_000,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            CAPTURE_DIR: captures,
            BACKUP_ENCRYPTION_KEY_FILE: keyFile,
            BACKUP_CRYPTO_IMAGE: "fake-crypto",
            RESTORE_TMP_ROOT: restoreTmp,
            RESTORE_MAX_ENCRYPTED_BYTES: "128",
            RESTORE_MAX_DECRYPTED_BYTES: "32",
            RESTORE_SPACE_SAFETY_BYTES: "0",
            RESTORE_DOCKER_CREATE_TIMEOUT_SECONDS: "1",
            RESTORE_DOCKER_CLI_TIMEOUT_SECONDS: "1",
            RESTORE_DOCKER_CLI_KILL_AFTER_SECONDS: "1",
            RESTORE_DECRYPT_RECONCILE_ATTEMPTS: "2",
            RESTORE_TEST_SECRET: secret,
          },
        },
      );
      const output = `${result.stdout}${result.stderr}`;

      expect(result.error, output).toBeUndefined();
      expect(result.status, output).toBe(1);
      expect(output.trim()).toBe(
        "restore drill decryption failed\nrestore drill cleanup failed",
      );
      expect(output).not.toContain(secret);
      expect(output).not.toContain(sandbox);
      expect(readdirSync(restoreTmp)).not.toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 15_000);

  it("propagates every safety-critical Docker lifecycle I/O failure", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "restore-io-faults-"));
    const wrappers = path.join(sandbox, "bin");
    const keyFile = path.join(sandbox, "encryption-key");
    const backupFile = path.join(sandbox, "backup.dump.gpg");
    const script = path.join(root, "infra/docker/restore-drill.sh");

    try {
      mkdirSync(wrappers);
      writeFileSync(keyFile, "0123456789abcdef0123456789abcdef", {
        mode: 0o600,
      });
      writeFileSync(backupFile, "cipher", { mode: 0o600 });
      writeFileSync(
        path.join(wrappers, "df"),
        `#!/bin/sh
set -eu
printf '%s\\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
printf '%s\\n' 'test 1048576 0 1048576 0% /restore'
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(wrappers, "mkdir"),
        `#!/bin/sh
set -eu
last=
for argument in "$@"; do last=$argument; done
case "$FAULT_MODE:$last" in
  register_mkdir:*/docker-resources/.10-decrypt.tmp) exit 1 ;;
esac
/bin/mkdir "$@"
case "$FAULT_MODE:$last" in
  register_write:*/docker-resources/.10-decrypt.tmp)
    /bin/mkdir "$last/type"
    ;;
esac
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(wrappers, "chmod"),
        `#!/bin/sh
set -eu
case "$FAULT_MODE:$*" in
  register_chmod:*'/docker-resources/.10-decrypt.tmp') exit 1 ;;
  outcome_chmod:*'/docker-resources/10-decrypt/.outcome.tmp') exit 1 ;;
esac
if [ "$FAULT_MODE" = supervisor_chmod ] && [ "$#" -eq 3 ]; then
  case "$2:$3" in
    */docker.stdout:*/docker.stderr) exit 1 ;;
  esac
fi
/bin/chmod "$@"
setup_directory=
for argument in "$@"; do
  case "$argument" in
    */runtime-select.stderr) setup_directory=\${argument%/*} ;;
  esac
done
case "$FAULT_MODE:$setup_directory" in
  supervisor_stdout_init:?*)
    /bin/rm -f "$setup_directory/docker.stdout"
    /bin/mkdir "$setup_directory/docker.stdout"
    ;;
  supervisor_diagnostic_init:?*)
    /bin/rm -f "$setup_directory/docker.stderr"
    /bin/mkdir "$setup_directory/docker.stderr"
    ;;
esac
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(wrappers, "mv"),
        `#!/bin/sh
set -eu
case "$FAULT_MODE:$1:$2" in
  register_rename:*/docker-resources/.10-decrypt.tmp:*/docker-resources/10-decrypt)
    exit 1
    ;;
  outcome_rename:*/docker-resources/10-decrypt/.outcome.tmp:*/docker-resources/10-decrypt/outcome)
    exit 1
    ;;
esac
exec /bin/mv "$@"
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(wrappers, "cat"),
        `#!/bin/sh
set -eu
[ "$#" -gt 0 ] || exec /bin/cat
case "$FAULT_MODE:$1" in
  query_read:*/docker.stdout)
    [ ! -f "$CAPTURE_DIR/query.ready" ] || exit 1
    ;;
  resource_type_read:*/docker-resources/10-decrypt/type|resource_name_read:*/docker-resources/10-decrypt/name|resource_outcome_read:*/docker-resources/10-decrypt/outcome)
    /bin/cat "$1"
    exit 1
    ;;
esac
exec /bin/cat "$@"
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(wrappers, "docker"),
        `#!/bin/sh
set -eu
printf '%s\\n' "$*" >>"$CAPTURE_DIR/docker.calls"
registry=$(find "$RESTORE_TMP_ROOT" -type d -name docker-resources -print | head -n 1)
command=$1
shift
case "$command" in
  create)
    previous=
    name=
    for argument in "$@"; do
      if [ "$previous" = --name ]; then name=$argument; fi
      previous=$argument
    done
    printf '%s\\n' "$name" >"$CAPTURE_DIR/container.name"
    : >"$CAPTURE_DIR/container.exists"
    case "$FAULT_MODE" in
      outcome_write)
        /bin/mkdir "$registry/10-decrypt/.outcome.tmp"
        printf '%s\\n' fake-container-id
        exit 0
        ;;
      outcome_chmod|outcome_rename|query_read)
        printf '%s\\n' fake-container-id
        exit 0
        ;;
      *) exit 1 ;;
    esac
    ;;
  ps)
    : >"$CAPTURE_DIR/query.ready"
    if [ "$FAULT_MODE" != query_read ] && [ -f "$CAPTURE_DIR/container.exists" ]; then
      /bin/cat "$CAPTURE_DIR/container.name"
    fi
    ;;
  rm)
    if [ "$FAULT_MODE" = query_read ]; then exit 1; fi
    if [ -f "$registry/10-decrypt/outcome" ]; then
      /bin/cat "$registry/10-decrypt/outcome" >"$CAPTURE_DIR/cleanup.outcome"
    fi
    /bin/rm -f "$CAPTURE_DIR/container.exists"
    ;;
  start) exit 1 ;;
  stop) exit 0 ;;
  *) exit 1 ;;
esac
`,
        { mode: 0o700 },
      );

      const cases = [
        { mode: "register_mkdir", expected: "registration", docker: false },
        { mode: "register_write", expected: "registration", docker: false },
        { mode: "register_chmod", expected: "registration", docker: false },
        { mode: "register_rename", expected: "registration", docker: false },
        {
          mode: "supervisor_stdout_init",
          expected: "cleanup",
          docker: false,
        },
        {
          mode: "supervisor_diagnostic_init",
          expected: "cleanup",
          docker: false,
        },
        { mode: "supervisor_chmod", expected: "cleanup", docker: false },
        { mode: "outcome_write", expected: "outcome", docker: true },
        { mode: "outcome_chmod", expected: "outcome", docker: true },
        { mode: "outcome_rename", expected: "outcome", docker: true },
        { mode: "query_read", expected: "cleanup", docker: true },
        { mode: "resource_type_read", expected: "entry", docker: true },
        { mode: "resource_name_read", expected: "entry", docker: true },
        { mode: "resource_outcome_read", expected: "entry", docker: true },
      ] as const;
      const failures: string[] = [];

      for (const testCase of cases) {
        const caseRoot = path.join(sandbox, testCase.mode);
        const captures = path.join(caseRoot, "captures");
        const restoreTmp = path.join(caseRoot, "restore-tmp");
        mkdirSync(captures, { recursive: true });
        mkdirSync(restoreTmp);
        const result = spawnSync(
          "sh",
          [
            script,
            backupFile,
            "1",
            "1",
            "11111111-1111-1111-1111-111111111111",
            "fixture-session",
          ],
          {
            encoding: "utf8",
            timeout: 8_000,
            env: {
              ...process.env,
              PATH: `${wrappers}:${process.env.PATH ?? ""}`,
              CAPTURE_DIR: captures,
              FAULT_MODE: testCase.mode,
              BACKUP_ENCRYPTION_KEY_FILE: keyFile,
              BACKUP_CRYPTO_IMAGE: "fake-crypto",
              RESTORE_TMP_ROOT: restoreTmp,
              RESTORE_MAX_ENCRYPTED_BYTES: "128",
              RESTORE_MAX_DECRYPTED_BYTES: "32",
              RESTORE_SPACE_SAFETY_BYTES: "0",
              RESTORE_DOCKER_CREATE_TIMEOUT_SECONDS: "1",
              RESTORE_DOCKER_CLI_TIMEOUT_SECONDS: "1",
              RESTORE_DOCKER_CLI_KILL_AFTER_SECONDS: "1",
              RESTORE_DECRYPT_RECONCILE_ATTEMPTS: "2",
              RESTORE_DOCKER_CREATE_SETTLE_SECONDS: "1",
            },
          },
        );
        const output = `${result.stdout}${result.stderr}`.trim();
        const callsPath = path.join(captures, "docker.calls");
        const calls = statSync(callsPath, { throwIfNoEntry: false })
          ? readFileSync(callsPath, "utf8")
          : "";
        const expectedOutput =
          testCase.expected === "registration" ||
          testCase.expected === "outcome"
            ? "restore drill decryption failed"
            : "restore drill decryption failed\nrestore drill cleanup failed";
        if (
          result.error !== undefined ||
          result.status !== 1 ||
          output !== expectedOutput ||
          output.includes(sandbox) ||
          readdirSync(restoreTmp).length !== 0 ||
          (testCase.docker ? calls.length === 0 : calls.length !== 0)
        ) {
          failures.push(
            `${testCase.mode}: status=${result.status} error=${result.error?.message ?? "none"} output=${JSON.stringify(output)} calls=${JSON.stringify(calls)} temp=${JSON.stringify(readdirSync(restoreTmp))}`,
          );
        }
        if (testCase.expected === "outcome") {
          const outcomePath = path.join(captures, "cleanup.outcome");
          const outcome = statSync(outcomePath, { throwIfNoEntry: false })
            ? readFileSync(outcomePath, "utf8").trim()
            : "missing";
          if (outcome !== "ambiguous" || calls.includes("start ")) {
            failures.push(
              `${testCase.mode}: outcome=${outcome} calls=${JSON.stringify(calls)}`,
            );
          }
        }
        if (testCase.expected === "entry" && /(?:^|\n)rm -f /u.test(calls)) {
          failures.push(`${testCase.mode}: cleanup used an unread entry`);
        }
        if (testCase.mode === "query_read") {
          const queryCount = calls
            .split("\n")
            .filter((call) => call.startsWith("ps -a ")).length;
          if (queryCount < 2) {
            failures.push(
              `${testCase.mode}: query read failure confirmed absence`,
            );
          }
        }
      }
      expect(failures).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 45_000);

  it("keeps the Docker resource registry protected and non-sensitive", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "restore-registry-mode-"));
    const bin = path.join(sandbox, "bin");
    const captures = path.join(sandbox, "captures");
    const restoreTmp = path.join(sandbox, "restore-tmp");
    const keyFile = path.join(sandbox, "encryption-key");
    const backupFile = path.join(sandbox, "backup.dump.gpg");
    const script = path.join(root, "infra/docker/restore-drill.sh");

    try {
      for (const directory of [bin, captures, restoreTmp]) {
        mkdirSync(directory, { recursive: true });
      }
      const secret = "registry-secret-sentinel";
      writeFileSync(keyFile, `0123456789abcdef${secret}`, { mode: 0o600 });
      writeFileSync(backupFile, "cipher", { mode: 0o600 });
      writeFileSync(
        path.join(bin, "df"),
        `#!/bin/sh
set -eu
printf '%s\\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
printf '%s\\n' 'test 1048576 0 1048576 0% /restore'
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "docker"),
        `#!/bin/sh
set -eu
mode_of() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}
registry=$(find "$RESTORE_TMP_ROOT" -type d -name docker-resources -print | head -n 1)
record="$registry/10-decrypt"
{
  printf 'registry|%s\\n' "$(mode_of "$registry")"
  for field in type name outcome; do
    printf '%s|%s|%s\\n' "$field" "$(mode_of "$record/$field")" "$(cat "$record/$field")"
  done
} >"$CAPTURE_DIR/registry.snapshot"
case "$1" in
  create) exit 1 ;;
  rm) exit 0 ;;
  ps) exit 0 ;;
  *) exit 1 ;;
esac
`,
        { mode: 0o700 },
      );

      const result = spawnSync(
        "sh",
        [
          script,
          backupFile,
          "1",
          "1",
          "11111111-1111-1111-1111-111111111111",
          "fixture-session",
        ],
        {
          encoding: "utf8",
          timeout: 10_000,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            CAPTURE_DIR: captures,
            BACKUP_ENCRYPTION_KEY_FILE: keyFile,
            BACKUP_CRYPTO_IMAGE: "fake-crypto",
            RESTORE_TMP_ROOT: restoreTmp,
            RESTORE_MAX_ENCRYPTED_BYTES: "128",
            RESTORE_MAX_DECRYPTED_BYTES: "32",
            RESTORE_SPACE_SAFETY_BYTES: "0",
            RESTORE_DOCKER_CREATE_TIMEOUT_SECONDS: "1",
            RESTORE_DOCKER_CLI_TIMEOUT_SECONDS: "1",
          },
        },
      );
      const output = `${result.stdout}${result.stderr}`;
      const snapshot = readFileSync(
        path.join(captures, "registry.snapshot"),
        "utf8",
      );

      expect(result.status, output).toBe(1);
      expect(output.trim()).toBe("restore drill decryption failed");
      expect(snapshot).toMatch(
        /^registry\|700\ntype\|600\|container\nname\|600\|aap-restore-decrypt-[A-Za-z0-9T-]+\noutcome\|600\|ambiguous\n$/u,
      );
      for (const protectedValue of [
        secret,
        keyFile,
        backupFile,
        "--passphrase-file",
        "docker.stderr",
      ]) {
        expect(snapshot).not.toContain(protectedValue);
      }
      expect(readdirSync(restoreTmp)).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 15_000);

  it("settles and removes a delayed resource after an ambiguous create", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "restore-late-create-"));
    const bin = path.join(sandbox, "bin");
    const captures = path.join(sandbox, "captures");
    const restoreTmp = path.join(sandbox, "restore-tmp");
    const keyFile = path.join(sandbox, "encryption-key");
    const backupFile = path.join(sandbox, "backup.dump.gpg");
    const script = path.join(root, "infra/docker/restore-drill.sh");

    try {
      for (const directory of [bin, captures, restoreTmp]) {
        mkdirSync(directory, { recursive: true });
      }
      writeFileSync(keyFile, "0123456789abcdef0123456789abcdef", {
        mode: 0o600,
      });
      writeFileSync(backupFile, "cipher", { mode: 0o600 });
      writeFileSync(
        path.join(bin, "df"),
        `#!/bin/sh
set -eu
printf '%s\\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
printf '%s\\n' 'test 1048576 0 1048576 0% /restore'
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "docker"),
        `#!/bin/sh
set -eu
printf '%s\\n' "$*" >>"$CAPTURE_DIR/docker.calls"

increment() {
  count=$(cat "$CAPTURE_DIR/rm.count" 2>/dev/null || printf 0)
  count=$((count + 1))
  printf '%s\\n' "$count" >"$CAPTURE_DIR/rm.count"
}

command=$1
shift
case "$command" in
  create)
    previous=
    for argument in "$@"; do
      if [ "$previous" = --name ]; then
        printf '%s\\n' "$argument" >"$CAPTURE_DIR/container.name"
      fi
      previous=$argument
    done
    (
      trap '' TERM INT HUP
      sleep 3.5
      : >"$CAPTURE_DIR/container.exists"
      : >"$CAPTURE_DIR/late-create.completed"
    ) &
    printf '%s\\n' "$!" >"$CAPTURE_DIR/late-create.pid"
    trap '' TERM INT HUP
    exec sleep 1000
    ;;
  rm)
    increment
    [ -f "$CAPTURE_DIR/container.exists" ] || exit 1
    /bin/rm -f "$CAPTURE_DIR/container.exists"
    ;;
  ps)
    if [ -f "$CAPTURE_DIR/container.exists" ]; then
      cat "$CAPTURE_DIR/container.name"
    fi
    ;;
  stop) exit 1 ;;
  *) exit 1 ;;
esac
`,
        { mode: 0o700 },
      );

      const result = spawnSync(
        "sh",
        [
          script,
          backupFile,
          "1",
          "1",
          "11111111-1111-1111-1111-111111111111",
          "fixture-session",
        ],
        {
          encoding: "utf8",
          timeout: 12_000,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            CAPTURE_DIR: captures,
            BACKUP_ENCRYPTION_KEY_FILE: keyFile,
            BACKUP_CRYPTO_IMAGE: "fake-crypto",
            RESTORE_TMP_ROOT: restoreTmp,
            RESTORE_MAX_ENCRYPTED_BYTES: "128",
            RESTORE_MAX_DECRYPTED_BYTES: "32",
            RESTORE_SPACE_SAFETY_BYTES: "0",
            RESTORE_DOCKER_CREATE_TIMEOUT_SECONDS: "1",
            RESTORE_DOCKER_CLI_TIMEOUT_SECONDS: "1",
            RESTORE_DOCKER_CLI_KILL_AFTER_SECONDS: "1",
            RESTORE_DECRYPT_RECONCILE_ATTEMPTS: "3",
            RESTORE_DOCKER_CREATE_SETTLE_SECONDS: "3",
          },
        },
      );
      const output = `${result.stdout}${result.stderr}`;
      spawnSync("sleep", ["1"]);

      expect(result.error, output).toBeUndefined();
      expect(result.status, output).toBe(1);
      expect(output.trim()).toBe("restore drill decryption failed");
      expect(
        statSync(path.join(captures, "late-create.completed"), {
          throwIfNoEntry: false,
        }),
      ).toBeDefined();
      expect(
        statSync(path.join(captures, "container.exists"), {
          throwIfNoEntry: false,
        }),
      ).toBeUndefined();
      expect(readdirSync(restoreTmp)).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 20_000);

  it("never truncates the configured ambiguous-create settle duration", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "restore-settle-floor-"));
    const bin = path.join(sandbox, "bin");
    const captures = path.join(sandbox, "captures");
    const restoreTmp = path.join(sandbox, "restore-tmp");
    const keyFile = path.join(sandbox, "encryption-key");
    const backupFile = path.join(sandbox, "backup.dump.gpg");
    const script = path.join(root, "infra/docker/restore-drill.sh");

    try {
      for (const directory of [bin, captures, restoreTmp]) {
        mkdirSync(directory, { recursive: true });
      }
      writeFileSync(keyFile, "0123456789abcdef0123456789abcdef", {
        mode: 0o600,
      });
      writeFileSync(backupFile, "cipher", { mode: 0o600 });
      writeFileSync(
        path.join(bin, "df"),
        `#!/bin/sh
set -eu
printf '%s\\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
printf '%s\\n' 'test 1048576 0 1048576 0% /restore'
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "date"),
        `#!/bin/sh
set -eu
if [ "\${1:-}" != +%s ]; then exec /bin/date "$@"; fi
count=$(cat "$CAPTURE_DIR/date.count" 2>/dev/null || printf 0)
count=$((count + 1))
printf '%s\\n' "$count" >"$CAPTURE_DIR/date.count"
if [ "$count" -eq 1 ]; then
  printf '%s\\n' 100
elif [ "$count" -eq 2 ]; then
  printf '%s\\n' 101
else
  sleep 1
  printf '%s\\n' 102
fi
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "docker"),
        `#!/bin/sh
set -eu
case "$1" in
  create)
    : >"$CAPTURE_DIR/create.failed"
    exit 1
    ;;
  rm) exit 1 ;;
  ps) exit 0 ;;
  *) exit 1 ;;
esac
`,
        { mode: 0o700 },
      );

      const startedAt = Date.now();
      const result = spawnSync(
        "sh",
        [
          script,
          backupFile,
          "1",
          "1",
          "11111111-1111-1111-1111-111111111111",
          "fixture-session",
        ],
        {
          encoding: "utf8",
          timeout: 6_000,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            CAPTURE_DIR: captures,
            BACKUP_ENCRYPTION_KEY_FILE: keyFile,
            BACKUP_CRYPTO_IMAGE: "fake-crypto",
            RESTORE_TMP_ROOT: restoreTmp,
            RESTORE_MAX_ENCRYPTED_BYTES: "128",
            RESTORE_MAX_DECRYPTED_BYTES: "32",
            RESTORE_SPACE_SAFETY_BYTES: "0",
            RESTORE_DOCKER_CREATE_TIMEOUT_SECONDS: "1",
            RESTORE_DOCKER_CLI_TIMEOUT_SECONDS: "1",
            RESTORE_DOCKER_CLI_KILL_AFTER_SECONDS: "1",
            RESTORE_DECRYPT_RECONCILE_ATTEMPTS: "2",
            RESTORE_DOCKER_CREATE_SETTLE_SECONDS: "1",
          },
        },
      );
      const elapsedMs = Date.now() - startedAt;
      const settleElapsedMs =
        Date.now() - statSync(path.join(captures, "create.failed")).mtimeMs;
      const output = `${result.stdout}${result.stderr}`.trim();

      expect(result.error, output).toBeUndefined();
      expect(result.status, output).toBe(1);
      expect(output).toBe(
        "restore drill decryption failed\nrestore drill cleanup failed",
      );
      expect(settleElapsedMs).toBeGreaterThanOrEqual(950);
      expect(elapsedMs).toBeLessThan(3_500);
      expect(readdirSync(restoreTmp)).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 10_000);

  it("fails the focused restore runner when its own cleanup fails", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "restore-runner-cleanup-"));
    const bin = path.join(sandbox, "bin");
    const captures = path.join(sandbox, "captures");
    const runtimeTmp = path.join(sandbox, "runtime-tmp");
    const runner = path.join(
      root,
      "docs/testing/run-restore-docker-lifecycle.sh",
    );

    try {
      for (const directory of [bin, captures, runtimeTmp]) {
        mkdirSync(directory, { recursive: true });
      }
      writeFileSync(
        path.join(bin, "docker"),
        `#!/bin/sh
set -eu
printf '%s\\n' "$*" >>"$CAPTURE_DIR/docker.calls"
command=$1
shift
case "$command" in
  build) exit 0 ;;
  create)
    previous=
    for argument in "$@"; do
      if [ "$previous" = --name ]; then
        printf '%s\\n' "$argument" >"$CAPTURE_DIR/container.name"
      fi
      previous=$argument
    done
    printf '%s\\n' fake-container-id
    ;;
  ps)
    case "$*" in
      *'name=^/'*) cat "$CAPTURE_DIR/container.name" ;;
    esac
    ;;
  start) exit 0 ;;
  wait)
    trap '' TERM INT HUP
    exec sleep 1000
    ;;
  rm) exit 0 ;;
  volume) exit 0 ;;
  image)
    [ "\${1:-}" != rm ] || exit 1
    ;;
  *) exit 1 ;;
esac
`,
        { mode: 0o700 },
      );

      const result = spawnSync("sh", [runner, "timeout"], {
        encoding: "utf8",
        timeout: 15_000,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          CAPTURE_DIR: captures,
          TMPDIR: runtimeTmp,
        },
      });
      const output = `${result.stdout}${result.stderr}`.trim();

      expect(result.error, output).toBeUndefined();
      expect(result.status, output).toBe(1);
      expect(output).toBe("restore lifecycle runner cleanup failed");
      expect(output).not.toContain("acceptance passed");
      expect(output).not.toContain(sandbox);
      expect(readdirSync(runtimeTmp)).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 20_000);

  it("keeps every nonzero launched create ambiguous until removal is proven", () => {
    const sandbox = mkdtempSync(
      path.join(tmpdir(), "restore-create-classification-"),
    );
    const bin = path.join(sandbox, "bin");
    const fixture = path.join(sandbox, "fixture");
    const backupFile = path.join(sandbox, "backup.dump.gpg");
    const keyFile = path.join(sandbox, "encryption-key");
    const dumpFile = path.join(fixture, "database.dump");
    const manifestFile = path.join(fixture, "skill-backup.manifest");
    const script = path.join(root, "infra/docker/restore-drill.sh");

    try {
      for (const directory of [bin, fixture]) {
        mkdirSync(directory, { recursive: true });
      }
      writeFileSync(keyFile, "0123456789abcdef0123456789abcdef", {
        mode: 0o600,
      });
      writeFileSync(dumpFile, "fake-custom-database-dump", { mode: 0o600 });
      const dumpSha256 = createHash("sha256")
        .update(readFileSync(dumpFile))
        .digest("hex");
      writeFileSync(
        manifestFile,
        `format_version=1
dump_sha256=${dumpSha256}
skill_registry_schema_version=1
skill_revision_count=0
skill_artifact_count=0
skill_file_count=0
`,
        { mode: 0o600 },
      );
      const archive = spawnSync(
        "tar",
        [
          "-cf",
          backupFile,
          "-C",
          fixture,
          "skill-backup.manifest",
          "database.dump",
        ],
        { encoding: "utf8" },
      );
      expect(archive.status, `${archive.stdout}${archive.stderr}`).toBe(0);

      writeFileSync(
        path.join(bin, "docker"),
        `#!/bin/sh
set -eu
printf '%s\n' "$*" >>"$CAPTURE_DIR/docker.calls"

container_resource() {
  resource_name=$1
  case "$resource_name" in
    aap-restore-decrypt-*) printf '%s\n' decrypt ;;
    aap-restore-bundle-*) printf '%s\n' bundle ;;
    aap-restore-digest-*) printf '%s\n' digest ;;
    aap-restore-registry-*) printf '%s\n' registry ;;
    aap-restore-drill-*) printf '%s\n' database ;;
    *) exit 1 ;;
  esac
}

command=$1
shift
case "$command" in
  create)
    previous=
    name=
    work_mount=
    input_mount=
    for argument in "$@"; do
      if [ "$previous" = --name ]; then
        name=$argument
      fi
      case "$argument" in
        *:/work) work_mount=\${argument%:/work} ;;
        *:/input:ro) input_mount=\${argument%:/input:ro} ;;
      esac
      previous=$argument
    done
    resource=$(container_resource "$name")
    printf '%s\n' "$name" >"$CAPTURE_DIR/$resource.name"
    [ -z "$work_mount" ] || printf '%s\n' "$work_mount" >"$CAPTURE_DIR/$resource.work"
    [ -z "$input_mount" ] || printf '%s\n' "$input_mount" >"$CAPTURE_DIR/$resource.input"
    case "$FAKE_DOCKER_MODE:$resource" in
      immediate_container:decrypt)
        : >"$CAPTURE_DIR/decrypt.exists"
        exit 1
        ;;
      absent_container:decrypt)
        exit 1
        ;;
    esac
    : >"$CAPTURE_DIR/$resource.exists"
    printf '%s\n' fake-container-id
    ;;
  start)
    target=$1
    resource=
    for candidate in decrypt bundle digest database registry; do
      if [ -f "$CAPTURE_DIR/$candidate.name" ] &&
         [ "$target" = "$(cat "$CAPTURE_DIR/$candidate.name")" ]; then
        resource=$candidate
      fi
    done
    case "$resource" in
      decrypt)
        work=$(cat "$CAPTURE_DIR/decrypt.work")
        cp "$FAKE_BACKUP_FILE" "$work/restored.bundle.partial"
        ;;
      bundle)
        work=$(cat "$CAPTURE_DIR/bundle.work")
        mkdir "$work/extracted"
        chmod 700 "$work/extracted"
        tar -xf "$work/restored.bundle" -C "$work/extracted"
        ;;
      digest)
        work=$(cat "$CAPTURE_DIR/digest.work")
        input=$(cat "$CAPTURE_DIR/digest.input")
        sha256sum "$input/database.dump" | awk '{ print $1 }' >"$work/dump-digest"
        ;;
      *) exit 1 ;;
    esac
    ;;
  wait) printf '%s\n' 0 ;;
  ps)
    for resource in decrypt bundle digest database registry; do
      if [ -f "$CAPTURE_DIR/$resource.exists" ]; then
        cat "$CAPTURE_DIR/$resource.name"
      fi
    done
    ;;
  rm)
    target=
    for argument in "$@"; do target=$argument; done
    for resource in decrypt bundle digest database registry; do
      if [ -f "$CAPTURE_DIR/$resource.name" ] &&
         [ "$target" = "$(cat "$CAPTURE_DIR/$resource.name")" ]; then
        if [ "$FAKE_DOCKER_MODE:$resource" = immediate_container:decrypt ]; then
          count=$(cat "$CAPTURE_DIR/decrypt.rm-count" 2>/dev/null || printf 0)
          count=$((count + 1))
          printf '%s\n' "$count" >"$CAPTURE_DIR/decrypt.rm-count"
          [ "$count" -gt 1 ] || exit 1
        fi
        [ -f "$CAPTURE_DIR/$resource.exists" ] || exit 1
        /bin/rm -f "$CAPTURE_DIR/$resource.exists"
        exit 0
      fi
    done
    exit 1
    ;;
  volume)
    subcommand=$1
    shift
    case "$subcommand" in
      create)
        printf '%s\n' "$1" >"$CAPTURE_DIR/volume.name"
        if [ "$FAKE_DOCKER_MODE" = late_volume ]; then
          (
            sleep 0.5
            : >"$CAPTURE_DIR/volume.exists"
            : >"$CAPTURE_DIR/late-volume.completed"
          ) &
          printf '%s\n' "$!" >"$CAPTURE_DIR/late-volume.pid"
          exit 1
        fi
        exit 1
        ;;
      rm)
        [ -f "$CAPTURE_DIR/volume.exists" ] || exit 1
        /bin/rm -f "$CAPTURE_DIR/volume.exists"
        ;;
      ls)
        if [ -f "$CAPTURE_DIR/volume.exists" ]; then
          cat "$CAPTURE_DIR/volume.name"
        fi
        ;;
      *) exit 1 ;;
    esac
    ;;
  *) exit 1 ;;
esac
`,
        { mode: 0o700 },
      );

      const cases = [
        {
          mode: "immediate_container",
          expectedOutput: "restore drill decryption failed",
        },
        {
          mode: "late_volume",
          expectedOutput: "restore drill failed database startup",
        },
        {
          mode: "absent_container",
          expectedOutput:
            "restore drill decryption failed\nrestore drill cleanup failed",
        },
      ] as const;
      const failures: string[] = [];

      for (const testCase of cases) {
        const caseRoot = path.join(sandbox, testCase.mode);
        const captures = path.join(caseRoot, "captures");
        const restoreTmp = path.join(caseRoot, "restore-tmp");
        mkdirSync(captures, { recursive: true });
        mkdirSync(restoreTmp);
        const startedAt = Date.now();
        const result = spawnSync(
          "sh",
          [
            script,
            backupFile,
            "1",
            "1",
            "11111111-1111-1111-1111-111111111111",
            "fixture-session",
          ],
          {
            encoding: "utf8",
            timeout: 10_000,
            env: {
              ...process.env,
              PATH: `${bin}:${process.env.PATH ?? ""}`,
              CAPTURE_DIR: captures,
              FAKE_BACKUP_FILE: backupFile,
              FAKE_DOCKER_MODE: testCase.mode,
              BACKUP_ENCRYPTION_KEY_FILE: keyFile,
              BACKUP_CRYPTO_IMAGE: "fake-crypto",
              RESTORE_TMP_ROOT: restoreTmp,
              RESTORE_MAX_ENCRYPTED_BYTES: "1048576",
              RESTORE_MAX_DECRYPTED_BYTES: "1048576",
              RESTORE_SPACE_SAFETY_BYTES: "0",
              RESTORE_DOCKER_CREATE_TIMEOUT_SECONDS: "1",
              RESTORE_DOCKER_CLI_TIMEOUT_SECONDS: "1",
              RESTORE_DOCKER_CLI_KILL_AFTER_SECONDS: "1",
              RESTORE_DECRYPT_TIMEOUT_SECONDS: "1",
              RESTORE_DECRYPT_RECONCILE_ATTEMPTS: "3",
              RESTORE_DOCKER_CREATE_SETTLE_SECONDS: "2",
            },
          },
        );
        const elapsedMs = Date.now() - startedAt;
        const output = `${result.stdout}${result.stderr}`.trim();
        spawnSync("sleep", ["1"]);
        const calls = readFileSync(path.join(captures, "docker.calls"), "utf8");
        const resourceMarkers = readdirSync(captures).filter((name) =>
          name.endsWith(".exists"),
        );
        if (
          result.error !== undefined ||
          result.status !== 1 ||
          output !== testCase.expectedOutput ||
          elapsedMs >= 6_000 ||
          readdirSync(restoreTmp).length !== 0 ||
          resourceMarkers.length !== 0 ||
          !/(?:^|\n)(?:rm -f|volume rm) /u.test(calls)
        ) {
          failures.push(
            `${testCase.mode}: status=${result.status} error=${result.error?.message ?? "none"} elapsed=${elapsedMs} output=${JSON.stringify(output)} temp=${JSON.stringify(readdirSync(restoreTmp))} markers=${JSON.stringify(resourceMarkers)} calls=${JSON.stringify(calls)}`,
          );
        }
        if (testCase.mode === "immediate_container") {
          const rmCountPath = path.join(captures, "decrypt.rm-count");
          const rmCount = statSync(rmCountPath, { throwIfNoEntry: false })
            ? Number(readFileSync(rmCountPath, "utf8").trim())
            : 0;
          if (!calls.includes("ps -a --filter") || rmCount < 2) {
            failures.push(
              `${testCase.mode}: missing exact query/remove evidence, rmCount=${rmCount}`,
            );
          }
        }
        if (testCase.mode === "late_volume") {
          const completed = statSync(
            path.join(captures, "late-volume.completed"),
            { throwIfNoEntry: false },
          );
          const pidPath = path.join(captures, "late-volume.pid");
          if (!completed || !statSync(pidPath, { throwIfNoEntry: false })) {
            failures.push(`${testCase.mode}: delayed create did not complete`);
          } else {
            const latePid = readFileSync(pidPath, "utf8").trim();
            const live = spawnSync("sh", ["-c", 'kill -0 "$1"', "sh", latePid]);
            if (live.status === 0) {
              failures.push(`${testCase.mode}: live pid ${latePid}`);
            }
          }
        }
        if (testCase.mode === "absent_container") {
          if (!calls.includes("ps -a --filter") || elapsedMs < 900) {
            failures.push(
              `${testCase.mode}: settle was skipped, elapsed=${elapsedMs}`,
            );
          }
        }
      }
      expect(failures).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 30_000);

  it("bounds representative late Docker lifecycle phases", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "restore-late-phases-"));
    const bin = path.join(sandbox, "bin");
    const fixture = path.join(sandbox, "fixture");
    const backupFile = path.join(sandbox, "backup.dump.gpg");
    const keyFile = path.join(sandbox, "encryption-key");
    const dumpFile = path.join(fixture, "database.dump");
    const manifestFile = path.join(fixture, "skill-backup.manifest");
    const script = path.join(root, "infra/docker/restore-drill.sh");

    try {
      for (const directory of [bin, fixture]) {
        mkdirSync(directory, { recursive: true });
      }
      writeFileSync(keyFile, "0123456789abcdef0123456789abcdef", {
        mode: 0o600,
      });
      writeFileSync(dumpFile, "fake-custom-database-dump", { mode: 0o600 });
      const dumpSha256 = createHash("sha256")
        .update(readFileSync(dumpFile))
        .digest("hex");
      writeFileSync(
        manifestFile,
        `format_version=1
dump_sha256=${dumpSha256}
skill_registry_schema_version=1
skill_revision_count=1
skill_artifact_count=1
skill_file_count=1
`,
        { mode: 0o600 },
      );
      const archive = spawnSync(
        "tar",
        [
          "-cf",
          backupFile,
          "-C",
          fixture,
          "skill-backup.manifest",
          "database.dump",
        ],
        { encoding: "utf8" },
      );
      expect(archive.status, `${archive.stdout}${archive.stderr}`).toBe(0);

      writeFileSync(
        path.join(bin, "docker"),
        `#!/bin/sh
set -eu
printf '%s\\n' "$*" >>"$CAPTURE_DIR/docker.calls"

hang_phase() {
  phase=$1
  printf '%s\\n' "$$" >"$CAPTURE_DIR/$phase.pids"
  : >"$CAPTURE_DIR/$phase.started"
  trap '' TERM INT HUP
  exec sleep 10
}

command=$1
shift
case "$command" in
  create)
    previous=
    name=
    work_mount=
    input_mount=
    for argument in "$@"; do
      if [ "$previous" = --name ]; then
        name=$argument
      fi
      case "$argument" in
        *:/work) work_mount=\${argument%:/work} ;;
        *:/input:ro) input_mount=\${argument%:/input:ro} ;;
      esac
      previous=$argument
    done
    case "$name" in
      aap-restore-decrypt-*) resource=decrypt ;;
      aap-restore-bundle-*) resource=bundle ;;
      aap-restore-digest-*) resource=digest ;;
      aap-restore-registry-*) resource=registry ;;
      aap-restore-drill-*) resource=database ;;
      *) exit 1 ;;
    esac
    printf '%s\\n' "$name" >"$CAPTURE_DIR/$resource.name"
    [ -z "$work_mount" ] || printf '%s\\n' "$work_mount" >"$CAPTURE_DIR/$resource.work"
    [ -z "$input_mount" ] || printf '%s\\n' "$input_mount" >"$CAPTURE_DIR/$resource.input"
    : >"$CAPTURE_DIR/$resource.exists"
    printf '%s\\n' fake-container-id
    ;;
  start)
    target=$1
    resource=
    for candidate in decrypt bundle digest database registry; do
      if [ -f "$CAPTURE_DIR/$candidate.name" ] &&
         [ "$target" = "$(cat "$CAPTURE_DIR/$candidate.name")" ]; then
        resource=$candidate
      fi
    done
    case "$resource" in
      decrypt)
        work=$(cat "$CAPTURE_DIR/decrypt.work")
        cp "$FAKE_BACKUP_FILE" "$work/restored.bundle.partial"
        ;;
      bundle)
        if [ "$FAKE_DOCKER_MODE" = bundle_validation_start_hang ]; then
          hang_phase bundle-validation-start
        fi
        work=$(cat "$CAPTURE_DIR/bundle.work")
        mkdir "$work/extracted"
        chmod 700 "$work/extracted"
        tar -xf "$work/restored.bundle" -C "$work/extracted"
        ;;
      digest)
        work=$(cat "$CAPTURE_DIR/digest.work")
        input=$(cat "$CAPTURE_DIR/digest.input")
        sha256sum "$input/database.dump" | awk '{ print $1 }' >"$work/dump-digest"
        ;;
      database)
        if [ "$FAKE_DOCKER_MODE" = database_start_hang ]; then
          hang_phase database-start
        fi
        ;;
      registry)
        if [ "$FAKE_DOCKER_MODE" = registry_migration_hang ]; then
          hang_phase registry-migration
        fi
        ;;
      *) exit 1 ;;
    esac
    ;;
  wait) printf '%s\\n' 0 ;;
  ps)
    for resource in decrypt bundle digest database registry; do
      if [ -f "$CAPTURE_DIR/$resource.exists" ]; then
        cat "$CAPTURE_DIR/$resource.name"
      fi
    done
    ;;
  exec)
    shift
    case "\${1:-}" in
      pg_isready) exit 0 ;;
      sh) exit 0 ;;
      pg_restore)
        if [ "$FAKE_DOCKER_MODE" = database_exec_migration_hang ]; then
          hang_phase database-exec-migration
        fi
        if [ "$FAKE_DOCKER_MODE" = registry_migration_hang ]; then
          exit 0
        fi
        exit 1
        ;;
      *) exit 1 ;;
    esac
    ;;
  rm)
    target=
    for argument in "$@"; do target=$argument; done
    for resource in decrypt bundle digest database registry; do
      if [ -f "$CAPTURE_DIR/$resource.name" ] &&
         [ "$target" = "$(cat "$CAPTURE_DIR/$resource.name")" ]; then
        /bin/rm -f "$CAPTURE_DIR/$resource.exists"
        exit 0
      fi
    done
    exit 0
    ;;
  volume)
    subcommand=$1
    shift
    case "$subcommand" in
      create)
        printf '%s\\n' "$1" >"$CAPTURE_DIR/volume.name"
        : >"$CAPTURE_DIR/volume.exists"
        if [ "$FAKE_DOCKER_MODE" = volume_create_hang ]; then
          hang_phase volume-create
        fi
        printf '%s\\n' "$1"
        ;;
      rm) /bin/rm -f "$CAPTURE_DIR/volume.exists" ;;
      ls)
        if [ -f "$CAPTURE_DIR/volume.exists" ]; then
          cat "$CAPTURE_DIR/volume.name"
        fi
        ;;
      *) exit 1 ;;
    esac
    ;;
  stop) exit 0 ;;
  *) exit 1 ;;
esac
`,
        { mode: 0o700 },
      );

      const lateCases = [
        [
          "bundle_validation_start_hang",
          "restore drill rejected invalid backup bundle",
        ],
        ["volume_create_hang", "restore drill failed database startup"],
        ["database_start_hang", "restore drill failed database startup"],
        [
          "database_exec_migration_hang",
          "restore drill failed database restore",
        ],
        [
          "registry_migration_hang",
          "restore drill failed skill registry migration verification",
        ],
      ] as const;
      const failures: string[] = [];

      for (const [mode, expectedOutput] of lateCases) {
        const caseRoot = path.join(sandbox, mode);
        const captures = path.join(caseRoot, "captures");
        const restoreTmp = path.join(caseRoot, "restore-tmp");
        mkdirSync(captures, { recursive: true });
        mkdirSync(restoreTmp);
        const startedAt = Date.now();
        const result = spawnSync(
          "sh",
          [
            script,
            backupFile,
            "1",
            "1",
            "11111111-1111-1111-1111-111111111111",
            "fixture-session",
          ],
          {
            encoding: "utf8",
            timeout: 10_000,
            env: {
              ...process.env,
              PATH: `${bin}:${process.env.PATH ?? ""}`,
              CAPTURE_DIR: captures,
              FAKE_BACKUP_FILE: backupFile,
              FAKE_DOCKER_MODE: mode,
              BACKUP_ENCRYPTION_KEY_FILE: keyFile,
              BACKUP_CRYPTO_IMAGE: "fake-crypto",
              RESTORE_SKILL_REGISTRY_IMAGE: "fake-skill-registry",
              RESTORE_TMP_ROOT: restoreTmp,
              RESTORE_MAX_DECRYPTED_BYTES: "1048576",
              RESTORE_SPACE_SAFETY_BYTES: "0",
              RESTORE_DOCKER_CREATE_TIMEOUT_SECONDS: "1",
              RESTORE_DOCKER_CLI_TIMEOUT_SECONDS: "1",
              RESTORE_DOCKER_CLI_KILL_AFTER_SECONDS: "1",
              RESTORE_DECRYPT_TIMEOUT_SECONDS: "1",
              RESTORE_DECRYPT_RECONCILE_ATTEMPTS: "3",
              RESTORE_DOCKER_CREATE_SETTLE_SECONDS: "2",
            },
          },
        );
        const elapsedMs = Date.now() - startedAt;
        const output = `${result.stdout}${result.stderr}`.trim();
        if (
          result.error !== undefined ||
          result.status !== 1 ||
          output !== expectedOutput ||
          elapsedMs >= 7_000 ||
          readdirSync(restoreTmp).length !== 0 ||
          readdirSync(captures).some((name) => name.endsWith(".exists"))
        ) {
          failures.push(
            `${mode}: status=${result.status} error=${result.error?.message ?? "none"} elapsed=${elapsedMs} output=${JSON.stringify(output)} temp=${JSON.stringify(readdirSync(restoreTmp))}`,
          );
        }
        for (const pidFile of readdirSync(captures).filter((name) =>
          name.endsWith(".pids"),
        )) {
          const pid = readFileSync(path.join(captures, pidFile), "utf8").trim();
          const live = spawnSync("sh", ["-c", 'kill -0 "$1"', "sh", pid]);
          if (live.status === 0) {
            failures.push(`${mode}: live pid ${pid}`);
          }
        }
      }

      expect(failures).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 45_000);

  it("contains pg_restore output and bounds database resource cleanup", () => {
    const sandbox = mkdtempSync(
      path.join(tmpdir(), "restore-output-boundary-"),
    );
    const bin = path.join(sandbox, "bin");
    const captures = path.join(sandbox, "captures");
    const fixture = path.join(sandbox, "fixture");
    const restoreTmp = path.join(sandbox, "restore-tmp");
    const backupFile = path.join(sandbox, "backup.dump.gpg");
    const keyFile = path.join(sandbox, "encryption-key");
    const dumpFile = path.join(fixture, "database.dump");
    const manifestFile = path.join(fixture, "skill-backup.manifest");
    const sentinel = "skill-registry-archive-bytes-sentinel-deadbeef";

    try {
      for (const directory of [bin, captures, fixture, restoreTmp]) {
        mkdirSync(directory, { recursive: true });
      }
      writeFileSync(keyFile, "0123456789abcdef0123456789abcdef", {
        mode: 0o600,
      });
      writeFileSync(dumpFile, "fake-custom-database-dump", { mode: 0o600 });
      const dumpSha256 = createHash("sha256")
        .update(readFileSync(dumpFile))
        .digest("hex");
      writeFileSync(
        manifestFile,
        `format_version=1
dump_sha256=${dumpSha256}
skill_registry_schema_version=1
skill_revision_count=1
skill_artifact_count=1
skill_file_count=1
`,
        { mode: 0o600 },
      );
      const archive = spawnSync(
        "tar",
        [
          "-cf",
          backupFile,
          "-C",
          fixture,
          "skill-backup.manifest",
          "database.dump",
        ],
        { encoding: "utf8" },
      );
      expect(archive.status, `${archive.stdout}${archive.stderr}`).toBe(0);

      writeFileSync(
        path.join(bin, "docker"),
        `#!/bin/sh
set -eu
printf '%s\n' "$*" >>"$CAPTURE_DIR/docker.calls"

increment() {
  counter=$1
  count=$(cat "$CAPTURE_DIR/$counter" 2>/dev/null || printf 0)
  count=$((count + 1))
  printf '%s\n' "$count" >"$CAPTURE_DIR/$counter"
  printf '%s\n' "$count"
}

command=$1
shift
case "$command" in
  create)
    previous=
    name=
    work_mount=
    input_mount=
    for argument in "$@"; do
      if [ "$previous" = --name ]; then
        name=$argument
      fi
      case "$argument" in
        *:/work) work_mount=\${argument%:/work} ;;
        *:/input:ro) input_mount=\${argument%:/input:ro} ;;
      esac
      previous=$argument
    done
    case "$name" in
      aap-restore-decrypt-*) resource=decrypt ;;
      aap-restore-bundle-*) resource=bundle ;;
      aap-restore-digest-*) resource=digest ;;
      aap-restore-registry-*) resource=registry ;;
      aap-restore-drill-*) resource=database ;;
      *) exit 1 ;;
    esac
    printf '%s\n' "$name" >"$CAPTURE_DIR/$resource.name"
    [ -z "$work_mount" ] || printf '%s\n' "$work_mount" >"$CAPTURE_DIR/$resource.work"
    [ -z "$input_mount" ] || printf '%s\n' "$input_mount" >"$CAPTURE_DIR/$resource.input"
    : >"$CAPTURE_DIR/$resource.exists"
    printf '%s\n' fake-container-id
    ;;
  start)
    target=$1
    resource=
    for candidate in decrypt bundle digest database registry; do
      if [ -f "$CAPTURE_DIR/$candidate.name" ] &&
         [ "$target" = "$(cat "$CAPTURE_DIR/$candidate.name")" ]; then
        resource=$candidate
      fi
    done
    case "$resource" in
      decrypt)
        work=$(cat "$CAPTURE_DIR/decrypt.work")
        cp "$FAKE_BACKUP_FILE" "$work/restored.bundle.partial"
        ;;
      bundle)
        work=$(cat "$CAPTURE_DIR/bundle.work")
        mkdir "$work/extracted"
        chmod 700 "$work/extracted"
        tar -xf "$work/restored.bundle" -C "$work/extracted"
        ;;
      digest)
        work=$(cat "$CAPTURE_DIR/digest.work")
        input=$(cat "$CAPTURE_DIR/digest.input")
        sha256sum "$input/database.dump" | awk '{ print $1 }' >"$work/dump-digest"
        ;;
      database|registry) ;;
      *) exit 1 ;;
    esac
    ;;
  wait) printf '%s\n' 0 ;;
  ps)
    for resource in decrypt bundle digest database registry; do
      if [ -f "$CAPTURE_DIR/$resource.exists" ]; then
        cat "$CAPTURE_DIR/$resource.name"
      fi
    done
    ;;
  exec)
    container=$1
    shift
    case "\${1:-}" in
      pg_isready) exit 0 ;;
      sh)
        if [ "$FAKE_DOCKER_MODE" = success_temp_rm_failure ]; then
          case "$*" in
            *"DELETE FROM skill_registry.skills"*|*"backup-insert-denied.sql"*|*"SELECT count(*) FROM skill_registry.skills"*)
              printf '%s\n' 'ERROR: 42501 permission denied' >&2
              exit 1
              ;;
          esac
        fi
        exit 0
        ;;
      pg_restore)
        if [ "$FAKE_DOCKER_MODE" = success_temp_rm_failure ]; then
          exit 0
        fi
        printf '%s\n' 'pg_restore raw stdout: ${sentinel}'
        printf '%s\n' 'pg_restore: error: COPY skill_registry.skill_revision_artifacts: ${sentinel}' >&2
        exit 1
        ;;
      psql)
        [ "$FAKE_DOCKER_MODE" = success_temp_rm_failure ] || exit 1
        case " $* " in
          *"BEGIN TRANSACTION READ ONLY"*) printf '%s\n' '1|1|1|1|1|1|0|0|0|t' ;;
          *"SELECT count(*) FROM drizzle.__drizzle_migrations"*) printf '%s\n' 8 ;;
          *"SELECT max(created_at) FROM drizzle.__drizzle_migrations"*) printf '%s\n' 1784480751832 ;;
          *"WHERE id = "*) printf '%s\n' 1 ;;
          *"WHERE session_id = "*) printf '%s\n' 1 ;;
          *"SELECT count(*) FROM public.users"*) printf '%s\n' 1 ;;
          *"SELECT count(*) FROM agno.agno_sessions"*) printf '%s\n' 1 ;;
          *"SELECT count(*) FROM agno.agno_schema_versions"*) printf '%s\n' 1 ;;
          *"to_regclass('public.users')"*) printf '%s\n' t ;;
          *) exit 1 ;;
        esac
        ;;
      *) exit 1 ;;
    esac
    ;;
  rm)
    target=
    for argument in "$@"; do target=$argument; done
    for resource in decrypt bundle digest database registry; do
      if [ -f "$CAPTURE_DIR/$resource.name" ] &&
         [ "$target" = "$(cat "$CAPTURE_DIR/$resource.name")" ]; then
        if [ "$resource" = database ]; then
          count=$(increment restore-container-rm.count)
          if [ "$FAKE_DOCKER_MODE" = container_hang ] && [ "$count" -eq 1 ]; then
            printf '%s\n' "$$" >"$CAPTURE_DIR/container-rm.pids"
            trap '' TERM INT HUP
            exec sleep 10
          fi
        fi
        /bin/rm -f "$CAPTURE_DIR/$resource.exists"
        exit 0
      fi
    done
    exit 1
    ;;
  volume)
    subcommand=$1
    shift
    case "$subcommand" in
      create)
        printf '%s\n' "$1" >"$CAPTURE_DIR/restore-volume.name"
        : >"$CAPTURE_DIR/restore-volume.exists"
        printf '%s\n' "$1"
        ;;
      rm)
        count=$(increment restore-volume-rm.count)
        if [ "$FAKE_DOCKER_MODE" = volume_hang ] && [ "$count" -eq 1 ]; then
          printf '%s\n' "$$" >"$CAPTURE_DIR/volume-rm.pids"
          trap '' TERM INT HUP
          exec sleep 10
        fi
        if [ "$FAKE_DOCKER_MODE" = volume_unknown ]; then
          exit 1
        fi
        /bin/rm -f "$CAPTURE_DIR/restore-volume.exists"
        ;;
      ls)
        increment restore-volume-query.count >/dev/null
        if [ "$FAKE_DOCKER_MODE" = volume_unknown ]; then
          printf '%s\n' 'daemon connection failed: ${sentinel}' >&2
          exit 1
        fi
        if [ -f "$CAPTURE_DIR/restore-volume.exists" ]; then
          cat "$CAPTURE_DIR/restore-volume.name"
        fi
        ;;
      *) exit 1 ;;
    esac
    ;;
  stop) exit 0 ;;
  *) exit 1 ;;
esac
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "rm"),
        `#!/bin/sh
set -eu
case "$FAKE_DOCKER_MODE:\${1:-}:\${2:-}" in
  success_temp_rm_failure:-rf:"$RESTORE_TMP_ROOT"/aap-restore-drill.*) exit 1 ;;
esac
exec /bin/rm "$@"
`,
        { mode: 0o700 },
      );

      const cases = [
        {
          mode: "baseline",
          expectedOutput: "restore drill failed database restore",
          expectedMaxElapsedMs: 5_000,
        },
        {
          mode: "container_hang",
          expectedOutput: "restore drill failed database restore",
          expectedMaxElapsedMs: 7_000,
        },
        {
          mode: "volume_hang",
          expectedOutput: "restore drill failed database restore",
          expectedMaxElapsedMs: 7_000,
        },
        {
          mode: "volume_unknown",
          expectedOutput:
            "restore drill failed database restore\nrestore drill cleanup failed",
          expectedMaxElapsedMs: 7_000,
        },
        {
          mode: "success_temp_rm_failure",
          expectedOutput: "restore drill cleanup failed",
          expectedMaxElapsedMs: 8_000,
        },
      ] as const;

      for (const testCase of cases) {
        const caseCaptures = path.join(captures, testCase.mode);
        const caseRestoreTmp = path.join(restoreTmp, testCase.mode);
        mkdirSync(caseCaptures);
        mkdirSync(caseRestoreTmp);
        const startedAt = Date.now();
        const result = spawnSync(
          "sh",
          [
            path.join(root, "infra/docker/restore-drill.sh"),
            backupFile,
            "1",
            "1",
            "11111111-1111-1111-1111-111111111111",
            "fixture-session",
          ],
          {
            encoding: "utf8",
            timeout: 15_000,
            env: {
              ...process.env,
              PATH: `${bin}:${process.env.PATH ?? ""}`,
              CAPTURE_DIR: caseCaptures,
              FAKE_BACKUP_FILE: backupFile,
              FAKE_DOCKER_MODE: testCase.mode,
              BACKUP_ENCRYPTION_KEY_FILE: keyFile,
              BACKUP_CRYPTO_IMAGE: "fake-crypto",
              RESTORE_SKILL_REGISTRY_IMAGE: "fake-skill-registry",
              RESTORE_TMP_ROOT: caseRestoreTmp,
              RESTORE_MAX_DECRYPTED_BYTES: "1048576",
              RESTORE_SPACE_SAFETY_BYTES: "0",
              RESTORE_DOCKER_CLI_TIMEOUT_SECONDS: "1",
              RESTORE_DOCKER_CLI_KILL_AFTER_SECONDS: "1",
              RESTORE_DECRYPT_RECONCILE_ATTEMPTS: "3",
            },
          },
        );
        const elapsedMs = Date.now() - startedAt;
        const output = `${result.stdout}${result.stderr}`;
        expect(result.error, `${testCase.mode}: ${output}`).toBeUndefined();
        expect(result.status, `${testCase.mode}: ${output}`).toBe(1);
        expect(output.trim(), testCase.mode).toBe(testCase.expectedOutput);
        expect(output, testCase.mode).not.toContain(sentinel);
        expect(output, testCase.mode).not.toContain("pg_restore:");
        expect(elapsedMs, testCase.mode).toBeLessThan(
          testCase.expectedMaxElapsedMs,
        );
        if (testCase.mode === "success_temp_rm_failure") {
          expect(readdirSync(caseRestoreTmp), testCase.mode).not.toEqual([]);
        } else {
          expect(readdirSync(caseRestoreTmp), testCase.mode).toEqual([]);
        }
        const dockerCalls = readFileSync(
          path.join(caseCaptures, "docker.calls"),
          "utf8",
        );
        expect(dockerCalls).toContain("exec aap-restore-drill-");
        expect(dockerCalls).toContain("pg_restore");
        expect(dockerCalls).toContain("rm -f aap-restore-drill-");
        expect(dockerCalls).toContain("volume rm aap-restore-drill-");
        if (testCase.mode !== "volume_unknown") {
          expect(
            statSync(path.join(caseCaptures, "database.exists"), {
              throwIfNoEntry: false,
            }),
            testCase.mode,
          ).toBeUndefined();
          expect(
            statSync(path.join(caseCaptures, "restore-volume.exists"), {
              throwIfNoEntry: false,
            }),
            testCase.mode,
          ).toBeUndefined();
        }
        for (const pidFile of readdirSync(caseCaptures).filter((name) =>
          name.endsWith(".pids"),
        )) {
          const pid = readFileSync(
            path.join(caseCaptures, pidFile),
            "utf8",
          ).trim();
          const live = spawnSync("sh", ["-c", 'kill -0 "$1"', "sh", pid]);
          expect(live.status, `${testCase.mode}: live pid ${pid}`).not.toBe(0);
        }
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 60_000);

  it("backs up all platform and AgentOS schemas through one protected dump", () => {
    const script = read("infra/docker/backup.sh");
    const backup = renderComposeFixture().services.backup;
    for (const schema of ["public", "drizzle", "agno", "skill_registry"]) {
      expect(script).toContain(`--schema=${schema}`);
    }
    expect(script).not.toContain("--schema=agent_control");
    expect(script.match(/pg_dump/g)).toHaveLength(1);
    expect(script).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(script).toContain("pg_export_snapshot()");
    expect(script).toContain('--snapshot="$snapshot_id"');
    expect(script).toContain("snapshot_group_pid");
    expect(script).toContain("mkfifo");
    expect(script).toContain("timeout");
    expect(script).toContain("BACKUP_DUMP_TIMEOUT_SECONDS");
    expect(script).toContain("BACKUP_DUMP_KILL_AFTER_SECONDS");
    expect(script).toContain("BACKUP_PROCESS_KILL_AFTER_SECONDS");
    expect(script).toContain("BACKUP_ENCRYPT_TIMEOUT_SECONDS");
    expect(script).toContain("BACKUP_ENCRYPT_KILL_AFTER_SECONDS");
    expect(script).toContain("BACKUP_SPACE_SAFETY_BYTES");
    expect(script).toContain("pg_database_size(current_database())");
    expect(script).toContain("backup temporary space budget is insufficient");
    expect(script).toContain("backup database dump failed");
    expect(script).toContain("terminate_process_group");
    expect(script).toContain(
      'timeout_command="${BACKUP_TIMEOUT_COMMAND:-/usr/bin/timeout}"',
    );
    expect(script.match(/setsid "\$timeout_command"/g)).toHaveLength(3);
    expect(script).not.toContain("timeout --foreground");
    expect(backup?.environment?.BACKUP_DUMP_TIMEOUT_SECONDS).toBe("3600");
    expect(backup?.environment?.BACKUP_DUMP_KILL_AFTER_SECONDS).toBe("5");
    expect(backup?.environment?.BACKUP_SNAPSHOT_TIMEOUT_SECONDS).toBe("3665");
    expect(backup?.environment?.BACKUP_SPACE_SAFETY_BYTES).toBe("67108864");
    expect(backup?.tmpfs).toContain("/tmp:rw,noexec,nosuid,size=1g");
    expect(read(".env.example")).toContain("BACKUP_TMPFS_SIZE=1g");
    expect(script).toContain("format_version=1");
    expect(script).toContain("dump_sha256=");
    expect(script).toContain("skill_registry_schema_version=");
    expect(script).toContain("skill_revision_count=");
    expect(script).toContain("skill_artifact_count=");
    expect(script).toContain("skill_file_count=");
    expect(script).toContain("skill-backup.manifest");
    expect(script).toContain("database.dump");
    expect(script).toContain("tar -cf");
    expect(script).toContain("--format=custom");
    expect(script).not.toContain("--no-owner");
    expect(script).not.toContain("--no-acl");
    expect(script).toContain("PGPASSFILE");
    expect(script).not.toContain("BACKUP_DATABASE_URL");
    expect(script).toContain("--symmetric");
    expect(script).toContain("--cipher-algo AES256");
    expect(script).toContain("--s2k-mode 3");
    expect(script).toContain("--s2k-digest-algo SHA512");
    expect(script).toContain("--s2k-count 65011712");
    expect(script).toContain("--force-mdc");
    expect(script).toContain("--pinentry-mode loopback");
    expect(script).toContain("--passphrase-file");
    expect(script).not.toContain("aes-256-cbc");
    expect(script).not.toContain("openssl enc");
    expect(script).toContain(".dump.gpg");
    expect(script).toContain('mv "$encrypted_temporary_file" "$backup_file"');
    expect(script).toContain("trap cleanup EXIT");
    expect(script).toContain("trap 'exit 130' INT");
    expect(script).toContain("trap 'exit 143' TERM");
    expect(backup?.depends_on?.migrate?.condition).toBe(
      "service_completed_successfully",
    );
    expect(backup?.depends_on?.["agent-migrate"]?.condition).toBe(
      "service_completed_successfully",
    );
    expect(backup?.depends_on?.["skill-registry-migrate"]?.condition).toBe(
      "service_completed_successfully",
    );
  });

  it("bounds restore decrypt input and expansion before plaintext can fill disk", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "restore-decrypt-bounds-"));
    const bin = path.join(sandbox, "bin");
    const captures = path.join(sandbox, "captures");
    const keyFile = path.join(sandbox, "encryption-key");
    const backupFile = path.join(sandbox, "backup.dump.gpg");
    const script = path.join(root, "infra/docker/restore-drill.sh");
    const args = [
      script,
      backupFile,
      "1",
      "1",
      "11111111-1111-1111-1111-111111111111",
      "fixture-session",
    ];

    try {
      mkdirSync(bin);
      mkdirSync(captures);
      writeFileSync(keyFile, "0123456789abcdef0123456789abcdef", {
        mode: 0o600,
      });
      writeFileSync(backupFile, "x".repeat(64), { mode: 0o600 });
      writeFileSync(
        path.join(bin, "docker"),
        `#!/bin/sh
set -eu
printf '%s\n' "$*" >>"$CAPTURE_DIR/docker.calls"
case "\${1:-}" in
  create)
    previous=
    for argument in "$@"; do
      if [ "$previous" = --name ]; then
        printf '%s\n' "$argument" >"$CAPTURE_DIR/container.name"
      fi
      case "$argument" in
        *:/work) printf '%s\n' "\${argument%:/work}" >"$CAPTURE_DIR/work" ;;
      esac
      previous=$argument
    done
    : >"$CAPTURE_DIR/container.exists"
    printf '%s\n' fake-decrypt-container-id
    ;;
  start)
    case "\${RESTORE_FAKE_MODE:-}" in
      expansion)
        work=$(cat "$CAPTURE_DIR/work")
        count=0
        while [ "$count" -lt 64 ]; do
          printf x
          count=$((count + 1))
        done >"$work/restored.bundle.partial"
        exit 1
        ;;
      *) exit 1 ;;
    esac
    ;;
  stop)
    exit 0
    ;;
  rm)
    rm -f "$CAPTURE_DIR/container.exists"
    ;;
  ps)
    if [ -f "$CAPTURE_DIR/container.exists" ]; then
      cat "$CAPTURE_DIR/container.name"
    fi
    ;;
esac
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "df"),
        `#!/bin/sh
set -eu
printf '%s\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
printf 'test 1048576 0 %s 0%% /restore\n' "\${RESTORE_FAKE_AVAILABLE_KIB:-1048576}"
`,
        { mode: 0o700 },
      );

      const commonEnv = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        CAPTURE_DIR: captures,
        BACKUP_ENCRYPTION_KEY_FILE: keyFile,
        BACKUP_CRYPTO_IMAGE: "fake-crypto",
        RESTORE_MAX_ENCRYPTED_BYTES: "128",
        RESTORE_MAX_DECRYPTED_BYTES: "32",
        RESTORE_DECRYPT_TIMEOUT_SECONDS: "5",
        RESTORE_DECRYPT_KILL_AFTER_SECONDS: "1",
        RESTORE_SPACE_SAFETY_BYTES: "16",
      };

      const oversized = spawnSync("sh", args, {
        encoding: "utf8",
        env: {
          ...commonEnv,
          RESTORE_MAX_ENCRYPTED_BYTES: "32",
          RESTORE_TMP_ROOT: path.join(sandbox, "oversized-tmp"),
        },
      });
      expect(`${oversized.stdout}${oversized.stderr}`.trim()).toBe(
        "restore drill rejected oversized encrypted backup",
      );
      expect(oversized.status).toBe(1);
      expect(readdirSync(captures)).toEqual([]);

      writeFileSync(backupFile, "cipher", { mode: 0o600 });
      const invalidBudget = spawnSync("sh", args, {
        encoding: "utf8",
        env: {
          ...commonEnv,
          RESTORE_SPACE_SAFETY_BYTES: "-1",
          RESTORE_TMP_ROOT: path.join(sandbox, "invalid-budget-tmp"),
        },
      });
      expect(`${invalidBudget.stdout}${invalidBudget.stderr}`.trim()).toBe(
        "restore drill space budget configuration is invalid",
      );
      expect(invalidBudget.status).toBe(64);
      expect(readdirSync(captures)).toEqual([]);

      const insufficientTmp = path.join(sandbox, "insufficient-tmp");
      mkdirSync(insufficientTmp);
      const insufficient = spawnSync("sh", args, {
        encoding: "utf8",
        env: {
          ...commonEnv,
          RESTORE_MAX_DECRYPTED_BYTES: "2048",
          RESTORE_FAKE_AVAILABLE_KIB: "1",
          RESTORE_TMP_ROOT: insufficientTmp,
        },
      });
      expect(`${insufficient.stdout}${insufficient.stderr}`.trim()).toBe(
        "restore drill temporary space budget is insufficient",
      );
      expect(insufficient.status).toBe(1);
      expect(readdirSync(captures)).toEqual([]);
      expect(readdirSync(insufficientTmp)).toEqual([]);

      const expansionTmp = path.join(sandbox, "expansion-tmp");
      mkdirSync(expansionTmp);
      const expansion = spawnSync("sh", args, {
        encoding: "utf8",
        env: {
          ...commonEnv,
          RESTORE_FAKE_MODE: "expansion",
          RESTORE_TMP_ROOT: expansionTmp,
        },
      });
      expect(`${expansion.stdout}${expansion.stderr}`.trim()).toBe(
        "restore drill rejected oversized decrypted bundle",
      );
      expect(expansion.status).toBe(1);
      expect(readdirSync(expansionTmp)).toEqual([]);
      expect(
        readFileSync(path.join(captures, "docker.calls"), "utf8"),
      ).toContain("create --name aap-restore-decrypt-");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 10_000);

  it("bounds and reconciles every decrypt Docker CLI phase", () => {
    const sandbox = mkdtempSync(
      path.join(tmpdir(), "restore-docker-lifecycle-"),
    );
    const bin = path.join(sandbox, "bin");
    const keyFile = path.join(sandbox, "encryption-key");
    const backupFile = path.join(sandbox, "backup.dump.gpg");
    const script = path.join(root, "infra/docker/restore-drill.sh");
    const args = [
      script,
      backupFile,
      "1",
      "1",
      "11111111-1111-1111-1111-111111111111",
      "fixture-session",
    ];

    try {
      mkdirSync(bin);
      writeFileSync(keyFile, "0123456789abcdef0123456789abcdef", {
        mode: 0o600,
      });
      writeFileSync(backupFile, "cipher", { mode: 0o600 });
      writeFileSync(
        path.join(bin, "df"),
        `#!/bin/sh
set -eu
printf '%s\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
printf '%s\n' 'test 1048576 0 1048576 0% /restore'
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "signal-driver"),
        `#!/bin/sh
set -u
"$@" &
child=$!
attempt=0
until [ -f "$SIGNAL_PHASE_MARKER" ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 100 ]; then
    kill -KILL "$child" >/dev/null 2>&1 || true
    wait "$child" >/dev/null 2>&1 || true
    exit 88
  fi
  sleep 0.1
done
kill -TERM "$child"
attempt=0
until [ -f "$SECOND_SIGNAL_PHASE_MARKER" ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 100 ]; then
    kill -KILL "$child" >/dev/null 2>&1 || true
    wait "$child" >/dev/null 2>&1 || true
    exit 89
  fi
  sleep 0.1
done
kill -INT "$child" >/dev/null 2>&1 || true
wait "$child"
exit $?
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "docker"),
        `#!/bin/sh
set -eu
printf '%s\n' "$*" >>"$CAPTURE_DIR/docker.calls"

hang_phase() {
  phase=$1
  printf '%s\n' "$$" >>"$CAPTURE_DIR/$phase.pids"
  : >"$CAPTURE_DIR/$phase.started"
  trap '' TERM INT HUP
  exec sleep 1000
}

command=$1
shift
case "$command" in
  create)
    case "$FAKE_DOCKER_MODE" in
      create_hang|signal_create) hang_phase create ;;
    esac
    previous=
    for argument in "$@"; do
      if [ "$previous" = --name ]; then
        printf '%s\n' "$argument" >"$CAPTURE_DIR/container.name"
      fi
      previous=$argument
    done
    : >"$CAPTURE_DIR/container.exists"
    printf '%s\n' fake-decrypt-container-id
    ;;
  start)
    case "$FAKE_DOCKER_MODE" in
      start_hang|signal_start)
        hang_phase start
        ;;
    esac
    exit 0
    ;;
  wait)
    case "$FAKE_DOCKER_MODE" in
      wait_hang|signal_wait) hang_phase wait ;;
    esac
    printf '%s\n' 1
    ;;
  rm)
    : >"$CAPTURE_DIR/rm.started"
    case "$FAKE_DOCKER_MODE" in
      rm_hang)
        if [ ! -f "$CAPTURE_DIR/rm.hung-once" ]; then
          : >"$CAPTURE_DIR/rm.hung-once"
          hang_phase rm
        fi
        ;;
    esac
    [ -f "$CAPTURE_DIR/container.exists" ] || exit 1
    rm -f "$CAPTURE_DIR/container.exists"
    ;;
  ps)
    if [ -f "$CAPTURE_DIR/container.exists" ]; then
      cat "$CAPTURE_DIR/container.name"
    fi
    ;;
  *) exit 1 ;;
esac
`,
        { mode: 0o700 },
      );

      const baseEnv = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        BACKUP_ENCRYPTION_KEY_FILE: keyFile,
        BACKUP_CRYPTO_IMAGE: "fake-crypto",
        RESTORE_MAX_ENCRYPTED_BYTES: "128",
        RESTORE_MAX_DECRYPTED_BYTES: "32",
        RESTORE_SPACE_SAFETY_BYTES: "0",
        RESTORE_DOCKER_CREATE_TIMEOUT_SECONDS: "1",
        RESTORE_DOCKER_CLI_TIMEOUT_SECONDS: "1",
        RESTORE_DOCKER_CLI_KILL_AFTER_SECONDS: "1",
        RESTORE_DECRYPT_TIMEOUT_SECONDS: "1",
        RESTORE_DECRYPT_KILL_AFTER_SECONDS: "1",
        RESTORE_DECRYPT_RECONCILE_ATTEMPTS: "3",
        RESTORE_DOCKER_CREATE_SETTLE_SECONDS: "2",
      };
      const cases = [
        [
          "create_hang",
          "restore drill decryption failed\nrestore drill cleanup failed",
          "create",
        ],
        ["start_hang", "restore drill decryption timed out", "start"],
        ["wait_hang", "restore drill decryption timed out", "wait"],
        ["rm_hang", "restore drill decryption failed", "rm"],
      ] as const;

      for (const [mode, expectedOutput, expectedPhase] of cases) {
        const caseRoot = path.join(sandbox, mode);
        const captures = path.join(caseRoot, "captures");
        const restoreTmp = path.join(caseRoot, "restore-tmp");
        mkdirSync(captures, { recursive: true });
        mkdirSync(restoreTmp);
        const startedAt = Date.now();
        const result = spawnSync("sh", args, {
          encoding: "utf8",
          timeout: 10_000,
          env: {
            ...baseEnv,
            CAPTURE_DIR: captures,
            FAKE_DOCKER_MODE: mode,
            RESTORE_TMP_ROOT: restoreTmp,
          },
        });
        const elapsedMs = Date.now() - startedAt;
        const output = `${result.stdout}${result.stderr}`;
        expect(result.error, `${mode}: ${output}`).toBeUndefined();
        expect(result.status, `${mode}: ${output}`).toBe(1);
        expect(output.trim(), mode).toBe(expectedOutput);
        expect(elapsedMs, mode).toBeLessThan(8_000);
        expect(readdirSync(restoreTmp), mode).toEqual([]);
        expect(
          statSync(path.join(captures, "container.exists"), {
            throwIfNoEntry: false,
          }),
          mode,
        ).toBeUndefined();
        const calls = readFileSync(path.join(captures, "docker.calls"), "utf8");
        expect(calls, mode).toContain("create --name aap-restore-decrypt-");
        expect(calls, mode).toContain(`${expectedPhase}`);
        for (const pidFile of readdirSync(captures).filter((name) =>
          name.endsWith(".pids"),
        )) {
          for (const pid of readFileSync(path.join(captures, pidFile), "utf8")
            .trim()
            .split("\n")) {
            const live = spawnSync("sh", ["-c", 'kill -0 "$1"', "sh", pid]);
            expect(live.status, `${mode}: live pid ${pid}`).not.toBe(0);
          }
        }
      }

      for (const phase of ["create", "start", "wait"] as const) {
        const mode = `signal_${phase}`;
        const caseRoot = path.join(sandbox, mode);
        const captures = path.join(caseRoot, "captures");
        const restoreTmp = path.join(caseRoot, "restore-tmp");
        mkdirSync(captures, { recursive: true });
        mkdirSync(restoreTmp);
        const startedAt = Date.now();
        const result = spawnSync(path.join(bin, "signal-driver"), args, {
          encoding: "utf8",
          timeout: 10_000,
          env: {
            ...baseEnv,
            CAPTURE_DIR: captures,
            FAKE_DOCKER_MODE: mode,
            RESTORE_TMP_ROOT: restoreTmp,
            SIGNAL_PHASE_MARKER: path.join(captures, `${phase}.started`),
            SECOND_SIGNAL_PHASE_MARKER: path.join(captures, "rm.started"),
          },
        });
        const elapsedMs = Date.now() - startedAt;
        const output = `${result.stdout}${result.stderr}`;
        expect(result.error, `${mode}: ${output}`).toBeUndefined();
        expect(result.status, `${mode}: ${output}`).toBe(143);
        expect(output.trim(), mode).toBe(
          phase === "create"
            ? "restore drill interrupted\nrestore drill cleanup failed"
            : "restore drill interrupted",
        );
        expect(elapsedMs, mode).toBeLessThan(8_000);
        expect(readdirSync(restoreTmp), mode).toEqual([]);
        expect(
          statSync(path.join(captures, "container.exists"), {
            throwIfNoEntry: false,
          }),
          mode,
        ).toBeUndefined();
        for (const pidFile of readdirSync(captures).filter((name) =>
          name.endsWith(".pids"),
        )) {
          for (const pid of readFileSync(path.join(captures, pidFile), "utf8")
            .trim()
            .split("\n")) {
            const live = spawnSync("sh", ["-c", 'kill -0 "$1"', "sh", pid]);
            expect(live.status, `${mode}: live pid ${pid}`).not.toBe(0);
          }
        }
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 80_000);

  it("fails closed when decrypt container identity queries are unknown", () => {
    const sandbox = mkdtempSync(
      path.join(tmpdir(), "restore-docker-query-state-"),
    );
    const bin = path.join(sandbox, "bin");
    const keyFile = path.join(sandbox, "encryption-key");
    const backupFile = path.join(sandbox, "backup.dump.gpg");
    const script = path.join(root, "infra/docker/restore-drill.sh");
    const args = [
      script,
      backupFile,
      "1",
      "1",
      "11111111-1111-1111-1111-111111111111",
      "fixture-session",
    ];

    try {
      mkdirSync(bin);
      writeFileSync(keyFile, "0123456789abcdef0123456789abcdef", {
        mode: 0o600,
      });
      writeFileSync(backupFile, "cipher", { mode: 0o600 });
      writeFileSync(
        path.join(bin, "df"),
        `#!/bin/sh
set -eu
printf '%s\\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
printf '%s\\n' 'test 1048576 0 1048576 0% /restore'
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "signal-driver"),
        `#!/bin/sh
set -u
"$@" &
child=$!
attempt=0
until [ -f "$SIGNAL_PHASE_MARKER" ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 100 ]; then
    kill -KILL "$child" >/dev/null 2>&1 || true
    wait "$child" >/dev/null 2>&1 || true
    exit 88
  fi
  sleep 0.1
done
kill -TERM "$child"
wait "$child"
exit $?
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "docker"),
        `#!/bin/sh
set -eu
printf '%s\\n' "$*" >>"$CAPTURE_DIR/docker.calls"

increment() {
  counter=$1
  count=$(cat "$CAPTURE_DIR/$counter" 2>/dev/null || printf 0)
  count=$((count + 1))
  printf '%s\\n' "$count" >"$CAPTURE_DIR/$counter"
  printf '%s\\n' "$count"
}

command=$1
shift
case "$command" in
  create)
    previous=
    for argument in "$@"; do
      if [ "$previous" = --name ]; then
        printf '%s\\n' "$argument" >"$CAPTURE_DIR/decrypt.name"
      fi
      previous=$argument
    done
    case "$FAKE_DOCKER_MODE" in
      exact_absent) ;;
      *) : >"$CAPTURE_DIR/container.exists" ;;
    esac
    : >"$CAPTURE_DIR/create.started"
    case "$FAKE_DOCKER_MODE" in
      signal_permanent_unknown)
        printf '%s\\n' "$$" >"$CAPTURE_DIR/create.pids"
        trap '' TERM INT HUP
        exec sleep 1000
        ;;
    esac
    exit 0
    ;;
  rm)
    count=$(increment rm.count)
    case "$FAKE_DOCKER_MODE:$count" in
      transient_unknown_exists:3)
        rm -f "$CAPTURE_DIR/container.exists"
        exit 0
        ;;
    esac
    exit 1
    ;;
  ps)
    count=$(increment query.count)
    case "$FAKE_DOCKER_MODE:$count" in
      transient_unknown_exists:1)
        printf '%s\\n' 'daemon connection failed: sensitive diagnostic' >&2
        exit 1
        ;;
      transient_unknown_exists:2)
        cat "$CAPTURE_DIR/decrypt.name"
        ;;
      exact_absent:*)
        exit 0
        ;;
      permanent_unexpected:*)
        printf '%s\\n' unexpected-container-name
        ;;
      *)
        printf '%s\\n' 'daemon connection failed: sensitive diagnostic' >&2
        exit 1
        ;;
    esac
    ;;
  stop) exit 1 ;;
  *) exit 1 ;;
esac
`,
        { mode: 0o700 },
      );

      const baseEnv = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        BACKUP_ENCRYPTION_KEY_FILE: keyFile,
        BACKUP_CRYPTO_IMAGE: "fake-crypto",
        RESTORE_MAX_ENCRYPTED_BYTES: "128",
        RESTORE_MAX_DECRYPTED_BYTES: "32",
        RESTORE_SPACE_SAFETY_BYTES: "0",
        RESTORE_DOCKER_CREATE_TIMEOUT_SECONDS: "1",
        RESTORE_DOCKER_CLI_TIMEOUT_SECONDS: "1",
        RESTORE_DOCKER_CLI_KILL_AFTER_SECONDS: "1",
        RESTORE_DECRYPT_TIMEOUT_SECONDS: "1",
        RESTORE_DECRYPT_KILL_AFTER_SECONDS: "1",
        RESTORE_DECRYPT_RECONCILE_ATTEMPTS: "3",
      };
      const cases = [
        {
          mode: "permanent_unknown",
          expectedStatus: 1,
          expectedOutput:
            "restore drill decryption failed\nrestore drill cleanup failed",
          expectedRmCount: "3",
          expectedQueryCount: "4",
          containerMayRemain: true,
          signal: false,
        },
        {
          mode: "transient_unknown_exists",
          expectedStatus: 1,
          expectedOutput: "restore drill decryption failed",
          expectedRmCount: "3",
          expectedQueryCount: "3",
          containerMayRemain: false,
          signal: false,
        },
        {
          mode: "exact_absent",
          expectedStatus: 1,
          expectedOutput: "restore drill decryption failed",
          expectedRmCount: "2",
          expectedQueryCount: "3",
          containerMayRemain: false,
          signal: false,
        },
        {
          mode: "permanent_unexpected",
          expectedStatus: 1,
          expectedOutput:
            "restore drill decryption failed\nrestore drill cleanup failed",
          expectedRmCount: "3",
          expectedQueryCount: "4",
          containerMayRemain: true,
          signal: false,
        },
        {
          mode: "signal_permanent_unknown",
          expectedStatus: 143,
          expectedOutput:
            "restore drill interrupted\nrestore drill cleanup failed",
          expectedRmCount: "at_least_one",
          expectedQueryCount: "at_least_one",
          containerMayRemain: true,
          signal: true,
        },
      ] as const;

      for (const testCase of cases) {
        const caseRoot = path.join(sandbox, testCase.mode);
        const captures = path.join(caseRoot, "captures");
        const restoreTmp = path.join(caseRoot, "restore-tmp");
        mkdirSync(captures, { recursive: true });
        mkdirSync(restoreTmp);
        const spawnArgs = testCase.signal
          ? [path.join(bin, "signal-driver"), ...args]
          : ["sh", ...args];
        const result = spawnSync(spawnArgs[0], spawnArgs.slice(1), {
          encoding: "utf8",
          timeout: 15_000,
          env: {
            ...baseEnv,
            CAPTURE_DIR: captures,
            FAKE_DOCKER_MODE: testCase.mode,
            RESTORE_TMP_ROOT: restoreTmp,
            SIGNAL_PHASE_MARKER: path.join(captures, "create.started"),
          },
        });
        const output = `${result.stdout}${result.stderr}`;
        expect(result.error, `${testCase.mode}: ${output}`).toBeUndefined();
        expect(result.status, `${testCase.mode}: ${output}`).toBe(
          testCase.expectedStatus,
        );
        expect(output.trim(), testCase.mode).toBe(testCase.expectedOutput);
        const rmCount = readFileSync(
          path.join(captures, "rm.count"),
          "utf8",
        ).trim();
        const queryCount = readFileSync(
          path.join(captures, "query.count"),
          "utf8",
        ).trim();
        if (testCase.expectedRmCount === "at_least_one") {
          expect(Number(rmCount), testCase.mode).toBeGreaterThanOrEqual(1);
          expect(Number(queryCount), testCase.mode).toBeGreaterThanOrEqual(1);
        } else {
          expect(rmCount, testCase.mode).toBe(testCase.expectedRmCount);
          expect(queryCount, testCase.mode).toBe(testCase.expectedQueryCount);
        }
        expect(
          statSync(path.join(captures, "container.exists"), {
            throwIfNoEntry: false,
          }) !== undefined,
          testCase.mode,
        ).toBe(testCase.containerMayRemain);
        expect(output, testCase.mode).not.toContain("sensitive diagnostic");
        expect(readdirSync(restoreTmp), testCase.mode).toEqual([]);
        if (testCase.signal) {
          const pid = readFileSync(
            path.join(captures, "create.pids"),
            "utf8",
          ).trim();
          const live = spawnSync("sh", ["-c", 'kill -0 "$1"', "sh", pid]);
          expect(live.status, `live pid ${pid}`).not.toBe(0);
        }
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 60_000);

  it("documents immutable registry recovery without weakening secret preflights", () => {
    const runbook = read("infra/docker/README.md");

    expect(runbook).toContain("skill-registry-bootstrap");
    expect(runbook).toContain("skill-registry-migrate");
    expect(runbook).toContain("agent / skill-registry → web → proxy/backup");
    expect(runbook).toContain(
      "`skill_registry`保存长期、不可变的 Skill 审核证据",
    );
    expect(runbook).toContain(
      "`agent_control`仍是短生命周期控制面，不进入备份",
    );
    expect(runbook).toContain(
      "schema version、revision/artifact/file 的源端计数",
    );
    expect(runbook).toContain("PostgreSQL 内验证每个 archive 的 SHA-256");
    expect(runbook).toContain("空 Registry 使用显式计数`0/0/0`");
    expect(runbook).toContain("BACKUP_DATABASE_PASSWORD_FILE");
    expect(runbook).toContain("BACKUP_ENCRYPTION_KEY_FILE");
    expect(runbook).toContain("BACKUP_CRYPTO_IMAGE");
    expect(runbook).toContain("RESTORE_TMP_ROOT");
    expect(runbook).toContain("BACKUP_DUMP_TIMEOUT_SECONDS=3600");
    expect(runbook).toContain("BACKUP_DUMP_KILL_AFTER_SECONDS=5");
    expect(runbook).toContain("BACKUP_SNAPSHOT_TIMEOUT_SECONDS=3665");
    expect(runbook).toContain(
      "Registry 计数来自加密 bundle 内、与 dump 同一导出 snapshot 的 manifest",
    );
    expect(runbook).toContain(
      "infra/docker/restore-drill.sh \\\n  /secure/path/ai-agent-platform-YYYYMMDDTHHMMSSZ.dump.gpg \\\n  EXPECTED_USERS EXPECTED_AGNO_SESSIONS USER_FIXTURE_ID AGNO_SESSION_FIXTURE_ID",
    );
    expect(runbook).toContain(
      "`docs/testing/run-restore-docker-lifecycle.sh`验证真实 Docker",
    );
    expect(runbook).toContain(
      "`docs/testing/run-agentos-backup-restore.sh`验证当前完整 OpenPGP 备份恢复链",
    );
    expect(runbook).toContain("`pnpm secrets:preflight`");
    expect(runbook).toContain("不得绕过`run-with-secret-env.sh`");
    expect(runbook).toContain("宽于`0600`的宿主 Secret");
    expect(runbook).toContain("密钥轮换");
    expect(runbook).toContain("README 和测试配置中禁止放真实凭据");
  });

  it("keeps backup secrets out of command argv, bounds hung dumps, and removes plaintext work files", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "backup-secret-boundary-"));
    const bin = path.join(sandbox, "bin");
    const captures = path.join(sandbox, "captures");
    const backups = path.join(sandbox, "backups");
    const temporary = path.join(sandbox, "temporary");
    const passwordFile = path.join(sandbox, "database-password");
    const encryptionKeyFile = path.join(sandbox, "encryption-key");
    const databasePassword = "backup:password\\sentinel";
    const encryptionKey = "encryption-key-sentinel-0123456789abcdef";
    const fakeDump = "fake-custom-dump";
    const fakeDumpSha256 = createHash("sha256").update(fakeDump).digest("hex");
    const hungProcessIds: number[] = [];
    let hungFallbackWatchdogPid: number | undefined;

    try {
      for (const directory of [bin, captures, backups, temporary]) {
        mkdirSync(directory, { recursive: true });
      }
      writeFileSync(passwordFile, databasePassword, { mode: 0o600 });
      writeFileSync(encryptionKeyFile, encryptionKey, { mode: 0o600 });
      writeFileSync(
        path.join(bin, "timeout"),
        `#!/bin/sh
set -eu
while [ "$#" -gt 0 ]; do
  case "$1" in
    -s|-k|--signal|--kill-after) shift 2 ;;
    --signal=*|--kill-after=*|--foreground) shift ;;
    --) shift; break ;;
    *) shift; break ;;
  esac
done
exec "$@"
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "setsid"),
        `#!/bin/sh
set -eu
exec "$@"
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "psql"),
        `#!/bin/sh
set -eu
printf '%s\\n' "$@" >"$CAPTURE_DIR/psql.argv"
while IFS= read -r command; do
  printf '%s\\n' "$command" >>"$CAPTURE_DIR/psql.commands"
  case "$command" in
    *pg_export_snapshot*) printf '%s\\n' '00000003-0000001B-1|1|2|2|3|1024' ;;
    '\\q') exit 0 ;;
  esac
done
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "pg_dump"),
        `#!/bin/sh
set -eu
printf '%s\\n' "$@" >"$CAPTURE_DIR/pg_dump.argv"
cp "$PGPASSFILE" "$CAPTURE_DIR/pgpass"
output=
for argument in "$@"; do
  case "$argument" in
    --file=*) output=\${argument#--file=} ;;
  esac
done
test -n "$output"
printf '${fakeDump}' >"$output"
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "sha256sum"),
        `#!/bin/sh
set -eu
printf '%s  %s\\n' '${fakeDumpSha256}' "$1"
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "gpg"),
        `#!/bin/sh
set -eu
printf '%s\\n' "$@" >"$CAPTURE_DIR/gpg.argv"
output=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) shift; output=$1 ;;
  esac
  shift
done
test -n "$output"
cat >"$CAPTURE_DIR/plaintext.bundle"
{ printf 'fake-openpgp'; cat "$CAPTURE_DIR/plaintext.bundle"; } >"$output"
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "fsync"),
        `#!/bin/sh
set -eu
printf '%s\\n' "$1" >>"$CAPTURE_DIR/fsync.paths"
`,
        { mode: 0o700 },
      );

      const result = spawnSync(
        "sh",
        [path.join(root, "infra/docker/backup.sh")],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            CAPTURE_DIR: captures,
            PGHOST: "db",
            PGPORT: "5432",
            PGDATABASE: "ai_agent_platform",
            PGUSER: "ai_agent_backup",
            BACKUP_DATABASE_PASSWORD_FILE: passwordFile,
            BACKUP_ENCRYPTION_KEY_FILE: encryptionKeyFile,
            BACKUP_DIRECTORY: backups,
            BACKUP_TMP_DIRECTORY: temporary,
            BACKUP_RUN_ONCE: "true",
            BACKUP_TIMEOUT_COMMAND: path.join(bin, "timeout"),
          },
        },
      );

      const output = `${result.stdout}${result.stderr}`;
      expect(result.status, output).toBe(0);
      const pgDumpArgv = readFileSync(
        path.join(captures, "pg_dump.argv"),
        "utf8",
      );
      const psqlArgv = readFileSync(path.join(captures, "psql.argv"), "utf8");
      const psqlCommands = readFileSync(
        path.join(captures, "psql.commands"),
        "utf8",
      );
      const gpgArgv = readFileSync(path.join(captures, "gpg.argv"), "utf8");
      for (const secret of [databasePassword, encryptionKey]) {
        expect(output).not.toContain(secret);
        expect(pgDumpArgv).not.toContain(secret);
        expect(psqlArgv).not.toContain(secret);
        expect(psqlCommands).not.toContain(secret);
        expect(gpgArgv).not.toContain(secret);
      }
      expect(psqlCommands).toContain(
        "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      expect(psqlCommands).toContain("pg_export_snapshot()");
      expect(psqlCommands).toContain("COMMIT;");
      expect(pgDumpArgv).toContain("--host=db");
      expect(pgDumpArgv).toContain("--username=ai_agent_backup");
      expect(pgDumpArgv).toContain("--snapshot=00000003-0000001B-1");
      expect(readFileSync(path.join(captures, "pgpass"), "utf8")).toBe(
        "db:5432:ai_agent_platform:ai_agent_backup:backup\\:password\\\\sentinel\n",
      );
      expect(readdirSync(temporary)).toEqual([]);
      const backupFiles = readdirSync(backups);
      expect(backupFiles).toHaveLength(1);
      expect(gpgArgv).toContain("--cipher-algo\nAES256");
      expect(gpgArgv).toContain("--force-mdc");
      const extractedBundle = path.join(sandbox, "extracted-bundle");
      mkdirSync(extractedBundle, { mode: 0o700 });
      const extracted = spawnSync(
        "tar",
        ["-xf", path.join(captures, "plaintext.bundle"), "-C", extractedBundle],
        { encoding: "utf8" },
      );
      expect(extracted.status, `${extracted.stdout}${extracted.stderr}`).toBe(
        0,
      );
      expect(readdirSync(extractedBundle).sort()).toEqual([
        "database.dump",
        "skill-backup.manifest",
      ]);
      expect(
        readFileSync(path.join(extractedBundle, "database.dump"), "utf8"),
      ).toBe(fakeDump);
      expect(
        readFileSync(
          path.join(extractedBundle, "skill-backup.manifest"),
          "utf8",
        ),
      ).toBe(`format_version=1
dump_sha256=${fakeDumpSha256}
skill_registry_schema_version=1
skill_revision_count=2
skill_artifact_count=2
skill_file_count=3
`);
      expect(backupFiles[0]).toMatch(/^ai-agent-platform-.*\.dump\.gpg$/u);
      expect(statSync(path.join(backups, backupFiles[0])).mode & 0o777).toBe(
        0o600,
      );
      expect(
        readFileSync(path.join(captures, "fsync.paths"), "utf8")
          .trim()
          .split("\n"),
      ).toEqual([expect.stringMatching(/\.dump\.gpg\.tmp$/u), backups]);

      const capacityBin = path.join(sandbox, "capacity-bin");
      const capacityCaptures = path.join(sandbox, "capacity-captures");
      const capacityBackups = path.join(sandbox, "capacity-backups");
      const capacityTemporary = path.join(sandbox, "capacity-temporary");
      for (const directory of [
        capacityBin,
        capacityCaptures,
        capacityBackups,
        capacityTemporary,
      ]) {
        mkdirSync(directory, { recursive: true });
      }
      for (const executable of [
        "timeout",
        "setsid",
        "psql",
        "pg_dump",
        "sha256sum",
        "gpg",
        "fsync",
      ]) {
        const target = path.join(capacityBin, executable);
        copyFileSync(path.join(bin, executable), target);
        chmodSync(target, 0o700);
      }
      writeFileSync(
        path.join(capacityBin, "df"),
        `#!/bin/sh
set -eu
printf '%s\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on'
printf '%s\n' 'test 1 0 1 0% /work'
`,
        { mode: 0o700 },
      );
      const insufficientCapacity = spawnSync(
        "sh",
        [path.join(root, "infra/docker/backup.sh")],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${capacityBin}:${process.env.PATH ?? ""}`,
            CAPTURE_DIR: capacityCaptures,
            PGHOST: "db",
            PGPORT: "5432",
            PGDATABASE: "ai_agent_platform",
            PGUSER: "ai_agent_backup",
            BACKUP_DATABASE_PASSWORD_FILE: passwordFile,
            BACKUP_ENCRYPTION_KEY_FILE: encryptionKeyFile,
            BACKUP_DIRECTORY: capacityBackups,
            BACKUP_TMP_DIRECTORY: capacityTemporary,
            BACKUP_RUN_ONCE: "true",
            BACKUP_TIMEOUT_COMMAND: path.join(capacityBin, "timeout"),
            BACKUP_PROCESS_KILL_AFTER_SECONDS: "1",
          },
        },
      );
      const capacityOutput = `${insufficientCapacity.stdout}${insufficientCapacity.stderr}`;
      expect(insufficientCapacity.status, capacityOutput).toBe(1);
      expect(capacityOutput.trim()).toBe(
        "backup temporary space budget is insufficient",
      );
      expect(readdirSync(capacityCaptures)).not.toContain("pg_dump.argv");
      expect(readdirSync(capacityBackups)).toEqual([]);
      expect(readdirSync(capacityTemporary)).toEqual([]);

      const hangBin = path.join(sandbox, "hang-bin");
      const hangCaptures = path.join(sandbox, "hang-captures");
      const hangBackups = path.join(sandbox, "hang-backups");
      const hangTemporary = path.join(sandbox, "hang-temporary");
      for (const directory of [
        hangBin,
        hangCaptures,
        hangBackups,
        hangTemporary,
      ]) {
        mkdirSync(directory, { recursive: true });
      }
      writeFileSync(
        path.join(hangBin, "timeout"),
        `#!/bin/sh
set -eu
signal=TERM
kill_after=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -s|--signal) signal=$2; shift 2 ;;
    -k|--kill-after) kill_after=$2; shift 2 ;;
    --signal=*) signal=\${1#*=}; shift ;;
    --kill-after=*) kill_after=\${1#*=}; shift ;;
    --foreground) shift ;;
    --) shift; break ;;
    *) duration=$1; shift; break ;;
  esac
done
test -n "\${duration:-}"
test "$#" -gt 0
if [ "$1" = "psql" ]; then
  exec "$@"
fi
child=
watchdog=
terminate() {
  [ -z "$watchdog" ] || kill "$watchdog" >/dev/null 2>&1 || true
  [ -z "$child" ] || kill -TERM "$child" >/dev/null 2>&1 || true
  [ -z "$child" ] || wait "$child" >/dev/null 2>&1 || true
  exit 143
}
trap terminate TERM INT HUP
"$@" &
child=$!
(
  sleep "$duration"
  kill -"$signal" "$child" >/dev/null 2>&1 || exit 0
  if [ -n "$kill_after" ]; then
    sleep "$kill_after"
    kill -KILL "$child" >/dev/null 2>&1 || true
  fi
) &
watchdog=$!
set +e
wait "$child"
status=$?
set -e
kill "$watchdog" >/dev/null 2>&1 || true
wait "$watchdog" >/dev/null 2>&1 || true
exit "$status"
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(hangBin, "setsid"),
        `#!/bin/sh
set -eu
exec "$@"
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(hangBin, "psql"),
        `#!/bin/sh
set -eu
printf '%s\n' "$$" >"$CAPTURE_DIR/snapshot.pid"
cleanup_snapshot() {
  rm -f "$CAPTURE_DIR/idle-transaction"
  printf 'exited\n' >"$CAPTURE_DIR/snapshot.exited"
}
trap 'cleanup_snapshot; exit 143' TERM INT HUP
trap cleanup_snapshot EXIT
while IFS= read -r command; do
  case "$command" in
    *pg_export_snapshot*)
      : >"$CAPTURE_DIR/idle-transaction"
      printf '%s\n' '00000003-0000001B-1|1|2|2|3|1024'
      ;;
    COMMIT*) rm -f "$CAPTURE_DIR/idle-transaction" ;;
    '\\q') exit 0 ;;
  esac
done
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(hangBin, "pg_dump"),
        `#!/bin/sh
set -eu
printf '%s\n' "$$" >"$CAPTURE_DIR/pg_dump.pid"
output=
for argument in "$@"; do
  case "$argument" in
    --file=*) output=\${argument#--file=} ;;
  esac
done
test -n "$output"
printf 'partial-dump' >"$output"
trap '' TERM
mkfifo "$CAPTURE_DIR/pg-dump-block.fifo"
blocked_pid=$$
(sleep 5; kill -KILL "$blocked_pid" >/dev/null 2>&1 || true) >/dev/null 2>&1 &
printf '%s\n' "$!" >"$CAPTURE_DIR/pg_dump.watchdog.pid"
IFS= read -r blocked <"$CAPTURE_DIR/pg-dump-block.fifo"
`,
        { mode: 0o700 },
      );

      const hangStartedAt = Date.now();
      const hung = spawnSync(
        "sh",
        [path.join(root, "infra/docker/backup.sh")],
        {
          encoding: "utf8",
          timeout: 7_000,
          env: {
            ...process.env,
            PATH: `${hangBin}:${process.env.PATH ?? ""}`,
            CAPTURE_DIR: hangCaptures,
            PGHOST: "db",
            PGPORT: "5432",
            PGDATABASE: "ai_agent_platform",
            PGUSER: "ai_agent_backup",
            BACKUP_DATABASE_PASSWORD_FILE: passwordFile,
            BACKUP_ENCRYPTION_KEY_FILE: encryptionKeyFile,
            BACKUP_DIRECTORY: hangBackups,
            BACKUP_TMP_DIRECTORY: hangTemporary,
            BACKUP_RUN_ONCE: "true",
            BACKUP_TIMEOUT_COMMAND: path.join(hangBin, "timeout"),
            BACKUP_DUMP_TIMEOUT_SECONDS: "1",
            BACKUP_DUMP_KILL_AFTER_SECONDS: "1",
            BACKUP_SNAPSHOT_TIMEOUT_SECONDS: "62",
            BACKUP_PROCESS_KILL_AFTER_SECONDS: "1",
          },
        },
      );
      const hangElapsedMs = Date.now() - hangStartedAt;
      for (const pidFile of ["snapshot.pid", "pg_dump.pid"]) {
        hungProcessIds.push(
          Number(readFileSync(path.join(hangCaptures, pidFile), "utf8").trim()),
        );
      }
      hungFallbackWatchdogPid = Number(
        readFileSync(
          path.join(hangCaptures, "pg_dump.watchdog.pid"),
          "utf8",
        ).trim(),
      );
      try {
        process.kill(hungFallbackWatchdogPid, "SIGKILL");
      } catch {
        // The fallback already fired on the pre-timeout RED path.
      }
      const hungOutput = `${hung.stdout}${hung.stderr}`;
      expect(hung.error, hungOutput).toBeUndefined();
      expect(hung.status, hungOutput).not.toBe(0);
      expect(hung.signal, hungOutput).toBeNull();
      expect(hangElapsedMs).toBeLessThan(4_500);
      expect(hungOutput.trim()).toBe("backup database dump failed");
      for (const protectedValue of [
        databasePassword,
        encryptionKey,
        hangTemporary,
      ]) {
        expect(hungOutput).not.toContain(protectedValue);
      }
      expect(readdirSync(hangTemporary)).toEqual([]);
      expect(readdirSync(hangBackups)).toEqual([]);
      expect(readdirSync(hangCaptures)).not.toContain("idle-transaction");
      expect(
        readFileSync(path.join(hangCaptures, "snapshot.exited"), "utf8"),
      ).toBe("exited\n");
      for (const pid of hungProcessIds) {
        expect(() => process.kill(pid, 0)).toThrow();
      }
    } finally {
      if (hungFallbackWatchdogPid !== undefined) {
        try {
          process.kill(hungFallbackWatchdogPid, "SIGKILL");
        } catch {
          // Watchdog already exited.
        }
      }
      for (const pid of hungProcessIds) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // Process already exited and was reaped by the backup script.
        }
      }
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 15_000);

  it("validates exactly the single passphrase line consumed by GnuPG", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "backup-key-format-"));
    const validator = path.join(root, "infra/docker/validate-backup-key.sh");
    const valid = [
      "0123456789abcdef0123456789abcdef",
      "0123456789abcdef0123456789abcdef\n",
    ];
    const invalid = [
      "0123456789abcdef0123456789abcde",
      "x\n0123456789abcdef0123456789abcdef0123456789abcdef",
      "0123456789abcdef0123456789abcdef\nsecond-line",
      "0123456789abcdef0123456789abcdef\r\n",
      " 0123456789abcdef0123456789abcdef",
      "0123456789abcdef0123456789abcdef ",
      "0123456789abcdef\t0123456789abcdef",
    ];

    try {
      for (const [index, value] of valid.entries()) {
        const keyFile = path.join(sandbox, `valid-${index}`);
        writeFileSync(keyFile, value, { mode: 0o600 });
        const accepted = spawnSync("sh", [validator, keyFile], {
          encoding: "utf8",
        });
        expect(accepted.status).toBe(0);
        expect(`${accepted.stdout}${accepted.stderr}`).not.toContain(value);
      }
      for (const [index, value] of invalid.entries()) {
        const keyFile = path.join(sandbox, `invalid-${index}`);
        writeFileSync(keyFile, value, { mode: 0o600 });
        const rejected = spawnSync("sh", [validator, keyFile], {
          encoding: "utf8",
        });
        expect(rejected.status).not.toBe(0);
        expect(`${rejected.stdout}${rejected.stderr}`).not.toContain(value);
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("documents AgentOS upgrades, startup order, and rollback sequencing", () => {
    const runbook = read("docs/deployment/server-readiness.md");
    const dockerReadme = read("infra/docker/README.md");
    const architecture = read("docs/architecture/system-design.md");
    const rootReadme = read("README.md");
    const documentation = `${runbook}\n${dockerReadme}\n${architecture}\n${rootReadme}`;

    expect(runbook).toContain("docker compose run --rm agno-bootstrap");
    expect(documentation).toContain(
      "db → migrate → agno-bootstrap → agent-migrate → agent → web → proxy/backup",
    );
    expect(runbook).toMatch(
      /停止[^\n]*agent[\s\S]*恢复[^\n]*dump[\s\S]*agent-migrate[\s\S]*ready[\s\S]*重启[^\n]*web/iu,
    );
    expect(rootReadme).not.toContain(
      "docker compose up -d --build --wait db migrate agno-bootstrap agent-migrate agent web proxy backup",
    );
  });

  it("defines a failure-safe isolated AgentOS backup and restore acceptance", () => {
    const script = read("docs/testing/run-agentos-backup-restore.sh");

    expect(script).toContain('docker compose -p "$project"');
    expect(script).toContain("down --rmi local -v --remove-orphans");
    expect(script).toContain("trap cleanup EXIT");
    expect(script).toContain("trap 'on_signal 130' INT");
    expect(script).toContain("trap 'on_signal 143' TERM");
    expect(script.indexOf("trap cleanup EXIT")).toBeLessThan(
      script.indexOf("mktemp"),
    );
    expect(script).toContain('chmod 600 "$env_file"');
    expect(script).toContain('stat -f %Lp "$env_file"');
    expect(script).toContain('stat -c %a "$env_file"');
    expect(script).toContain('[ "$env_permissions" = "600" ]');
    expect(script).toContain("config --quiet");
    expect(script).toMatch(/build[^\n]*migrate[^\n]*agent[^\n]*backup/u);
    expect(script).toContain("run --rm agno-bootstrap");
    expect(script).toContain("run --rm --no-deps agent-migrate");
    expect(script).toContain("run --rm --no-deps agent-control-bootstrap");
    expect(script).toContain("run --rm --no-deps agent-control-migrate");
    expect(script).toContain("run --rm --no-deps skill-registry-bootstrap");
    expect(script).toContain("run --rm --no-deps skill-registry-migrate");
    expect(script).toContain("up -d --no-deps agent");
    expect(script).toContain("run --rm --no-deps backup");
    expect(script).toContain("http://127.0.0.1:7777/internal/health/ready");
    expect(script).toContain("/run/secrets/os_security_key");
    expect(script).toContain("30");
    expect(script).toContain(
      'payload == {"ready": True, "capability": "placeholder"}',
    );
    expect(script).toContain('type(payload["ready"]) is bool');
    expect(script).toContain('type(payload["capability"]) is str');
    expect(script).not.toContain('payload.get("ready")');
    expect(script).not.toMatch(/ports?:[^\n]*7777/u);
    expect(script).toContain("backup_data");
    expect(script).toContain(".dump.gpg");
    expect(script).toContain("BACKUP_ENCRYPTION_KEY_FILE");
    expect(script).toContain("ASSISTANT_PUBLIC_ORIGIN=http://127.0.0.1:8080");
    expect(script).toContain("ASSISTANT_SESSION_SECRET_FILE");
    expect(script).toContain("ASSISTANT_RATE_LIMIT_SECRET_FILE");
    expect(script).toContain("AGENT_CONTROL_MIGRATOR_DATABASE_URL_FILE");
    expect(script).toContain("SKILL_REGISTRY_MIGRATOR_DATABASE_URL_FILE");
    expect(script).toContain("RESTORE_SKILL_REGISTRY_IMAGE");
    expect(script).toContain("wrong encryption key was rejected");
    expect(script).toContain("rejection_elapsed_seconds");
    expect(script).toContain("restore rejection exceeded its bounded runtime");
    expect(script).toContain("tampered ciphertext was rejected");
    expect(script).toContain("OpenPGP packet contract verified");
    expect(script).toContain("mdc_method: 2");
    expect(script).toContain("RESTORE_TMP_ROOT");
    expect(script).toContain("left a usable plaintext dump");
    expect(script).toContain("postgres:18.3-alpine3.23");
    expect(script).toContain("mktemp -d");
    expect(script).toContain("infra/docker/restore-drill.sh");
    expect(script).toContain("INSERT INTO public.users");
    expect(script).toContain("INSERT INTO agno.agno_sessions");
    expect(script).toContain("platform_user_count");
    expect(script).toContain("agno_session_count");
    expect(script).toContain("AAP_AGENTOS_RESTORE_TEST_FAIL_AFTER_TEMP");
  });

  it("cleans temporary paths on a controlled failure immediately after allocation", () => {
    const sandbox = mkdtempSync(
      path.join(tmpdir(), "agentos-restore-cleanup-"),
    );
    const runner = path.join(
      root,
      "docs/testing/run-agentos-backup-restore.sh",
    );
    const envPrefix = ".env.agentos-backup-restore.";
    const before = readdirSync(root).filter((entry) =>
      entry.startsWith(envPrefix),
    );

    try {
      const failed = spawnSync("sh", [runner], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${sandbox}:/usr/bin:/bin`,
          TMPDIR: sandbox,
          AAP_AGENTOS_RESTORE_TEST_FAIL_AFTER_TEMP: "true",
        },
      });
      expect(failed.status).toBe(86);
      expect(failed.stdout).not.toMatch(/password|secret|DATABASE_URL/iu);
      expect(failed.stderr).not.toMatch(/password|secret|DATABASE_URL/iu);
      expect(
        readdirSync(root).filter((entry) => entry.startsWith(envPrefix)),
      ).toEqual(before);
      expect(readdirSync(sandbox)).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("uses host webServer only when BASE_URL is absent", () => {
    const config = read("apps/web/playwright.config.ts");
    expect(config).toContain("process.env.BASE_URL");
    expect(config).toContain("process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
    expect(config).toContain('name: "mobile"');
    expect(config).toContain("viewport: { width: 390, height: 844 }");
    expect(config).toContain(".next/standalone/apps/web/server.js");
    expect(config).toContain(
      "['.next/static','.next/standalone/apps/web/.next/static']",
    );
    expect(config).toContain("['public','.next/standalone/apps/web/public']");
    expect(config).toContain("fs.cpSync(source,target,{recursive:true})");
    expect(config).toContain("ASSISTANT_PUBLIC_ORIGIN: baseURL");
    expect(config).toContain("ASSISTANT_SESSION_SECRET:");
    expect(config).toContain('HOSTNAME: "127.0.0.1"');
    expect(config).toContain("PORT: new URL(baseURL).port");
    expect(config).not.toContain(".env.local");
    expect(config).toMatch(/webServer:\s*externalBaseUrl\s*\?\s*undefined/u);
    expect(read("apps/web/e2e/auth-smoke.spec.ts")).toContain("test(");
    const accessSpec = read("apps/web/e2e/auth-access.spec.ts");
    const fixtures = read("apps/web/e2e/auth-fixtures.ts");
    const seed = read("packages/database/src/seed-auth-e2e.ts");
    const atRest = read("packages/database/src/assert-auth-at-rest.ts");
    expect(accessSpec).toContain("@security-state");
    expect(accessSpec).toContain("@totp-enroll");
    expect(accessSpec).toContain("@recovery-consume");
    expect(fixtures).not.toMatch(
      /@ai-agent-platform\/database|\bpg\b|DATABASE_URL/u,
    );
    for (const source of [accessSpec, fixtures, seed, atRest]) {
      expect(source).not.toMatch(/['"]e2e-[^'"]*session[^'"]*['"]/u);
    }
    expect(accessSpec).toContain("fixtureCredentials().replacementPassword");
    const workflow = read(".github/workflows/ci.yml");
    for (const key of [
      "E2E_PENDING_CUSTOMER_SESSION_TOKEN",
      "E2E_DISABLED_CUSTOMER_SESSION_TOKEN",
      "E2E_STAFF_SESSION_TOKEN",
      "E2E_ROLE_TARGET_SESSION_TOKEN",
      "E2E_ADMIN_SESSION_TOKEN",
      "E2E_NO_TOTP_ADMIN_SESSION_TOKEN",
      "E2E_REVOKED_SESSION_TOKEN",
      "E2E_REPLACEMENT_PASSWORD",
    ]) {
      expect(workflow).toContain(key);
    }
    expect(workflow).toContain("::add-mask::$value");
    expect(read("apps/web/e2e/proxy-auth-security.spec.ts")).toContain("429");
    const proxySpec = read("apps/web/e2e/proxy-auth-security.spec.ts");
    expect(proxySpec).toContain("audit-source-ip");
    expect(proxySpec).toContain("audit-e2e-");
    expect(proxySpec).not.toContain('locator("body")).not.toContainText');
  });

  it("keeps client auth components outside the server-only action module", () => {
    for (const file of [
      "apps/web/src/components/auth/change-password-form.tsx",
      "apps/web/src/components/auth/re-auth-form.tsx",
      "apps/web/src/components/auth/two-factor-form.tsx",
    ]) {
      expect(read(file)).not.toContain('@/server/auth/actions"');
    }
  });

  it("keeps workforce security pages dynamic so builds never query PostgreSQL", () => {
    expect(read("apps/web/src/app/staff/layout.tsx")).toContain(
      'export const dynamic = "force-dynamic"',
    );
  });

  it("renders a standalone hardened provider smoke service with only model egress", () => {
    const rendered = renderComposeFixture(["compose.provider-smoke.yaml"]);
    const service = rendered.services.smoke;

    expect(Object.keys(rendered.services)).toEqual(["smoke"]);
    expect(Object.keys(rendered.networks)).toEqual(["default"]);
    expect(rendered.networks.default?.internal).not.toBe(true);
    expect(service).toBeDefined();
    expect(service?.build?.target).toBe("runtime");
    expect(service?.ports ?? []).toEqual([]);
    expect(service?.read_only).toBe(true);
    expect(service?.user).toBe("root");
    expect(service?.tmpfs).toEqual(["/tmp:rw,noexec,nosuid,size=32m"]);
    expect(service?.cap_drop).toEqual(["ALL"]);
    expect(new Set(service?.cap_add)).toEqual(
      new Set(["DAC_OVERRIDE", "SETGID", "SETUID"]),
    );
    expect(service?.security_opt).toEqual(["no-new-privileges:true"]);
    expect(service?.cpus).toBe(1);
    expect(service?.mem_limit).toBe("536870912");
    expect(service?.pids_limit).toBe(128);
    expect(service?.networks).toEqual({ default: null });
    expect((service?.secrets ?? []).map(secretSource)).toEqual([
      "model_api_key",
    ]);
    expect(service?.entrypoint?.join(" ")).toContain(
      "/opt/aap/run-with-secret-env.sh",
    );
    expect(service?.command).toEqual([
      "python",
      "-m",
      "agent_service.provider_smoke",
    ]);
    expect(service?.environment).toEqual({
      MODEL_BASE_URL: "",
      MODEL_ID: "provider-smoke-model",
      MODEL_PROVIDER: "openai",
      MODEL_RUN_TIMEOUT_SECONDS: "25",
      SECRET_ENV_SPECS: "MODEL_API_KEY=/run/secrets/model_api_key",
      SECRET_RUN_AS: "agent",
    });
    expect(JSON.stringify(rendered)).not.toMatch(
      /AGNO_DATABASE|OS_SECURITY|BETTER_AUTH|ASSISTANT_|postgres|agentos|web/iu,
    );
    expect(service?.volumes).toHaveLength(1);
    expect(service?.volumes?.[0]).toMatchObject({
      target: "/opt/aap/run-with-secret-env.sh",
      read_only: true,
    });
    expect(JSON.stringify(service?.volumes?.[0])).toContain(
      "/infra/docker/run-with-secret-env.sh",
    );
  });

  it("runs provider smoke fail-closed and cleans its disposable project silently", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "provider-smoke-owner-"));
    const repo = path.join(sandbox, "repo");
    const bin = path.join(sandbox, "bin");
    const temp = path.join(sandbox, "tmp");
    const keyFile = path.join(sandbox, "model-api-key");
    const symlinkKeyFile = path.join(sandbox, "model-api-key-symlink");
    const dockerLog = path.join(sandbox, "docker.log");
    const dockerState = path.join(sandbox, "docker.state");
    const snapshotCapture = path.join(sandbox, "snapshot.capture");
    const secret = "provider-smoke-secret-that-must-not-leak";
    const replacementSecret = "replacement-secret-that-must-not-be-used";
    mkdirSync(path.join(repo, "docs/testing"), { recursive: true });
    mkdirSync(bin, { recursive: true });
    mkdirSync(temp, { recursive: true });
    copyFileSync(
      path.join(root, "docs/testing/run-model-provider-smoke.sh"),
      path.join(repo, "docs/testing/run-model-provider-smoke.sh"),
    );
    copyFileSync(
      path.join(root, "compose.provider-smoke.yaml"),
      path.join(repo, "compose.provider-smoke.yaml"),
    );
    writeFileSync(keyFile, `${secret}\n`, { mode: 0o600 });
    chmodSync(keyFile, 0o600);
    symlinkSync(keyFile, symlinkKeyFile);
    writeFileSync(
      path.join(bin, "docker"),
      `#!/bin/sh
primary_mode=\${FAKE_PRIMARY_MODE:-\${FAKE_MODE-}}
cleanup_mode=\${FAKE_CLEANUP_MODE:-\${FAKE_MODE-}}
printf '%s\n' "$*" >>"$FAKE_DOCKER_LOG"
printf '%s\n' "hidden compose warning" >&2
case " $* " in
  *" ps -aq "*|*" volume ls "*|*" network ls "*|*" image ls "*)
    if [ "$primary_mode" = replace-source ] && [ ! -f "$FAKE_DOCKER_STATE.replaced" ]; then
      printf '%s\n' "$FAKE_REPLACEMENT_SECRET" >"$FAKE_SOURCE_KEY"
      chmod 600 "$FAKE_SOURCE_KEY"
      : >"$FAKE_DOCKER_STATE.replaced"
    fi
    if [ -s "$FAKE_DOCKER_STATE" ]; then
      [ "$cleanup_mode" = cleanup-query-fail ] && exit 75
      [ "$cleanup_mode" = cleanup-residual ] && printf '%s\n' "residual-resource"
    fi
    exit 0
    ;;
  *" compose "*" config --quiet "*)
    if [ -n "\${FAKE_SNAPSHOT_CAPTURE-}" ]; then
      /bin/cat "$MODEL_API_KEY_FILE" >"$FAKE_SNAPSHOT_CAPTURE"
    fi
    exit 0
    ;;
  *" compose "*" build --pull smoke "*)
    [ "$primary_mode" = build-fail ] && exit 42
    if [ "$primary_mode" = signal-exit ]; then
      exit 143
    fi
    exit 0
    ;;
  *" compose "*" create smoke "*) exit 0 ;;
  *" compose "*" run --rm smoke python -m agent_service.provider_smoke --validate-only "*) exit 0 ;;
  *" compose "*" run --rm smoke "*)
    [ "$primary_mode" = provider-fail ] && exit 43
    if [ "$primary_mode" = unsafe-output ]; then
      printf '%s\n' "unsafe provider answer"
    else
      printf '%s\n' "openai/provider-smoke-model: verified"
    fi
    exit 0
    ;;
  *" compose "*" down --rmi local -v --remove-orphans "*)
    printf '%s\n' "down" >"$FAKE_DOCKER_STATE"
    [ "$cleanup_mode" = cleanup-down-fail ] && exit 77
    exit 0
    ;;
esac
exit 0
`,
      { mode: 0o755 },
    );
    writeFileSync(
      path.join(bin, "mktemp"),
      `#!/bin/sh
if [ -n "\${FAKE_MKTEMP_LOG-}" ]; then
  printf '%s\n' called >"$FAKE_MKTEMP_LOG"
fi
if [ "\${FAKE_MODE-}" = mktemp-fail ]; then
  printf '%s\n' "raw allocation detail must stay hidden" >&2
  exit 71
fi
exec /usr/bin/mktemp "$@"
`,
      { mode: 0o755 },
    );
    symlinkSync("/usr/bin/dirname", path.join(bin, "dirname"));

    const run = (extra: NodeJS.ProcessEnv = {}) => {
      writeFileSync(dockerLog, "");
      writeFileSync(dockerState, "");
      rmSync(`${dockerState}.replaced`, { force: true });
      rmSync(snapshotCapture, { force: true });
      return spawnSync(
        "/bin/sh",
        [path.join(repo, "docs/testing/run-model-provider-smoke.sh")],
        {
          cwd: repo,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}:/usr/bin:/bin`,
            TMPDIR: temp,
            MODEL_PROVIDER: "openai",
            MODEL_ID: "provider-smoke-model",
            MODEL_API_KEY_FILE: keyFile,
            MODEL_RUN_TIMEOUT_SECONDS: "25",
            FAKE_DOCKER_LOG: dockerLog,
            FAKE_DOCKER_STATE: dockerState,
            FAKE_SNAPSHOT_CAPTURE: snapshotCapture,
            FAKE_SOURCE_KEY: keyFile,
            FAKE_REPLACEMENT_SECRET: replacementSecret,
            ...extra,
          },
        },
      );
    };

    try {
      const success = run();
      const successCalls = readFileSync(dockerLog, "utf8");
      expect(success.status).toBe(0);
      expect(success.stdout).toBe("openai/provider-smoke-model: verified\n");
      expect(success.stderr).toBe("");
      expect(successCalls).toContain("config --quiet");
      expect(successCalls).toContain("build --pull smoke");
      expect(successCalls).toContain("create smoke");
      expect(successCalls).toContain(
        "run --rm smoke python -m agent_service.provider_smoke --validate-only",
      );
      expect(successCalls).toContain("run --rm smoke");
      expect(successCalls).toContain("down --rmi local -v --remove-orphans");
      expect(successCalls).not.toContain(secret);
      expect(successCalls).not.toContain(replacementSecret);
      expect(readdirSync(temp)).toEqual([]);

      const secondSuccess = run();
      expect(secondSuccess.status).toBe(0);
      const firstProject = successCalls.match(
        /compose -p (aap-provider-smoke-[^ ]+)/u,
      )?.[1];
      const secondProject = readFileSync(dockerLog, "utf8").match(
        /compose -p (aap-provider-smoke-[^ ]+)/u,
      )?.[1];
      expect(firstProject).toBeDefined();
      expect(secondProject).toBeDefined();
      expect(secondProject).not.toBe(firstProject);
      expect(firstProject?.replace("aap-provider-smoke-", "")).not.toMatch(
        /^\d+$/u,
      );

      const preexistingSharedPath = path.join(temp, "aap-provider-smoke-locks");
      writeFileSync(preexistingSharedPath, "preexisting path");
      const ignoresPreexistingSharedPath = run();
      expect(ignoresPreexistingSharedPath.status).toBe(0);
      expect(ignoresPreexistingSharedPath.stdout).toBe(
        "openai/provider-smoke-model: verified\n",
      );
      rmSync(preexistingSharedPath);

      const symlinkKey = run({ MODEL_API_KEY_FILE: symlinkKeyFile });
      expect(symlinkKey.status).not.toBe(0);
      expect(symlinkKey.stdout).toBe("");
      expect(symlinkKey.stderr).toBe(
        "provider smoke wrapper failed: configuration\n",
      );
      expect(readFileSync(dockerLog, "utf8")).toBe("");

      const fifoKeyFile = path.join(sandbox, "model-api-key-fifo");
      const makeFifo = spawnSync(
        "python3",
        ["-c", "import os,sys; os.mkfifo(sys.argv[1])", fifoKeyFile],
        { encoding: "utf8" },
      );
      expect(makeFifo.status).toBe(0);
      const fifoKey = run({ MODEL_API_KEY_FILE: fifoKeyFile });
      expect(fifoKey.status).not.toBe(0);
      expect(fifoKey.stdout).toBe("");
      expect(fifoKey.stderr).toBe(
        "provider smoke wrapper failed: configuration\n",
      );
      expect(`${fifoKey.stdout}${fifoKey.stderr}`).not.toContain(fifoKeyFile);
      expect(`${fifoKey.stdout}${fifoKey.stderr}`).not.toContain(secret);
      expect(readFileSync(dockerLog, "utf8")).toBe("");

      writeFileSync(keyFile, `${secret}\n`, { mode: 0o600 });
      chmodSync(keyFile, 0o600);
      const replacedSource = run({ FAKE_MODE: "replace-source" });
      expect(replacedSource.status).toBe(0);
      expect(replacedSource.stdout).toBe(
        "openai/provider-smoke-model: verified\n",
      );
      expect(readFileSync(snapshotCapture, "utf8")).toBe(`${secret}\n`);
      expect(readFileSync(keyFile, "utf8")).toBe(`${replacementSecret}\n`);

      for (const mode of [
        "cleanup-down-fail",
        "cleanup-query-fail",
        "cleanup-residual",
      ]) {
        const cleanupFailure = run({ FAKE_MODE: mode });
        expect(cleanupFailure.status, mode).not.toBe(0);
        expect(cleanupFailure.stdout, mode).toBe("");
        expect(cleanupFailure.stderr, mode).toBe(
          "provider smoke wrapper failed: cleanup\n",
        );
        expect(cleanupFailure.stderr, mode).not.toContain(
          "hidden compose warning",
        );
        expect(readdirSync(temp), mode).toEqual([]);
      }

      const primaryFailures = [
        ["build-fail", "lifecycle"],
        ["provider-fail", "provider"],
        ["unsafe-output", "output"],
        ["signal-exit", "lifecycle"],
      ] as const;
      const cleanupFailures = [
        "cleanup-down-fail",
        "cleanup-query-fail",
        "cleanup-residual",
      ] as const;
      for (const [primaryMode, primaryCategory] of primaryFailures) {
        const primaryFailure = run({ FAKE_PRIMARY_MODE: primaryMode });
        expect(primaryFailure.status, primaryMode).not.toBe(0);
        expect(primaryFailure.stdout, primaryMode).toBe("");
        expect(primaryFailure.stderr, primaryMode).toBe(
          `provider smoke wrapper failed: ${primaryCategory}\n`,
        );
        expect(primaryFailure.stderr, primaryMode).not.toContain(
          "hidden compose warning",
        );
        expect(readFileSync(dockerLog, "utf8"), primaryMode).toContain(
          "down --rmi local -v --remove-orphans",
        );
        expect(readdirSync(temp), primaryMode).toEqual([]);

        for (const cleanupMode of cleanupFailures) {
          const combinedFailure = run({
            FAKE_PRIMARY_MODE: primaryMode,
            FAKE_CLEANUP_MODE: cleanupMode,
          });
          expect(
            combinedFailure.status,
            `${primaryMode}/${cleanupMode}`,
          ).not.toBe(0);
          expect(combinedFailure.stdout, `${primaryMode}/${cleanupMode}`).toBe(
            "",
          );
          expect(combinedFailure.stderr, `${primaryMode}/${cleanupMode}`).toBe(
            "provider smoke wrapper failed: cleanup\n",
          );
          expect(
            combinedFailure.stderr,
            `${primaryMode}/${cleanupMode}`,
          ).not.toContain("hidden compose warning");
          expect(readdirSync(temp), `${primaryMode}/${cleanupMode}`).toEqual(
            [],
          );
        }
      }

      const missingPythonMktempLog = path.join(
        sandbox,
        "missing-python-mktemp",
      );
      const missingPython = run({
        PATH: bin,
        FAKE_MKTEMP_LOG: missingPythonMktempLog,
      });
      expect(missingPython.status).not.toBe(0);
      expect(missingPython.stdout).toBe("");
      expect(missingPython.stderr).toBe(
        "provider smoke wrapper failed: configuration\n",
      );
      expect(`${missingPython.stdout}${missingPython.stderr}`).not.toContain(
        "python3",
      );
      expect(() => readFileSync(missingPythonMktempLog)).toThrow();
      expect(readFileSync(dockerLog, "utf8")).toBe("");
      expect(readdirSync(temp)).toEqual([]);

      const allocationFailure = run({ FAKE_MODE: "mktemp-fail" });
      expect(allocationFailure.status).not.toBe(0);
      expect(allocationFailure.stdout).toBe("");
      expect(allocationFailure.stderr).toBe(
        "provider smoke wrapper failed: ownership\n",
      );
      expect(readFileSync(dockerLog, "utf8")).toBe("");
      expect(readdirSync(temp)).toEqual([]);

      writeFileSync(keyFile, `${secret}\n`, { mode: 0o600 });
      chmodSync(keyFile, 0o644);
      const unsafeKey = run();
      expect(unsafeKey.status).not.toBe(0);
      expect(unsafeKey.stdout).toBe("");
      expect(unsafeKey.stderr).toBe(
        "provider smoke wrapper failed: configuration\n",
      );
      expect(readFileSync(dockerLog, "utf8")).toBe("");
      expect(readdirSync(temp)).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 15_000);

  it("snapshots provider keys without blocking on FIFOs or zero-byte writes", () => {
    const runner = read("docs/testing/run-model-provider-smoke.sh");
    expect(runner).toContain("command -v python3");
    const helperMatch = runner.match(
      /snapshot_helper='(?<source>[\s\S]*?)'\nexport AAP_PROVIDER_SMOKE_KEY_SOURCE=/u,
    );
    expect(helperMatch?.groups?.source).toBeDefined();
    const helper = helperMatch?.groups?.source ?? "";
    const sandbox = mkdtempSync(path.join(tmpdir(), "provider-key-snapshot-"));
    const source = path.join(sandbox, "source-key");
    const fifo = path.join(sandbox, "source-fifo");
    const secret = "snapshot-secret-that-must-not-leak";
    writeFileSync(source, secret, { mode: 0o600 });
    chmodSync(source, 0o600);
    const makeFifo = spawnSync(
      "python3",
      ["-c", "import os,sys; os.mkfifo(sys.argv[1])", fifo],
      { encoding: "utf8" },
    );
    expect(makeFifo.status).toBe(0);

    const execute = (helperSource: string, input: string, output: string) =>
      spawnSync("python3", ["-c", helperSource], {
        encoding: "utf8",
        timeout: 500,
        env: {
          ...process.env,
          AAP_PROVIDER_SMOKE_KEY_SOURCE: input,
          AAP_PROVIDER_SMOKE_KEY_SNAPSHOT: output,
        },
      });

    try {
      const fifoResult = execute(
        helper,
        fifo,
        path.join(sandbox, "fifo-snapshot"),
      );
      expect(fifoResult.error).toBeUndefined();
      expect(fifoResult.status).not.toBe(0);
      expect(fifoResult.stdout).toBe("");
      expect(`${fifoResult.stdout}${fifoResult.stderr}`).not.toContain(fifo);
      expect(`${fifoResult.stdout}${fifoResult.stderr}`).not.toContain(secret);

      const zeroWriteResult = execute(
        `import os\nos.write = lambda *_args: 0\n${helper}`,
        source,
        path.join(sandbox, "zero-write-snapshot"),
      );
      expect(zeroWriteResult.error).toBeUndefined();
      expect(zeroWriteResult.status).not.toBe(0);
      expect(zeroWriteResult.stdout).toBe("");
      expect(
        `${zeroWriteResult.stdout}${zeroWriteResult.stderr}`,
      ).not.toContain(source);
      expect(
        `${zeroWriteResult.stdout}${zeroWriteResult.stderr}`,
      ).not.toContain(secret);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("documents provider verification honestly without claiming an unrun matrix", () => {
    const guide = read("docs/testing/model-provider-smoke.md");
    const index = read("docs/testing/README.md");

    expect(guide).toContain("adapter-tested");
    expect(guide).toContain("real-API verified");
    expect(guide).toContain("单独");
    expect(guide).toContain("不提交未实际运行的验证矩阵");
    expect(guide).toContain("本地模型仓库");
    expect(guide).toContain("MODEL_API_KEY_FILE");
    expect(guide).toContain("宿主机");
    expect(guide).toContain("python3");
    expect(index).toContain("model-provider-smoke.md");
    expect(index).toContain("run-model-provider-smoke.sh");
  });

  it("defines the CMS document migration and rollback runbook", () => {
    const runbook = read("docs/deployment/cms-document-migration.md");

    for (const requirement of [
      "备份",
      "DOCUMENT_SEED_MANIFEST",
      "7 篇 `content`",
      "7 个 revision-1 `content_revisions`",
      "7 个 canonical `content_routes`",
      "migration/backfill",
      "先于 Web 镜像",
      "不回滚数据库",
      "上一 Web 镜像",
      "CMS 生命周期 smoke",
      "alias 永久重定向",
      "archive 后",
      "返回 404",
    ]) {
      expect(runbook).toContain(requirement);
    }

    const migration = runbook.indexOf("migration/backfill");
    const web = runbook.indexOf("Web 镜像", migration);
    expect(migration).toBeGreaterThanOrEqual(0);
    expect(web).toBeGreaterThan(migration);

    for (const field of [
      "目标环境",
      "公开 origin",
      "镜像 registry/repository",
      "Phase 2 digest",
      "Phase 3 digest",
      "备份命令",
      "部署命令",
      "回滚命令",
      "证据存储位置",
    ]) {
      expect(runbook).toContain(field);
    }
  });

  it("defines a no-fallback isolated CMS document acceptance gate", () => {
    const runner = read("docs/testing/run-cms-documents-e2e.sh");
    const browser = read("apps/web/e2e/cms-documents.spec.ts");
    const index = read("docs/testing/README.md");
    const dockerIgnore = read(".dockerignore");

    expect(runner).toContain("aap-cms-documents-e2e-");
    expect(runner).toContain("mktemp -d");
    expect(runner).toContain("trap on_exit EXIT");
    expect(runner.indexOf("trap on_exit EXIT")).toBeLessThan(
      runner.indexOf("mktemp -d"),
    );
    expect(runner).toContain("down -v --remove-orphans");
    expect(runner).toContain("build migrate web");
    expect(runner).toContain("up -d --wait db");
    expect(runner).toContain("run --rm migrate");
    expect(runner).toContain("db:seed-auth-e2e");
    expect(runner).toContain("DOCUMENT_SEED_MANIFEST");
    expect(runner).toContain("E2E_MODEL_ADMIN_SESSION_TOKEN");
    expect(runner).toContain("E2E_STAFF_SESSION_TOKEN");
    expect(runner).toContain("content_revisions");
    expect(runner).toContain("content_routes");
    expect(runner).toContain("(SELECT count FROM manifest_mismatches)");
    expect(runner).not.toContain("(SELECT count(*) FROM manifest_mismatches)");
    expect(runner).toContain("--project=desktop --project=mobile --workers=1");
    expect(runner).toContain("e2e/cms-documents.spec.ts");
    expect(runner).toContain("SOAK_SECONDS=${CMS_DOCUMENTS_SOAK_SECONDS:-600}");
    expect(runner).toContain("SOAK_INTERVAL_SECONDS=15");
    expect(runner).toContain("RestartCount");
    expect(runner).toContain("CMS documents E2E passed.");
    expect(runner).not.toMatch(/fallback|skip[^\n]*e2e/iu);

    expect(browser).toContain("{ width: 1440, height: 900 }");
    expect(browser).toContain("{ width: 390, height: 844 }");
    expect(browser).toContain("admin:docs denied fixture");
    expect(browser).toContain("capturedProtocolRequest.body");
    expect(browser).toContain(
      '"Next-Action": capturedProtocolRequest.nextAction',
    );
    expect(browser).toContain("await route.abort()");
    expect(browser).toContain("AUTH_PERMISSION_DENIED");
    expect(browser).toContain("发布当前修订");
    expect(browser).toContain("归档文档");
    expect(browser).toContain("预览当前修订");
    expect(browser).toContain("response.status() === 404");
    expect(browser).toContain("requestfailed");
    expect(browser).toContain('failure === "net::ERR_ABORTED"');
    expect(browser).toContain('request.resourceType() === "fetch"');
    expect(browser).toContain('url.searchParams.has("_rsc")');
    expect(browser).toContain(
      'typeof request.headers()["next-action"] === "string"',
    );
    expect(browser).toContain("console");

    expect(dockerIgnore).toContain("apps/web/e2e");
    expect(dockerIgnore).toContain("artifacts");
    expect(dockerIgnore).toContain("output");
    expect(dockerIgnore).toContain("**/*.test.ts");
    expect(dockerIgnore).toContain(".secrets");

    expect(index).toContain("run-cms-documents-e2e.sh");
    expect(index).toContain("CMS documents E2E passed.");
  });
});
