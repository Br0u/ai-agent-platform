import {
  ADMIN_SKILL_CASEFOLD_PYTHON_VERSION,
  ADMIN_SKILL_CASEFOLD_UNICODE_VERSION,
  ADMIN_SKILL_PYTHON_CASEFOLD_ENTRIES,
  pythonCasefoldAdminSkillPath,
} from "./admin-skill-python-casefold";

export {
  ADMIN_SKILL_CASEFOLD_PYTHON_VERSION,
  ADMIN_SKILL_CASEFOLD_UNICODE_VERSION,
  ADMIN_SKILL_PYTHON_CASEFOLD_ENTRIES,
  pythonCasefoldAdminSkillPath,
};

export const ADMIN_SKILL_REVISION_STATES = [
  "pending_review",
  "published",
  "rejected",
  "archived",
] as const;

export const ADMIN_SKILL_FILE_KINDS = [
  "manifest",
  "script",
  "reference",
  "other",
] as const;

export const ADMIN_SKILL_FINDING_CODES = [
  "possible_secret",
  "private_key",
  "network_access",
  "subprocess",
  "environment_read",
  "dynamic_code",
  "filesystem_write",
  "external_url",
  "unsupported_import",
] as const;

export type AdminSkillRevisionState =
  (typeof ADMIN_SKILL_REVISION_STATES)[number];
export type AdminSkillFileKind = (typeof ADMIN_SKILL_FILE_KINDS)[number];
export type AdminSkillFindingCode = (typeof ADMIN_SKILL_FINDING_CODES)[number];

export type AdminSkillPermissionFlags = {
  canUpload: boolean;
  canManageConnections: boolean;
  canReview: boolean;
  canConfigure: boolean;
};

export type AdminSkillRevision = {
  id: string;
  skillId: string;
  name: string;
  number: number;
  state: AdminSkillRevisionState;
  sourceType: "upload";
  artifactSha256: string;
  createdBy: string;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export type AdminSkillRevisionResponse = {
  version: "1";
  revision: AdminSkillRevision;
};

export type AdminSkillListResponse = {
  version: "1";
  skills: Array<{
    id: string;
    name: string;
    createdAt: string;
    revision: null | {
      id: string;
      number: number;
      state: AdminSkillRevisionState;
      sourceType: "upload";
      artifactSha256Prefix: string;
      createdBy: string;
      createdAt: string;
      reviewedBy: string | null;
      reviewedAt: string | null;
    };
  }>;
  page: { limit: number; offset: number; returned: number };
};

export type AdminSkillRevisionDetailResponse = {
  version: "1";
  revision: AdminSkillRevision & {
    description: string;
    license: string | null;
    compatibility: string | null;
    allowedTools: string[];
    compressedSize: number;
    extractedSize: number;
    fileCount: number;
  };
  files: Array<{
    path: string;
    sha256: string;
    size: number;
    mediaType: string | null;
    kind: AdminSkillFileKind;
  }>;
  dependencies: {
    pythonModules: string[];
    unavailablePythonModules: string[];
  };
  findings: Array<{
    path: string;
    line: number;
    code: AdminSkillFindingCode;
    message: string;
    blocking: boolean;
  }>;
  previousPublishedRevisionId: string | null;
  diff: null | {
    truncated: boolean;
    files: Array<{
      path: string;
      status: "added" | "deleted" | "modified";
      binary: boolean;
      diff: string;
    }>;
  };
  reviewAttestations: {
    contentReviewed: true;
    usageRightsConfirmed: true;
    executionRiskAccepted: true;
    independentReviewerConfirmed: true;
  };
};

export type AdminSkillFileResponse = {
  version: "1";
  path: string;
  content: string;
};

const MAX_SKILLS = 100;
const MAX_FILES = 128;
const MAX_FINDINGS = 65_536;
const MAX_MODULES = 256;
const MAX_ALLOWED_TOOLS = 128;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_DIFF_BYTES = 512 * 1024;
const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 20 * 1024 * 1024;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const PATH_CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SHA256_PREFIX = /^[0-9a-f]{12}$/u;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MODULE = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const MEDIA_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;
const UTF8_ENCODER = new TextEncoder();

function utf8Length(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
    ) {
      return null;
    }
    const snapshot: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return null;
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function exactArray(value: unknown, maximum: number): unknown[] | null {
  try {
    if (
      !Array.isArray(value) ||
      Reflect.getPrototypeOf(value) !== Array.prototype
    ) {
      return null;
    }
    const length = Reflect.getOwnPropertyDescriptor(value, "length");
    if (
      length === undefined ||
      !("value" in length) ||
      typeof length.value !== "number" ||
      !Number.isSafeInteger(length.value) ||
      length.value < 0 ||
      length.value > maximum
    ) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) return null;
    const expected = new Set<string>(["length"]);
    for (let index = 0; index < length.value; index += 1) {
      expected.add(String(index));
    }
    if (
      ownKeys.length !== expected.size ||
      (ownKeys as string[]).some((key) => !expected.has(key))
    ) {
      return null;
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return null;
      }
      snapshot.push(descriptor.value);
    }
    return snapshot;
  } catch {
    return null;
  }
}

