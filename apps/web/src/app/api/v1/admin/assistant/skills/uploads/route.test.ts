import { describe, expect, it, vi } from "vitest";

import { AuthAccessError } from "@/server/auth/access";
import type { AuthorizedSkillCommand } from "@/server/assistant/admin-skill-commands";
import { SkillRegistryClientError } from "@/server/assistant/skill-registry-client";
import { BoundedMultipartError } from "@/server/http/read-bounded-multipart";
import { MutationRequestError } from "@/server/http/require-trusted-mutation";
import { createAdminSkillUploadHandler } from "../handler";

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const context = { requestId: REQUEST_ID } as AuthorizedSkillCommand;
const revision = {
  version: "1" as const,
  revision: {
    id: "44444444-4444-4444-8444-444444444444",
    skillId: "33333333-3333-4333-8333-333333333333",
    name: "safe-skill",
    number: 1,
    state: "pending_review" as const,
    sourceType: "upload" as const,
    artifactSha256: "a".repeat(64),
    createdBy: "11111111-1111-4111-8111-111111111111",
    createdAt: "2027-01-15T08:00:00Z",
    reviewedBy: null,
    reviewedAt: null,
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
  const readMultipart = vi.fn(async () => {
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
      revision: { state: "pending_review" },
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
    expect(response.status).toBe(400);
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
});
