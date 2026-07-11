import { hash, type Options, verify } from "@node-rs/argon2";

const MIN_PASSWORD_CHARACTERS = 12;
const MAX_PASSWORD_CHARACTERS = 128;

const ARGON2ID_OPTIONS = {
  // @node-rs/argon2 exposes Algorithm as an ambient const enum, which cannot
  // be referenced with isolatedModules. Its documented Argon2id value is 2.
  algorithm: 2,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
} as const satisfies Options;

export function assertPasswordPolicy(password: string): void {
  // Better Auth applies min/maxPasswordLength with JavaScript string.length.
  // Keep the shared primitive identical so direct provisioning and sign-in
  // cannot disagree on Unicode passwords.
  const characterCount = password.length;

  if (
    characterCount < MIN_PASSWORD_CHARACTERS ||
    characterCount > MAX_PASSWORD_CHARACTERS
  ) {
    throw new Error("Password must contain between 12 and 128 characters");
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordPolicy(password);
  return hash(password, ARGON2ID_OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return verify(passwordHash, password, ARGON2ID_OPTIONS);
}