function hasOnlyPairedSurrogates(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function boundedText(
  value: unknown,
  maximumBytes: number,
  options: { empty?: boolean; control?: boolean; trimmed?: boolean } = {},
): value is string {
  return (
    typeof value === "string" &&
    (options.empty === true || value.length > 0) &&
    (options.trimmed !== true || value === value.trim()) &&
    utf8Length(value) <= maximumBytes &&
    hasOnlyPairedSurrogates(value) &&
    (options.control === true || !CONTROL_CHARACTER.test(value))
  );
}

function positiveInteger(
  value: unknown,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= maximum
  );
}

function nonNegativeInteger(
  value: unknown,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= maximum
  );
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function canonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function skillName(value: unknown): value is string {
  return (
    typeof value === "string" && utf8Length(value) <= 64 && SLUG.test(value)
  );
}

export function isCanonicalAdminSkillPath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    utf8Length(value) > 160 ||
    !hasOnlyPairedSurrogates(value) ||
    value.normalize("NFC") !== value ||
    PATH_CONTROL_OR_FORMAT.test(value) ||
    value.includes("\\")
  ) {
    return false;
  }
  const segments = value.split("/");
  return (
    segments.length <= 8 &&
    segments.every(
      (segment) => segment.length > 0 && segment !== "." && segment !== "..",
    )
  );
}

function uniqueEquivalentPaths(paths: readonly string[]): boolean {
  const keys = new Set<string>();
  for (const path of paths) {
    const key = pythonCasefoldAdminSkillPath(path);
    if (keys.has(key)) return false;
    keys.add(key);
  }
  return true;
}

function enumValue<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
): value is Values[number] {
  return (
    typeof value === "string" && (values as readonly string[]).includes(value)
  );
}

function reviewMetadataMatchesState(
  state: AdminSkillRevisionState,
  createdAt: string,
  reviewedBy: unknown,
  reviewedAt: unknown,
): boolean {
  if (state === "pending_review") {
    return reviewedBy === null && reviewedAt === null;
  }
  return (
    canonicalUuid(reviewedBy) &&
    canonicalTimestamp(reviewedAt) &&
    reviewedAt >= createdAt
  );
}

function readRevision(value: unknown): AdminSkillRevision | null {
  const item = exactRecord(value, [
    "id",
    "skillId",
    "name",
    "number",
    "state",
    "sourceType",
    "artifactSha256",
    "createdBy",
    "createdAt",
    "reviewedBy",
    "reviewedAt",
  ]);
  if (
    item === null ||
    !canonicalUuid(item.id) ||
    !canonicalUuid(item.skillId) ||
    !skillName(item.name) ||
    !positiveInteger(item.number, 2_147_483_647) ||
    !enumValue(item.state, ADMIN_SKILL_REVISION_STATES) ||
    item.sourceType !== "upload" ||
    typeof item.artifactSha256 !== "string" ||
    !SHA256.test(item.artifactSha256) ||
    !canonicalUuid(item.createdBy) ||
    !canonicalTimestamp(item.createdAt) ||
    !reviewMetadataMatchesState(
      item.state,
      item.createdAt,
      item.reviewedBy,
      item.reviewedAt,
    )
  ) {
    return null;
  }
  return {
    id: item.id,
    skillId: item.skillId,
    name: item.name,
    number: item.number,
    state: item.state,
    sourceType: "upload",
    artifactSha256: item.artifactSha256,
    createdBy: item.createdBy,
    createdAt: item.createdAt,
    reviewedBy: item.reviewedBy as string | null,
    reviewedAt: item.reviewedAt as string | null,
  };
}

