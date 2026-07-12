import { describe, expect, it, vi } from "vitest";
import { makeSignature } from "better-auth/crypto";

import {
  AUTH_ACTION_INITIAL_STATE,
  createAuthActions,
  createRecoveryChallengeActions,
  createRecoveryCodeService,
  createStaffTotpRemovalService,
  createStaffSecurityActions,
  safeReturnPath,
  verifySignedChallengeCookie,
  type AuthActionDependencies,
  type LoginUser,
} from "./actions";

describe("staff password, TOTP, recovery, and re-auth actions", () => {
  it("accepts only an untampered Better Auth challenge signature", async () => {
    const secret = "unit-test-secret-that-is-at-least-32-characters";
    const identifier = "2fa-pending-challenge";
    const signed = `${identifier}.${await makeSignature(identifier, secret)}`;
    await expect(verifySignedChallengeCookie(signed, secret)).resolves.toBe(
      identifier,
    );
    await expect(
      verifySignedChallengeCookie(`${signed}tampered`, secret),
    ).resolves.toBeNull();
  });
  it("consumes a signed pending challenge recovery code and commits only the replacement session", async () => {
    const repository = {
      consume: vi.fn(async () => ({
        userId: "staff-1",
        mustChangePassword: false,
        sessionToken: "replacement-token",
      })),
    };
    const commitSession = vi.fn(async () => undefined);
    const clearChallenge = vi.fn(async () => undefined);
    const actions = createRecoveryChallengeActions({
      getChallenge: async () => "signed-challenge",
      verifyChallenge: async () => "challenge-id",
      repository,
      commitSession,
      clearChallenge,
    });

    await expect(
      actions.verify(
        form({
          recoveryCode: "AAAAA-BBBBB-CCCCC-DDDDD",
          returnTo: "/admin/users",
        }),
      ),
    ).resolves.toEqual({ kind: "success", redirectTo: "/admin/users" });
    expect(repository.consume).toHaveBeenCalledWith(
      "challenge-id",
      "AAAAA-BBBBB-CCCCC-DDDDD",
    );
    expect(commitSession).toHaveBeenCalledWith("replacement-token");
    expect(clearChallenge).toHaveBeenCalledOnce();
  });

  it("rejects recovery-code reuse without committing a session", async () => {
    const commitSession = vi.fn(async () => undefined);
    const actions = createRecoveryChallengeActions({
      getChallenge: async () => "signed-challenge",
      verifyChallenge: async () => "challenge-id",
      repository: { consume: vi.fn(async () => null) },
      commitSession,
      clearChallenge: vi.fn(async () => undefined),
    });
    await expect(
      actions.verify(form({ recoveryCode: "AAAAA-BBBBB-CCCCC-DDDDD" })),
    ).resolves.toEqual({ kind: "error", code: "AUTH_INVALID_CREDENTIALS" });
    expect(commitSession).not.toHaveBeenCalled();
  });
  function securityFixture() {
    const gateway = {
      changePassword: vi.fn(async () => ({
        response: { token: "changed" },
        headers: new Headers(),
      })),
      enableTwoFactor: vi.fn(async () => ({
        response: {
          totpURI: "otpauth://totp/AI%20Agent%20Platform:staff",
          backupCodes: [],
        },
        headers: new Headers(),
      })),
      verifyTOTP: vi.fn(async () => ({
        response: { token: "new-token", user: { id: "staff-1" } },
        headers: new Headers(),
      })),
      disableTwoFactor: vi.fn(async () => ({
        response: { status: true },
        headers: new Headers(),
      })),
      signIn: vi.fn(async () => ({
        response: {
          twoFactorRedirect: true as const,
          twoFactorMethods: ["totp"],
        },
        headers: new Headers(),
      })),
      revokeNewSession: vi.fn(async () => undefined),
    };
    const repository = {
      current: vi.fn(async () => ({
        userId: "staff-1",
        sessionId: "old-session",
        mustChangePassword: true,
        twoFactorEnabled: false,
      })),
      finalizePasswordChange: vi.fn(async () => undefined),
      revokeSession: vi.fn(async () => undefined),
      readMustChangePassword: vi.fn(async () => true),
      removeTwoFactor: vi.fn(async () => undefined),
      writeAudit: vi.fn(async () => undefined),
      writeLoginFailureAudit: vi.fn(async () => undefined),
    };
    const recovery = { generate: vi.fn(async () => ["RC-ONE", "RC-TWO"]) };
    const commitCookies = vi.fn(async () => undefined);
    const clearCookies = vi.fn(async () => undefined);
    const requireAssurance = vi.fn(async () => ({ userId: "staff-1" }));
    return {
      actions: createStaffSecurityActions({
        gateway,
        repository,
        recovery,
        commitCookies,
        getHeaders: async () => new Headers({ cookie: "old=1" }),
        clearCookies,
        requireAssurance,
      }),
      clearCookies,
      commitCookies,
      gateway,
      recovery,
      requireAssurance,
      repository,
    };
  }

  it("removes only the current actor's TOTP after recent assurance and password confirmation", async () => {
    const { actions, clearCookies, gateway, repository, requireAssurance } =
      securityFixture();
    repository.current.mockResolvedValueOnce({
      userId: "staff-1",
      sessionId: "session-1",
      mustChangePassword: false,
      twoFactorEnabled: true,
    });
    await expect(
      actions.removeTwoFactor(
        form({ password: "Permanent#1234", returnTo: "/admin/users" }),
      ),
    ).resolves.toEqual({
      kind: "success",
      redirectTo: "/staff/two-factor?returnTo=%2Fadmin%2Fusers",
    });
    expect(requireAssurance).toHaveBeenCalledOnce();
    expect(repository.removeTwoFactor).toHaveBeenCalledWith(
      "staff-1",
      "Permanent#1234",
    );
    expect(gateway.disableTwoFactor).not.toHaveBeenCalled();
    expect(repository.removeTwoFactor.mock.invocationCallOrder[0]).toBeLessThan(
      clearCookies.mock.invocationCallOrder[0]!,
    );
    expect(clearCookies).toHaveBeenCalledOnce();
  });

  it("stops TOTP removal before Better Auth when recent assurance is denied or changes identity", async () => {
    const denied = securityFixture();
    denied.requireAssurance.mockRejectedValueOnce(
      new Error("AUTH_MFA_REQUIRED"),
    );
    await expect(
      denied.actions.removeTwoFactor(form({ password: "Permanent#1234" })),
    ).resolves.toMatchObject({ kind: "error" });
    expect(denied.gateway.disableTwoFactor).not.toHaveBeenCalled();
    expect(denied.repository.removeTwoFactor).not.toHaveBeenCalled();

    const switched = securityFixture();
    switched.requireAssurance.mockResolvedValueOnce({ userId: "other-user" });
    switched.repository.current.mockResolvedValueOnce({
      userId: "staff-1",
      sessionId: "session-1",
      mustChangePassword: false,
      twoFactorEnabled: true,
    });
    await expect(
      switched.actions.removeTwoFactor(form({ password: "Permanent#1234" })),
    ).resolves.toMatchObject({ kind: "error" });
    expect(switched.gateway.disableTwoFactor).not.toHaveBeenCalled();
    expect(switched.repository.removeTwoFactor).not.toHaveBeenCalled();
  });

  it("keeps the current cookie when the atomic TOTP transaction fails", async () => {
    const { actions, clearCookies, commitCookies, repository } =
      securityFixture();
    repository.current.mockResolvedValueOnce({
      userId: "staff-1",
      sessionId: "session-1",
      mustChangePassword: false,
      twoFactorEnabled: true,
    });
    repository.removeTwoFactor.mockRejectedValueOnce(
      new Error("audit unavailable"),
    );
    await expect(
      actions.removeTwoFactor(form({ password: "Permanent#1234" })),
    ).resolves.toEqual({
      kind: "error",
      code: "AUTH_INFRASTRUCTURE_FAILURE",
    });
    expect(commitCookies).not.toHaveBeenCalled();
    expect(clearCookies).not.toHaveBeenCalled();
  });

  it("changes the password through Better Auth headers and revokes other sessions", async () => {
    const { actions, gateway, repository } = securityFixture();
    const result = await actions.changePassword(
      form({ currentPassword: "Temporary#123", newPassword: "Permanent#1234" }),
    );
    expect(gateway.changePassword).toHaveBeenCalledWith({
      currentPassword: "Temporary#123",
      newPassword: "Permanent#1234",
      revokeOtherSessions: true,
      headers: expect.any(Headers),
    });
    expect(repository.finalizePasswordChange).toHaveBeenCalledWith(
      "staff-1",
      "changed",
    );
    expect(result).toEqual({
      kind: "success",
      redirectTo: "/staff/two-factor?returnTo=%2Fadmin",
    });
  });

  it("enables TOTP with empty built-in codes, then returns project recovery codes only once", async () => {
    const { actions, gateway, recovery } = securityFixture();
    const result = await actions.enrollTwoFactor(
      form({ password: "Permanent#1234" }),
    );
    expect(gateway.enableTwoFactor).toHaveBeenCalledWith({
      password: "Permanent#1234",
      headers: expect.any(Headers),
    });
    expect(recovery.generate).toHaveBeenCalledWith("staff-1");
    expect(result).toEqual({
      kind: "enrollment",
      totpURI: expect.stringMatching(/^otpauth:/),
      recoveryCodes: ["RC-ONE", "RC-TWO"],
    });
  });

  it("rejects initial TOTP enrollment for an already-enrolled actor before Better Auth", async () => {
    const { actions, gateway, repository } = securityFixture();
    repository.current.mockResolvedValueOnce({
      userId: "staff-1",
      sessionId: "session-1",
      mustChangePassword: false,
      twoFactorEnabled: true,
    });
    await expect(
      actions.enrollTwoFactor(form({ password: "Permanent#1234" })),
    ).resolves.toEqual({ kind: "error", code: "AUTH_TOTP_ALREADY_ENABLED" });
    expect(gateway.enableTwoFactor).not.toHaveBeenCalled();
  });

  it("hard-codes trustDevice false and re-reads forced-password state after a real TOTP challenge", async () => {
    const { actions, gateway, repository } = securityFixture();
    const result = await actions.verifyTwoFactor(
      form({ code: "123456", returnTo: "/admin/users" }),
    );
    expect(gateway.verifyTOTP).toHaveBeenCalledWith({
      code: "123456",
      trustDevice: false,
      headers: expect.any(Headers),
    });
    expect(repository.readMustChangePassword).toHaveBeenCalledWith("staff-1");
    expect(result).toEqual({
      kind: "success",
      redirectTo: "/staff/change-password?returnTo=%2Fadmin%2Fusers",
    });
  });

  it("audits TOTP enablement only when verification completes an authenticated enrollment", async () => {
    const { actions, repository } = securityFixture();
    repository.current.mockResolvedValueOnce({
      userId: "staff-1",
      sessionId: "enrollment-session",
      mustChangePassword: false,
      twoFactorEnabled: false,
    });
    await actions.verifyTwoFactor(form({ code: "123456" }));
    expect(repository.writeAudit).toHaveBeenCalledWith(
      "auth.totp_enabled",
      "staff-1",
    );

    repository.writeAudit.mockClear();
    repository.current.mockResolvedValueOnce(null as never);
    await actions.verifyTwoFactor(form({ code: "123456" }));
    expect(repository.writeAudit).not.toHaveBeenCalled();
  });

  it("revokes the incoming old session before re-auth password verification", async () => {
    const { actions, gateway, repository } = securityFixture();
    await actions.reauthenticate(
      form({
        identifier: "staff@example.test",
        password: "Permanent#1234",
        code: "123456",
        returnTo: "/admin/users",
      }),
    );
    expect(repository.revokeSession.mock.invocationCallOrder[0]).toBeLessThan(
      gateway.signIn.mock.invocationCallOrder[0],
    );
    expect(gateway.signIn).toHaveBeenCalledWith(
      expect.objectContaining({
        rememberMe: false,
        headers: expect.any(Headers),
      }),
    );
    expect(gateway.verifyTOTP).toHaveBeenCalledWith({
      code: "123456",
      trustDevice: false,
      headers: expect.any(Headers),
    });
  });

  it("creates no new TOTP session after a bad re-auth password", async () => {
    const { actions, gateway } = securityFixture();
    gateway.signIn.mockRejectedValueOnce(new Error("bad password"));
    await expect(
      actions.reauthenticate(
        form({
          identifier: "staff",
          password: "wrong-password",
          code: "123456",
        }),
      ),
    ).resolves.toMatchObject({ kind: "error" });
    expect(gateway.verifyTOTP).not.toHaveBeenCalled();
  });

  it("revokes an unexpected password-only re-auth session before failing", async () => {
    const { actions, gateway } = securityFixture();
    gateway.signIn.mockResolvedValueOnce({
      response: { user: { id: "staff-1" }, token: "password-only-token" },
      headers: new Headers(),
    } as never);
    await expect(
      actions.reauthenticate(
        form({
          identifier: "staff",
          password: "Permanent#1234",
          code: "123456",
        }),
      ),
    ).resolves.toMatchObject({ kind: "error" });
    expect(gateway.revokeNewSession).toHaveBeenCalledWith(
      "password-only-token",
    );
  });

  it("rejects a re-auth identity switch before cookie commit", async () => {
    const { actions, clearCookies, commitCookies, gateway, repository } =
      securityFixture();
    gateway.verifyTOTP.mockResolvedValueOnce({
      response: { token: "other-token", user: { id: "other-user" } },
      headers: new Headers({
        "set-cookie": "aap_staff_session=other; Path=/; HttpOnly",
      }),
    });
    await expect(
      actions.reauthenticate(
        form({
          identifier: "staff",
          password: "Permanent#1234",
          code: "123456",
          returnTo: "/admin/users",
        }),
      ),
    ).resolves.toEqual({ kind: "error", code: "AUTH_INVALID_CREDENTIALS" });
    expect(gateway.revokeNewSession).toHaveBeenCalledWith("other-token");
    expect(clearCookies).toHaveBeenCalledOnce();
    expect(repository.writeLoginFailureAudit).toHaveBeenCalledOnce();
    expect(commitCookies).not.toHaveBeenCalled();
  });

  it("keeps forced-password precedence after successful re-auth TOTP", async () => {
    const { actions, repository } = securityFixture();
    repository.readMustChangePassword.mockResolvedValueOnce(true);
    await expect(
      actions.reauthenticate(
        form({
          identifier: "staff",
          password: "Permanent#1234",
          code: "123456",
          returnTo: "/admin/users",
        }),
      ),
    ).resolves.toEqual({
      kind: "success",
      redirectTo: "/staff/change-password?returnTo=%2Fadmin%2Fusers",
    });
  });

  it.each(["finalizer", "cookie"] as const)(
    "compensates replacement session on post-password %s failure",
    async (boundary) => {
      const { actions, clearCookies, commitCookies, gateway, repository } =
        securityFixture();
      if (boundary === "finalizer")
        repository.finalizePasswordChange.mockRejectedValueOnce(
          new Error("database down"),
        );
      else commitCookies.mockRejectedValueOnce(new Error("cookie down"));

      await expect(
        actions.changePassword(
          form({
            currentPassword: "Temporary#123",
            newPassword: "Permanent#1234",
          }),
        ),
      ).resolves.toEqual({
        kind: "error",
        code: "AUTH_INFRASTRUCTURE_FAILURE",
      });
      expect(gateway.revokeNewSession).toHaveBeenCalledWith("changed");
      expect(clearCookies).toHaveBeenCalledOnce();
    },
  );

  it("sends enrolled staff to the allow-listed destination after changing the forced password", async () => {
    const { actions, repository } = securityFixture();
    repository.current.mockResolvedValueOnce({
      userId: "staff-1",
      sessionId: "old-session",
      mustChangePassword: true,
      twoFactorEnabled: true,
    });
    await expect(
      actions.changePassword(
        form({
          currentPassword: "Temporary#123",
          newPassword: "Permanent#1234",
          returnTo: "/admin/users",
        }),
      ),
    ).resolves.toEqual({ kind: "success", redirectTo: "/admin/users" });
  });

  it("sends staff without TOTP to enrollment after changing the forced password", async () => {
    const { actions, repository } = securityFixture();
    repository.current.mockResolvedValueOnce({
      userId: "staff-1",
      sessionId: "old-session",
      mustChangePassword: true,
      twoFactorEnabled: false,
    });
    await expect(
      actions.changePassword(
        form({
          currentPassword: "Temporary#123",
          newPassword: "Permanent#1234",
          returnTo: "/admin/users",
        }),
      ),
    ).resolves.toEqual({
      kind: "success",
      redirectTo: "/staff/two-factor?returnTo=%2Fadmin%2Fusers",
    });
  });

  it("forwards staged TOTP enrollment cookies only after recovery codes are stored", async () => {
    const { actions, commitCookies, gateway, recovery } = securityFixture();
    const stagedHeaders = new Headers({
      "set-cookie": "aap_staff_session=enrolled; Path=/; HttpOnly",
    });
    gateway.enableTwoFactor.mockResolvedValueOnce({
      response: { totpURI: "otpauth://totp/test", backupCodes: [] },
      headers: stagedHeaders,
    });
    await actions.enrollTwoFactor(form({ password: "Permanent#1234" }));
    expect(recovery.generate.mock.invocationCallOrder[0]).toBeLessThan(
      commitCookies.mock.invocationCallOrder[0],
    );
    expect(commitCookies).toHaveBeenCalledWith(stagedHeaders);
  });

  it("rolls back TOTP and clears cookies when recovery-code storage fails", async () => {
    const { actions, clearCookies, gateway, recovery } = securityFixture();
    recovery.generate.mockRejectedValueOnce(new Error("storage failed"));
    gateway.disableTwoFactor.mockRejectedValueOnce(
      new Error("rollback failed"),
    );
    await expect(
      actions.enrollTwoFactor(form({ password: "Permanent#1234" })),
    ).resolves.toMatchObject({ kind: "error" });
    expect(gateway.disableTwoFactor).toHaveBeenCalledWith({
      password: "Permanent#1234",
      headers: expect.any(Headers),
    });
    expect(clearCookies).toHaveBeenCalledOnce();
  });

  it("revokes a newly verified session when the authoritative post-TOTP read fails", async () => {
    const { actions, gateway, repository } = securityFixture();
    repository.readMustChangePassword.mockRejectedValueOnce(
      new Error("db down"),
    );
    await expect(
      actions.verifyTwoFactor(form({ code: "123456" })),
    ).resolves.toMatchObject({ kind: "error" });
    expect(gateway.revokeNewSession).toHaveBeenCalledWith("new-token");
  });

  it.each([
    "https://evil.example/admin",
    "/staff/re-auth?returnTo=/admin/users",
    "/console",
  ])(
    "falls back to /admin for unlisted re-auth return path %s",
    async (returnTo) => {
      const { actions, repository } = securityFixture();
      repository.readMustChangePassword.mockResolvedValue(false);
      const result = await actions.reauthenticate(
        form({
          identifier: "staff",
          password: "Permanent#1234",
          code: "123456",
          returnTo,
        }),
      );
      expect(result).toEqual({ kind: "success", redirectTo: "/admin" });
    },
  );
});

