import { describe, expect, it, vi } from "vitest";

import type { WorkforceActor } from "../auth/access";
import type { AuditWriteInput } from "../auth/audit";
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
const ARCHIVE = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

const actor: WorkforceActor = {
  userId: ACTOR_ID,
  realm: "workforce",
  status: "active",
  displayName: "Admin",
  mustChangePassword: false,
  permissions: ["admin:assistant:skills:upload"],
};

const uploadedRevision = {
  version: "1" as const,
  revision: {
    id: REVISION_ID,
    skillId: SKILL_ID,
    name: "safe-skill",
    number: 7,
    state: "published" as const,
    sourceType: "upload" as const,
    artifactSha256: "a".repeat(64),
    createdBy: ACTOR_ID,
    createdAt: "2027-01-15T08:00:00Z",
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
  const requirePermission = vi.fn(async () => {
    operations.push("permission:upload");
    return actor;
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
      return uploadedRevision;
    }),
  };
  const commands = createAdminSkillCommands({
    requireTrustedUploadMutation,
    requirePermission,
    audit,
    client,
    requestIdFactory: () => REQUEST_ID,
    now: options.now ?? (() => NOW_MS),
  });
  return {
    operations,
    requireTrustedUploadMutation,
    requirePermission,
    audit,
    client,
    commands,
  };
}

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
    expect(context).toMatchObject({
      actor,
      requestId: REQUEST_ID,
      action: "upload",
    });
    expect(Object.isFrozen(context)).toBe(true);
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
    await current.commands.upload(upload, { archive: ARCHIVE });
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
    expect(current.audit.write).toHaveBeenCalledTimes(2);
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
        expectedArtifactSha256: "a".repeat(64),
      }),
    ).resolves.toEqual(uploadedRevision);
    expect(current.client.uploadSkill).toHaveBeenCalledWith({
      actor: ACTOR_ID,
      requestId: REQUEST_ID,
      archive: ARCHIVE,
      targetSkillId: SKILL_ID,
      expectedArtifactSha256: "a".repeat(64),
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