function readStringArray(
  value: unknown,
  maximumItems: number,
  validator: (item: unknown) => item is string,
): string[] | null {
  const raw = exactArray(value, maximumItems);
  if (raw === null) return null;
  const result: string[] = [];
  for (const item of raw) {
    if (!validator(item)) return null;
    result.push(item);
  }
  return new Set(result).size === result.length ? result : null;
}

export function parseAdminSkillPermissionFlags(
  value: unknown,
): AdminSkillPermissionFlags | null {
  const flags = exactRecord(value, [
    "canUpload",
    "canManageConnections",
    "canReview",
    "canConfigure",
  ]);
  if (
    flags === null ||
    typeof flags.canUpload !== "boolean" ||
    typeof flags.canManageConnections !== "boolean" ||
    typeof flags.canReview !== "boolean" ||
    typeof flags.canConfigure !== "boolean"
  ) {
    return null;
  }
  return {
    canUpload: flags.canUpload,
    canManageConnections: flags.canManageConnections,
    canReview: flags.canReview,
    canConfigure: flags.canConfigure,
  };
}

export function parseAdminSkillRevisionResponse(
  value: unknown,
): AdminSkillRevisionResponse | null {
  const response = exactRecord(value, ["version", "revision"]);
  if (response?.version !== "1") return null;
  const revision = readRevision(response.revision);
  return revision === null ? null : { version: "1", revision };
}

export function parseAdminSkillListResponse(
  value: unknown,
): AdminSkillListResponse | null {
  const response = exactRecord(value, ["version", "skills", "page"]);
  const rawSkills = exactArray(response?.skills, MAX_SKILLS);
  const page = exactRecord(response?.page, ["limit", "offset", "returned"]);
  if (
    response?.version !== "1" ||
    rawSkills === null ||
    page === null ||
    !positiveInteger(page.limit, 100) ||
    !nonNegativeInteger(page.offset, 1_000_000) ||
    !nonNegativeInteger(page.returned, 100) ||
    page.returned !== rawSkills.length ||
    page.returned > page.limit
  ) {
    return null;
  }
  const skills: AdminSkillListResponse["skills"] = [];
  for (const raw of rawSkills) {
    const skill = exactRecord(raw, ["id", "name", "createdAt", "revision"]);
    if (
      skill === null ||
      !canonicalUuid(skill.id) ||
      !skillName(skill.name) ||
      !canonicalTimestamp(skill.createdAt)
    ) {
      return null;
    }
    let revision: AdminSkillListResponse["skills"][number]["revision"] = null;
    if (skill.revision !== null) {
      const item = exactRecord(skill.revision, [
        "id",
        "number",
        "state",
        "sourceType",
        "artifactSha256Prefix",
        "createdBy",
        "createdAt",
        "reviewedBy",
        "reviewedAt",
      ]);
      if (
        item === null ||
        !canonicalUuid(item.id) ||
        !positiveInteger(item.number, 2_147_483_647) ||
        !enumValue(item.state, ADMIN_SKILL_REVISION_STATES) ||
        item.sourceType !== "upload" ||
        typeof item.artifactSha256Prefix !== "string" ||
        !SHA256_PREFIX.test(item.artifactSha256Prefix) ||
        !canonicalUuid(item.createdBy) ||
        !canonicalTimestamp(item.createdAt) ||
        !reviewMetadataMatchesState(
          item.state,
          item.createdAt,
          item.reviewedBy,
          item.reviewedAt,
        )
      ) {
        return null;
      }
      revision = {
        id: item.id,
        number: item.number,
        state: item.state,
        sourceType: "upload",
        artifactSha256Prefix: item.artifactSha256Prefix,
        createdBy: item.createdBy,
        createdAt: item.createdAt,
        reviewedBy: item.reviewedBy as string | null,
        reviewedAt: item.reviewedAt as string | null,
      };
    }
    skills.push({
      id: skill.id,
      name: skill.name,
      createdAt: skill.createdAt,
      revision,
    });
  }
  if (
    new Set(skills.map(({ id }) => id)).size !== skills.length ||
    new Set(skills.map(({ name }) => name)).size !== skills.length
  ) {
    return null;
  }
  return {
    version: "1",
    skills,
    page: { limit: page.limit, offset: page.offset, returned: page.returned },
  };
}

