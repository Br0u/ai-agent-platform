import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

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
    const nginx = `${read("infra/nginx/nginx.conf")}\n${read("infra/nginx/default.conf.template")}`;
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
      "ASSISTANT_AGENTOS_DEFAULT_AGENT_ID",
      "ASSISTANT_AGENTOS_READINESS_TTL_MS",
      "ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS",
      "ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD",
      "ASSISTANT_AGENTOS_CIRCUIT_RESET_MS",
    ]) {
      expect(webService).toContain(`${name}:`);
    }
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
  });

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
    expect(dockerfile).toContain(
      'PNPM_CONFIG_REGISTRY="$PNPM_REGISTRY" pnpm install --frozen-lockfile',
    );
    expect(read("docs/testing/run-assistant-runtime-e2e.sh")).toContain(
      "PNPM_REGISTRY=${PNPM_REGISTRY:-https://registry.npmjs.org}",
    );

    const dockerIgnore = read(".dockerignore");
    expect(dockerIgnore).toContain("**/.env");
    expect(dockerIgnore).toContain("**/.env.*");
    expect(dockerIgnore).toContain("!**/.env.example");
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
    expect(agentService).toContain("networks:\n      - backend");
    expect(agentService).not.toMatch(/OS_SECURITY_KEY:\s*[A-Za-z0-9_-]{20,}/u);

    expect(backupService).toMatch(
      /migrate:[\s\S]*condition: service_completed_successfully/u,
    );
    expect(backupService).toMatch(
      /agent-migrate:[\s\S]*condition: service_completed_successfully/u,
    );
  });

  it("builds AgentOS from a pinned, locked, non-root multi-stage image", () => {
    const dockerfile = read("apps/agent/Dockerfile");
    const dockerIgnore = read("apps/agent/.dockerignore");
    const rootDockerIgnore = read(".dockerignore");

    expect(dockerfile).toMatch(
      /^FROM python:3\.13\.13-slim-trixie@sha256:[a-f0-9]{64} AS builder/mu,
    );
    expect(dockerfile).toMatch(
      /^FROM python:3\.13\.13-slim-trixie@sha256:[a-f0-9]{64} AS runtime/mu,
    );
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

  it("keeps every production credential out of rendered Compose config", () => {
    const secretKeys = [
      "POSTGRES_PASSWORD",
      "MIGRATOR_DATABASE_PASSWORD",
      "RUNTIME_DATABASE_PASSWORD",
      "BACKUP_DATABASE_PASSWORD",
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
    ] as const;
    const sentinels = Object.fromEntries(
      secretKeys.map((key, index) => [key, `compose-secret-${index}-sentinel`]),
    );
    const sandbox = mkdtempSync(path.join(tmpdir(), "compose-secrets-"));
    const secretFileEnv: Record<string, string> = {};
    const runner = read("infra/docker/run-with-secret-env.sh");
    expect(runner).toContain("/run/secrets/*");
    expect(runner).toContain('exec "$@"');
    expect(runner).not.toMatch(/set\s+-[^\n]*x/u);
    expect(read(".gitignore")).toContain(".secrets/");
    try {
      for (const key of secretKeys) {
        const secretFile = path.join(sandbox, key.toLowerCase());
        writeFileSync(secretFile, sentinels[key], { mode: 0o600 });
        chmodSync(secretFile, 0o600);
        secretFileEnv[`${key}_FILE`] = secretFile;
      }
      const rendered = spawnSync("docker", ["compose", "config"], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          ...secretFileEnv,
          BETTER_AUTH_URL: "http://127.0.0.1:3000",
          BETTER_AUTH_TRUSTED_ORIGINS: "http://127.0.0.1:3000",
          ASSISTANT_PUBLIC_ORIGIN: "https://portal.example.com",
          PUBLIC_HOST: "127.0.0.1",
        },
      });

      expect(rendered.status, rendered.stderr).toBe(0);
      for (const sentinel of Object.values(sentinels)) {
        expect(rendered.stdout).not.toContain(sentinel);
        expect(rendered.stderr).not.toContain(sentinel);
      }
      expect(rendered.stdout).toContain("source: postgres_password");
      expect(rendered.stdout).toContain("source: os_security_key");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
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
    expect(config).toContain(
      'command: "node .next/standalone/apps/web/server.js"',
    );
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
