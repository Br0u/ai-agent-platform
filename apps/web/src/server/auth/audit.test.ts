import { describe, expect, it, vi } from "vitest";

import { createAuditWriter, type AuditRepository } from "./audit";

describe("audit writer", () => {
  it("stores only event-specific primitive metadata", async () => {
    const repository: AuditRepository = {
      insert: vi.fn().mockResolvedValue(undefined),
    };
    const writer = createAuditWriter(repository);

    await writer.write({
      event: "auth.login_failure",
      actor: { realm: "workforce", userId: "staff-1" },
      target: { type: "user", id: "target-1" },
      ipAddress: "192.0.2.10",
      userAgent: "browser",
      metadata: {
        reason: "invalid_credentials",
        password: "secret",
        passwordHash: "hash",
        sessionToken: "token",
        tokenHash: "token-hash",
        totpSecret: "totp-secret",
        unknownBodyKey: "drop-me",
        nested: { reason: "hidden secret" },
      },
    });

    expect(repository.insert).toHaveBeenCalledWith({
      action: "auth.login_failure",
      actorRealm: "workforce",
      actorUserId: "staff-1",
      targetType: "user",
      targetId: "target-1",
      ipAddress: "192.0.2.10",
      userAgent: "browser",
      metadata: { reason: "invalid_credentials" },
    });
  });

  it("drops non-primitive values even when their key is allow-listed", async () => {
    const repository: AuditRepository = {
      insert: vi.fn().mockResolvedValue(undefined),
    };
    const writer = createAuditWriter(repository);

    await writer.write({
      event: "auth.login_failure",
      target: { type: "user" },
      metadata: { reason: { password: "nested" } },
    });

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: {} }),
    );
  });

  it("propagates database failures", async () => {
    const writer = createAuditWriter({
      insert: vi.fn().mockRejectedValue(new Error("database unavailable")),
    });

    await expect(
      writer.write({
        event: "auth.logout",
        target: { type: "session" },
      }),
    ).rejects.toThrow("database unavailable");
  });
});
