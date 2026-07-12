import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { RegistrationError } from "./service";
import {
  buildRegistrationRateLimitCleanupQuery,
  presentRegistrationCompanyName,
  rethrowReviewWriteConflict,
} from "./repository";

describe("review unique-conflict mapping", () => {
  it.each([
    "organization_memberships_organization_id_user_id_unique",
    "user_roles_user_id_role_id_unique",
  ])("maps %s to the stable reviewed conflict", (constraint) => {
    expect(() =>
      rethrowReviewWriteConflict({ code: "23505", constraint }),
    ).toThrowError(
      expect.objectContaining<Partial<RegistrationError>>({
        code: "REGISTRATION_ALREADY_REVIEWED",
      }),
    );
  });

  it.each([
    { code: "23505", constraint: "organizations_legal_name_key_unique" },
    { code: "23505", constraint: "users_email_lower_unique" },
    {
      code: "23503",
      constraint: "organization_memberships_user_id_users_id_fk",
    },
  ])("does not relabel unrelated database errors: $constraint", (error) => {
    expect(() => rethrowReviewWriteConflict(error)).toThrow(error);
  });

  it("recognizes a precise driver error wrapped by the ORM", () => {
    expect(() =>
      rethrowReviewWriteConflict({
        cause: {
          code: "23505",
          constraint: "organization_memberships_organization_id_user_id_unique",
        },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<RegistrationError>>({
        code: "REGISTRATION_ALREADY_REVIEWED",
      }),
    );
  });
});

describe("registration rate-limit cleanup", () => {
  it("deletes at most 100 expired registration buckets without touching auth keys", () => {
    const compiled = new PgDialect().sqlToQuery(
      buildRegistrationRateLimitCleanupQuery(123_456),
    );
    expect(compiled.sql).toMatch(/delete from "rate_limits"/iu);
    expect(compiled.sql).toMatch(/"key" like/iu);
    expect(compiled.sql).toMatch(/order by .*"last_request"/iu);
    expect(compiled.sql).toMatch(/limit \$\d+/iu);
    expect(compiled.params).toEqual(
      expect.arrayContaining(["registration:%", 123_456, 100]),
    );
  });
});

describe("legacy company presentation", () => {
  it("maps the explicit legacy sentinel to a safe display placeholder", () => {
    expect(
      presentRegistrationCompanyName("__aap_legacy_missing_company_name_v1__"),
    ).toBe("历史数据（公司信息缺失）");
    expect(presentRegistrationCompanyName("ACME")).toBe("ACME");
    expect(presentRegistrationCompanyName("[legacy-unavailable]")).toBe(
      "[legacy-unavailable]",
    );
  });
});
