import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as nodeHttpRequest } from "node:http";
import { isIP } from "node:net";
import { Readable } from "node:stream";

import {
  isCanonicalAdminSkillPath,
  parseAdminSkillFileResponse,
  parseAdminSkillListResponse,
  parseAdminSkillRevisionDetailResponse,
  parseAdminSkillRevisionResponse,
  type AdminSkillFileResponse,
  type AdminSkillListResponse,
  type AdminSkillRevisionDetailResponse,
  type AdminSkillRevisionResponse,
} from "@/features/assistant/admin-skill-contract";

export type SkillRegistryEnvironment = {
  NODE_ENV?: string;
  SKILL_REGISTRY_ALLOW_LOOPBACK?: string;
  SKILL_REGISTRY_INTERNAL_URL?: string;
  SKILL_REGISTRY_CONTROL_KEY?: string;
  OS_SECURITY_KEY?: string;
  AGENT_CONFIG_CONTROL_KEY?: string;
};

export type SkillRegistrySettings = { baseUrl: string; controlKey: string };
const SKILL_REGISTRY_SETTINGS_BRAND = new WeakSet<object>();
const SKILL_REGISTRY_LOOPBACK_SETTINGS = new WeakSet<object>();
export type SkillRegistryResolvedAddress = {
  address: string;
  family: 4 | 6;
};
export type SkillRegistryAddressResolver = (
  hostname: string,
) => Promise<readonly SkillRegistryResolvedAddress[]>;
export type SkillRegistryTransportInput = Readonly<{
  address: string;
  family: 4 | 6;
  port: number;
  hostHeader: string;
  method: "GET" | "POST";
  path: string;
  headers: Readonly<Record<string, string>>;
  body?: string | Uint8Array;
  signal: AbortSignal;
}>;
export type SkillRegistryTransport = (
  input: SkillRegistryTransportInput,
) => Promise<Response>;
export type SkillRegistryAction =
  | "list"
  | "detail"
  | "file"
  | "upload"
  | "review";
export type SkillRegistryPermission =
  | "admin:assistant:skills"
  | "admin:assistant:skills:upload"
  | "admin:assistant:skills:review";
export type SkillRegistryAssurance = "session" | "password+mfa";

export type SkillRegistryAssertionInput = {
  action: SkillRegistryAction;
  actor: string;
  permission: SkillRegistryPermission;
  requestId: string;
  target: string;
  assurance: SkillRegistryAssurance;
  assuredAt: number | null;
};

export type SkillRegistryReviewInput = {
  decision: "approve" | "reject";
  expectedState: "pending_review";
  reason: string | null;
  attestations: {
    contentReviewed: true;
    usageRightsConfirmed: true;
    executionRiskAccepted: true;
    independentReviewerConfirmed: true;
  };
};

export type SkillRegistryClient = {
  listSkills(input: {
    actor: string;
    requestId: string;
    limit: number;
    offset: number;
  }): Promise<AdminSkillListResponse>;
  getRevision(input: {
    actor: string;
    requestId: string;
    skillId: string;
    revisionId: string;
  }): Promise<AdminSkillRevisionDetailResponse>;
  getFile(input: {
    actor: string;
    requestId: string;
    skillId: string;
    revisionId: string;
    path: string;
  }): Promise<AdminSkillFileResponse>;
  uploadSkill(input: {
    actor: string;
    requestId: string;
    archive: Uint8Array;
    targetSkillId?: string;
  }): Promise<AdminSkillRevisionResponse>;
  reviewRevision(input: {
    actor: string;
    requestId: string;
    skillId: string;
    revisionId: string;
    assuredAt: number;
    input: SkillRegistryReviewInput;
  }): Promise<AdminSkillRevisionResponse>;
};

export const SKILL_REGISTRY_DOMAIN_CODES = [
  "ARCHIVE_ENCRYPTED",
  "ARCHIVE_EXTRACTED_TOO_LARGE",
  "ARCHIVE_FILE_TOO_LARGE",
  "ARCHIVE_GIT_LFS_POINTER",
  "ARCHIVE_GIT_METADATA",
  "ARCHIVE_INVALID",
  "ARCHIVE_MULTIPLE_SKILL_ROOTS",
  "ARCHIVE_NESTED",
  "ARCHIVE_PATH_CONFLICT",
  "ARCHIVE_PATH_TOO_DEEP",
  "ARCHIVE_PATH_TOO_LONG",
  "ARCHIVE_SKILL_ROOT_REQUIRED",
  "ARCHIVE_TOO_LARGE",
  "ARCHIVE_TOO_MANY_FILES",
  "ARCHIVE_UNSAFE_PATH",
  "ARCHIVE_UNSUPPORTED_FILE",
  "ARTIFACT_DIGEST_MISMATCH",
  "ARTIFACT_NOT_FOUND",
  "ARTIFACT_STORAGE_ERROR",
  "ASSERTION_REPLAY",
  "AUTHENTICATION_FAILED",
  "AUTHORIZATION_FAILED",
  "FILE_NOT_FOUND",
  "MANIFEST_INVALID",
  "REGISTRY_STORAGE_ERROR",
  "REGISTRY_UNAVAILABLE",
  "RESPONSE_TOO_LARGE",
  "REVIEW_BLOCKED",
  "REVIEW_SELF_APPROVAL_DENIED",
  "REVISION_NOT_FOUND",
  "REVISION_STATE_CONFLICT",
  "SKILL_BINARY_FILE",
  "SKILL_FILE_NOT_UTF8",
  "SKILL_FILE_TOO_LARGE",
  "SKILL_NAME_CONFLICT",
  "SKILL_NOT_FOUND",
  "SKILL_SCAN_FAILED",
  "SKILL_SCRIPT_SHEBANG_UNSUPPORTED",
  "VALIDATION_ERROR",
] as const;

