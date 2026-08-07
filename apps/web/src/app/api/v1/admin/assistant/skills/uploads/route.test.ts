import { describe, expect, it, vi } from "vitest";

import { AuthAccessError } from "@/server/auth/access";
import type { AuthorizedSkillCommand } from "@/server/assistant/admin-skill-commands";
import type { AuthorizedSkillLifecycleCommand } from "@/server/assistant/admin-skill-lifecycle-commands";
import { SkillRegistryClientError } from "@/server/assistant/skill-registry-client";
import {
  BoundedMultipartError,
  type BoundedSkillUpload,
} from "@/server/http/read-bounded-multipart";
import { MutationRequestError } from "@/server/http/require-trusted-mutation";
import { createAdminSkillUploadHandler } from "../handler";

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const context = {
  requestId: REQUEST_ID,
  actor: { userId: ACTOR_ID },
} as AuthorizedSkillCommand;
const lifecycleContext = {} as AuthorizedSkillLifecycleCommand;
const SKILL_ID = "33333333-3333-4333-8333-333333333333";
const OLD_REVISION_ID = "44444444-4444-4444-8444-444444444444";
const NEW_REVISION_ID = "55555555-5555-4555-8555-555555555555";
const revision = {
  version: "1" as const,
  revision: {
    id: "44444444-4444-4444-8444-444444444444",
    skillId: "33333333-3333-4333-8333-333333333333",
    name: "safe-skill",
    number: 1,
    state: "published" as const,
    sourceType: "upload" as const,
    artifactSha256: "a".repeat(64),
    createdBy: "11111111-1111-4111-8111-111111111111",
    createdAt: "2027-01-15T08:00:00Z",
  },
};

function fixture() {
  const operations: string[] = [];
  const commands = {
    authorize: vi.fn(async () => {
      operations.push("authorize");
      return context;
    }),
    upload: vi.fn(async () => {
      operations.push("upload");
      return revision;
    }),
  };
  const readMultipart = vi.fn<() => Promise<BoundedSkillUpload>>(async () => {
    operations.push("multipart");
    return { archive: new Uint8Array([0x50, 0x4b, 3, 4]) };
  });
  return {
    operations,
    commands,
    readMultipart,
    handler: createAdminSkillUploadHandler({
      commands,
      readMultipart,
      requestIdFactory: () => REQUEST_ID,
    }),
  };
}

