import { readFileSync } from "node:fs";
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
    ).toHaveLength(2);
  });

  it("uses separate migration and runtime URLs without publishing the origin", () => {
    const compose = read("compose.yaml");
    expect(compose).toContain("MIGRATOR_DATABASE_URL");
    expect(compose).toContain("RUNTIME_DATABASE_URL");
    expect(compose).toContain("BACKUP_DATABASE_URL");
    const webService = compose.split("\n  web:\n")[1]?.split("\n  proxy:\n")[0];
    const backupService = compose.split("\n  backup:\n")[1];
    expect(webService).toBeDefined();
    expect(webService).not.toMatch(/^\s{4}ports:/m);
    expect(backupService).toContain(
      "BACKUP_DATABASE_URL: ${BACKUP_DATABASE_URL:?Set BACKUP_DATABASE_URL in .env}",
    );
    expect(backupService).not.toContain("RUNTIME_DATABASE_PASSWORD");
    expect(backupService).not.toContain("PGUSER");
    const backupScript = read("infra/docker/backup.sh");
    expect(backupScript).toContain('"$BACKUP_DATABASE_URL"');
    expect(backupScript).not.toContain("PGDATABASE");
  });

  it("rejects unknown hosts before forwarding and preserves approved Host ports", () => {
    const nginx = read("infra/nginx/default.conf.template");
    const compose = read("compose.yaml");
    expect(nginx).toContain("${PUBLIC_HOST}");
    expect(nginx).toContain("return 421;");
    expect(nginx).toContain("proxy_set_header Host $http_host;");
    expect(nginx).toContain("127.0.0.1");
    expect(nginx).toContain("localhost");
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
    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).toContain("db:seed-auth-e2e");
    expect(workflow).toContain("playwright install --with-deps chromium");
    expect(workflow).toContain("e2e/auth-smoke.spec.ts");
    expect(workflow).toContain("docker build --target migrator");
    expect(workflow).toContain("docker build --target runner");
    expect(workflow).toContain("nginx -t");
    expect(workflow).toContain("docker network create");
    expect(workflow).toContain("--network-alias web");
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
    for (const key of [
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "BETTER_AUTH_TRUSTED_ORIGINS",
      "FEATURE_EMAIL_VERIFICATION=false",
      "MIGRATOR_DATABASE_URL",
      "RUNTIME_DATABASE_URL",
      "BACKUP_DATABASE_URL",
      "BACKUP_DATABASE_PASSWORD",
      "PUBLIC_HOST",
      "TEST_DATABASE_URL",
    ]) {
      expect(env).toContain(key);
    }
  });

  it("starts every production service in documented dependency order", () => {
    const runbook = read("docs/deployment/server-readiness.md");
    expect(runbook).toContain(
      "docker compose up -d --wait db migrate web proxy backup",
    );
    expect(runbook).toContain("`migrate`等待`db`健康后执行");
    expect(runbook).toContain("`web`和`backup`等待`migrate`成功退出");
    expect(runbook).toContain("`proxy`等待`web`健康");
    expect(runbook).not.toContain("后续服务按`service_healthy`顺序启动");

    for (const file of [
      "README.md",
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
        "FEATURE_EMAIL_VERIFICATION",
        "E2E_CUSTOMER_PASSWORD",
        "E2E_STAFF_PASSWORD",
        "E2E_ADMIN_PASSWORD",
      ]) {
        expect(block).toContain(`export ${key}=`);
      }
      expect(block).toMatch(
        /MIGRATOR_DATABASE_URL='postgresql:\/\/ai_agent_migrator:[^']+@db:5432\/ai_agent_platform'/u,
      );
      expect(block).toMatch(
        /RUNTIME_DATABASE_URL='postgresql:\/\/ai_agent_runtime:[^']+@db:5432\/ai_agent_platform'/u,
      );
      expect(block).toMatch(
        /BACKUP_DATABASE_URL='postgresql:\/\/ai_agent_backup:[^']+@db:5432\/ai_agent_platform'/u,
      );
      expect(block).not.toContain("export DATABASE_URL=");
      expect(block).toContain("config --quiet");
    }
    expect(acceptanceBlock).toContain("db migrate web proxy backup");
  });

  it("uses host webServer only when BASE_URL is absent", () => {
    const config = read("apps/web/playwright.config.ts");
    expect(config).toContain("process.env.BASE_URL");
    expect(config).toContain("process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
    expect(config).toMatch(/webServer:\s*externalBaseUrl\s*\?\s*undefined/u);
    expect(read("apps/web/e2e/auth-smoke.spec.ts")).toContain("test(");
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
