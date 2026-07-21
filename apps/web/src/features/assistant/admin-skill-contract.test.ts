import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ADMIN_SKILL_FILE_KINDS,
  ADMIN_SKILL_FINDING_CODES,
  ADMIN_SKILL_REVISION_STATES,
  parseAdminSkillFileResponse,
  parseAdminSkillListResponse,
  parseAdminSkillPermissionFlags,
  parseAdminSkillRevisionDetailResponse,
  parseAdminSkillRevisionResponse,
  type AdminSkillRevisionState,
} from "./admin-skill-contract";

const SKILL_ID = "11111111-1111-4111-8111-111111111111";
const REVISION_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-07-20T01:02:03.000Z";
const SHA256 = "a".repeat(64);

function revision() {
  return {
    id: REVISION_ID,
    skillId: SKILL_ID,
    name: "safe-skill",
    number: 3,
    state: "pending_review",
    sourceType: "upload",
    artifactSha256: SHA256,
    createdBy: ACTOR_ID,
    createdAt: NOW,
    reviewedBy: null,
    reviewedAt: null,
  };
}

function listResponse() {
  return {
    version: "1",
    skills: [
      {
        id: SKILL_ID,
        name: "safe-skill",
        createdAt: NOW,
        revision: {
          id: REVISION_ID,
          number: 3,
          state: "pending_review",
          sourceType: "upload",
          artifactSha256Prefix: SHA256.slice(0, 12),
          createdBy: ACTOR_ID,
          createdAt: NOW,
          reviewedBy: null,
          reviewedAt: null,
        },
      },
    ],
    page: { limit: 50, offset: 0, returned: 1 },
  };
}

function detailResponse() {
  return {
    version: "1",
    revision: {
      ...revision(),
      description: "A reviewed skill.",
      license: "Apache-2.0",
      compatibility: "agno>=2.7.2",
      allowedTools: ["get_skill_reference"],
      compressedSize: 512,
      extractedSize: 1024,
      fileCount: 2,
    },
    files: [
      {
        path: "SKILL.md",
        sha256: "b".repeat(64),
        size: 128,
        mediaType: "text/plain",
        kind: "manifest",
      },
      {
        path: "scripts/check.py",
        sha256: "c".repeat(64),
        size: 256,
        mediaType: "text/plain",
        kind: "script",
      },
    ],
    dependencies: {
      pythonModules: ["json"],
      unavailablePythonModules: [],
    },
    findings: [
      {
        path: "scripts/check.py",
        line: 2,
        code: "subprocess",
        message: "Subprocess-capable operation found; review required.",
        blocking: false,
      },
    ],
    previousPublishedRevisionId: null,
    diff: {
      truncated: false,
      files: [
        {
          path: "scripts/check.py",
          status: "added",
          binary: false,
          diff: "+print('safe')\n",
        },
      ],
    },
    reviewAttestations: {
      contentReviewed: true,
      usageRightsConfirmed: true,
      executionRiskAccepted: true,
      independentReviewerConfirmed: true,
    },
  };
}