describe("admin skill upload route", () => {
  it("authorizes before reading multipart and returns 201 no-store", async () => {
    const current = fixture();
    const request = new Request("https://admin.example.test/uploads", {
      method: "POST",
    });
    const response = await current.handler(request);
    expect(current.commands.authorize).toHaveBeenCalledWith(request, "upload");
    expect(current.operations).toEqual(["authorize", "multipart", "upload"]);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      requestId: REQUEST_ID,
      revision: { state: "published" },
    });
  });

  it("never consumes the body when a customer or workforce actor is denied", async () => {
    const current = fixture();
    current.commands.authorize.mockRejectedValueOnce(
      new AuthAccessError("AUTH_PERMISSION_DENIED", 403),
    );
    const response = await current.handler(
      new Request("https://admin.example.test/uploads", { method: "POST" }),
    );
    expect(response.status).toBe(403);
    expect(current.readMultipart).not.toHaveBeenCalled();
  });

  it("cancels an unread body after trusted-mutation rejection without masking the public error", async () => {
    const current = fixture();
    current.commands.authorize.mockRejectedValueOnce(
      new MutationRequestError(),
    );
    const cancel = vi.fn(async () => {
      throw new Error("cleanup failure");
    });
    const body = new ReadableStream<Uint8Array>({ pull() {}, cancel });
    const response = await current.handler(
      new Request("https://admin.example.test/uploads", {
        method: "POST",
        body,
        duplex: "half",
      } as RequestInit & { duplex: "half" }),
    );

    expect(cancel).toHaveBeenCalledOnce();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      version: "1",
      requestId: REQUEST_ID,
      error: {
        code: "permission_denied",
        message: "Permission denied",
        retryable: false,
      },
    });
    expect(current.readMultipart).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_multipart", 400],
    ["archive_too_large", 413],
    ["body_too_large", 413],
  ] as const)("maps bounded parser %s to %s", async (code, status) => {
    const current = fixture();
    current.readMultipart.mockRejectedValueOnce(
      new BoundedMultipartError(code),
    );
    const response = await current.handler(
      new Request("https://admin.example.test/uploads", { method: "POST" }),
    );
    expect(response.status).toBe(status);
    expect(current.commands.upload).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each(["SKILL_BINARY_FILE", "SKILL_SCRIPT_SHEBANG_UNSUPPORTED"] as const)(
    "maps Registry package error %s to safe 400",
    async (code) => {
      const current = fixture();
      current.commands.upload.mockRejectedValueOnce(
        new SkillRegistryClientError(code),
      );

      const response = await current.handler(
        new Request("https://admin.example.test/uploads", { method: "POST" }),
      );

      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        version: "1",
        requestId: REQUEST_ID,
        error: {
          code: "validation_error",
          message: "Invalid skill request",
          retryable: false,
        },
      });
    },
  );

  it("preserves the Registry archive-too-large response as a safe 413", async () => {
    const current = fixture();
    current.commands.upload.mockRejectedValueOnce(
      new SkillRegistryClientError("ARCHIVE_TOO_LARGE"),
    );

    const response = await current.handler(
      new Request("https://admin.example.test/uploads", { method: "POST" }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      requestId: REQUEST_ID,
      error: { code: "payload_too_large", retryable: false },
    });
  });

  it("returns only the safe conflicting Skill ID for replacement confirmation", async () => {
    const current = fixture();
    current.commands.upload.mockRejectedValueOnce(
      new SkillRegistryClientError(
        "SKILL_NAME_CONFLICT",
        revision.revision.skillId,
        "a".repeat(64),
        true,
      ),
    );

    const response = await current.handler(
      new Request("https://admin.example.test/uploads", { method: "POST" }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      requestId: REQUEST_ID,
      conflictingSkillId: revision.revision.skillId,
      replacementToken: "a".repeat(64),
      conflictingSkillEnabled: true,
      error: { code: "state_conflict" },
    });
  });

  it("replaces an active Skill with the uploaded revision in the same BFF request", async () => {
    const current = fixture();
    current.readMultipart.mockResolvedValueOnce({
      archive: new Uint8Array([0x50, 0x4b, 3, 4]),
      targetSkillId: SKILL_ID,
      expectedArtifactSha256: "a".repeat(64),
    });
    current.commands.upload.mockResolvedValueOnce({
      ...revision,
      revision: {
        ...revision.revision,
        id: NEW_REVISION_ID,
        skillId: SKILL_ID,
      },
    });
    const registry = {
      listSkills: vi.fn(async () => ({
        version: "1" as const,
        skills: [
          {
            id: SKILL_ID,
            name: "safe-skill",
            description: "",
            enabled: true,
            uploadedAt: "2026-08-07T08:00:00.000Z",
            replacementToken: "a".repeat(64),
            revisionId: OLD_REVISION_ID,
          },
        ],
        page: { limit: 100, offset: 0, returned: 1 },
      })),
      runtimeStatus: vi.fn(async () => ({
        active: {
          id: "66666666-6666-4666-8666-666666666666",
          state: "active" as const,
          revisionIds: [OLD_REVISION_ID],
          itemCount: 1,
          totalExtractedSize: 42,
          failureCode: null,
        },
        previous: null,
        activationVersion: 7,
        candidateCount: 0,
        candidates: [],
      })),
    };
    const lifecycle = {
      authorize: vi.fn(async () => lifecycleContext),
      applySkillSet: vi.fn(async () => ({ activationVersion: 8 })),
    };
    const handler = createAdminSkillUploadHandler({
      commands: current.commands,
      readMultipart: current.readMultipart,
      requestIdFactory: () => REQUEST_ID,
      registry: registry as never,
      lifecycle: lifecycle as never,
    });

    const response = await handler(
      new Request("https://admin.example.test/uploads", { method: "POST" }),
    );

    expect(response.status).toBe(201);
    expect(current.commands.upload).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        targetSkillId: SKILL_ID,
        expectedArtifactSha256: "a".repeat(64),
      }),
    );
    expect(lifecycle.applySkillSet).toHaveBeenCalledWith(
      lifecycleContext,
      expect.objectContaining({
        operation: "replace",
        skillId: SKILL_ID,
        expectedActivationVersion: 7,
        nextRevisionIds: [NEW_REVISION_ID],
        requestId: REQUEST_ID,
      }),
    );
  });

  it("keeps an inactive replacement out of runtime activation", async () => {
    const current = fixture();
    current.readMultipart.mockResolvedValueOnce({
      archive: new Uint8Array([0x50, 0x4b, 3, 4]),
      targetSkillId: SKILL_ID,
      expectedArtifactSha256: "a".repeat(64),
    });
    const registry = {
      listSkills: vi.fn(async () => ({
        version: "1" as const,
        skills: [
          {
            id: SKILL_ID,
            name: "safe-skill",
            description: "",
            enabled: false,
            uploadedAt: "2026-08-07T08:00:00.000Z",
            replacementToken: "a".repeat(64),
            revisionId: OLD_REVISION_ID,
          },
        ],
        page: { limit: 100, offset: 0, returned: 1 },
      })),
      runtimeStatus: vi.fn(),
    };
    const lifecycle = {
      authorize: vi.fn(async () => lifecycleContext),
      applySkillSet: vi.fn(async () => ({ activationVersion: 8 })),
    };
    const handler = createAdminSkillUploadHandler({
      commands: current.commands,
      readMultipart: current.readMultipart,
      requestIdFactory: () => REQUEST_ID,
      registry: registry as never,
      lifecycle: lifecycle as never,
    });

    const response = await handler(
      new Request("https://admin.example.test/uploads", { method: "POST" }),
    );

    expect(response.status).toBe(201);
    expect(lifecycle.authorize).not.toHaveBeenCalled();
    expect(lifecycle.applySkillSet).not.toHaveBeenCalled();
  });
});
