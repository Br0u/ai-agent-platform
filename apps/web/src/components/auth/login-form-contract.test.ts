import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("login form interaction contract", () => {
  it.each(["customer-login-form.tsx", "staff-login-form.tsx"])(
    "uses React action state and a form pending state in %s",
    (fileName) => {
      const source = readFileSync(`src/components/auth/${fileName}`, "utf8");
      expect(source).toContain("useActionState");
      expect(source).toContain("useFormStatus");
      expect(source).not.toContain("@/server/auth/actions");
    },
  );

  it("keeps interactive targets at least 44px", () => {
    const source = readFileSync("src/components/auth/login-form.css", "utf8");
    expect(source).toMatch(/min-height:\s*44px/u);
    expect(source).toMatch(
      /\.auth-form__secondary a\s*\{[^}]*display:\s*inline-flex/isu,
    );
  });
});
