import { describe, expect, it } from "vitest";

import {
  ASSISTANT_ACTION_HREF_MAX_CODE_POINTS,
  ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS,
  ASSISTANT_CONTENT_MAX_CODE_POINTS,
  ASSISTANT_MAX_SUGGESTED_ACTIONS,
  ASSISTANT_MESSAGE_ID_MAX_CODE_POINTS,
  ASSISTANT_REQUEST_ID_MAX_CODE_POINTS,
  createAssistantErrorResponse,
  isAssistantProviderReply,
  isAssistantStatusResponse,
  isAssistantSuccessResponse,
  type AssistantStatusResponse,
  type AssistantSuccessResponse,
} from "./assistant-contract";

function success(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    requestId: "req-1",
    mode: "placeholder",
    session: { temporary: true, expiresAt: "2026-07-13T12:00:00.000Z" },
    message: { id: "msg-1", role: "assistant", content: "回答" },
    suggestedActions: [{ label: "帮助中心", href: "/help" }],
    ...overrides,
  };
}

describe("assistant platform contract", () => {
  it("marks transient errors retryable and validation errors terminal", () => {
    expect(
      createAssistantErrorResponse("req-1", "rate_limited").error.retryable,
    ).toBe(true);
    expect(
      createAssistantErrorResponse("req-1", "assistant_unavailable").error
        .retryable,
    ).toBe(true);
    expect(
      createAssistantErrorResponse("req-1", "validation_error").error.retryable,
    ).toBe(false);
  });

  it("requires a canonical expiry and exposes no session identifier", () => {
    expect(isAssistantSuccessResponse(success())).toBe(true);
    expect(
      isAssistantSuccessResponse(
        success({ session: { temporary: true, expiresAt: "not-a-date" } }),
      ),
    ).toBe(false);
    expect(
      isAssistantSuccessResponse(
        success({
          session: {
            temporary: true,
            expiresAt: "2026-07-13T12:00:00.000Z",
            id: "must-not-be-public",
          },
        }),
      ),
    ).toBe(false);
  });

  it("expresses both runtime modes and all status capabilities", () => {
    const agentos = {
      version: "1",
      requestId: "req-1",
      mode: "agentos",
      session: { temporary: true, expiresAt: "2026-07-13T12:00:00.000Z" },
      message: { id: "msg-1", role: "assistant", content: "回答" },
      suggestedActions: [],
    } satisfies AssistantSuccessResponse;
    const available = {
      version: "1",
      requestId: "req-1",
      live: true,
      ready: true,
      capability: "available",
      message: "服务可用",
    } satisfies AssistantStatusResponse;
    const degraded = {
      ...available,
      ready: false,
      capability: "degraded",
      message: "服务降级",
    } satisfies AssistantStatusResponse;

    expect(isAssistantSuccessResponse(agentos)).toBe(true);
    expect(isAssistantStatusResponse(available)).toBe(true);
    expect(isAssistantStatusResponse(degraded)).toBe(true);
    expect(isAssistantSuccessResponse(success({ mode: "future" }))).toBe(false);
    expect(
      isAssistantStatusResponse({ ...available, capability: "future" }),
    ).toBe(false);
  });

  it.each([
    [
      "ready without live",
      { live: false, ready: true, capability: "available" },
    ],
    [
      "ready while degraded",
      { live: true, ready: true, capability: "degraded" },
    ],
    [
      "unready placeholder",
      { live: true, ready: false, capability: "placeholder" },
    ],
    [
      "unready available",
      { live: true, ready: false, capability: "available" },
    ],
  ])("rejects contradictory status semantics: %s", (_name, contradiction) => {
    expect(
      isAssistantStatusResponse({
        version: "1",
        requestId: "semantic-status",
        message: "must not be adopted",
        ...contradiction,
      }),
    ).toBe(false);
  });

  it("accepts exact Unicode boundaries", () => {
    expect(
      isAssistantSuccessResponse(
        success({
          requestId: "😀".repeat(ASSISTANT_REQUEST_ID_MAX_CODE_POINTS),
          message: {
            id: "😀".repeat(ASSISTANT_MESSAGE_ID_MAX_CODE_POINTS),
            role: "assistant",
            content: "😀".repeat(ASSISTANT_CONTENT_MAX_CODE_POINTS),
          },
          suggestedActions: Array.from(
            { length: ASSISTANT_MAX_SUGGESTED_ACTIONS },
            (_, index) => ({
              label: "😀".repeat(ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS),
              href: `/${"a".repeat(ASSISTANT_ACTION_HREF_MAX_CODE_POINTS - 2)}${index}`,
            }),
          ),
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ["blank request id", success({ requestId: "   " })],
    [
      "long request id",
      success({
        requestId: "😀".repeat(ASSISTANT_REQUEST_ID_MAX_CODE_POINTS + 1),
      }),
    ],
    [
      "blank message id",
      success({ message: { id: " ", role: "assistant", content: "回答" } }),
    ],
    [
      "long message id",
      success({
        message: {
          id: "😀".repeat(ASSISTANT_MESSAGE_ID_MAX_CODE_POINTS + 1),
          role: "assistant",
          content: "回答",
        },
      }),
    ],
    [
      "blank content",
      success({ message: { id: "msg-1", role: "assistant", content: "\n " } }),
    ],
    [
      "long content",
      success({
        message: {
          id: "msg-1",
          role: "assistant",
          content: "😀".repeat(ASSISTANT_CONTENT_MAX_CODE_POINTS + 1),
        },
      }),
    ],
    [
      "too many actions",
      success({
        suggestedActions: Array.from(
          { length: ASSISTANT_MAX_SUGGESTED_ACTIONS + 1 },
          () => ({ label: "帮助", href: "/help" }),
        ),
      }),
    ],
    [
      "blank label",
      success({ suggestedActions: [{ label: " ", href: "/help" }] }),
    ],
    [
      "long label",
      success({
        suggestedActions: [
          {
            label: "😀".repeat(ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS + 1),
            href: "/help",
          },
        ],
      }),
    ],
    [
      "blank href",
      success({ suggestedActions: [{ label: "帮助", href: " " }] }),
    ],
    [
      "long href",
      success({
        suggestedActions: [
          {
            label: "帮助",
            href: `/${"a".repeat(ASSISTANT_ACTION_HREF_MAX_CODE_POINTS)}`,
          },
        ],
      }),
    ],
  ])("rejects %s", (_name, value) => {
    expect(isAssistantSuccessResponse(value)).toBe(false);
  });

  it("enforces provider reply boundaries before platform wrapping", () => {
    expect(
      isAssistantProviderReply({
        content: "😀".repeat(ASSISTANT_CONTENT_MAX_CODE_POINTS),
        suggestedActions: Array.from(
          { length: ASSISTANT_MAX_SUGGESTED_ACTIONS },
          (_, index) => ({
            label: "😀".repeat(ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS),
            href: `/${"a".repeat(ASSISTANT_ACTION_HREF_MAX_CODE_POINTS - 2)}${index}`,
          }),
        ),
      }),
    ).toBe(true);

    for (const invalid of [
      {
        content: "😀".repeat(ASSISTANT_CONTENT_MAX_CODE_POINTS + 1),
        suggestedActions: [],
      },
      {
        content: "回答",
        suggestedActions: Array.from(
          { length: ASSISTANT_MAX_SUGGESTED_ACTIONS + 1 },
          () => ({ label: "帮助", href: "/help" }),
        ),
      },
      {
        content: "回答",
        suggestedActions: [
          {
            label: "😀".repeat(ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS + 1),
            href: "/help",
          },
        ],
      },
      {
        content: "回答",
        suggestedActions: [
          {
            label: "帮助",
            href: `/${"a".repeat(ASSISTANT_ACTION_HREF_MAX_CODE_POINTS)}`,
          },
        ],
      },
      {
        content: "回答",
        suggestedActions: [{ label: " ", href: "/secret-value" }],
      },
    ]) {
      expect(isAssistantProviderReply(invalid)).toBe(false);
    }
  });
});
