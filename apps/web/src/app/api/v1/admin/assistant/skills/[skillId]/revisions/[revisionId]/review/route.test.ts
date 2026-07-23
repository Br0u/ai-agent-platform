import { describe, expect, it, vi } from "vitest";

import { SensitiveActionError } from "@/server/auth/sensitive-action";
import type { AuthorizedSkillCommand } from "@/server/assistant/admin-skill-commands";
import { SkillRegistryClientError } from "@/server/assistant/skill-registry-client";
import { createAdminSkillReviewHandler } from "../../../../handler";

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const SKILL_ID = "33333333-3333-4333-8333-333333333333";
const REVISION_ID = "44444444-4444-4444-8444-444444444444";
const context = { requestId: REQUEST_ID } as AuthorizedSkillCommand;
const input = {
  decision: "approve",
  reason: null,
  expectedState: "pending_review",
  attestations: {
    contentReviewed: true,
    usageRightsConfirmed: true,
    executionRiskAccepted: true,
    reviewerAuthorizationConfirmed: true,
  },
};

function fixture() {
  const commands = {
    authorize: vi.fn(async () => context),
    review: vi.fn(async () => ({
      version: "1",
      revision: { state: "published" },
    })),
  };
  const readJson = vi.fn(async () => ({ ok: true as const, value: input }));
  return {
    commands,
    readJson,
    handler: createAdminSkillReviewHandler({
      commands: commands as never,
      readJson,
      requestIdFactory: () => REQUEST_ID,
    }),
  };
}

function reviewRequest(): Request {
  return new Request("https://admin.example.test/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
}

function streamingReviewRequest(
  cancel: (reason: unknown) => void | Promise<void>,
  options: { contentLength?: string; chunk?: Uint8Array } = {},
): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (options.chunk !== undefined) controller.enqueue(options.chunk);
    },
    pull() {},
    cancel,
  });
  const headers = new Headers({ "content-type": "application/json" });
  if (options.contentLength !== undefined) {
    headers.set("content-length", options.contentLength);
  }
  return new Request("https://admin.example.test/review", {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("admin skill review route", () => {
  it("authorizes recent MFA then passes exact route and JSON input", async () => {
    const current = fixture();
    const request = reviewRequest();
    const response = await current.handler(request, {
      params: Promise.resolve({ skillId: SKILL_ID, revisionId: REVISION_ID }),
    });
    expect(current.commands.authorize).toHaveBeenCalledWith(request, "review");
    expect(current.commands.review).toHaveBeenCalledWith(context, {
      skillId: SKILL_ID,
      revisionId: REVISION_ID,
      ...input,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("maps stale password/TOTP assurance without reading JSON", async () => {
    const current = fixture();
    current.commands.authorize.mockRejectedValueOnce(
      new SensitiveActionError("AUTH_MFA_REQUIRED"),
    );
    const cancel = vi.fn(async () => {
      throw new Error("cleanup failure");
    });
    const response = await current.handler(streamingReviewRequest(cancel), {
      params: Promise.resolve({ skillId: SKILL_ID, revisionId: REVISION_ID }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(cancel).toHaveBeenCalledOnce();
    expect(current.readJson).not.toHaveBeenCalled();
  });

  it("cancels the unread body when route params are invalid", async () => {
    const current = fixture();
    const cancel = vi.fn(async () => undefined);
    const response = await current.handler(streamingReviewRequest(cancel), {
      params: Promise.resolve({ skillId: "bad", revisionId: REVISION_ID }),
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(cancel).toHaveBeenCalledOnce();
    expect(current.readJson).not.toHaveBeenCalled();
  });

  it("cancels a declared oversized body before invoking the JSON reader", async () => {
    const current = fixture();
    const cancel = vi.fn(async () => undefined);
    const response = await current.handler(
      streamingReviewRequest(cancel, { contentLength: String(8 * 1024 + 1) }),
      {
        params: Promise.resolve({ skillId: SKILL_ID, revisionId: REVISION_ID }),
      },
    );

    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(cancel).toHaveBeenCalledOnce();
    expect(current.readJson).not.toHaveBeenCalled();
  });

  it("cancels and unlocks a chunk-overrun body through the real JSON reader", async () => {
    const commands = fixture().commands;
    const handler = createAdminSkillReviewHandler({
      commands: commands as never,
      requestIdFactory: () => REQUEST_ID,
    });
    const cancel = vi.fn(async () => undefined);
    const request = streamingReviewRequest(cancel, {
      chunk: new Uint8Array(8 * 1024 + 1),
    });
    const response = await handler(request, {
      params: Promise.resolve({ skillId: SKILL_ID, revisionId: REVISION_ID }),
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(cancel).toHaveBeenCalledOnce();
    expect(request.body?.locked).toBe(false);
    expect(commands.review).not.toHaveBeenCalled();
  });

  it("rejects extra JSON keys and malformed UUIDs", async () => {
    const current = fixture();
    current.readJson.mockResolvedValueOnce({
      ok: true,
      value: { ...input, extra: true },
    } as never);
    const extra = await current.handler(reviewRequest(), {
      params: Promise.resolve({ skillId: SKILL_ID, revisionId: REVISION_ID }),
    });
    expect(extra.status).toBe(400);
    expect(current.commands.review).not.toHaveBeenCalled();

    const badUuid = await fixture().handler(reviewRequest(), {
      params: Promise.resolve({ skillId: "bad", revisionId: REVISION_ID }),
    });
    expect(badUuid.status).toBe(400);
  });

  it("maps state conflicts to 409 and upstream failures to stable 503", async () => {
    const conflict = fixture();
    conflict.commands.review.mockRejectedValueOnce(
      new SkillRegistryClientError("REVISION_STATE_CONFLICT"),
    );
    const denied = await conflict.handler(reviewRequest(), {
      params: Promise.resolve({ skillId: SKILL_ID, revisionId: REVISION_ID }),
    });
    expect(denied.status).toBe(409);

    const unavailable = fixture();
    unavailable.commands.review.mockRejectedValueOnce(
      new SkillRegistryClientError("REGISTRY_UNAVAILABLE"),
    );
    const failed = await unavailable.handler(reviewRequest(), {
      params: Promise.resolve({ skillId: SKILL_ID, revisionId: REVISION_ID }),
    });
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain(
      "REGISTRY_UNAVAILABLE",
    );
  });
});