describe("admin Skill contracts", () => {
  it("locks the version, states, upload source, file kinds and finding codes", () => {
    expect(ADMIN_SKILL_REVISION_STATES).toEqual([
      "pending_review",
      "published",
      "rejected",
      "archived",
    ]);
    expect(ADMIN_SKILL_FILE_KINDS).toEqual([
      "manifest",
      "script",
      "reference",
      "other",
    ]);
    expect(ADMIN_SKILL_FINDING_CODES).toEqual([
      "possible_secret",
      "private_key",
      "network_access",
      "subprocess",
      "environment_read",
      "dynamic_code",
      "filesystem_write",
      "external_url",
      "unsupported_import",
    ]);
    expectTypeOf<AdminSkillRevisionState>().toEqualTypeOf<
      "pending_review" | "published" | "rejected" | "archived"
    >();
  });

  it("parses exact list, revision, detail and file responses", () => {
    expect(parseAdminSkillListResponse(listResponse())).toEqual(listResponse());
    expect(
      parseAdminSkillRevisionResponse({ version: "1", revision: revision() }),
    ).toEqual({ version: "1", revision: revision() });
    expect(parseAdminSkillRevisionDetailResponse(detailResponse())).toEqual(
      detailResponse(),
    );
    expect(
      parseAdminSkillFileResponse({
        version: "1",
        path: "scripts/check.py",
        content: "print('safe')\n",
      }),
    ).toEqual({
      version: "1",
      path: "scripts/check.py",
      content: "print('safe')\n",
    });
  });

  it("parses exact action permission flags", () => {
    const flags = {
      canUpload: true,
      canManageConnections: false,
      canReview: false,
      canConfigure: false,
    };
    expect(parseAdminSkillPermissionFlags(flags)).toEqual(flags);
    expect(
      parseAdminSkillPermissionFlags({ ...flags, canDelete: true }),
    ).toBeNull();
  });

  it.each([
    [
      "version",
      (value: ReturnType<typeof detailResponse>) => (value.version = "2"),
    ],
    [
      "state",
      (value: ReturnType<typeof detailResponse>) =>
        (value.revision.state = "draft"),
    ],
    [
      "source",
      (value: ReturnType<typeof detailResponse>) =>
        (value.revision.sourceType = "github"),
    ],
    [
      "timestamp",
      (value: ReturnType<typeof detailResponse>) =>
        (value.revision.createdAt = "2026-07-20T01:02:03Z"),
    ],
    [
      "uuid",
      (value: ReturnType<typeof detailResponse>) =>
        (value.revision.id = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"),
    ],
    [
      "sha",
      (value: ReturnType<typeof detailResponse>) =>
        (value.revision.artifactSha256 = SHA256.toUpperCase()),
    ],
    [
      "kind",
      (value: ReturnType<typeof detailResponse>) =>
        (value.files[0]!.kind = "binary"),
    ],
    [
      "finding",
      (value: ReturnType<typeof detailResponse>) =>
        (value.findings[0]!.code = "raw_source"),
    ],
  ])("rejects a non-canonical %s", (_name, mutate) => {
    const value = detailResponse();
    mutate(value);
    expect(parseAdminSkillRevisionDetailResponse(value)).toBeNull();
  });

  it("rejects duplicate identities, paths, modules and diff paths", () => {
    const duplicateFile = detailResponse();
    duplicateFile.files.push({ ...duplicateFile.files[0]! });
    expect(parseAdminSkillRevisionDetailResponse(duplicateFile)).toBeNull();

    const duplicateModule = detailResponse();
    duplicateModule.dependencies.pythonModules.push("json");
    expect(parseAdminSkillRevisionDetailResponse(duplicateModule)).toBeNull();

    const duplicateDiff = detailResponse();
    duplicateDiff.diff!.files.push({ ...duplicateDiff.diff!.files[0]! });
    expect(parseAdminSkillRevisionDetailResponse(duplicateDiff)).toBeNull();

    const duplicateSkill = listResponse();
    duplicateSkill.skills.push({ ...duplicateSkill.skills[0]! });
    duplicateSkill.page.returned = 2;
    expect(parseAdminSkillListResponse(duplicateSkill)).toBeNull();
  });

  it("rejects prototype, getter, symbol, hidden and extra fields without executing code", () => {
    const getter = () => {
      throw new Error("must not run");
    };
    const accessor = detailResponse();
    Object.defineProperty(accessor.revision, "name", {
      get: getter,
      enumerable: true,
    });
    const symbol = detailResponse();
    Reflect.set(symbol, Symbol("source"), "private");
    const hidden = detailResponse();
    Object.defineProperty(hidden, "archive", {
      value: "private",
      enumerable: false,
    });
    const inherited = Object.assign(
      Object.create({ source: "private" }),
      detailResponse(),
    );
    const extra = {
      ...detailResponse(),
      rejectionReason: "private full reason",
    };

    for (const value of [accessor, symbol, hidden, inherited, extra]) {
      expect(() => parseAdminSkillRevisionDetailResponse(value)).not.toThrow();
      expect(parseAdminSkillRevisionDetailResponse(value)).toBeNull();
    }
  });

  it("rejects oversized arrays before reading sparse indices", () => {
    const huge = new Proxy(new Array(2 ** 32 - 1), {
      getOwnPropertyDescriptor(target, key) {
        if (key !== "length") throw new Error("must reject length first");
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    const list = listResponse();
    Reflect.set(list, "skills", huge);
    expect(() => parseAdminSkillListResponse(list)).not.toThrow();
    expect(parseAdminSkillListResponse(list)).toBeNull();
  });

  it("rejects oversized strings, arrays and mismatched counts", () => {
    const description = detailResponse();
    description.revision.description = "x".repeat(4_097);
    expect(parseAdminSkillRevisionDetailResponse(description)).toBeNull();

    const diff = detailResponse();
    diff.diff!.files[0]!.diff = "x".repeat(512 * 1024 + 1);
    expect(parseAdminSkillRevisionDetailResponse(diff)).toBeNull();

    const file = {
      version: "1",
      path: "scripts/check.py",
      content: "😀".repeat(600_000),
    };
    expect(parseAdminSkillFileResponse(file)).toBeNull();

    const count = detailResponse();
    count.revision.fileCount = 1;
    expect(parseAdminSkillRevisionDetailResponse(count)).toBeNull();

    const page = listResponse();
    page.page.returned = 0;
    expect(parseAdminSkillListResponse(page)).toBeNull();
  });

  it("requires all four review attestations to be literal true", () => {
    for (const key of [
      "contentReviewed",
      "usageRightsConfirmed",
      "executionRiskAccepted",
      "independentReviewerConfirmed",
    ] as const) {
      const value = detailResponse();
      value.reviewAttestations[key] = false;
      expect(parseAdminSkillRevisionDetailResponse(value)).toBeNull();
    }
  });
});
