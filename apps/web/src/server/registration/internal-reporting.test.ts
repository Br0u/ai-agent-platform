import { afterEach, describe, expect, it, vi } from "vitest";

import { reportRegistrationInternalError } from "./internal-reporting";

afterEach(() => vi.restoreAllMocks());

describe("registration internal reporting", () => {
  it("logs only a fixed structured envelope without sensitive error data", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const failure = Object.assign(
      new Error(
        "password=Secret123 company=Sensitive Co reviewNote=deny SQL=INSERT",
        {
          cause: {
            query: "insert into users values ($1)",
            params: ["customer@example.test", "argon-hash"],
          },
        },
      ),
      { code: "23505", identifier: "customer@example.test" },
    );
    failure.name = "SensitiveCompany";

    expect(() => reportRegistrationInternalError(failure)).not.toThrow();

    const serialized = JSON.stringify(consoleError.mock.calls);
    expect(serialized).toContain("registration.internal_error");
    expect(serialized).toContain("23505");
    expect(serialized).toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/iu);
    for (const secret of [
      "Secret123",
      "Sensitive Co",
      "reviewNote",
      "INSERT",
      "customer@example.test",
      "argon-hash",
      "params",
      "cause",
      "SensitiveCompany",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("never throws when the logging sink fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("sink unavailable");
    });
    expect(() =>
      reportRegistrationInternalError(new Error("sensitive")),
    ).not.toThrow();
  });
});