export type SkillRegistryDomainErrorCode =
  (typeof SKILL_REGISTRY_DOMAIN_CODES)[number];
export type SkillRegistryClientErrorCode =
  | SkillRegistryDomainErrorCode
  | "invalid_request"
  | "invalid_response"
  | "response_too_large"
  | "timeout"
  | "transport_error";

const SKILL_REGISTRY_CLIENT_ERROR_BRAND = new WeakSet<object>();

export class SkillRegistryClientError extends Error {
  constructor(readonly code: SkillRegistryClientErrorCode) {
    super("Skill Registry request failed");
    SKILL_REGISTRY_CLIENT_ERROR_BRAND.add(this);
    Object.defineProperty(this, "name", {
      value: "SkillRegistryClientError",
      configurable: true,
    });
  }
}

const ASSERTION_DOMAIN = "ai-agent-platform:skill-registry-assertion:v1";
const ACTION_PERMISSION: Readonly<
  Record<SkillRegistryAction, SkillRegistryPermission>
> = {
  list: "admin:assistant:skills",
  detail: "admin:assistant:skills:review",
  file: "admin:assistant:skills:review",
  upload: "admin:assistant:skills:upload",
  review: "admin:assistant:skills:review",
};
const BEARER = /^[A-Za-z0-9._~+/-]+=*$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;
const MAX_FILE_RESPONSE_BYTES = MAX_FILE_BYTES * 6 + 1024;
const MAX_REVIEW_BODY_BYTES = 8 * 1024;
const CONNECT_TIMEOUT_MS = 2_000;
const RESPONSE_TIMEOUT_MS = 5_000;

function configurationError(): never {
  throw new Error("Skill Registry configuration is invalid");
}

function clientError(code: SkillRegistryClientErrorCode): never {
  throw new SkillRegistryClientError(code);
}

