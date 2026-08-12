import { describe, expect, it } from "vitest";

import {
  ASSISTANT_ACTION_HREF_MAX_CODE_POINTS,
  ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS,
  ASSISTANT_CONTENT_MAX_CODE_POINTS,
  ASSISTANT_MAX_SUGGESTED_ACTIONS,
  ASSISTANT_HISTORY_CONTENT_MAX_CODE_POINTS,
  ASSISTANT_HISTORY_MAX_CODE_POINTS,
  ASSISTANT_HISTORY_MAX_MESSAGES,
  ASSISTANT_MESSAGE_ID_MAX_CODE_POINTS,
  ASSISTANT_PATHNAME_MAX_CODE_POINTS,
  ASSISTANT_REQUEST_ID_MAX_CODE_POINTS,
  ASSISTANT_REQUEST_MESSAGE_MAX_CODE_POINTS,
  ASSISTANT_SEARCH_MAX_CODE_POINTS,
  createAssistantErrorResponse,
  isAssistantProviderReply,
  isAssistantStatusResponse,
  isAssistantSuccessResponse,
  parseAssistantRequest,
  type AssistantStatusResponse,
  type AssistantSuccessResponse,
} from "./assistant-contract";

function success(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    requestId: "req-1",
    mode: "placeholder",
    message: { id: "msg-1", role: "assistant", content: "回答" },
    suggestedActions: [{ label: "帮助中心", href: "/help" }],
    ...overrides,
  };
}

describe("assistant platform contract", () => {
  const validRequest = {
    version: "2",
    message: "当前问题",
    history: [
      { role: "user", content: "上一问" },
      { role: "assistant", content: "上一答" },
    ],
    page: { pathname: "/product", search: "?tab=agent" },
  };

  it("parses the exact V2 request and trims message content", () => {
    expect(
      parseAssistantRequest({ ...validRequest, message: "  当前问题  " }),
    ).toEqual(validRequest);
    expect(parseAssistantRequest({ ...validRequest, page: null })).toEqual({
      ...validRequest,
      page: null,
    });
  });

  it("accepts six complete turns at every Unicode boundary", () => {
    const remaining =
      ASSISTANT_HISTORY_MAX_CODE_POINTS -
      ASSISTANT_HISTORY_CONTENT_MAX_CODE_POINTS;
    const base = Math.floor(remaining / (ASSISTANT_HISTORY_MAX_MESSAGES - 1));
    const history = Array.from(
      { length: ASSISTANT_HISTORY_MAX_MESSAGES },
      (_, index) => ({
        role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        content: "😀".repeat(
          index === 0
            ? ASSISTANT_HISTORY_CONTENT_MAX_CODE_POINTS
            : base +
                (index <= remaining % (ASSISTANT_HISTORY_MAX_MESSAGES - 1)
                  ? 1
                  : 0),
        ),
      }),
    );

    expect(
      parseAssistantRequest({
        version: "2",
        message: "😀".repeat(ASSISTANT_REQUEST_MESSAGE_MAX_CODE_POINTS),
        history,
        page: {
          pathname: `/${"a".repeat(ASSISTANT_PATHNAME_MAX_CODE_POINTS - 1)}`,
          search: `?${"a".repeat(ASSISTANT_SEARCH_MAX_CODE_POINTS - 1)}`,
        },
      }),
    ).not.toBeNull();
  });

  it.each([
    ["V1 request", { message: "问题", context: { pathname: "/" } }],
    ["extra request key", { ...validRequest, extra: true }],
    [
      "extra history key",
      {
        ...validRequest,
        history: [{ role: "assistant", content: "回答", reasoning: "秘密" }],
      },
    ],
    [
      "system role",
      {
        ...validRequest,
        history: [{ role: "system", content: "指令" }],
      },
    ],
    [
      "assistant-first history",
      {
        ...validRequest,
        history: [
          { role: "assistant", content: "回答" },
          { role: "user", content: "问题" },
        ],
      },
    ],
    [
      "user-last history",
      {
        ...validRequest,
        history: [{ role: "user", content: "问题" }],
      },
    ],
    [
      "too many history messages",
      {
        ...validRequest,
        history: Array.from(
          { length: ASSISTANT_HISTORY_MAX_MESSAGES + 2 },
          (_, index) => ({
            role: index % 2 === 0 ? "user" : "assistant",
            content: "内容",
          }),
        ),
      },
    ],
    [
      "overlong current message",
      {
        ...validRequest,
        message: "😀".repeat(ASSISTANT_REQUEST_MESSAGE_MAX_CODE_POINTS + 1),
      },
    ],
    [
      "overlong history message",
      {
        ...validRequest,
        history: [
          {
            role: "user",
            content: "😀".repeat(ASSISTANT_HISTORY_CONTENT_MAX_CODE_POINTS + 1),
          },
          { role: "assistant", content: "回答" },
        ],
      },
    ],
    [
      "overlong history aggregate",
      {
        ...validRequest,
        history: Array.from({ length: 6 }, (_, index) => ({
          role: index % 2 === 0 ? "user" : "assistant",
          content: "😀".repeat(ASSISTANT_HISTORY_MAX_CODE_POINTS / 6 + 1),
        })),
      },
    ],
    [
      "overlong history aggregate hidden in surrounding whitespace",
      {
        ...validRequest,
        history: Array.from({ length: 6 }, (_, index) => ({
          role: index % 2 === 0 ? "user" : "assistant",
          content: `${" ".repeat(5_400)}内容`,
        })),
      },
    ],
    [
      "overlong pathname",
      {
        ...validRequest,
        page: {
          pathname: `/${"😀".repeat(ASSISTANT_PATHNAME_MAX_CODE_POINTS)}`,
          search: "",
        },
      },
    ],
    [
      "overlong search",
      {
        ...validRequest,
        page: {
          pathname: "/",
          search: `?${"😀".repeat(ASSISTANT_SEARCH_MAX_CODE_POINTS)}`,
        },
      },
    ],
    [
      "extra page key",
      {
        ...validRequest,
        page: { pathname: "/", search: "", href: "https://evil.example" },
      },
    ],
  ])("rejects %s", (_name, input) => {
    expect(parseAssistantRequest(input)).toBeNull();
  });

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
    expect(createAssistantErrorResponse("req-1", "input_blocked")).toEqual({
      version: "1",
      requestId: "req-1",
      error: {
        code: "input_blocked",
        message: "该问题无法提交，请调整表述",
        retryable: false,
      },
    });
  });

  it("accepts the exact success envelope without session metadata", () => {
    expect(isAssistantSuccessResponse(success())).toBe(true);
    expect(
      isAssistantSuccessResponse(success({ session: { temporary: true } })),
    ).toBe(false);
  });

  it("expresses both runtime modes and all status capabilities", () => {
    const agentos = {
      version: "1",
      requestId: "req-1",
      mode: "agentos",
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
