import { describe, expect, it } from "vitest";

import { matchesPostgresConstraint } from "./database-errors";

describe("PostgreSQL constraint error classification", () => {
  it("matches a direct driver error", () => {
    expect(
      matchesPostgresConstraint(
        { code: "23505", constraint: "users_email_lower_unique" },
        "23505",
        ["users_email_lower_unique"],
      ),
    ).toBe(true);
  });

  it("matches an ORM-wrapped driver error", () => {
    expect(
      matchesPostgresConstraint(
        {
          cause: {
            cause: {
              code: "23505",
              constraint: "users_email_lower_unique",
            },
          },
        },
        "23505",
        ["users_email_lower_unique"],
      ),
    ).toBe(true);
  });

  it("continues through a wrapper that copies SQLSTATE but omits constraint", () => {
    expect(
      matchesPostgresConstraint(
        {
          code: "23505",
          cause: {
            code: "23505",
            constraint: "users_email_lower_unique",
          },
        },
        "23505",
        ["users_email_lower_unique"],
      ),
    ).toBe(true);
  });

  it("does not match another unique constraint or a missing constraint", () => {
    expect(
      matchesPostgresConstraint(
        { code: "23505", constraint: "accounts_provider_id_account_id_unique" },
        "23505",
        ["users_email_lower_unique"],
      ),
    ).toBe(false);
    expect(
      matchesPostgresConstraint({ code: "23505" }, "23505", [
        "users_email_lower_unique",
      ]),
    ).toBe(false);
  });

  it("terminates safely for a cyclic cause chain", () => {
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(
      matchesPostgresConstraint(cyclic, "23505", ["users_email_lower_unique"]),
    ).toBe(false);
  });
});
