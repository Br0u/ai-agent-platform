import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../drizzle/0003_registration_company_name.sql", import.meta.url),
  "utf8",
);

describe("registration company-name migration", () => {
  it("keeps existing 0002 databases upgradeable and leaves no default", () => {
    expect(migration).toMatch(
      /ADD COLUMN "company_name" varchar\(240\) DEFAULT '__aap_legacy_missing_company_name_v1__' NOT NULL/iu,
    );
    expect(migration).toMatch(/ALTER COLUMN "company_name" DROP DEFAULT/iu);
  });
});