describe("atomic workforce TOTP removal", () => {
  function fixture(
    options: {
      passwordValid?: boolean;
      factorExists?: boolean;
      auditFails?: boolean;
    } = {},
  ) {
    const state = {
      twoFactorEnabled: true,
      factorExists: options.factorExists ?? true,
      sessions: ["session-1", "session-2"],
      audit: [] as unknown[],
    };
    const operations: string[] = [];
    const repository = {
      lockCredential: vi.fn(async () => ({
        realm: "workforce" as const,
        status: "active" as const,
        twoFactorEnabled: state.twoFactorEnabled,
        passwordHash: "argon-hash",
      })),
      lockFactor: vi.fn(async () => state.factorExists),
      deleteFactor: vi.fn(async () => {
        operations.push("factor:delete");
        state.factorExists = false;
      }),
      markDisabled: vi.fn(async () => {
        operations.push("user:disable-totp");
        state.twoFactorEnabled = false;
      }),
      revokeWorkforceSessions: vi.fn(async () => {
        operations.push("sessions:revoke");
        const count = state.sessions.length;
        state.sessions = [];
        return count;
      }),
      writeAudit: vi.fn(async (event) => {
        operations.push("audit");
        if (options.auditFails) throw new Error("audit unavailable");
        state.audit.push(event);
      }),
    };
    const transaction = async <T>(
      work: (value: typeof repository) => Promise<T>,
    ): Promise<T> => {
      const snapshot = structuredClone(state);
      try {
        return await work(repository);
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    };
    const verifyPassword = vi.fn(async () => options.passwordValid ?? true);
    return {
      operations,
      repository,
      service: createStaffTotpRemovalService({
        repository: { transaction },
        verifyPassword,
      }),
      state,
      verifyPassword,
    };
  }

  it("verifies the credential then atomically removes TOTP, revokes every session, and audits", async () => {
    const { operations, repository, service, state, verifyPassword } =
      fixture();
    await service.remove("staff-1", "Permanent#1234");
    expect(verifyPassword).toHaveBeenCalledWith("argon-hash", "Permanent#1234");
    expect(repository.revokeWorkforceSessions).toHaveBeenCalledWith("staff-1");
    expect(operations).toEqual([
      "factor:delete",
      "user:disable-totp",
      "sessions:revoke",
      "audit",
    ]);
    expect(state.sessions).toEqual([]);
    expect(state.audit).toEqual([
      {
        event: "auth.totp_disabled",
        actorId: "staff-1",
        targetId: "staff-1",
      },
    ]);
    expect(JSON.stringify(state.audit)).not.toMatch(/password|hash/i);
  });

  it("rejects an invalid current password without changing factor or sessions", async () => {
    const { repository, service, state } = fixture({ passwordValid: false });
    await expect(service.remove("staff-1", "Wrong#1234")).rejects.toMatchObject(
      { code: "AUTH_INVALID_CREDENTIALS" },
    );
    expect(repository.deleteFactor).not.toHaveBeenCalled();
    expect(state.factorExists).toBe(true);
    expect(state.sessions).toHaveLength(2);
  });

  it("rejects a concurrent or missing factor under lock", async () => {
    const { repository, service } = fixture({ factorExists: false });
    await expect(
      service.remove("staff-1", "Permanent#1234"),
    ).rejects.toMatchObject({ code: "AUTH_TOTP_NOT_ENABLED" });
    expect(repository.deleteFactor).not.toHaveBeenCalled();
  });

  it("rolls back factor and sessions when the audit write fails", async () => {
    const { service, state } = fixture({ auditFails: true });
    await expect(service.remove("staff-1", "Permanent#1234")).rejects.toThrow(
      "audit unavailable",
    );
    expect(state.factorExists).toBe(true);
    expect(state.twoFactorEnabled).toBe(true);
    expect(state.sessions).toEqual(["session-1", "session-2"]);
    expect(state.audit).toEqual([]);
  });
});

describe("project recovery codes", () => {
  it("stores only one-way hashes and returns plaintext only at generation", async () => {
    let stored = "";
    const service = createRecoveryCodeService({
      randomBytes: () => Buffer.from("0123456789abcdef", "hex"),
      transaction: async (work) =>
        work({
          read: async () => stored,
          write: async (_userId, value) => {
            stored = value;
          },
          writeUsedAudit: async () => undefined,
        }),
    });
    const codes = await service.generate("staff-1", 2);
    expect(codes).toHaveLength(2);
    expect(stored).not.toContain(codes[0]!);
    expect(JSON.parse(stored)).toEqual([
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    ]);
  });

  it("atomically consumes one matching hash and rejects reuse", async () => {
    let stored = "";
    const repository = {
      read: async () => stored,
      write: async (_userId: string, value: string) => {
        stored = value;
      },
      writeUsedAudit: async () => undefined,
    };
    const service = createRecoveryCodeService({
      transaction: async (work) => work(repository),
    });
    const [code] = await service.generate("staff-1", 1);
    await expect(service.verifyAndConsume("staff-1", code!)).resolves.toBe(
      true,
    );
    await expect(service.verifyAndConsume("staff-1", code!)).resolves.toBe(
      false,
    );
  });

  it("writes the exact recovery-code-used audit event when a code is consumed", async () => {
    let stored = "";
    const writeUsedAudit = vi.fn().mockResolvedValue(undefined);
    const service = createRecoveryCodeService({
      transaction: async (work) =>
        work({
          read: async () => stored,
          write: async (_userId, value) => {
            stored = value;
          },
          writeUsedAudit,
        }),
    });
    const [code] = await service.generate("staff-1", 1);

    await expect(service.verifyAndConsume("staff-1", code!)).resolves.toBe(
      true,
    );
    expect(writeUsedAudit).toHaveBeenCalledOnce();
    expect(writeUsedAudit).toHaveBeenCalledWith(
      "auth.recovery_code_used",
      "staff-1",
    );
  });

  it("leaves the recovery code unconsumed when the audit write fails", async () => {
    let stored = "";
    let failAudit = true;
    const repository = {
      read: async () => stored,
      write: async (_userId: string, value: string) => {
        stored = value;
      },
      writeUsedAudit: async () => {
        if (failAudit) throw new Error("audit unavailable");
      },
    };
    const service = createRecoveryCodeService({
      transaction: async (work) => {
        const snapshot = stored;
        try {
          return await work(repository);
        } catch (error) {
          stored = snapshot;
          throw error;
        }
      },
    });
    const [code] = await service.generate("staff-1", 1);

    await expect(service.verifyAndConsume("staff-1", code!)).rejects.toThrow(
      "audit unavailable",
    );
    failAudit = false;
    await expect(service.verifyAndConsume("staff-1", code!)).resolves.toBe(
      true,
    );
  });
});

const activeCustomer: LoginUser = {
  id: "customer-1",
  realm: "customer",
  status: "active",
  mustChangePassword: false,
  twoFactorEnabled: false,
};

const activeStaff: LoginUser = {
  id: "staff-1",
  realm: "workforce",
  status: "active",
  mustChangePassword: false,
  twoFactorEnabled: false,
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function staged<T>(response: T): { response: T; headers: Headers } {
  return { response, headers: new Headers() };
}

function fixture(overrides: Partial<AuthActionDependencies> = {}) {
  const customer = {
    signInEmail: vi.fn().mockResolvedValue(
      staged({
        user: { id: activeCustomer.id },
        token: "new-customer-token",
      }),
    ),
    signOut: vi.fn().mockResolvedValue(staged({ success: true })),
    revokeNewSession: vi.fn().mockResolvedValue(undefined),
  };
  const staff = {
    signInEmail: vi.fn().mockResolvedValue(
      staged({
        user: { id: activeStaff.id },
        token: "new-staff-token",
      }),
    ),
    signInUsername: vi.fn().mockResolvedValue(
      staged({
        user: { id: activeStaff.id },
        token: "new-staff-token",
      }),
    ),
    signOut: vi.fn().mockResolvedValue(staged({ success: true })),
    revokeNewSession: vi.fn().mockResolvedValue(undefined),
  };
  const users = {
    findById: vi
      .fn()
      .mockImplementation(
        async (id: string): Promise<LoginUser | null> =>
          id === activeCustomer.id ? activeCustomer : activeStaff,
      ),
  };
  const audit = { write: vi.fn().mockResolvedValue(undefined) };
  const reportInternalError = vi.fn();
  const commitCookies = vi.fn().mockResolvedValue(undefined);
  const cookieStore = { delete: vi.fn(), set: vi.fn() };
  const dependencies: AuthActionDependencies = {
    customer,
    staff,
    users,
    audit,
    reportInternalError,
    commitCookies,
    getHeaders: async () =>
      new Headers({ "user-agent": "test-agent", "x-real-ip": "127.0.0.1" }),
    getCookieStore: async () => cookieStore,
    ...overrides,
  };

  return {
    actions: createAuthActions(dependencies),
    audit,
    cookieStore,
    customer,
    commitCookies,
    reportInternalError,
    staff,
    users,
  };
}

describe("safeReturnPath", () => {
  it.each([
    ["customer", "/console", "/console"],
    [
      "customer",
      "/console/profile?tab=security#password",
      "/console/profile?tab=security#password",
    ],
    ["workforce", "/admin/products", "/admin/products"],
    ["workforce", "/admin/site#settings", "/admin/site#settings"],
  ] as const)("allows a canonical %s path", (realm, value, expected) => {
    expect(safeReturnPath(realm, value)).toBe(expected);
  });

  it.each([
    "//evil.example/console",
    "/\\evil",
    "https://evil.example/console",
    "/console/%2e%2e/admin",
    "/console%2fprofile",
    "/console/../admin",
    "/console\\profile",
    "/login?returnTo=/console",
    "/staff/login?returnTo=/admin",
    "/console-old",
    "/admin-old",
  ])(
    "rejects an off-origin, encoded, traversal, or login-loop path: %s",
    (value) => {
      expect(safeReturnPath("customer", value)).toBe("/console");
      expect(safeReturnPath("workforce", value)).toBe("/admin");
    },
  );
});

describe("customer login action", () => {
  it("normalizes email and hard-codes the seven-day remember policy", async () => {
    const { actions, commitCookies, customer } = fixture();

    await actions.customerLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({
        email: "  ALICE@EXAMPLE.TEST  ",
        password: "ValidPass#12",
        rememberMe: "false",
        realm: "workforce",
      }),
    );

    expect(customer.signInEmail).toHaveBeenCalledWith({
      email: "alice@example.test",
      password: "ValidPass#12",
      rememberMe: true,
      headers: expect.any(Headers),
    });
    expect(commitCookies).toHaveBeenCalledWith("customer", expect.any(Headers));
  });

  it.each([
    { status: "pending_review", redirectTo: "/console/onboarding" },
    { status: "rejected", redirectTo: "/console/onboarding" },
    { status: "active", redirectTo: "/console/profile" },
  ] as const)(
    "redirects $status customers by authoritative status",
    async ({ status, redirectTo }) => {
      const { actions, users } = fixture();
      users.findById.mockResolvedValue({ ...activeCustomer, status });

      const result = await actions.customerLogin(
        AUTH_ACTION_INITIAL_STATE,
        form({
          email: "alice@example.test",
          password: "ValidPass#12",
          returnTo: "/console/profile",
        }),
      );

      expect(result).toEqual({ kind: "success", redirectTo });
    },
  );

  it("rejects disabled users, revokes a just-created session, and clears only the customer cookie", async () => {
    const { actions, cookieStore, customer, users } = fixture();
    users.findById.mockResolvedValue({ ...activeCustomer, status: "disabled" });

    const result = await actions.customerLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ email: "alice@example.test", password: "ValidPass#12" }),
    );

    expect(result).toEqual({ kind: "error", code: "AUTH_INVALID_CREDENTIALS" });
    expect(customer.revokeNewSession).toHaveBeenCalledWith(
      "new-customer-token",
    );
    expect(cookieStore.delete).toHaveBeenCalledWith("aap_customer_session");
    expect(cookieStore.delete).not.toHaveBeenCalledWith("aap_staff_session");
  });

  it("compensates a post-sign-in repository failure without exposing it", async () => {
    const { actions, cookieStore, customer, users } = fixture();
    users.findById.mockRejectedValue(new Error("database connection secret"));

    const result = await actions.customerLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ email: "alice@example.test", password: "ValidPass#12" }),
    );

    expect(result).toEqual({ kind: "error", code: "AUTH_INVALID_CREDENTIALS" });
    expect(customer.revokeNewSession).toHaveBeenCalledWith(
      "new-customer-token",
    );
    expect(cookieStore.delete).toHaveBeenCalledWith("aap_customer_session");
  });

  it("stays generic even when both compensation operations fail", async () => {
    const {
      actions,
      commitCookies,
      cookieStore,
      customer,
      reportInternalError,
      users,
    } = fixture();
    users.findById.mockRejectedValue(new Error("repository unavailable"));
    customer.revokeNewSession.mockRejectedValue(new Error("revoke failed"));
    cookieStore.delete.mockImplementation(() => {
      throw new Error("cookie store failed");
    });
    reportInternalError.mockImplementation(() => {
      throw new Error("reporter failed");
    });

    await expect(
      actions.customerLogin(
        AUTH_ACTION_INITIAL_STATE,
        form({ email: "alice@example.test", password: "ValidPass#12" }),
      ),
    ).resolves.toEqual({
      kind: "error",
      code: "AUTH_INVALID_CREDENTIALS",
    });
    expect(customer.revokeNewSession).toHaveBeenCalledWith(
      "new-customer-token",
    );
    expect(cookieStore.delete).toHaveBeenCalledWith("aap_customer_session");
    expect(commitCookies).not.toHaveBeenCalled();
    expect(reportInternalError).toHaveBeenCalledWith(
      expect.any(AggregateError),
    );
  });
});

