import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(process.cwd(), "../..");
const compose = readFileSync(`${workspaceRoot}/compose.yaml`, "utf8");
const nginx = [
  readFileSync(`${workspaceRoot}/infra/nginx/nginx.conf`, "utf8"),
  readFileSync(`${workspaceRoot}/infra/nginx/default.conf.template`, "utf8"),
].join("\n");
const deploymentGuide = readFileSync(
  `${workspaceRoot}/docs/deployment/server-readiness.md`,
  "utf8",
);

function serviceBlock(name: string, nextName: string): string {
  return compose.split(`\n  ${name}:`)[1]?.split(`\n  ${nextName}:`)[0] ?? "";
}

describe("trusted proxy deployment boundary", () => {
  it("publishes only the proxy and keeps the web origin private", () => {
    expect(serviceBlock("web", "proxy")).not.toMatch(/^    ports:/m);
    expect(serviceBlock("proxy", "backup")).toMatch(/^    ports:/m);
  });

  it("enables trusted Nginx IP handling for the isolated web service", () => {
    const web = serviceBlock("web", "proxy");
    expect(web).toContain('TRUST_NGINX_PROXY: "true"');
    expect(web).not.toContain("NGINX_TRUSTED_PROXY_CIDRS");
  });

  it("overwrites client-supplied forwarding headers", () => {
    expect(nginx).toContain("proxy_set_header X-Real-IP $remote_addr;");
    expect(nginx).toContain("proxy_set_header X-Forwarded-For $remote_addr;");
    expect(nginx).not.toContain("$proxy_add_x_forwarded_for");
  });

  it("documents that proxy trust requires an equivalent isolated origin", () => {
    expect(deploymentGuide).toContain("TRUST_NGINX_PROXY=true");
    expect(deploymentGuide).toContain("禁止客户端直连 Web origin");
    expect(deploymentGuide).toContain("应用无法验证 TCP 直连来源");
    expect(deploymentGuide).not.toContain("NGINX_TRUSTED_PROXY_CIDRS");
  });
});
