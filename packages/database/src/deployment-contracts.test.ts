import { spawnSync } from "node:child_process";
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
] as const;

type RenderedSecretAttachment = string | { source?: string; target?: string };

type RenderedNetworkAttachment = null | { gw_priority?: number };

type RenderedService = {
  build?: { target?: string };
  cap_drop?: string[];
  command?: string[];
  cpus?: number | string;
  entrypoint?: string[];
  environment?: Record<string, string | null>;
  mem_limit?: number | string;
  networks?: Record<string, RenderedNetworkAttachment>;
  pids_limit?: number;
  ports?: unknown[];
  read_only?: boolean;
  secrets?: RenderedSecretAttachment[];
  security_opt?: string[];
  tmpfs?: string[];
  user?: string;
};

type RenderedCompose = {
  networks: Record<string, { internal?: boolean }>;
  services: Record<string, RenderedService>;
};

const renderComposeFixture = (
  composeFiles = ["compose.yaml"],
): RenderedCompose => {
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
      secretFileEnv[`${key}_FILE`] = secretFile;
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
          E2E_REVOKED_SESSION_TOKEN: "compose-e2e-revoked",
          E2E_REPLACEMENT_PASSWORD: "compose-e2e-replacement",
          BETTER_AUTH_URL: "http://127.0.0.1:3000",
          BETTER_AUTH_TRUSTED_ORIGINS: "http://127.0.0.1:3000",
          ASSISTANT_PUBLIC_ORIGIN: "https://portal.example.com",
          PUBLIC_HOST: "127.0.0.1",
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
    expect(webService).not.toMatch(/agent:[\s\S]*condition: service_healthy/u);
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
    expect(script).toMatch(
      /build[^\n]*migrate[^\n]*web[^\n]*agent[^\n]*backup/u,
    );
    expect(script.match(/run --rm migrate/g)).toHaveLength(2);
    expect(script.match(/run --rm agno-bootstrap/g)).toHaveLength(2);
    expect(script.match(/run --rm --no-deps agent-migrate/g)).toHaveLength(2);
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
      script.indexOf("compose build"),
    );
    expect(script).toContain('--grep-invert "@agentos|@guard"');
    expect(script).toContain("--grep @guard");
    expect(script).toContain("--grep @agentos");
    expect(script.indexOf('--grep-invert "@agentos|@guard"')).toBeLessThan(
      script.indexOf("--grep @agentos"),
    );
    expect(script).toContain("export AGENT_ENABLED=false");
    expect(script).toContain("export ASSISTANT_PROVIDER_MODE=placeholder");
    expect(script).toContain("export AGENT_ENABLED=true");
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
    expect(script).toContain('scan_logs "agentos"');
    expect(script.indexOf('scan_logs "placeholder"')).toBeLessThan(
      script.indexOf("export AGENT_ENABLED=true"),
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
      'scan_logs "agentos" "$agentos_dynamic_patterns_file"',
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
      'identity_audit_path = "/tmp/aap-session-identity-audit"',
    );
    expect(script).toContain('getattr(os, "O_NOFOLLOW", 0)');
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
      'scan_logs "agentos"',
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
      "E2E_REVOKED_SESSION_TOKEN",
      "E2E_REPLACEMENT_PASSWORD",
    ]) {
      expect(script).toContain(`\"$${variable}\"`);
    }
    expect(script).toContain("guard 6 + placeholder 2 + AgentOS 4");
    expect(script).toContain("db_port_bindings=");
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
  *" compose "*" build migrate web agent backup "*) exit 42 ;;
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
      ?.split("\n  agent:\n")[0];
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
    expect(agentService).toContain("user: agent");
    expect(agentService).toContain("read_only: true");
    expect(agentService).toContain("/tmp:rw,noexec,nosuid,size=32m");
    expect(agentService).toContain("no-new-privileges:true");
    expect(agentService).toContain("cap_drop:\n      - ALL");
    expect(agentService).toContain("/internal/health/ready");
    expect(agentService).toContain("Authorization");
    expect(agentService).toContain(
      "pathlib.Path('/run/secrets/os_security_key').read_text().strip()",
    );
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

  it("gives only AgentOS the model credential and controlled egress", () => {
    const compose = read("compose.yaml");
    const serviceNames = [
      "db",
      "migrate",
      "agno-bootstrap",
      "agent-migrate",
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
    expect(agentService).toContain(
      'if [ -z "$${MODEL_BASE_URL-}" ]; then unset MODEL_BASE_URL; fi',
    );
    expect(agentService).toContain(
      'exec /opt/aap/run-with-secret-env.sh "$$@"',
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
      "model_api_key:\n    file: ${MODEL_API_KEY_FILE:-.secrets/model_api_key}",
    );

    for (const name of serviceNames.filter((name) => name !== "agent")) {
      expect(serviceSections[name]).toBeDefined();
      expect(serviceSections[name]).not.toContain("model_api_key");
      expect(serviceSections[name]).not.toContain("MODEL_API_KEY");
      expect(serviceSections[name]).not.toContain("model_egress");
    }
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
      "MODEL_API_KEY_FILE=.secrets/model_api_key",
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
      /model_run_timeout_seconds:\s*int\s*=\s*Field\([\s\S]*?default=50,[\s\S]*?ge=1,[\s\S]*?le=50,/u,
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
    expect(runner).toContain('exec "$@"');
    expect(runner).not.toMatch(/set\s+-[^\n]*x/u);
    expect(read(".gitignore")).toContain(".secrets/");
    const rendered = renderComposeFixture();
    expect(Object.keys(rendered.services).length).toBeGreaterThan(0);
  });

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
      "/bin/sh",
      "-eu",
      "-c",
      expect.stringContaining("/opt/aap/run-with-secret-env.sh"),
      "--",
    ]);
    expect(agent?.environment?.SECRET_ENV_SPECS).toContain(
      "MODEL_API_KEY=/run/secrets/model_api_key",
    );
    expect(Object.hasOwn(agent?.networks ?? {}, "backend")).toBe(true);
    expect(backendAttachment?.gw_priority ?? 0).toBe(0);
    expect(modelEgressAttachment?.gw_priority).toBe(1);
    expect(rendered.networks.backend?.internal).toBe(true);
    expect(rendered.networks.model_egress?.internal ?? false).toBe(false);

    expect(agent?.user).toBe("agent");
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
      "uv --directory apps/agent sync --frozen",
      "Run Agno migration twice",
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
    expect(script).toContain("BACKUP_ENCRYPTION_KEY_FILE");
    expect(script).toContain("--decrypt");
    expect(script).toContain("--pinentry-mode loopback");
    expect(script).toContain("--passphrase-file");
    expect(script).toContain("decrypted_candidate");
    expect(script).toContain('mv "$decrypted_candidate" "$decrypted_dump"');
    expect(script).not.toContain("aes-256-cbc");
    expect(script).not.toContain("openssl enc");
    expect(script).toContain("--env-file");
    expect(script).not.toMatch(/docker run[^\n]*-e\s+POSTGRES_/u);
    expect(script).not.toContain("POSTGRES_PASSWORD=");
    expect(script).toContain('expected_migrations="6"');
    expect(script).toContain("migration_count");
    expect(script).toContain("latest_migration");
    expect(script).toContain("users_email_lower_unique");
    expect(script).toContain("sessions_identity_boundary_guard");
    expect(script).toContain("audit_logs_created_id_desc_idx");
    expect(script).toContain("rate_limits_key_unique");
    expect(script).toContain("--clean --if-exists");
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
    expect(script).not.toMatch(/SELECT\s+(?:message|messages|content|runs?)/iu);
    expect(script).not.toContain('[ "$migration_count" -lt 1 ]');
  });

  it("backs up all platform and AgentOS schemas through one protected dump", () => {
    const script = read("infra/docker/backup.sh");
    for (const schema of ["public", "drizzle", "agno"]) {
      expect(script).toContain(`--schema=${schema}`);
    }
    expect(script.match(/pg_dump/g)).toHaveLength(1);
    expect(script).toContain("--format=custom");
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
  });

  it("keeps backup secrets out of command argv and removes plaintext work files", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "backup-secret-boundary-"));
    const bin = path.join(sandbox, "bin");
    const captures = path.join(sandbox, "captures");
    const backups = path.join(sandbox, "backups");
    const temporary = path.join(sandbox, "temporary");
    const passwordFile = path.join(sandbox, "database-password");
    const encryptionKeyFile = path.join(sandbox, "encryption-key");
    const databasePassword = "backup:password\\sentinel";
    const encryptionKey = "encryption-key-sentinel-0123456789abcdef";

    try {
      for (const directory of [bin, captures, backups, temporary]) {
        mkdirSync(directory, { recursive: true });
      }
      writeFileSync(passwordFile, databasePassword, { mode: 0o600 });
      writeFileSync(encryptionKeyFile, encryptionKey, { mode: 0o600 });
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
printf 'fake-custom-dump' >"$output"
`,
        { mode: 0o700 },
      );
      writeFileSync(
        path.join(bin, "gpg"),
        `#!/bin/sh
set -eu
printf '%s\\n' "$@" >"$CAPTURE_DIR/gpg.argv"
input=
output=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) shift; output=$1 ;;
    --*) ;;
    *) input=$1 ;;
  esac
  shift
