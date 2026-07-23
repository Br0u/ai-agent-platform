import { describe, expect, it, vi } from "vitest";

import type { WorkforceActor } from "../auth/access";
import { createAuditWriter, type AuditWriteInput } from "../auth/audit";
import { MutationRequestError } from "../http/require-trusted-mutation";
import {
  AdminSkillCommandError,
  createAdminSkillCommands,
  type AuthorizedSkillCommand,
} from "./admin-skill-commands";
import {
  SkillRegistryClientError,
  type SkillRegistryClient,
} from "./skill-registry-client";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const SKILL_ID = "33333333-3333-4333-8333-333333333333";
const REVISION_ID = "44444444-4444-4444-8444-444444444444";
const NOW_MS = 1_800_000_000_000;
const ASSURED_AT = Math.floor(NOW_MS / 1000) - 300;
const ARCHIVE = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

const actor: WorkforceActor = {
  userId: ACTOR_ID,
  realm: "workforce",
  status: "active",
  displayName: "Admin",
  mustChangePassword: false,
  twoFactorEnabled: true,
  permissions: [
    "admin:assistant:skills:upload",
    "admin:assistant:skills:review",
  ],
};

const pendingRevision = {
  version: "1" as const,
  revision: {
    id: REVISION_ID,
    skillId: SKILL_ID,
    name: "safe-skill",
    number: 7,
    state: "pending_review" as const,
    sourceType: "upload" as const,
    artifactSha256: "a".repeat(64),
    createdBy: ACTOR_ID,
    createdAt: "2027-01-15T08:00:00Z",
    reviewedBy: null,
    reviewedAt: null,
  },
};

function request(contentType = "application/json"): Request {
  return new Request("https://admin.example.test/api/skills", {
    method: "POST",
    headers: {
      origin: "https://admin.example.test",
      "sec-fetch-site": "same-origin",
      "content-type": contentType,
    },
  });
}

function fixture(options: { now?: () => number } = {}) {
  const operations: string[] = [];
  const requireTrustedUploadMutation = vi.fn(() => {
    operations.push("trusted:upload");
  });
  const requireTrustedJsonMutation = vi.fn(() => {
    operations.push("trusted:review");
  });
  const requirePermission = vi.fn(async () => {
    operations.push("permission:upload");
    return actor;
  });
  const requireSensitiveAction = vi.fn(async () => {
    operations.push("permission:review");
    return { actor, assuredAt: ASSURED_AT };
  });
  const audit = {
    write: vi.fn(async (input: AuditWriteInput) => {
      operations.push(`audit:${input.event}`);
    }),
  };
  const client: SkillRegistryClient = {
    listSkills: vi.fn(),
    getRevision: vi.fn(),
    getFile: vi.fn(),
    uploadSkill: vi.fn(async () => {
      operations.push("registry:upload");
      return pendingRevision;
    }),
    reviewRevision: vi.fn(async () => {
      operations.push("registry:review");
      return {
        version: "1" as const,
        revision: {
          ...pendingRevision.revision,
          state: "published" as const,
          reviewedBy: ACTOR_ID,
          reviewedAt: "2027-01-15T08:01:00Z",
        },
      };
    }),
  };
  const commands = createAdminSkillCommands({
    requireTrustedUploadMutation,
    requireTrustedJsonMutation,
    requirePermission,
    requireSensitiveAction,
    audit,
    client,
    requestIdFactory: () => REQUEST_ID,
    now: options.now ?? (() => NOW_MS),
  });
  return {
    operations,
    requireTrustedUploadMutation,
    requireTrustedJsonMutation,
    requirePermission,
    requireSensitiveAction,
    audit,
    client,
    commands,
  };
}

const reviewInput = {
  skillId: SKILL_ID,
  revisionId: REVISION_ID,
  decision: "approve" as const,
  reason: null,
  expectedState: "pending_review" as const,
  attestations: {
    contentReviewed: true as const,
    usageRightsConfirmed: true as const,
    executionRiskAccepted: true as const,
    reviewerAuthorizationConfirmed: true as const,
  },
};

