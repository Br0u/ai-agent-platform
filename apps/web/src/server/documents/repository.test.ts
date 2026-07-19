import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/server/documents/repository.ts"),
  "utf8",
);
const serviceSource = readFileSync(
  resolve(process.cwd(), "src/server/documents/service.ts"),
  "utf8",
);

describe("document database repository contract", () => {
  it("locks every authoritative authorization row in the mutation transaction", () => {
    expect(source).toMatch(
      /FROM users u[\s\S]*JOIN user_roles ur[\s\S]*JOIN roles r[\s\S]*JOIN role_permissions rp[\s\S]*JOIN permissions p/u,
    );
    expect(source).toContain("FOR SHARE OF u, ur, r, rp, p");
    expect(source).toContain("p.key = ${permission}");
  });

  it("requires the qualifying locked role itself to be super_admin for delete permission", () => {
    expect(source).toContain(
      "(${requireSuperAdmin} = false OR r.name = 'super_admin')",
    );
    expect(serviceSource).toContain(
      'requireSuperAdmin: permission === "admin:docs:delete"',
    );
  });

  it("injects the active database transaction into the audit repository", () => {
    expect(source).toContain(
      "createAuditWriter(createDatabaseAuditRepository(databaseTx))",
    );
  });

  it("only inserts revisions and only performs permanent route transitions", () => {
    expect(source).toContain("databaseTx.insert(contentRevisions)");
    expect(source).not.toMatch(
      /\.update\(contentRevisions\)|\.delete\(contentRevisions\)/u,
    );
    expect(source).toContain('.set({ state: "alias" })');
    expect(source).toContain('.set({ state: "canonical" })');
    expect(source).not.toMatch(/\.delete\(contentRoutes\)/u);
    expect(source).not.toContain('.set({ state: "reserved" })');
  });

  it("locks slug reservations and only reuses same-document reserved or canonical routes", () => {
    expect(source).toMatch(
      /FROM content_routes[\s\S]*WHERE slug = \$\{slug\}[\s\S]*FOR UPDATE/u,
    );
    expect(source).toContain("route.content_id === documentId");
    expect(source).toContain(
      '(route.state === "reserved" || route.state === "canonical")',
    );
  });

  it("projects list DTO columns without loading document bodies and uses one snapshot", () => {
    const projection = source.slice(
      source.indexOf("const documentListProjection"),
      source.indexOf("const SLUG_UNIQUE_CONSTRAINTS"),
    );
    expect(projection).not.toContain("content.body");
    expect(source).toContain(".select(documentListProjection)");
    expect(source).toContain('{ isolationLevel: "repeatable read" }');
  });

  it("loads a selected document by joining its exact current immutable revision", () => {
    expect(source).toContain("revisionId: contentRevisions.id");
    expect(source).toMatch(
      /innerJoin\([\s\S]*contentRevisions[\s\S]*eq\(contentRevisions\.contentId, content\.id\)[\s\S]*eq\(contentRevisions\.revision, content\.revision\)[\s\S]*\)/u,
    );
  });
});
