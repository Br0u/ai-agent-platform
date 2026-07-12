import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("production deployment security contracts", () => {
  it("keeps the runtime role away from schema and audit mutation privileges", () => {
    const sql = `${read("infra/postgres/01-roles.sql")}\n${read("infra/postgres/02-runtime-grants.sql")}`;
    expect(sql).toContain("ai_agent_migrator");
    expect(sql).toContain("ai_agent_runtime");
    expect(sql).toMatch(/GRANT CREATE ON DATABASE .* TO ai_agent_migrator/);
    expect(sql).toMatch(
      /ALTER DEFAULT PRIVILEGES[\s\S]*GRANT SELECT, INSERT, UPDATE, DELETE/,
    );
    expect(sql).toMatch(
      /REVOKE UPDATE, DELETE ON TABLE public\.audit_logs FROM ai_agent_runtime/,
    );
    expect(sql).not.toMatch(/GRANT (CREATE|ALL).*ai_agent_runtime/);
  });

  it("runs role bootstrap as the configured PostgreSQL owner", () => {
    const script = read("infra/postgres/01-roles.sh");
    expect(script).toContain('--username="$POSTGRES_USER"');
    expect(script).toContain('--dbname="$POSTGRES_DB"');
  });

  it("limits only POST requests on exact authentication routes", () => {
    const nginx = read("infra/nginx/nginx.conf");
    expect(nginx).toContain(
      "limit_req_zone $auth_post_key zone=auth_post_per_ip:10m rate=5r/m;",
    );
    expect(nginx).toContain("limit_req zone=auth_post_per_ip burst=5 nodelay;");
    expect(nginx).toContain("limit_req_status 429;");
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
    const webService = compose.split("\n  web:\n")[1]?.split("\n  proxy:\n")[0];
    expect(webService).toBeDefined();
    expect(webService).not.toMatch(/^\s{4}ports:/m);
  });

  it("defines the pinned PostgreSQL-backed CI and browser gates", () => {
    const workflow = read(".github/workflows/ci.yml");
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
      "TEST_DATABASE_URL",
    ]) {
      expect(env).toContain(key);
    }
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