describe("admin skill command authorization", () => {
  it("requires trusted upload mutation then the exact upload permission", async () => {
    const current = fixture();
    const context = await current.commands.authorize(
      request("multipart/form-data; boundary=safe"),
      "upload",
    );

    expect(current.operations).toEqual(["trusted:upload", "permission:upload"]);
    expect(current.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant:skills:upload",
    );
    expect(current.requireSensitiveAction).not.toHaveBeenCalled();
    expect(context).toMatchObject({
      actor,
      requestId: REQUEST_ID,
      action: "upload",
    });
    expect(Object.isFrozen(context)).toBe(true);
  });

  it("requires trusted JSON and recent password plus MFA for review", async () => {
    const current = fixture();
    const context = await current.commands.authorize(request(), "review");

    expect(current.operations).toEqual(["trusted:review", "permission:review"]);
    expect(current.requireSensitiveAction).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant:skills:review",
      { recentWithinSeconds: 600, mfaRequired: true },
    );
    expect(context).toMatchObject({ action: "review" });
  });

  it("stops before auth, request ID, audit and registry when trust fails", async () => {
    const current = fixture();
    current.requireTrustedUploadMutation.mockImplementation(() => {
      throw new MutationRequestError();
    });

    await expect(
      current.commands.authorize(
        request("multipart/form-data; boundary=safe"),
        "upload",
      ),
    ).rejects.toBeInstanceOf(MutationRequestError);
    expect(current.requirePermission).not.toHaveBeenCalled();
    expect(current.audit.write).not.toHaveBeenCalled();
    expect(current.client.uploadSkill).not.toHaveBeenCalled();
  });

  it("rejects forged, replayed, wrong-action and expired grants", async () => {
    let now = NOW_MS;
    const current = fixture({ now: () => now });
    const forged = {} as AuthorizedSkillCommand;
    await expect(
      current.commands.upload(forged, { archive: ARCHIVE }),
    ).rejects.toEqual(new AdminSkillCommandError("authorization_failed"));

    const upload = await current.commands.authorize(
      request("multipart/form-data; boundary=safe"),
      "upload",
    );
    await expect(current.commands.review(upload, reviewInput)).rejects.toEqual(
      new AdminSkillCommandError("authorization_failed"),
    );
    await expect(
      current.commands.upload(upload, { archive: ARCHIVE }),
    ).rejects.toEqual(new AdminSkillCommandError("authorization_failed"));

    const expired = await current.commands.authorize(
      request("multipart/form-data; boundary=safe"),
      "upload",
    );
    now += 30_000;
    await expect(
      current.commands.upload(expired, { archive: ARCHIVE }),
    ).rejects.toEqual(new AdminSkillCommandError("authorization_failed"));
    expect(current.audit.write).not.toHaveBeenCalled();
  });
});

describe("admin skill upload command", () => {
  it("writes paired minimal audit records and returns the strict response", async () => {
    const current = fixture();
    const context = await current.commands.authorize(
      request("multipart/form-data; boundary=safe"),
      "upload",
    );

    await expect(
      current.commands.upload(context, {
        archive: ARCHIVE,
        targetSkillId: SKILL_ID,
      }),
    ).resolves.toEqual(pendingRevision);
    expect(current.client.uploadSkill).toHaveBeenCalledWith({
      actor: ACTOR_ID,
      requestId: REQUEST_ID,
      archive: ARCHIVE,
      targetSkillId: SKILL_ID,
    });
    expect(current.operations.slice(-3)).toEqual([
      "audit:assistant.skill_upload_requested",
      "registry:upload",
      "audit:assistant.skill_upload_completed",
    ]);
    expect(current.audit.write.mock.calls.map(([value]) => value)).toEqual([
      {
        event: "assistant.skill_upload_requested",
        actor: { realm: "workforce", userId: ACTOR_ID },
        target: { type: "assistant_skill_revision" },
        metadata: {
          skillId: SKILL_ID,
          revisionId: null,
          revisionNo: null,
          digest: null,
          requestId: REQUEST_ID,
          result: "requested",
        },
      },
      {
        event: "assistant.skill_upload_completed",
        actor: { realm: "workforce", userId: ACTOR_ID },
        target: { type: "assistant_skill_revision", id: REVISION_ID },
        metadata: {
          skillId: SKILL_ID,
          revisionId: REVISION_ID,
          revisionNo: 7,
          digest: "aaaaaaaaaaaa",
          requestId: REQUEST_ID,
          result: "success",
        },
      },
    ]);
    expect(JSON.stringify(current.audit.write.mock.calls)).not.toMatch(
      /filename|PK|source|archive/i,
    );
  });

  it("pairs a registry failure audit and preserves the primary error", async () => {
    const current = fixture();
    const failure = new SkillRegistryClientError("REGISTRY_UNAVAILABLE");
    vi.mocked(current.client.uploadSkill).mockRejectedValueOnce(failure);
    current.audit.write.mockImplementation(async (input) => {
      if (input.event === "assistant.skill_upload_completed") {
        throw new Error("secondary audit failure");
      }
    });
    const context = await current.commands.authorize(
      request("multipart/form-data; boundary=safe"),
      "upload",
    );

    await expect(
      current.commands.upload(context, { archive: ARCHIVE }),
    ).rejects.toBe(failure);
    expect(current.audit.write).toHaveBeenCalledTimes(2);
    expect(current.audit.write.mock.calls[1]?.[0]).toMatchObject({
      event: "assistant.skill_upload_completed",
      metadata: { result: "failure" },
    });
  });
});