function readDetailRevision(
  value: unknown,
): AdminSkillRevisionDetailResponse["revision"] | null {
  const item = exactRecord(value, [
    "id",
    "skillId",
    "name",
    "number",
    "state",
    "sourceType",
    "artifactSha256",
    "createdBy",
    "createdAt",
    "reviewedBy",
    "reviewedAt",
    "description",
    "license",
    "compatibility",
    "allowedTools",
    "compressedSize",
    "extractedSize",
    "fileCount",
  ]);
  if (item === null) return null;
  const base = readRevision({
    id: item.id,
    skillId: item.skillId,
    name: item.name,
    number: item.number,
    state: item.state,
    sourceType: item.sourceType,
    artifactSha256: item.artifactSha256,
    createdBy: item.createdBy,
    createdAt: item.createdAt,
    reviewedBy: item.reviewedBy,
    reviewedAt: item.reviewedAt,
  });
  const allowedTools = readStringArray(
    item.allowedTools,
    MAX_ALLOWED_TOOLS,
    (tool): tool is string => boundedText(tool, 128, { trimmed: true }),
  );
  if (
    base === null ||
    !boundedText(item.description, 4_096, { empty: true }) ||
    !(
      item.license === null || boundedText(item.license, 512, { trimmed: true })
    ) ||
    !(
      item.compatibility === null ||
      boundedText(item.compatibility, 512, { trimmed: true })
    ) ||
    allowedTools === null ||
    !positiveInteger(item.compressedSize, MAX_ARCHIVE_BYTES) ||
    !positiveInteger(item.extractedSize, MAX_EXTRACTED_BYTES) ||
    !positiveInteger(item.fileCount, MAX_FILES)
  ) {
    return null;
  }
  return {
    ...base,
    description: item.description,
    license: item.license,
    compatibility: item.compatibility,
    allowedTools,
    compressedSize: item.compressedSize,
    extractedSize: item.extractedSize,
    fileCount: item.fileCount,
  };
}

