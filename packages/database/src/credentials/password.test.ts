import { describe, expect, it } from "vitest";

import { assertPasswordPolicy, hashPassword, verifyPassword } from "./password";

describe("password credentials", () => {
  it("hashes and verifies a valid 12-character passphrase with Argon2id", async () => {
    const password = "ValidPass#12";

    const hash = await hashPassword(password);

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).toContain("$m=65536,t=3,p=4$");
    expect(Buffer.from(hash.split("$").at(-1) ?? "", "base64")).toHaveLength(
      32,
    );
    await expect(verifyPassword(hash, password)).resolves.toBe(true);
  });

  it("returns false for a wrong password", async () => {
    const hash = await hashPassword("ValidPass#12");

    await expect(verifyPassword(hash, "WrongPass#12")).resolves.toBe(false);
  });

  it("rejects an overlong password before Argon2 verification", async () => {
    const hash = await hashPassword("ValidPass#12");

    await expect(verifyPassword(hash, "x".repeat(129))).rejects.toThrow(
      "Password must contain between 12 and 128 characters",
    );
  });

  it.each(["short", "x".repeat(129)])(
    "rejects a password outside the 12 to 128 character policy",
    async (password) => {
      expect(() => assertPasswordPolicy(password)).toThrow(
        "Password must contain between 12 and 128 characters",
      );
      await expect(hashPassword(password)).rejects.toThrow(
        "Password must contain between 12 and 128 characters",
      );
    },
  );

  it("uses JavaScript string length consistently with Better Auth", () => {
    expect(() => assertPasswordPolicy("😀".repeat(64))).not.toThrow();
    expect(() => assertPasswordPolicy("😀".repeat(65))).toThrow();
  });

  it("never includes the rejected password in an error", () => {
    const password = "secret";

    expect(() => assertPasswordPolicy(password)).toThrowError(
      expect.not.objectContaining({
        message: expect.stringContaining(password),
      }),
    );
  });
});