describe("admin skill review command", () => {
  it("requires exact true attestations and passes assurance epoch seconds", async () => {
    const current = fixture();
    const context = await current.commands.authorize(request(), "review");

    await expect(
      current.commands.review(context, reviewInput),
    ).resolves.toEqual(
      expect.objectContaining({
        revision: expect.objectContaining({ state: "published" }),
      }),
    );
    expect(current.client.reviewRevision).toHaveBeenCalledWith({
      actor: ACTOR_ID,
      requestId: REQUEST_ID,
      skillId: SKILL_ID,
      revisionId: REVISION_ID,
      assuredAt: ASSURED_AT,
      input: {
        decision: "approve",
        reason: null,
        expectedState: "pending_review",
        attestations: reviewInput.attestations,
      },
    });
    expect(current.operations.slice(-3)).toEqual([
      "audit:assistant.skill_review_requested",
      "registry:review",
      "audit:assistant.skill_review_completed",
    ]);
    expect(current.audit.write.mock.calls[0]?.[0]).toMatchObject({
      event: "assistant.skill_review_requested",
      target: { type: "assistant_skill_revision", id: REVISION_ID },
      metadata: {
        skillId: SKILL_ID,
        revisionId: REVISION_ID,
        revisionNo: null,
        digest: null,
        result: "requested",
      },
    });
    const insert = vi.fn(async () => undefined);
    const strictAudit = createAuditWriter({ insert });
    for (const [payload] of current.audit.write.mock.calls) {
      await strictAudit.write(payload);
    }
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["missing attestation", { ...reviewInput, attestations: undefined }],
    [
      "false attestation",
      {
        ...reviewInput,
        attestations: {
          ...reviewInput.attestations,
          contentReviewed: false,
        },
      },
    ],
    ["extra input key", { ...reviewInput, unexpected: true }],
    ["upstream state conflict", { ...reviewInput }],
  ])("fails closed for %s", async (scenario, input) => {
    const current = fixture();
    if (scenario === "upstream state conflict") {
      vi.mocked(current.client.reviewRevision).mockRejectedValueOnce(
        new SkillRegistryClientError("REVISION_STATE_CONFLICT"),
      );
    }
    const context = await current.commands.authorize(request(), "review");

    await expect(
      current.commands.review(context, input as never),
    ).rejects.toBeInstanceOf(Error);
    if (scenario !== "upstream state conflict") {
      expect(current.client.reviewRevision).not.toHaveBeenCalled();
      expect(current.audit.write).not.toHaveBeenCalled();
    } else {
      expect(current.audit.write).toHaveBeenCalledTimes(2);
      expect(current.audit.write.mock.calls[1]?.[0]).toMatchObject({
        metadata: { result: "failure" },
      });
    }
  });

  it("never puts the full rejection reason in audit metadata", async () => {
    const current = fixture();
    const context = await current.commands.authorize(request(), "review");
    const reason = "private rejection details that must stay out of audit";

    await current.commands.review(context, {
      ...reviewInput,
      decision: "reject",
      reason,
    });

    expect(JSON.stringify(current.audit.write.mock.calls)).not.toContain(
      reason,
    );
  });
});