function exactRecord(
  value: unknown,
  keySets: readonly (readonly string[])[],
): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) return null;
    const expected = keySets.find(
      (keys) =>
        keys.length === ownKeys.length &&
        keys.every((key) => (ownKeys as string[]).includes(key)),
    );
    if (expected === undefined) return null;
    const snapshot: Record<string, unknown> = Object.create(null);
    for (const key of expected) {
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

function sameUtf8(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function safeBearer(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Buffer.byteLength(value, "utf8") >= 32 &&
    BEARER.test(value)
  );
}

function allowedHostnameSyntax(
  hostname: string,
  allowLoopback = false,
): boolean {
  const unwrapped = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  const ipVersion = isIP(unwrapped);
  if (ipVersion === 4) {
    if (allowLoopback && unwrapped === "127.0.0.1") return true;
    const octets = unwrapped.split(".").map(Number);
    return (
      octets[0] === 10 ||
      (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    );
  }
  if (ipVersion === 6) {
    if (allowLoopback && unwrapped === "::1") return true;
    return /^f[cd][0-9a-f]{2}:/u.test(unwrapped);
  }
  if (
    (hostname === "localhost" && !allowLoopback) ||
    hostname.endsWith(".localhost") ||
    /^\d+$/u.test(hostname)
  ) {
    return false;
  }
  const label = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
  return (
    new RegExp(`^${label}$`, "u").test(hostname) ||
    new RegExp(`^(?:${label}\\.)+internal$`, "u").test(hostname)
  );
}

export function resolveSkillRegistrySettings(
  environment?: SkillRegistryEnvironment,
): SkillRegistrySettings {
  const source = environment ?? {
    NODE_ENV: process.env.NODE_ENV,
    SKILL_REGISTRY_ALLOW_LOOPBACK: process.env.SKILL_REGISTRY_ALLOW_LOOPBACK,
    SKILL_REGISTRY_INTERNAL_URL: process.env.SKILL_REGISTRY_INTERNAL_URL,
    SKILL_REGISTRY_CONTROL_KEY: process.env.SKILL_REGISTRY_CONTROL_KEY,
    OS_SECURITY_KEY: process.env.OS_SECURITY_KEY,
    AGENT_CONFIG_CONTROL_KEY: process.env.AGENT_CONFIG_CONTROL_KEY,
  };
  const allowLoopback =
    source.NODE_ENV === "development" &&
    source.SKILL_REGISTRY_ALLOW_LOOPBACK === "true";
  const rawUrl = source.SKILL_REGISTRY_INTERNAL_URL;
  let url: URL;
  try {
    if (typeof rawUrl !== "string") configurationError();
    url = new URL(rawUrl);
  } catch {
    configurationError();
  }
  if (
    rawUrl !== url.origin ||
    url.protocol !== "http:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    !allowedHostnameSyntax(url.hostname, allowLoopback)
  ) {
    configurationError();
  }
  const controlKey = source.SKILL_REGISTRY_CONTROL_KEY;
  if (!safeBearer(controlKey)) configurationError();
  for (const other of [
    source.OS_SECURITY_KEY,
    source.AGENT_CONFIG_CONTROL_KEY,
  ]) {
    if (typeof other === "string" && sameUtf8(controlKey, other)) {
      configurationError();
    }
  }
  const settings: SkillRegistrySettings = {
    baseUrl: url.origin,
    controlKey,
  };
  SKILL_REGISTRY_SETTINGS_BRAND.add(settings);
  if (allowLoopback) SKILL_REGISTRY_LOOPBACK_SETTINGS.add(settings);
  return Object.freeze(settings);
}

type InternalSkillRegistrySettings = Readonly<{
  baseUrl: string;
  controlKey: string;
  hostname: string;
  hostHeader: string;
  port: number;
  allowLoopback: boolean;
}>;

function validatedSettings(value: unknown): InternalSkillRegistrySettings {
  if (
    typeof value !== "object" ||
    value === null ||
    !SKILL_REGISTRY_SETTINGS_BRAND.has(value)
  ) {
    configurationError();
  }
  const snapshot = exactRecord(value, [["baseUrl", "controlKey"]]);
  if (
    snapshot === null ||
    typeof snapshot.baseUrl !== "string" ||
    !safeBearer(snapshot.controlKey)
  ) {
    configurationError();
  }
  const rawUrl = snapshot.baseUrl;
  const allowLoopback = SKILL_REGISTRY_LOOPBACK_SETTINGS.has(value);
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    configurationError();
  }
  if (
    rawUrl !== url.origin ||
    url.protocol !== "http:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    !allowedHostnameSyntax(url.hostname, allowLoopback)
  ) {
    configurationError();
  }
  return Object.freeze({
    baseUrl: url.origin,
    controlKey: snapshot.controlKey,
    hostname: url.hostname.startsWith("[")
      ? url.hostname.slice(1, -1)
      : url.hostname,
    hostHeader: url.host,
    port: url.port === "" ? 80 : Number(url.port),
    allowLoopback,
  });
}

function privateResolvedAddress(
  address: string,
  family: 4 | 6,
  allowLoopback = false,
): boolean {
  if (family === 4) {
    if (isIP(address) !== 4) return false;
    if (allowLoopback && address === "127.0.0.1") return true;
    const octets = address.split(".").map(Number);
    return (
      octets[0] === 10 ||
      (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    );
  }
  if (allowLoopback && address === "::1") return true;
  return (
    isIP(address) === 6 &&
    !address.toLowerCase().includes("::ffff:") &&
    /^f[cd][0-9a-f]{2}(?::|$)/iu.test(address)
  );
}

const defaultAddressResolver: SkillRegistryAddressResolver = async (
  hostname,
) => {
  const resolved = await lookup(hostname, { all: true, verbatim: true });
  return resolved.map(({ address, family }) => ({
    address,
    family: family as 4 | 6,
  }));
};

async function pinnedAddress(
  settings: InternalSkillRegistrySettings,
  resolver: SkillRegistryAddressResolver,
): Promise<SkillRegistryResolvedAddress> {
  const resolved = await resolver(settings.hostname);
  if (!Array.isArray(resolved) || resolved.length < 1 || resolved.length > 64) {
    clientError("transport_error");
  }
  const addresses: SkillRegistryResolvedAddress[] = [];
  for (const item of resolved) {
    const address = exactRecord(item, [["address", "family"]]);
    if (
      address === null ||
      typeof address.address !== "string" ||
      (address.family !== 4 && address.family !== 6) ||
      !privateResolvedAddress(
        address.address,
        address.family,
        settings.allowLoopback,
      )
    ) {
      clientError("transport_error");
    }
    addresses.push({ address: address.address, family: address.family });
  }
  return addresses[0]!;
}

export function sendPinnedSkillRegistryHttpRequest(
  input: SkillRegistryTransportInput,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = Object.create(null);
    for (const [name, value] of Object.entries(input.headers)) {
      if (name.toLowerCase() !== "host") headers[name] = value;
    }
    headers.Host = input.hostHeader;
    const request = nodeHttpRequest(
      {
        protocol: "http:",
        hostname: input.address,
        family: input.family,
        port: input.port,
        method: input.method,
        path: input.path,
        headers,
        signal: input.signal,
        insecureHTTPParser: false,
      },
      (incoming) => {
        const status = incoming.statusCode;
        if (status === undefined) {
          incoming.destroy();
          reject(new Error("Invalid Skill Registry response"));
          return;
        }
        const responseHeaders = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
          responseHeaders.append(
            incoming.rawHeaders[index]!,
            incoming.rawHeaders[index + 1]!,
          );
        }
        const body =
          status === 204 || status === 205 || status === 304
            ? null
            : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>);
        try {
          resolve(
            new Response(body, {
              status,
              statusText: incoming.statusMessage,
              headers: responseHeaders,
            }),
          );
        } catch (error) {
          incoming.destroy();
          reject(error);
        }
      },
    );
    request.once("error", reject);
    request.end(input.body);
  });
}

function canonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function pairedSurrogates(value: string): boolean {
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

function validTarget(action: SkillRegistryAction, target: string): boolean {
  if (action === "list") return target === "skills";
  if (action === "upload") return target === "new" || canonicalUuid(target);
  const segments = target.split("/");
  if (action === "detail" || action === "review") {
    return (
      segments.length === 2 &&
      canonicalUuid(segments[0]) &&
      canonicalUuid(segments[1])
    );
  }
  return (
    segments.length >= 3 &&
    canonicalUuid(segments[0]) &&
    canonicalUuid(segments[1]) &&
    isCanonicalAdminSkillPath(segments.slice(2).join("/"))
  );
}

export function createSkillRegistryAssertionSigner(options: {
  controlKey: string;
  clock?: () => number;
  nonceFactory?: () => string;
}): { sign(input: SkillRegistryAssertionInput): string } {
  if (!safeBearer(options.controlKey)) clientError("invalid_request");
  const clock = options.clock ?? (() => Math.floor(Date.now() / 1_000));
  const nonceFactory = options.nonceFactory ?? randomUUID;
  const signingKey = createHmac(
    "sha256",
    Buffer.from(options.controlKey, "utf8"),
  )
    .update(ASSERTION_DOMAIN, "utf8")
    .digest();

  return {
    sign(input) {
      try {
        const value = exactRecord(input, [
          [
            "action",
            "actor",
            "permission",
            "requestId",
            "target",
            "assurance",
            "assuredAt",
          ],
        ]);
        if (
          value === null ||
          typeof value.action !== "string" ||
          !Object.hasOwn(ACTION_PERMISSION, value.action) ||
          !canonicalUuid(value.actor) ||
          !canonicalUuid(value.requestId) ||
          typeof value.permission !== "string" ||
          ACTION_PERMISSION[value.action as SkillRegistryAction] !==
            value.permission ||
          typeof value.target !== "string" ||
          !validTarget(value.action as SkillRegistryAction, value.target)
        ) {
          clientError("invalid_request");
        }
        const issuedAt = clock();
        if (
          !Number.isSafeInteger(issuedAt) ||
          issuedAt < 0 ||
          issuedAt > Number.MAX_SAFE_INTEGER - 5
        ) {
          clientError("invalid_request");
        }
        if (value.action === "review") {
          if (
            value.assurance !== "password+mfa" ||
            typeof value.assuredAt !== "number" ||
            !Number.isSafeInteger(value.assuredAt) ||
            value.assuredAt > issuedAt ||
            value.assuredAt < issuedAt - 600
          ) {
            clientError("invalid_request");
          }
        } else if (value.assurance !== "session" || value.assuredAt !== null) {
          clientError("invalid_request");
        }
        const nonce = nonceFactory();
        if (!canonicalUuid(nonce)) clientError("invalid_request");
        const payload = {
          action: value.action,
          actor: value.actor,
          assurance: value.assurance,
          assuredAt: value.assuredAt,
          expiresAt: issuedAt + 5,
          issuedAt,
          nonce,
          permission: value.permission,
          requestId: value.requestId,
          target: value.target,
        };
        const canonical = Buffer.from(JSON.stringify(payload), "utf8");
        const signature = createHmac("sha256", signingKey)
          .update(canonical)
          .digest("base64url");
        return `${canonical.toString("base64url")}.${signature}`;
      } catch (error) {
        throw sanitized(error);
      }
    },
  };
}

const CLEAN_ERROR_CODES: ReadonlySet<string> = new Set([
  ...SKILL_REGISTRY_DOMAIN_CODES,
  "invalid_request",
  "invalid_response",
  "response_too_large",
  "timeout",
  "transport_error",
]);

function cleanErrorCode(error: unknown): SkillRegistryClientErrorCode {
  try {
    if (
      typeof error !== "object" ||
      error === null ||
      !SKILL_REGISTRY_CLIENT_ERROR_BRAND.has(error)
    ) {
      return "transport_error";
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(error, "code");
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !descriptor.enumerable ||
      !descriptor.configurable ||
      !descriptor.writable ||
      typeof descriptor.value !== "string" ||
      !CLEAN_ERROR_CODES.has(descriptor.value)
    ) {
      return "transport_error";
    }
    return descriptor.value as SkillRegistryClientErrorCode;
  } catch {
    return "transport_error";
  }
}

function sanitized(error: unknown): SkillRegistryClientError {
  return new SkillRegistryClientError(cleanErrorCode(error));
}

function strictNoStore(value: string | null): boolean {
  return value?.trim().toLowerCase() === "no-store";
}

function declaredLength(response: Response): number | null {
  const raw = response.headers.get("content-length");
  if (raw === null) return null;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(raw)) clientError("invalid_response");
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) clientError("invalid_response");
  return parsed;
}