describe("staff login action", () => {
  it.each([
    ["STAFF@EXAMPLE.TEST", "email", "staff@example.test"],
    ["  Operator.One  ", "username", "operator.one"],
  ] as const)(
    "selects the server-owned %s method",
    async (identifier, method, normalized) => {
      const { actions, staff } = fixture();

      await actions.staffLogin(
        AUTH_ACTION_INITIAL_STATE,
        form({
          identifier,
          password: "ValidPass#12",
          rememberMe: "true",
          realm: "customer",
        }),
      );

      const expected = {
        password: "ValidPass#12",
        rememberMe: false,
        headers: expect.any(Headers),
        [method]: normalized,
      };
      expect(
        method === "email" ? staff.signInEmail : staff.signInUsername,
      ).toHaveBeenCalledWith(expected);
      expect(
        method === "email" ? staff.signInUsername : staff.signInEmail,
      ).not.toHaveBeenCalled();
    },
  );

  it("never bypasses an actual TOTP challenge for a forced-password user", async () => {
    const { actions, commitCookies, staff } = fixture();
    staff.signInUsername.mockResolvedValue(
      staged({
        twoFactorRedirect: true,
        twoFactorMethods: ["totp"],
      }),
    );

    const result = await actions.staffLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({
        identifier: "operator.one",
        password: "ValidPass#12",
        returnTo: "/admin/products",
      }),
    );

    expect(result).toEqual({
      kind: "success",
      redirectTo: "/staff/two-factor?returnTo=%2Fadmin%2Fproducts",
    });
    expect(commitCookies).toHaveBeenCalledWith(
      "workforce",
      expect.any(Headers),
    );
  });

  it("authenticates before applying the authoritative disabled-user policy", async () => {
    const { actions, commitCookies, staff, users } = fixture();
    users.findById.mockResolvedValue({ ...activeStaff, status: "disabled" });

    const result = await actions.staffLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ identifier: "operator.one", password: "ValidPass#12" }),
    );

    expect(staff.signInUsername).toHaveBeenCalledOnce();
    expect(staff.signOut).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "error", code: "AUTH_INVALID_CREDENTIALS" });
    expect(commitCookies).not.toHaveBeenCalled();
  });

  it("redirects an actual Better Auth challenge with a safe default return path", async () => {
    const { actions, staff } = fixture();
    staff.signInEmail.mockResolvedValue(
      staged({
        twoFactorRedirect: true,
        twoFactorMethods: ["totp"],
      }),
    );

    const result = await actions.staffLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ identifier: "staff@example.test", password: "ValidPass#12" }),
    );

    expect(result).toEqual({
      kind: "success",
      redirectTo: "/staff/two-factor?returnTo=%2Fadmin",
    });
  });

  it("forces password change before CMS when no TOTP challenge is active", async () => {
    const { actions, users } = fixture();
    const forcedPasswordUser = {
      ...activeStaff,
      mustChangePassword: true,
    };
    users.findById.mockResolvedValue(forcedPasswordUser);

    const result = await actions.staffLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({
        identifier: "operator.one",
        password: "ValidPass#12",
        returnTo: "/admin/products",
      }),
    );

    expect(result).toEqual({
      kind: "success",
      redirectTo: "/staff/change-password?returnTo=%2Fadmin%2Fproducts",
    });
  });

  it("compensates a post-sign-in workforce repository failure", async () => {
    const { actions, cookieStore, staff, users } = fixture();
    users.findById.mockRejectedValue(new Error("database unavailable"));

    const result = await actions.staffLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ identifier: "operator.one", password: "ValidPass#12" }),
    );

    expect(result).toEqual({ kind: "error", code: "AUTH_INVALID_CREDENTIALS" });
    expect(staff.revokeNewSession).toHaveBeenCalledWith("new-staff-token");
    expect(cookieStore.delete).toHaveBeenCalledWith("aap_staff_session");
    expect(cookieStore.delete).not.toHaveBeenCalledWith("aap_customer_session");
  });
});