export function parseAdminSkillRevisionDetailResponse(
  value: unknown,
): AdminSkillRevisionDetailResponse | null {
  try {
    const response = exactRecord(value, [
      "version",
      "revision",
      "files",
      "dependencies",
      "findings",
      "previousPublishedRevisionId",
      "diff",
      "reviewAttestations",
    ]);
    const revision = readDetailRevision(response?.revision);
    const rawFiles = exactArray(response?.files, MAX_FILES);
    const rawFindings = exactArray(response?.findings, MAX_FINDINGS);
    const dependencies = exactRecord(response?.dependencies, [
      "pythonModules",
      "unavailablePythonModules",
    ]);
    const attestations = exactRecord(response?.reviewAttestations, [
      "contentReviewed",
      "usageRightsConfirmed",
      "executionRiskAccepted",
      "independentReviewerConfirmed",
    ]);
    if (
      response?.version !== "1" ||
      revision === null ||
      rawFiles === null ||
      revision.fileCount !== rawFiles.length ||
      rawFindings === null ||
      dependencies === null ||
      attestations === null ||
      attestations.contentReviewed !== true ||
      attestations.usageRightsConfirmed !== true ||
      attestations.executionRiskAccepted !== true ||
      attestations.independentReviewerConfirmed !== true ||
      !(
        response.previousPublishedRevisionId === null ||
        canonicalUuid(response.previousPublishedRevisionId)
      )
    ) {
      return null;
    }
    const files: AdminSkillRevisionDetailResponse["files"] = [];
    for (const raw of rawFiles) {
      const file = exactRecord(raw, [
        "path",
        "sha256",
        "size",
        "mediaType",
        "kind",
      ]);
      if (
        file === null ||
        !isCanonicalAdminSkillPath(file.path) ||
        typeof file.sha256 !== "string" ||
        !SHA256.test(file.sha256) ||
        !nonNegativeInteger(file.size, MAX_FILE_BYTES) ||
        !(
          file.mediaType === null ||
          (typeof file.mediaType === "string" &&
            MEDIA_TYPE.test(file.mediaType))
        ) ||
        !enumValue(file.kind, ADMIN_SKILL_FILE_KINDS)
      ) {
        return null;
      }
      files.push({
        path: file.path,
        sha256: file.sha256,
        size: file.size,
        mediaType: file.mediaType,
        kind: file.kind,
      });
    }
    const filePaths = files.map(({ path }) => path);
    if (!uniqueEquivalentPaths(filePaths)) return null;
    const extractedSize = files.reduce((total, file) => total + file.size, 0);
    if (extractedSize !== revision.extractedSize) return null;
    if (response.previousPublishedRevisionId === revision.id) return null;
    const filePathIndex = new Set(filePaths);

    const pythonModules = readStringArray(
      dependencies.pythonModules,
      MAX_MODULES,
      (item): item is string => typeof item === "string" && MODULE.test(item),
    );
    const unavailablePythonModules = readStringArray(
      dependencies.unavailablePythonModules,
      MAX_MODULES,
      (item): item is string => typeof item === "string" && MODULE.test(item),
    );
    if (
      pythonModules === null ||
      unavailablePythonModules === null ||
      unavailablePythonModules.some((item) => !pythonModules.includes(item))
    ) {
      return null;
    }

    const findings: AdminSkillRevisionDetailResponse["findings"] = [];
    for (const raw of rawFindings) {
      const finding = exactRecord(raw, [
        "path",
        "line",
        "code",
        "message",
        "blocking",
      ]);
      if (
        finding === null ||
        !isCanonicalAdminSkillPath(finding.path) ||
        !positiveInteger(finding.line, 2_147_483_647) ||
        !enumValue(finding.code, ADMIN_SKILL_FINDING_CODES) ||
        !boundedText(finding.message, 512) ||
        typeof finding.blocking !== "boolean" ||
        !filePathIndex.has(finding.path) ||
        (finding.code === "unsupported_import") !== finding.blocking
      ) {
        return null;
      }
      findings.push({
        path: finding.path,
        line: finding.line,
        code: finding.code,
        message: finding.message,
        blocking: finding.blocking,
      });
    }
    const findingKeys = findings.map(
      ({ path, line, code }) => `${path}\0${line}\0${code}`,
    );
    if (new Set(findingKeys).size !== findingKeys.length) return null;

    let diff: AdminSkillRevisionDetailResponse["diff"] = null;
    if (response.diff !== null) {
      const rawDiff = exactRecord(response.diff, ["truncated", "files"]);
      const rawDiffFiles = exactArray(rawDiff?.files, MAX_FILES);
      if (
        rawDiff === null ||
        typeof rawDiff.truncated !== "boolean" ||
        rawDiffFiles === null
      ) {
        return null;
      }
      const diffFiles: NonNullable<
        AdminSkillRevisionDetailResponse["diff"]
      >["files"] = [];
      let diffBytes = 0;
      for (const raw of rawDiffFiles) {
        const file = exactRecord(raw, ["path", "status", "binary", "diff"]);
        const inCurrentFiles =
          file !== null &&
          typeof file.path === "string" &&
          filePathIndex.has(file.path);
        if (
          file === null ||
          !isCanonicalAdminSkillPath(file.path) ||
          !enumValue(file.status, ["added", "deleted", "modified"] as const) ||
          (file.status === "deleted" ? inCurrentFiles : !inCurrentFiles) ||
          typeof file.binary !== "boolean" ||
          !boundedText(file.diff, MAX_DIFF_BYTES, {
            empty: true,
            control: true,
          })
        ) {
          return null;
        }
        diffBytes += utf8Length(file.diff);
        if (diffBytes > MAX_DIFF_BYTES) return null;
        diffFiles.push({
          path: file.path,
          status: file.status,
          binary: file.binary,
          diff: file.diff,
        });
      }
      if (!uniqueEquivalentPaths(diffFiles.map(({ path }) => path)))
        return null;
      diff = { truncated: rawDiff.truncated, files: diffFiles };
    }

    return {
      version: "1",
      revision,
      files,
      dependencies: { pythonModules, unavailablePythonModules },
      findings,
      previousPublishedRevisionId: response.previousPublishedRevisionId,
      diff,
      reviewAttestations: {
        contentReviewed: true,
        usageRightsConfirmed: true,
        executionRiskAccepted: true,
        independentReviewerConfirmed: true,
      },
    };
  } catch {
    return null;
  }
}

export function parseAdminSkillFileResponse(
  value: unknown,
): AdminSkillFileResponse | null {
  const response = exactRecord(value, ["version", "path", "content"]);
  if (
    response?.version !== "1" ||
    !isCanonicalAdminSkillPath(response.path) ||
    !boundedText(response.content, MAX_FILE_BYTES, {
      empty: true,
      control: true,
    }) ||
    response.content.includes("\0")
  ) {
    return null;
  }
  return { version: "1", path: response.path, content: response.content };
}