done
test -n "$input"
test -n "$output"
{ printf 'fake-openpgp'; cat "$input"; } >"$output"
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
          },
        },
      );

      expect(result.status).toBe(0);
      const output = `${result.stdout}${result.stderr}`;
      const pgDumpArgv = readFileSync(
        path.join(captures, "pg_dump.argv"),
        "utf8",
      );
      const gpgArgv = readFileSync(path.join(captures, "gpg.argv"), "utf8");
      for (const secret of [databasePassword, encryptionKey]) {
        expect(output).not.toContain(secret);
        expect(pgDumpArgv).not.toContain(secret);
        expect(gpgArgv).not.toContain(secret);
      }
      expect(pgDumpArgv).toContain("--host=db");
      expect(pgDumpArgv).toContain("--username=ai_agent_backup");
      expect(readFileSync(path.join(captures, "pgpass"), "utf8")).toBe(
        "db:5432:ai_agent_platform:ai_agent_backup:backup\\:password\\\\sentinel\n",
      );
      expect(readdirSync(temporary)).toEqual([]);
      const backupFiles = readdirSync(backups);
      expect(backupFiles).toHaveLength(1);
      expect(gpgArgv).toContain("--cipher-algo\nAES256");
      expect(gpgArgv).toContain("--force-mdc");
      expect(backupFiles[0]).toMatch(/^ai-agent-platform-.*\.dump\.gpg$/u);
      expect(statSync(path.join(backups, backupFiles[0])).mode & 0o777).toBe(
        0o600,
      );
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

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
    expect(script).toContain("wrong encryption key was rejected");
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
});