describe("validation, errors, and audit", () => {
  it("rejects overlong passwords before either auth realm is called", async () => {
    const { actions, customer, staff } = fixture();

    const customerResult = await actions.customerLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ email: "alice@example.test", password: "x".repeat(129) }),
    );
    const staffResult = await actions.staffLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ identifier: "operator", password: "x".repeat(129) }),
    );

    expect(customerResult).toEqual({
      kind: "error",
      code: "AUTH_INVALID_CREDENTIALS",
    });
    expect(staffResult).toEqual({
      kind: "error",
      code: "AUTH_INVALID_CREDENTIALS",
    });
    expect(customer.signInEmail).not.toHaveBeenCalled();
    expect(staff.signInEmail).not.toHaveBeenCalled();
    expect(staff.signInUsername).not.toHaveBeenCalled();
  });

  it("maps raw Better Auth failures to one generic error and audits an enum reason", async () => {
    const { actions, audit, customer } = fixture();
    customer.signInEmail.mockRejectedValue(
      new Error("invalid password for alice@example.test; token=secret"),
    );

    const result = await actions.customerLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ email: "alice@example.test", password: "WrongPass#12" }),
    );

    expect(result).toEqual({ kind: "error", code: "AUTH_INVALID_CREDENTIALS" });
    expect(audit.write).toHaveBeenCalledWith({
      event: "auth.login_failure",
      target: { type: "system" },
      metadata: { reason: "invalid_credentials" },
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
    });
    expect(JSON.stringify(audit.write.mock.calls)).not.toMatch(
      /alice@example|WrongPass|token=secret/i,
    );
  });

  it("revokes the new session when success audit persistence fails", async () => {
    const audit = {
      write: vi.fn().mockRejectedValue(new Error("db unavailable")),
    };
    const { actions, cookieStore, customer } = fixture({ audit });

    const result = await actions.customerLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ email: "alice@example.test", password: "ValidPass#12" }),
    );

    expect(result).toEqual({ kind: "error", code: "AUTH_INVALID_CREDENTIALS" });
    expect(customer.revokeNewSession).toHaveBeenCalledWith(
      "new-customer-token",
    );
    expect(cookieStore.delete).toHaveBeenCalledWith("aap_customer_session");
  });
});

