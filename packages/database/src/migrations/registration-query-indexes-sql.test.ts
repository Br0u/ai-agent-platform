import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../drizzle/0004_registration_query_indexes.sql", import.meta.url),
  "utf8",
);

describe("registration query indexes migration", () => {
  it("adds rate-limit cleanup and paginated review indexes", () => {
    expect(migration).toContain("rate_limits_last_request_idx");
    expect(migration).toContain("customer_registrations_status_created_id_idx");
    expect(migration).toMatch(
      /"customer_registrations" USING btree \("status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST\)/iu,
    );
  });
});
