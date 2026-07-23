import { createHash } from "node:crypto";

import { describe, expect, expectTypeOf, it } from "vitest";

import * as adminSkillContractModule from "./admin-skill-contract";

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
    reviewedBy: null as string | null,
    reviewedAt: null as string | null,
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
      extractedSize: 384,
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
    previousPublishedRevisionId: null as string | null,
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
      reviewerAuthorizationConfirmed: true,
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

  it("enforces review state, reviewer and timestamp relationships", () => {
    const pendingWithReview = revision();
    pendingWithReview.reviewedBy = ACTOR_ID;
    pendingWithReview.reviewedAt = "2026-07-20T01:03:03.000Z";
    expect(
      parseAdminSkillRevisionResponse({
        version: "1",
        revision: pendingWithReview,
      }),
    ).toBeNull();

    for (const state of ["published", "rejected", "archived"]) {
      const missingReview = revision();
      missingReview.state = state;
      expect(
        parseAdminSkillRevisionResponse({
          version: "1",
          revision: missingReview,
        }),
      ).toBeNull();

      const staleReview = revision();
      staleReview.state = state;
      staleReview.reviewedBy = ACTOR_ID;
      staleReview.reviewedAt = "2026-07-20T01:02:02.999Z";
      expect(
        parseAdminSkillRevisionResponse({
          version: "1",
          revision: staleReview,
        }),
      ).toBeNull();
    }

    const list = listResponse();
    list.skills[0]!.revision!.state = "published";
    expect(parseAdminSkillListResponse(list)).toBeNull();
  });

  it("requires positive artifact sizes and an exact extracted file sum", () => {
    for (const key of ["compressedSize", "extractedSize"] as const) {
      const zero = detailResponse();
      zero.revision[key] = 0;
      expect(parseAdminSkillRevisionDetailResponse(zero)).toBeNull();
    }

    const mismatchedSum = detailResponse();
    mismatchedSum.revision.extractedSize += 1;
    expect(parseAdminSkillRevisionDetailResponse(mismatchedSum)).toBeNull();

    const samePreviousRevision = detailResponse();
    samePreviousRevision.previousPublishedRevisionId = REVISION_ID;
    expect(
      parseAdminSkillRevisionDetailResponse(samePreviousRevision),
    ).toBeNull();
  });

  it("rejects non-NFC, format-control and case-fold-equivalent file paths", () => {
    for (const path of ["references/cafe\u0301.md", "scripts/\u202eevil.py"]) {
      const value = detailResponse();
      value.files[1]!.path = path;
      value.findings[0]!.path = path;
      value.diff!.files[0]!.path = path;
      expect(parseAdminSkillRevisionDetailResponse(value)).toBeNull();
      expect(
        parseAdminSkillFileResponse({ version: "1", path, content: "safe" }),
      ).toBeNull();
    }

    const collision = detailResponse();
    collision.files.push(
      {
        path: "references/straße.md",
        sha256: "d".repeat(64),
        size: 1,
        mediaType: "text/plain",
        kind: "reference",
      },
      {
        path: "references/STRASSE.md",
        sha256: "e".repeat(64),
        size: 1,
        mediaType: "text/plain",
        kind: "reference",
      },
    );
    collision.revision.fileCount = 4;
    collision.revision.extractedSize = 386;
    expect(parseAdminSkillRevisionDetailResponse(collision)).toBeNull();

    const sigmaCollision = detailResponse();
    sigmaCollision.files.push(
      {
        path: "references/σ.md",
        sha256: "d".repeat(64),
        size: 1,
        mediaType: "text/plain",
        kind: "reference",
      },
      {
        path: "references/ς.md",
        sha256: "e".repeat(64),
        size: 1,
        mediaType: "text/plain",
        kind: "reference",
      },
    );
    sigmaCollision.revision.fileCount = 4;
    sigmaCollision.revision.extractedSize = 386;
    expect(parseAdminSkillRevisionDetailResponse(sigmaCollision)).toBeNull();

    const accentsRemainDistinct = detailResponse();
    accentsRemainDistinct.files.push(
      {
        path: "references/a.md",
        sha256: "d".repeat(64),
        size: 1,
        mediaType: "text/plain",
        kind: "reference",
      },
      {
        path: "references/á.md",
        sha256: "e".repeat(64),
        size: 1,
        mediaType: "text/plain",
        kind: "reference",
      },
      {
        path: "references/e.md",
        sha256: "f".repeat(64),
        size: 1,
        mediaType: "text/plain",
        kind: "reference",
      },
      {
        path: "references/é.md",
        sha256: "1".repeat(64),
        size: 1,
        mediaType: "text/plain",
        kind: "reference",
      },
    );
    accentsRemainDistinct.revision.fileCount = 6;
    accentsRemainDistinct.revision.extractedSize = 388;
    expect(
      parseAdminSkillRevisionDetailResponse(accentsRemainDistinct),
    ).toEqual(accentsRemainDistinct);

    const dotlessIRemainsDistinct = detailResponse();
    dotlessIRemainsDistinct.files.push(
      {
        path: "references/I.md",
        sha256: "d".repeat(64),
        size: 1,
        mediaType: "text/plain",
        kind: "reference",
      },
      {
        path: "references/ı.md",
        sha256: "e".repeat(64),
        size: 1,
        mediaType: "text/plain",
        kind: "reference",
      },
    );
    dotlessIRemainsDistinct.revision.fileCount = 4;
    dotlessIRemainsDistinct.revision.extractedSize = 386;
    expect(
      parseAdminSkillRevisionDetailResponse(dotlessIRemainsDistinct),
    ).toEqual(dotlessIRemainsDistinct);

    const ligatureCollision = detailResponse();
    ligatureCollision.files.push(
      {
        path: "references/ﬀ.md",
        sha256: "d".repeat(64),
        size: 1,
        mediaType: "text/plain",
        kind: "reference",
      },
      {
        path: "references/ff.md",
        sha256: "e".repeat(64),
        size: 1,
        mediaType: "text/plain",
        kind: "reference",
      },
    );
    ligatureCollision.revision.fileCount = 4;
    ligatureCollision.revision.extractedSize = 386;
    expect(parseAdminSkillRevisionDetailResponse(ligatureCollision)).toBeNull();
  });

  it("pins exact Python 3.13 Unicode 15.1 casefold semantics", () => {
    const pythonVersion = Reflect.get(
      adminSkillContractModule,
      "ADMIN_SKILL_CASEFOLD_PYTHON_VERSION",
    ) as unknown;
    const version = Reflect.get(
      adminSkillContractModule,
      "ADMIN_SKILL_CASEFOLD_UNICODE_VERSION",
    ) as unknown;
    const entries = Reflect.get(
      adminSkillContractModule,
      "ADMIN_SKILL_PYTHON_CASEFOLD_ENTRIES",
    ) as unknown;
    const casefold = Reflect.get(
      adminSkillContractModule,
      "pythonCasefoldAdminSkillPath",
    ) as unknown;

    expect(pythonVersion).toBe("3.13.13");
    expect(version).toBe("15.1.0");
    expect(entries).toBeInstanceOf(Array);
    expect(typeof casefold).toBe("function");
    if (!Array.isArray(entries) || typeof casefold !== "function") return;

    const fold = casefold as (value: string) => string;
    expect([
      fold("I"),
      fold("ı"),
      fold("ß"),
      fold("SS"),
      fold("σ"),
      fold("ς"),
      fold("ﬀ"),
      fold("ff"),
      fold("İ"),
      fold("i\u0307"),
      fold("ſ"),
      fold("s"),
    ]).toEqual([
      "i",
      "ı",
      "ss",
      "ss",
      "σ",
      "σ",
      "ff",
      "ff",
      "i\u0307",
      "i\u0307",
      "s",
      "s",
    ]);

    // Python 3.13.13 / unicodedata 15.1.0: one UTF-8 line per changed code
    // point, formatted as `CCCCCC;folded_utf8_hex\n` in ascending order.
    const payload = (entries as readonly (readonly [number, string])[])
      .map(
        ([codePoint, value]) =>
          `${codePoint.toString(16).toUpperCase().padStart(6, "0")};${Buffer.from(value, "utf8").toString("hex")}\n`,
      )
      .join("");
    expect(entries).toHaveLength(1_530);
    expect(Buffer.byteLength(payload, "utf8")).toBe(21_188);
    expect(createHash("sha256").update(payload).digest("hex")).toBe(
      "144934597d1f1320798da1502233becf7ef20b3caf59057c6cdad391460a9712",
    );
  });

  it("enforces current-file membership by diff status", () => {
    const addedMissing = detailResponse();
    addedMissing.diff!.files[0]!.path = "scripts/missing.py";
    expect(parseAdminSkillRevisionDetailResponse(addedMissing)).toBeNull();

    const deletedStillPresent = detailResponse();
    deletedStillPresent.diff!.files[0]!.status = "deleted";
    expect(
      parseAdminSkillRevisionDetailResponse(deletedStillPresent),
    ).toBeNull();

    const deleted = detailResponse();
    deleted.diff!.files[0] = {
      path: "scripts/old.py",
      status: "deleted",
      binary: false,
      diff: "-print('old')\n",
    };
    expect(parseAdminSkillRevisionDetailResponse(deleted)).toEqual(deleted);
  });

  it("accepts more than 1152 bounded findings when the response is otherwise valid", () => {
    const value = detailResponse();
    value.findings = Array.from({ length: 1_153 }, (_, index) => ({
      path: "scripts/check.py",
      line: index + 1,
      code: "subprocess",
      message: "Review required.",
      blocking: false,
    }));
    expect(parseAdminSkillRevisionDetailResponse(value)).toEqual(value);
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
      "reviewerAuthorizationConfirmed",
    ] as const) {
      const value = detailResponse();
      value.reviewAttestations[key] = false;
      expect(parseAdminSkillRevisionDetailResponse(value)).toBeNull();
    }
  });
});