async function boundedResponseBody(
  response: Response,
  controller: AbortController,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declared = declaredLength(response);
  if (declared !== null && declared > maximumBytes) {
    clientError("response_too_large");
  }
  const reader = response.body?.getReader();
  if (reader === undefined) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new SkillRegistryClientError("timeout"));
    }, RESPONSE_TIMEOUT_MS);
  });
  const consume = (async () => {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maximumBytes) {
        clientError("response_too_large");
      }
      chunks.push(result.value);
    }
  })();
  try {
    await Promise.race([consume, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    try {
      reader.releaseLock();
    } catch {
      // An aborted body may remain locked until the source accepts cancellation.
    }
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Cancellation is cleanup only and must never replace the primary error.
  }
}

function parseStrictJson(bytes: Uint8Array): unknown {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    clientError("invalid_response");
  }
  let index = 0;
  let nodes = 0;
  const whitespace = () => {
    while (
      index < source.length &&
      /[\u0009\u000a\u000d\u0020]/u.test(source[index]!)
    ) {
      index += 1;
    }
  };
  const string = (): string => {
    const start = index;
    if (source[index] !== '"') throw new Error();
    index += 1;
    while (index < source.length) {
      const code = source.charCodeAt(index);
      if (code < 0x20) throw new Error();
      if (source[index] === '"') {
        index += 1;
        const parsed: unknown = JSON.parse(source.slice(start, index));
        if (typeof parsed !== "string") throw new Error();
        return parsed;
      }
      if (source[index] === "\\") {
        index += 1;
        if (index >= source.length) throw new Error();
        if (source[index] === "u") {
          if (!/^[0-9a-fA-F]{4}$/u.test(source.slice(index + 1, index + 5))) {
            throw new Error();
          }
          index += 5;
          continue;
        }
        if (!/["\\/bfnrt]/u.test(source[index]!)) throw new Error();
      }
      index += 1;
    }
    throw new Error();
  };
  const value = (depth: number): unknown => {
    if (depth > 32 || (nodes += 1) > 500_000) throw new Error();
    whitespace();
    if (source[index] === '"') return string();
    if (source.startsWith("true", index)) {
      index += 4;
      return true;
    }
    if (source.startsWith("false", index)) {
      index += 5;
      return false;
    }
    if (source.startsWith("null", index)) {
      index += 4;
      return null;
    }
    if (source[index] === "[") {
      index += 1;
      whitespace();
      const array: unknown[] = [];
      if (source[index] === "]") {
        index += 1;
        return array;
      }
      while (true) {
        array.push(value(depth + 1));
        whitespace();
        if (source[index] === "]") {
          index += 1;
          return array;
        }
        if (source[index] !== ",") throw new Error();
        index += 1;
      }
    }
    if (source[index] === "{") {
      index += 1;
      whitespace();
      const object: Record<string, unknown> = Object.create(null);
      const keys = new Set<string>();
      if (source[index] === "}") {
        index += 1;
        return object;
      }
      while (true) {
        whitespace();
        const key = string();
        if (keys.has(key)) throw new Error();
        keys.add(key);
        whitespace();
        if (source[index] !== ":") throw new Error();
        index += 1;
        object[key] = value(depth + 1);
        whitespace();
        if (source[index] === "}") {
          index += 1;
          return object;
        }
        if (source[index] !== ",") throw new Error();
        index += 1;
      }
    }
    const match = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/uy;
    match.lastIndex = index;
    const found = match.exec(source);
    if (found === null) throw new Error();
    index = match.lastIndex;
    const number = Number(found[0]);
    if (!Number.isFinite(number)) throw new Error();
    return number;
  };
  try {
    const parsed = value(0);
    whitespace();
    if (index !== source.length) throw new Error();
    return parsed;
  } catch {
    clientError("invalid_response");
  }
}

const STATUS_BY_CODE: Readonly<Record<SkillRegistryDomainErrorCode, number>> = {
  ARCHIVE_ENCRYPTED: 400,
  ARCHIVE_EXTRACTED_TOO_LARGE: 400,
  ARCHIVE_FILE_TOO_LARGE: 400,
  ARCHIVE_GIT_LFS_POINTER: 400,
  ARCHIVE_GIT_METADATA: 400,
  ARCHIVE_INVALID: 400,
  ARCHIVE_MULTIPLE_SKILL_ROOTS: 400,
  ARCHIVE_NESTED: 400,
  ARCHIVE_PATH_CONFLICT: 400,
  ARCHIVE_PATH_TOO_DEEP: 400,
  ARCHIVE_PATH_TOO_LONG: 400,
  ARCHIVE_SKILL_ROOT_REQUIRED: 400,
  ARCHIVE_TOO_LARGE: 413,
  ARCHIVE_TOO_MANY_FILES: 400,
  ARCHIVE_UNSAFE_PATH: 400,
  ARCHIVE_UNSUPPORTED_FILE: 400,
  ARTIFACT_DIGEST_MISMATCH: 503,
  ARTIFACT_NOT_FOUND: 400,
  ARTIFACT_STORAGE_ERROR: 503,
  ASSERTION_REPLAY: 409,
  AUTHENTICATION_FAILED: 401,
  AUTHORIZATION_FAILED: 403,
  FILE_NOT_FOUND: 404,
  MANIFEST_INVALID: 400,
  REGISTRY_STORAGE_ERROR: 503,
  REGISTRY_UNAVAILABLE: 503,
  RESPONSE_TOO_LARGE: 503,
  REVIEW_BLOCKED: 409,
  REVIEW_SELF_APPROVAL_DENIED: 409,
  REVISION_NOT_FOUND: 404,
  REVISION_STATE_CONFLICT: 409,
  SKILL_BINARY_FILE: 400,
  SKILL_FILE_NOT_UTF8: 400,
  SKILL_FILE_TOO_LARGE: 400,
  SKILL_NAME_CONFLICT: 409,
  SKILL_NOT_FOUND: 404,
  SKILL_SCAN_FAILED: 503,
  SKILL_SCRIPT_SHEBANG_UNSUPPORTED: 400,
  VALIDATION_ERROR: 400,
};

function readError(
  status: number,
  value: unknown,
): SkillRegistryDomainErrorCode | null {
  const response = exactRecord(value, [["error"]]);
  if (
    response === null ||
    typeof response.error !== "string" ||
    !Object.hasOwn(STATUS_BY_CODE, response.error) ||
    STATUS_BY_CODE[response.error as SkillRegistryDomainErrorCode] !== status
  ) {
    return null;
  }
  return response.error as SkillRegistryDomainErrorCode;
}

function encodeFilePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function readCommandIdentity(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  const command = exactRecord(value, [keys]);
  return command !== null &&
    canonicalUuid(command.actor) &&
    canonicalUuid(command.requestId)
    ? command
    : null;
}

function readReviewInput(value: unknown): SkillRegistryReviewInput | null {
  const input = exactRecord(value, [
    ["decision", "expectedState", "reason", "attestations"],
  ]);
  const attestations = exactRecord(input?.attestations, [
    [
      "contentReviewed",
      "usageRightsConfirmed",
      "executionRiskAccepted",
      "independentReviewerConfirmed",
    ],
  ]);
  if (
    input === null ||
    attestations === null ||
    (input.decision !== "approve" && input.decision !== "reject") ||
    input.expectedState !== "pending_review" ||
    attestations.contentReviewed !== true ||
    attestations.usageRightsConfirmed !== true ||
    attestations.executionRiskAccepted !== true ||
    attestations.independentReviewerConfirmed !== true
  ) {
    return null;
  }
  if (
    (input.decision === "approve" && input.reason !== null) ||
    (input.decision === "reject" &&
      (typeof input.reason !== "string" ||
        input.reason !== input.reason.trim() ||
        input.reason.length === 0 ||
        Buffer.byteLength(input.reason, "utf8") > 2_048 ||
        Array.from(input.reason).length > 500 ||
        !pairedSurrogates(input.reason) ||
        CONTROL_CHARACTER.test(input.reason)))
  ) {
    return null;
  }
  return {
    decision: input.decision,
    expectedState: "pending_review",
    reason: input.reason as string | null,
    attestations: {
      contentReviewed: true,
      usageRightsConfirmed: true,
      executionRiskAccepted: true,
      independentReviewerConfirmed: true,
    },
  };
}

function copyArchive(value: unknown): Uint8Array<ArrayBuffer> | null {
  try {
    if (
      !(value instanceof Uint8Array) ||
      Reflect.getPrototypeOf(value) !== Uint8Array.prototype ||
      value.byteLength < 1 ||
      value.byteLength > MAX_ARCHIVE_BYTES
    ) {
      return null;
    }
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    return copy;
  } catch {
    return null;
  }
}

export function createSkillRegistryClient(options: {
  settings: SkillRegistrySettings;
  transport?: SkillRegistryTransport;
  resolver?: SkillRegistryAddressResolver;
  clock?: () => number;
  nonceFactory?: () => string;
}): SkillRegistryClient {
  const settings = validatedSettings(options.settings);
  const transport = options.transport ?? sendPinnedSkillRegistryHttpRequest;
  const resolver = options.resolver ?? defaultAddressResolver;
  const signer = createSkillRegistryAssertionSigner({
    controlKey: settings.controlKey,
    clock: options.clock,
    nonceFactory: options.nonceFactory,
  });

  async function request<T>(requestOptions: {
    method: "GET" | "POST";
    path: string;
    requestId: string;
    assertion: SkillRegistryAssertionInput;
    contentType?: "application/json" | "application/zip";
    body?: string | Uint8Array;
    successStatus: 200 | 201;
    read(value: unknown): T | null;
    validate?(value: T): boolean;
    file?: boolean;
  }): Promise<T> {
    const controller = new AbortController();
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    let response: Response | undefined;
    let responseFullyConsumed = false;
    try {
      const assertion = signer.sign(requestOptions.assertion);
      const headers: Record<string, string> = {
        Accept: "application/json",
        Authorization: `Bearer ${settings.controlKey}`,
        "X-Request-Id": requestOptions.requestId,
        "X-Skill-Registry-Assertion": assertion,
      };
      if (requestOptions.contentType !== undefined) {
        headers["Content-Type"] = requestOptions.contentType;
      }
      const connectDeadline = new Promise<never>((_resolve, reject) => {
        connectTimer = setTimeout(() => {
          controller.abort();
          reject(new SkillRegistryClientError("timeout"));
        }, CONNECT_TIMEOUT_MS);
      });
      const responsePromise = (async () => {
        const address = await pinnedAddress(settings, resolver);
        if (controller.signal.aborted) clientError("timeout");
        return transport({
          address: address.address,
          family: address.family,
          port: settings.port,
          hostHeader: settings.hostHeader,
          method: requestOptions.method,
          path: requestOptions.path,
          headers,
          body: requestOptions.body,
          signal: controller.signal,
        });
      })();
      response = await Promise.race([responsePromise, connectDeadline]);
      if (connectTimer !== undefined) clearTimeout(connectTimer);
      if (response.status >= 300 && response.status < 400) {
        clientError("invalid_response");
      }
      if (response.headers.get("content-type") !== "application/json") {
        clientError("invalid_response");
      }
      if (!strictNoStore(response.headers.get("cache-control"))) {
        clientError("invalid_response");
      }
      const body = await boundedResponseBody(
        response,
        controller,
        requestOptions.file ? MAX_FILE_RESPONSE_BYTES : MAX_RESPONSE_BYTES,
      );
      responseFullyConsumed = true;
      const parsed = parseStrictJson(body);
      if (response.status !== requestOptions.successStatus) {
        const code = readError(response.status, parsed);
        if (code === null) clientError("invalid_response");
        throw new SkillRegistryClientError(code);
      }
      if (requestOptions.file) {
        const raw = exactRecord(parsed, [["version", "path", "content"]]);
        if (
          raw !== null &&
          typeof raw.content === "string" &&
          Buffer.byteLength(raw.content, "utf8") > MAX_FILE_BYTES
        ) {
          clientError("response_too_large");
        }
      }
      const safe = requestOptions.read(parsed);
      if (
        safe === null ||
        (requestOptions.validate && !requestOptions.validate(safe))
      ) {
        clientError("invalid_response");
      }
      return safe;
    } catch (error) {
      if (response !== undefined && !responseFullyConsumed) {
        controller.abort();
        await cancelResponseBody(response);
      }
      throw sanitized(error);
    } finally {
      if (connectTimer !== undefined) clearTimeout(connectTimer);
    }
  }

  function assertion(
    command: { actor: string; requestId: string },
    action: SkillRegistryAction,
    target: string,
    assuredAt: number | null = null,
  ): SkillRegistryAssertionInput {
    return {
      action,
      actor: command.actor,
      permission: ACTION_PERMISSION[action],
      requestId: command.requestId,
      target,
      assurance: action === "review" ? "password+mfa" : "session",
      assuredAt,
    };
  }

  return {
    async listSkills(input) {
      try {
        const command = readCommandIdentity(input, [
          "actor",
          "requestId",
          "limit",
          "offset",
        ]);
        if (
          command === null ||
          typeof command.limit !== "number" ||
          !Number.isSafeInteger(command.limit) ||
          command.limit < 1 ||
          command.limit > 100 ||
          typeof command.offset !== "number" ||
          !Number.isSafeInteger(command.offset) ||
          command.offset < 0 ||
          command.offset > 1_000_000
        ) {
          clientError("invalid_request");
        }
        const actor = command.actor as string;
        const requestId = command.requestId as string;
        const limit = command.limit as number;
        const offset = command.offset as number;
        return await request({
          method: "GET",
          path: `/internal/skills?limit=${limit}&offset=${offset}`,
          requestId,
          assertion: assertion({ actor, requestId }, "list", "skills"),
          successStatus: 200,
          read: parseAdminSkillListResponse,
          validate: (value) =>
            value.page.limit === limit && value.page.offset === offset,
        });
      } catch (error) {
        throw sanitized(error);
      }
    },

    async getRevision(input) {
      try {
        const command = readCommandIdentity(input, [
          "actor",
          "requestId",
          "skillId",
          "revisionId",
        ]);
        if (
          command === null ||
          !canonicalUuid(command.skillId) ||
          !canonicalUuid(command.revisionId)
        ) {
          clientError("invalid_request");
        }
        const { actor, requestId, skillId, revisionId } = command as Record<
          "actor" | "requestId" | "skillId" | "revisionId",
          string
        >;
        const target = `${skillId}/${revisionId}`;
        return await request({
          method: "GET",
          path: `/internal/skills/${skillId}/revisions/${revisionId}`,
          requestId,
          assertion: assertion({ actor, requestId }, "detail", target),
          successStatus: 200,
          read: parseAdminSkillRevisionDetailResponse,
          validate: (value) =>
            value.revision.skillId === skillId &&
            value.revision.id === revisionId,
        });
      } catch (error) {
        throw sanitized(error);
      }
    },

    async getFile(input) {
      try {
        const command = readCommandIdentity(input, [
          "actor",
          "requestId",
          "skillId",
          "revisionId",
          "path",
        ]);
        if (
          command === null ||
          !canonicalUuid(command.skillId) ||
          !canonicalUuid(command.revisionId) ||
          !isCanonicalAdminSkillPath(command.path)
        ) {
          clientError("invalid_request");
        }
        const { actor, requestId, skillId, revisionId, path } =
          command as Record<
            "actor" | "requestId" | "skillId" | "revisionId" | "path",
            string
          >;
        const target = `${skillId}/${revisionId}/${path}`;
        return await request({
          method: "GET",
          path: `/internal/skills/${skillId}/revisions/${revisionId}/files/${encodeFilePath(path)}`,
          requestId,
          assertion: assertion({ actor, requestId }, "file", target),
          successStatus: 200,
          read: parseAdminSkillFileResponse,
          validate: (value) => value.path === path,
          file: true,
        });
      } catch (error) {
        throw sanitized(error);
      }
    },

    async uploadSkill(input) {
      try {
        const snapshot = exactRecord(input, [
          ["actor", "requestId", "archive"],
          ["actor", "requestId", "archive", "targetSkillId"],
        ]);
        const archive =
          snapshot === null ? null : copyArchive(snapshot.archive);
        if (
          snapshot === null ||
          !canonicalUuid(snapshot.actor) ||
          !canonicalUuid(snapshot.requestId) ||
          archive === null ||
          !(
            snapshot.targetSkillId === undefined ||
            canonicalUuid(snapshot.targetSkillId)
          )
        ) {
          clientError("invalid_request");
        }
        const actor = snapshot.actor as string;
        const requestId = snapshot.requestId as string;
        const targetSkillId = snapshot.targetSkillId as string | undefined;
        const target = targetSkillId ?? "new";
        return await request({
          method: "POST",
          path: `/internal/skills/uploads${
            targetSkillId === undefined ? "" : `?targetSkillId=${targetSkillId}`
          }`,
          requestId,
          assertion: assertion({ actor, requestId }, "upload", target),
          contentType: "application/zip",
          body: archive,
          successStatus: 201,
          read: parseAdminSkillRevisionResponse,
          validate: (value) =>
            value.revision.state === "pending_review" &&
            (targetSkillId === undefined ||
              value.revision.skillId === targetSkillId),
        });
      } catch (error) {
        throw sanitized(error);
      }
    },

    async reviewRevision(input) {
      try {
        const command = readCommandIdentity(input, [
          "actor",
          "requestId",
          "skillId",
          "revisionId",
          "assuredAt",
          "input",
        ]);
        const reviewInput =
          command === null ? null : readReviewInput(command.input);
        if (
          command === null ||
          reviewInput === null ||
          !canonicalUuid(command.skillId) ||
          !canonicalUuid(command.revisionId) ||
          typeof command.assuredAt !== "number" ||
          !Number.isSafeInteger(command.assuredAt)
        ) {
          clientError("invalid_request");
        }
        const { actor, requestId, skillId, revisionId } = command as Record<
          "actor" | "requestId" | "skillId" | "revisionId",
          string
        >;
        const assuredAt = command.assuredAt as number;
        const body = JSON.stringify(reviewInput);
        if (Buffer.byteLength(body, "utf8") > MAX_REVIEW_BODY_BYTES) {
          clientError("invalid_request");
        }
        const target = `${skillId}/${revisionId}`;
        return await request({
          method: "POST",
          path: `/internal/skills/${skillId}/revisions/${revisionId}/review`,
          requestId,
          assertion: assertion(
            { actor, requestId },
            "review",
            target,
            assuredAt,
          ),
          contentType: "application/json",
          body,
          successStatus: 200,
          read: parseAdminSkillRevisionResponse,
          validate: (value) =>
            value.revision.skillId === skillId &&
            value.revision.id === revisionId &&
            value.revision.state ===
              (reviewInput.decision === "approve" ? "published" : "rejected"),
        });
      } catch (error) {
        throw sanitized(error);
      }
    },
  };
}