describe("logout actions", () => {
  it.each([
    ["customer", "aap_customer_session", "aap_staff_session"],
    ["workforce", "aap_staff_session", "aap_customer_session"],
  ] as const)(
    "revokes and clears only the %s realm",
    async (realm, ownCookie, otherCookie) => {
      const { actions, audit, cookieStore, customer, staff } = fixture();

      const result = await (realm === "customer"
        ? actions.customerLogout()
        : actions.staffLogout());

      const gateway = realm === "customer" ? customer : staff;
      const otherGateway = realm === "customer" ? staff : customer;
      expect(result).toEqual({
        kind: "success",
        redirectTo: realm === "customer" ? "/login" : "/staff/login",
      });
      expect(gateway.signOut).toHaveBeenCalledWith({
        headers: expect.any(Headers),
      });
      expect(otherGateway.signOut).not.toHaveBeenCalled();
      expect(cookieStore.delete).toHaveBeenCalledWith(ownCookie);
      expect(cookieStore.delete).not.toHaveBeenCalledWith(otherCookie);
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "auth.logout",
          target: { type: "session" },
        }),
      );
    },
  );

  it("still clears locally but fails without a success audit when server revocation throws", async () => {
    const { actions, audit, cookieStore, customer, reportInternalError } =
      fixture();
    customer.signOut.mockRejectedValue(new Error("revocation failed"));

    await expect(actions.customerLogout()).resolves.toEqual({
      kind: "error",
      code: "AUTH_LOGOUT_FAILED",
    });
    expect(cookieStore.delete).toHaveBeenCalledWith("aap_customer_session");
    expect(audit.write).not.toHaveBeenCalled();
    expect(reportInternalError).toHaveBeenCalledWith(
      expect.any(AggregateError),
    );
  });

  it("does not audit a logout when server revocation throws and client cleanup also fails", async () => {
    const { actions, audit, cookieStore, customer, reportInternalError } =
      fixture();
    customer.signOut.mockRejectedValue(new Error("revocation failed"));
    cookieStore.delete.mockImplementation(() => {
      throw new Error("cookie clear failed");
    });

    await expect(actions.customerLogout()).resolves.toEqual({
      kind: "error",
      code: "AUTH_LOGOUT_FAILED",
    });
    expect(audit.write).not.toHaveBeenCalled();
    expect(reportInternalError).toHaveBeenCalledWith(
      expect.any(AggregateError),
    );
  });

  it("treats success false as a server revocation failure while attempting both client cleanups", async () => {
    const {
      actions,
      audit,
      commitCookies,
      cookieStore,
      customer,
      reportInternalError,
    } = fixture();
    customer.signOut.mockResolvedValue(staged({ success: false }));

    await expect(actions.customerLogout()).resolves.toEqual({
      kind: "error",
      code: "AUTH_LOGOUT_FAILED",
    });
    expect(commitCookies).toHaveBeenCalledWith("customer", expect.any(Headers));
    expect(cookieStore.delete).toHaveBeenCalledWith("aap_customer_session");
    expect(audit.write).not.toHaveBeenCalled();
    expect(reportInternalError).toHaveBeenCalledWith(
      expect.any(AggregateError),
    );
  });

  it("audits a revoked server session but reports client cleanup failure", async () => {
    const { actions, audit, commitCookies, cookieStore, reportInternalError } =
      fixture();
    commitCookies.mockRejectedValue(new Error("expiry commit failed"));
    cookieStore.delete.mockImplementation(() => {
      throw new Error("cookie clear failed");
    });

    await expect(actions.customerLogout()).resolves.toEqual({
      kind: "error",
      code: "AUTH_LOGOUT_FAILED",
    });
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ event: "auth.logout" }),
    );
    expect(reportInternalError).toHaveBeenCalledWith(
      expect.any(AggregateError),
    );
  });

  it("allows redirect after server and client cleanup even when logout audit fails", async () => {
    const audit = { write: vi.fn().mockRejectedValue(new Error("audit down")) };
    const { actions, reportInternalError } = fixture({ audit });

    await expect(actions.customerLogout()).resolves.toEqual({
      kind: "success",
      redirectTo: "/login",
    });
    expect(audit.write).toHaveBeenCalledOnce();
    expect(reportInternalError).toHaveBeenCalledWith(
      expect.any(AggregateError),
    );
  });
});
