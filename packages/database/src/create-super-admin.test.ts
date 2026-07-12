import { describe, expect, it, vi } from "vitest";

import {
  bootstrapSuperAdmin,
  runCreateSuperAdminCli,
  type SuperAdminBootstrapRepository,
} from "./create-super-admin";

function fixture(overrides?: { existing?: number }) {
  const operations: string[] = [];
  const tx: SuperAdminBootstrapRepository = {
    countSuperAdmins: vi.fn(async () => overrides?.existing ?? 0),
    findSuperAdminRoleId: vi.fn(async () => "role-super-admin"),
    createUser: vi.fn(async (input) => {
      operations.push(`user:${input.email}:${input.username}`);
      expect(input).toMatchObject({
        identityRealm: "workforce",
        status: "active",
        mustChangePassword: true,
      });
      return "user-1";
    }),
    createCredentialAccount: vi.fn(async (userId, passwordHash) => {
      operations.push(`credential:${userId}:${passwordHash}`);
    }),
    assignRole: vi.fn(async (userId, roleId) => {
      operations.push(`role:${userId}:${roleId}`);
    }),
    writeAudit: vi.fn(async (event) => {
      operations.push(`audit:${event.action}:${event.targetId}`);
    }),
    transaction: async (work) => {
      operations.push("tx");
      return work(tx);
    },
  };

  return { operations, repository: tx };
}

describe("secure super-admin bootstrap", () => {
  it.each([
    { email: "", username: "root", password: "long-enough-password" },
    {
      email: "root@example.test",
      username: "",
      password: "long-enough-password",
    },
    { email: "root@example.test", username: "root", password: "" },
  ])("refuses absent identity or credential fields", async (input) => {
    const { repository } = fixture();

    await expect(
      bootstrapSuperAdmin({
        input,
        repository,
        hashPassword: vi.fn(async () => "hash"),
      }),
    ).rejects.toThrow("required");
  });

  it("refuses when any super administrator already exists", async () => {
    const { repository } = fixture({ existing: 1 });

    await expect(
      bootstrapSuperAdmin({
        input: {
          email: "root@example.test",
          username: "root",
          password: "long-enough-password",
        },
        repository,
        hashPassword: vi.fn(async () => "hash"),
      }),
    ).rejects.toThrow("already exists");
  });

  it("normalizes identities and creates the complete account atomically", async () => {
    const { operations, repository } = fixture();
    const hashPassword = vi.fn(async () => "argon2id-hash");

    await bootstrapSuperAdmin({
      input: {
        email: "  ROOT@Example.TEST  ",
        username: "  ROOT  ",
        password: "long-enough-password",
      },
      repository,
      hashPassword,
    });

    expect(hashPassword).toHaveBeenCalledWith("long-enough-password");
    expect(operations).toEqual([
      "tx",
      "user:root@example.test:root",
      "credential:user-1:argon2id-hash",
      "role:user-1:role-super-admin",
      "audit:bootstrap.super_admin_created:user-1",
    ]);
  });

  it("reads the password through hidden prompts and never logs it", async () => {
    const { repository } = fixture();
    const log = vi.fn();
    const readVisible = vi
      .fn()
      .mockResolvedValueOnce("root@example.test")
      .mockResolvedValueOnce("root");
    const readHidden = vi
      .fn()
      .mockResolvedValueOnce("long-enough-password")
      .mockResolvedValueOnce("long-enough-password");

    await runCreateSuperAdminCli({
      isTTY: true,
      prompt: { readVisible, readHidden },
      repository,
      hashPassword: vi.fn(async () => "hash"),
      log,
    });

    expect(readHidden).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith("Super administrator created.");
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "long-enough-password",
    );
  });

  it("refuses non-TTY execution and mismatched confirmation", async () => {
    const { repository } = fixture();
    const prompt = {
      readVisible: vi.fn(async () => "root@example.test"),
      readHidden: vi
        .fn()
        .mockResolvedValueOnce("long-enough-password")
        .mockResolvedValueOnce("different-password"),
    };

    await expect(
      runCreateSuperAdminCli({
        isTTY: false,
        prompt,
        repository,
        hashPassword: vi.fn(async () => "hash"),
        log: vi.fn(),
      }),
    ).rejects.toThrow("TTY");

    await expect(
      runCreateSuperAdminCli({
        isTTY: true,
        prompt,
        repository,
        hashPassword: vi.fn(async () => "hash"),
        log: vi.fn(),
      }),
    ).rejects.toThrow("do not match");
  });
});
