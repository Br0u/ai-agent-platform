import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSISTANT_CHAT_REQUEST_MAX_BYTES } from "@/features/assistant/assistant-contract";
import {
  ASSISTANT_REQUEST_TIMEOUT_MS,
  useAssistantSession,
} from "./use-assistant-session";

const success = (
  message: string,
  suggestedActions: { label: string; href: string }[] = [],
) =>
  new Response(
    JSON.stringify({
      version: "1",
      requestId: "req-1",
      mode: "placeholder",
      session: { temporary: true, expiresAt: "2026-07-13T12:00:00.000Z" },
      message: { id: "msg-1", role: "assistant", content: message },
      suggestedActions,
    }),
    { status: 200 },
  );

const streamFrame = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

describe("useAssistantSession", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses the public endpoint and named 60 second timeout by default", () => {
    expect(ASSISTANT_REQUEST_TIMEOUT_MS).toBe(60_000);
  });

  it("exposes session data and commands without presentation state", () => {
    const { result } = renderHook(() => useAssistantSession("/"));

    expect(result.current).not.toHaveProperty("open");
    expect(result.current).not.toHaveProperty("openAssistant");
    expect(result.current).not.toHaveProperty("closeAssistant");
  });

  it("supports a protected endpoint without duplicating the request controller", async () => {
    vi.mocked(fetch).mockResolvedValue(success("管理员回答"));
    const { result } = renderHook(() =>
      useAssistantSession("/admin/assistant", {
        endpoint: "/api/v1/admin/assistant/chat",
      }),
    );

    await act(() => result.current.submit("检查合同"));

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/admin/assistant/chat",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.current.latestAnnouncement).toBe("管理员回答");
  });

  it("uses the default 60 second deadline, aborts, and waits for explicit retry", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce(success("重试成功"));
    const { result } = renderHook(() =>
      useAssistantSession("/admin/assistant", {
        endpoint: "/api/v1/admin/assistant/chat",
        failureAnnouncement: "测试暂时失败，请稍后重试。",
      }),
    );

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.submit("超时问题");
    });
    expect(result.current.requestStatus).toBe("sending");
    const firstSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999);
    });
    expect(result.current.requestStatus).toBe("sending");
    expect(fetch).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await pending;
    });
    expect(firstSignal?.aborted).toBe(true);
    expect(result.current.requestStatus).toBe("failed");
    expect(result.current.lastFailedMessage).toBe("超时问题");
    expect(result.current.latestAnnouncement).toBe(
      "测试暂时失败，请稍后重试。",
    );
    expect(fetch).toHaveBeenCalledOnce();

    await act(() => result.current.retry());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.requestStatus).toBe("idle");
    expect(result.current.latestAnnouncement).toBe("重试成功");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("applies the timeout to response parsing, not only response headers", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => new Promise(() => undefined),
    } as Response);
    const { result } = renderHook(() =>
      useAssistantSession("/assistant", { timeoutMs: 25 }),
    );

    act(() => {
      void result.current.submit("解析超时");
    });
    await act(() => vi.advanceTimersByTimeAsync(25));

    expect(result.current.requestStatus).toBe("failed");
    expect(result.current.lastFailedMessage).toBe("解析超时");
  });

  it("aborts on controller unmount, clears its timer and settles silently", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockReturnValue(new Promise(() => undefined));
    const { result, unmount } = renderHook(() =>
      useAssistantSession("/assistant", { timeoutMs: 1_000 }),
    );

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.submit("卸载中的问题");
    });
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    await pending;

    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sends the exact V2 request with the current pathname and search", async () => {
    vi.mocked(fetch).mockResolvedValue(success("回答"));
    window.history.replaceState(null, "", "/pricing?edition=enterprise");
    const { result } = renderHook(() => useAssistantSession("/pricing"));

    act(() => result.current.setDraft("  你好 👋  "));
    await act(() => result.current.submit());

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/assistant/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: "2",
          message: "你好 👋",
          history: [],
          page: { pathname: "/pricing", search: "?edition=enterprise" },
        }),
      }),
    );
    expect(
      result.current.messages.map(({ role, content }) => [role, content]),
    ).toEqual([
      ["user", "你好 👋"],
      ["assistant", "回答"],
    ]);
    expect(result.current.draft).toBe("");
    expect(result.current.latestAnnouncement).toBe("回答");
  });

  it("sends only the last six complete turns in chronological order", async () => {
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { message: string };
      return success(`${request.message}的回答`);
    });
    const { result } = renderHook(() => useAssistantSession("/pricing"));

    for (let index = 0; index < 7; index += 1) {
      await act(() => result.current.submit(`问题${index}`));
    }
    await act(() => result.current.submit("当前问题"));

    const body = JSON.parse(
      String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body),
    ) as { history: Array<{ role: string; content: string }> };
    expect(body.history).toEqual(
      Array.from({ length: 6 }, (_, offset) => offset + 1).flatMap((index) => [
        { role: "user", content: `问题${index}` },
        { role: "assistant", content: `问题${index}的回答` },
      ]),
    );
  });

  it("trims whole newest turns to every history and encoded-body bound", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      success("界".repeat(9_000)),
    );
    const { result } = renderHook(() => useAssistantSession("/pricing"));

    for (let index = 0; index < 7; index += 1) {
      await act(() => result.current.submit(`问题${index}`));
    }

    const encoded = String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body);
    const body = JSON.parse(encoded) as {
      history: Array<{ role: "user" | "assistant"; content: string }>;
    };
    expect(new TextEncoder().encode(encoded).byteLength).toBeLessThanOrEqual(
      ASSISTANT_CHAT_REQUEST_MAX_BYTES,
    );
    expect(body.history.length).toBeLessThanOrEqual(12);
    expect(body.history).toHaveLength(4);
    expect(body.history.length % 2).toBe(0);
    expect(
      body.history.reduce(
        (total, message) => total + Array.from(message.content).length,
        0,
      ),
    ).toBeLessThanOrEqual(32_000);
    expect(
      body.history.every(
        (message, index) =>
          message.role === (index % 2 === 0 ? "user" : "assistant") &&
          Array.from(message.content).length <= 8_000,
      ),
    ).toBe(true);
    expect(body.history.at(-1)?.content).toBe("界".repeat(8_000));
  });

  it("drops invalid or non-public page context and reads search at send time", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(success("第一次"))
      .mockResolvedValueOnce(success("第二次"))
      .mockResolvedValueOnce(success("第三次"));
    window.history.replaceState(null, "", "/admin/assistant?first=1");
    const { result, rerender } = renderHook(
      ({ pathname }) => useAssistantSession(pathname),
      { initialProps: { pathname: "/admin/assistant" } },
    );

    await act(() => result.current.submit("后台页面"));
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).page,
    ).toBeNull();

    rerender({ pathname: "/pricing" });
    window.history.replaceState(null, "", `/pricing?${"q".repeat(1_025)}`);
    await act(() => result.current.submit("过长查询"));
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)).page,
    ).toBeNull();

    window.history.replaceState(null, "", "/pricing?second=2");
    await act(() => result.current.submit("最新查询"));
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[2]?.[1]?.body)).page,
    ).toEqual({ pathname: "/pricing", search: "?second=2" });
  });

  it("preserves a bounded normalized Unicode pathname", async () => {
    vi.mocked(fetch).mockResolvedValue(success("回答"));
    const { result } = renderHook(() =>
      useAssistantSession("/solutions/知识库"),
    );

    await act(() => result.current.submit("页面问题"));

    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).page,
    ).toEqual({ pathname: "/solutions/知识库", search: "" });
  });

  it("accepts pathname and search at their exact bounds and drops either overrun", async () => {
    vi.mocked(fetch).mockResolvedValue(success("回答"));
    const pathnameAtLimit = `/solutions/${"a".repeat(245)}`;
    const { result, rerender } = renderHook(
      ({ pathname }) => useAssistantSession(pathname),
      { initialProps: { pathname: pathnameAtLimit } },
    );
    window.history.replaceState(null, "", `/pricing?${"q".repeat(1_023)}`);

    await act(() => result.current.submit("边界"));
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).page,
    ).toEqual({
      pathname: pathnameAtLimit,
      search: `?${"q".repeat(1_023)}`,
    });

    rerender({ pathname: `${pathnameAtLimit}a` });
    await act(() => result.current.submit("路径超限"));
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)).page,
    ).toBeNull();

    rerender({ pathname: "/pricing" });
    window.history.replaceState(null, "", `/pricing?${"q".repeat(1_024)}`);
    await act(() => result.current.submit("查询超限"));
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[2]?.[1]?.body)).page,
    ).toBeNull();
  });

  it("uses the current search when explicitly retrying a failed request", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(success("恢复"));
    window.history.replaceState(null, "", "/pricing?before=1");
    const { result } = renderHook(() => useAssistantSession("/pricing"));

    await act(() => result.current.submit("重试搜索"));
    window.history.replaceState(null, "", "/pricing?after=2");
    await act(() => result.current.retry());

    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)).page,
    ).toEqual({ pathname: "/pricing", search: "?after=2" });
  });

  it("renders SSE deltas before the assistant response completes", async () => {
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(streamController) {
            controller = streamController;
          },
        }),
        { headers: { "content-type": "text/event-stream; charset=utf-8" } },
      ),
    );
    const { result } = renderHook(() => useAssistantSession("/assistant"));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.submit("流式问题");
    });
    await act(async () => {
      controller.enqueue(
        encoder.encode(
          streamFrame({
            type: "activity",
            phase: "analyzing",
            label: "正在分析问题",
          }),
        ),
      );
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(result.current.messages.at(-1)).toMatchObject({
        role: "assistant",
        content: "",
        activities: [
          { type: "activity", phase: "analyzing", label: "正在分析问题" },
        ],
      }),
    );
    expect(result.current.requestStatus).toBe("sending");

    await act(async () => {
      controller.enqueue(
        encoder.encode(
          streamFrame({ type: "answer_delta", content: "第一段" }) +
            streamFrame({
              type: "action",
              action: {
                kind: "navigate",
                pathname: "/pricing",
                label: "价格与服务",
              },
            }),
        ),
      );
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(
        result.current.messages.map(({ role, content }) => [role, content]),
      ).toEqual([
        ["user", "流式问题"],
        ["assistant", "第一段"],
      ]),
    );
    expect(result.current.requestStatus).toBe("sending");

    await act(async () => {
      controller.enqueue(
        encoder.encode(
          streamFrame({ type: "answer_delta", content: "第二段" }) +
            streamFrame({ type: "done" }),
        ),
      );
      controller.close();
      await pending;
    });

    expect(result.current.requestStatus).toBe("idle");
    expect(result.current.messages.at(-1)?.content).toBe("第一段第二段");
    expect(result.current.messages.at(-1)).toMatchObject({
      activities: [
        { type: "activity", phase: "analyzing", label: "正在分析问题" },
      ],
      actions: [
        {
          kind: "navigate",
          pathname: "/pricing",
          label: "价格与服务",
        },
      ],
    });
    expect(result.current.latestAnnouncement).toBe("第一段第二段");
  });

  it("keeps one absolute deadline even while response chunks keep arriving", async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(streamController) {
            controller = streamController;
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
    );
    const { result } = renderHook(() =>
      useAssistantSession("/assistant", { timeoutMs: 100 }),
    );

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.submit("持续输出");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
      controller.enqueue(
        encoder.encode(
          streamFrame({ type: "answer_delta", content: "第一段" }),
        ),
      );
      await vi.advanceTimersByTimeAsync(40);
      controller.enqueue(
        encoder.encode(
          streamFrame({ type: "answer_delta", content: "第二段" }),
        ),
      );
      await vi.advanceTimersByTimeAsync(19);
    });
    expect(result.current.requestStatus).toBe("sending");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await pending;
    });

    expect(result.current.requestStatus).toBe("failed");
    expect(result.current.messages.at(-1)?.content).toBe("第一段第二段");
    expect(result.current.messages.at(-1)).toMatchObject({ incomplete: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains and marks a partial SSE answer when the stream fails", async () => {
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(streamController) {
            controller = streamController;
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
    );
    const { result } = renderHook(() => useAssistantSession("/assistant"));
    act(() => result.current.setDraft("保留这个问题"));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.submit();
    });
    await act(async () => {
      controller.enqueue(
        encoder.encode(
          streamFrame({ type: "answer_delta", content: "不完整回答" }),
        ),
      );
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(result.current.messages.at(-1)?.content).toBe("不完整回答"),
    );

    await act(async () => {
      controller.enqueue(
        encoder.encode(
          streamFrame({
            type: "error",
            code: "stream_interrupted",
            message: "不可信内部错误",
          }),
        ),
      );
      controller.close();
      await pending;
    });

    expect(result.current.requestStatus).toBe("failed");
    expect(result.current.messages).toEqual([
      { id: 1, role: "user", content: "保留这个问题" },
      {
        id: 2,
        role: "assistant",
        content: "不完整回答",
        suggestedActions: [],
        activities: [],
        actions: [],
        incomplete: true,
      },
    ]);
    expect(result.current.draft).toBe("保留这个问题");
    expect(result.current.latestAnnouncement).toBe(
      "发送失败，请重试或使用帮助中心或商务咨询。",
    );
    expect(result.current.latestAnnouncement).not.toContain("private");
  });

  it("rejects malformed structured frames without exposing their fields", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        streamFrame({
          type: "activity",
          phase: "analyzing",
          label: "正在分析问题",
          reasoning: "private chain of thought",
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
    );
    const { result } = renderHook(() => useAssistantSession("/pricing"));

    await act(() => result.current.submit("异常流"));

    expect(result.current.requestStatus).toBe("failed");
    expect(result.current.messages).toEqual([]);
    expect(result.current.latestAnnouncement).toBe(
      "发送失败，请重试或使用帮助中心或商务咨询。",
    );
    expect(result.current.latestAnnouncement).not.toMatch(/private|thought/u);
  });

  it("excludes an incomplete turn while retaining a newer completed retry", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          streamFrame({ type: "answer_delta", content: "未完成" }) +
            streamFrame({
              type: "error",
              code: "stream_interrupted",
              message: "回答中断，请重试。",
            }),
          { headers: { "content-type": "text/event-stream" } },
        ),
      )
      .mockResolvedValueOnce(success("重试完成"))
      .mockResolvedValueOnce(success("下一轮回答"));
    const { result } = renderHook(() => useAssistantSession("/pricing"));

    await act(() => result.current.submit("原问题"));
    await act(() => result.current.retry());
    await act(() => result.current.submit("下一轮"));

    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[2]?.[1]?.body)).history,
    ).toEqual([
      { role: "user", content: "原问题" },
      { role: "assistant", content: "重试完成" },
    ]);
  });

  it("stores only internal single-slash suggested actions", async () => {
    vi.mocked(fetch).mockResolvedValue(
      success("可用入口", [
        { label: "快速开始", href: "/docs#quick-start" },
        { label: "商务咨询", href: "/contact" },
        { label: "客户支持", href: "/support" },
        { label: "协议相对", href: "//evil.example/path" },
        { label: "反斜杠", href: "/safe\\evil" },
        { label: "查询跳转", href: "/contact?next=https://evil.example" },
        { label: "编码斜杠", href: "/%2Fevil.example" },
      ]),
    );
    const { result } = renderHook(() => useAssistantSession("/pricing"));

    await act(() => result.current.submit("入口"));

    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "可用入口",
      suggestedActions: [
        { label: "快速开始", href: "/docs#quick-start" },
        { label: "商务咨询", href: "/contact" },
        { label: "客户支持", href: "/support" },
      ],
    });
  });

  it("exposes renderable validation for blank and more than 500 Unicode code points", async () => {
    const { result } = renderHook(() => useAssistantSession("/"));
    act(() => result.current.setDraft("   "));
    await act(() => result.current.submit());
    expect(result.current.validationError).toEqual({
      code: "empty",
      message: "请输入问题。",
    });
    act(() => result.current.setDraft("😀".repeat(501)));
    await act(() => result.current.submit());
    expect(result.current.validationError).toEqual({
      code: "too_long",
      message: "问题不能超过 500 个字符。",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  it("accepts exactly 500 emoji and rejects 501 by Unicode code point", async () => {
    vi.mocked(fetch).mockResolvedValue(success("回答"));
    const { result } = renderHook(() => useAssistantSession("/"));

    act(() => result.current.setDraft("😀".repeat(500)));
    await act(() => result.current.submit());
    expect(result.current.validationError).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).message,
    ).toBe("😀".repeat(500));

    act(() => result.current.setDraft("😀".repeat(501)));
    await act(() => result.current.submit());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.validationError?.code).toBe("too_long");
  });

  it("prevents duplicate submits while a request is active", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise((done) => (resolve = done)));
    const { result } = renderHook(() => useAssistantSession("/docs"));
    act(() => result.current.setDraft("问题"));

    let first!: Promise<void>;
    act(() => {
      first = result.current.submit();
      void result.current.submit();
    });

    expect(result.current.requestStatus).toBe("sending");
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(success("回答"));
      await first;
    });
  });

  it("cancels an active request and clears all page memory on pathname changes", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise((done) => (resolve = done)));
    const { result, rerender } = renderHook(
      ({ pathname }) => useAssistantSession(pathname),
      { initialProps: { pathname: "/pricing" } },
    );

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.submit("跨路由问题");
    });
    expect(result.current.requestStatus).toBe("sending");

    rerender({ pathname: "/assistant" });

    expect(result.current.requestStatus).toBe("idle");
    expect(result.current.messages).toEqual([]);
    expect(result.current.draft).toBe("");
    expect(result.current.lastFailedMessage).toBeNull();
    expect(result.current.latestAnnouncement).toBe("");
    expect(result.current.validationError).toBeNull();
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)),
    ).toEqual({
      version: "2",
      message: "跨路由问题",
      history: [],
      page: { pathname: "/pricing", search: "" },
    });
    await act(async () => resolve(success("已取消回答")));
    await pending;
    expect(result.current.messages).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retains the draft on failure without adding transcript messages", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    const { result } = renderHook(() => useAssistantSession("/support"));
    act(() => result.current.setDraft("需要帮助"));
    await act(() => result.current.submit());

    expect(result.current.requestStatus).toBe("failed");
    expect(result.current.draft).toBe("需要帮助");
    expect(result.current.lastFailedMessage).toBe("需要帮助");
    expect(result.current.messages).toEqual([]);
    expect(result.current.latestAnnouncement).toBe(
      "发送失败，请重试或使用帮助中心或商务咨询。",
    );
  });

  it("does not expose legacy session expiry state", async () => {
    vi.mocked(fetch).mockResolvedValue(success("回答"));
    const { result } = renderHook(() => useAssistantSession("/assistant"));

    await act(() => result.current.submit("会话何时过期"));
  });

  it("shows a rate-limit message and never automatically retries POST", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        {
          version: "1",
          requestId: "req-429",
          error: {
            code: "rate_limited",
            message: "请求过于频繁，请稍后再试。",
            retryable: true,
          },
        },
        { status: 429, headers: { "Retry-After": "37" } },
      ),
    );
    const { result } = renderHook(() => useAssistantSession("/assistant"));

    await act(() => result.current.submit("频率测试"));

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.current.requestStatus).toBe("failed");
    expect(result.current.latestAnnouncement).toBe(
      "请求过于频繁，请稍后再试。",
    );
  });

  it("shows the safe blocked message and preserves edits made while pending", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise((done) => (resolve = done)));
    const { result } = renderHook(() => useAssistantSession("/assistant"));
    act(() => result.current.setDraft("原问题"));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.submit();
    });
    act(() => result.current.setDraft("等待时编辑的新问题"));
    await act(async () => {
      resolve(
        Response.json(
          {
            version: "1",
            requestId: "req-blocked",
            error: {
              code: "input_blocked",
              message: "该问题无法提交，请调整表述",
              retryable: false,
            },
          },
          { status: 422 },
        ),
      );
      await pending;
    });

    expect(result.current.requestStatus).toBe("failed");
    expect(result.current.latestAnnouncement).toBe(
      "该问题无法提交，请调整表述",
    );
    expect(result.current.draft).toBe("等待时编辑的新问题");
    expect(result.current.messages).toEqual([]);
    expect(result.current.lastFailedMessage).toBeNull();
  });

  it.each([
    [
      "hostile message",
      422,
      {
        version: "1",
        requestId: "req-hostile",
        error: {
          code: "input_blocked",
          message: "internal URL http://agent:7777 and secret key",
          retryable: false,
        },
      },
    ],
    [
      "extra key",
      422,
      {
        version: "1",
        requestId: "req-extra",
        error: {
          code: "input_blocked",
          message: "该问题无法提交，请调整表述",
          retryable: false,
        },
        extra: "unsafe",
      },
    ],
    [
      "other status",
      400,
      {
        version: "1",
        requestId: "req-status",
        error: {
          code: "input_blocked",
          message: "该问题无法提交，请调整表述",
          retryable: false,
        },
      },
    ],
  ])(
    "keeps a malformed blocked response generic: %s",
    async (_name, status, body) => {
      vi.mocked(fetch).mockResolvedValue(Response.json(body, { status }));
      const { result } = renderHook(() => useAssistantSession("/assistant"));

      await act(() => result.current.submit("异常屏蔽响应"));

      expect(result.current.latestAnnouncement).toBe(
        "发送失败，请重试或使用帮助中心或商务咨询。",
      );
      expect(result.current.latestAnnouncement).not.toMatch(
        /agent:7777|secret/u,
      );
    },
  );

  it("never renders an untrusted error message from a malformed 429 body", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        {
          version: "1",
          requestId: "req-malformed",
          error: {
            code: "rate_limited",
            message: "internal URL http://agent:7777 and secret key",
            retryable: true,
          },
          extra: "unsafe",
        },
        { status: 429 },
      ),
    );
    const { result } = renderHook(() => useAssistantSession("/assistant"));

    await act(() => result.current.submit("异常响应"));

    expect(result.current.latestAnnouncement).toBe(
      "发送失败，请重试或使用帮助中心或商务咨询。",
    );
    expect(result.current.latestAnnouncement).not.toMatch(/agent:7777|secret/u);
  });

  it("uses the safe unavailable envelope for a degraded 503 without retrying", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        {
          version: "1",
          requestId: "req-503",
          error: {
            code: "assistant_unavailable",
            message: "助手服务暂不可用，请使用帮助中心或商务咨询。",
            retryable: true,
          },
        },
        { status: 503 },
      ),
    );
    const { result } = renderHook(() => useAssistantSession("/assistant"));

    await act(() => result.current.submit("状态测试"));

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.current.latestAnnouncement).toBe(
      "助手服务暂不可用，请使用帮助中心或商务咨询。",
    );
  });

  it("rejects a transient error with a false retryable flag", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        {
          version: "1",
          requestId: "req-invalid-retryable",
          error: {
            code: "rate_limited",
            message: "untrusted",
            retryable: false,
          },
        },
        { status: 429 },
      ),
    );
    const { result } = renderHook(() => useAssistantSession("/assistant"));

    await act(() => result.current.submit("异常重试标记"));

    expect(result.current.latestAnnouncement).toBe(
      "发送失败，请重试或使用帮助中心或商务咨询。",
    );
  });

  it("uses a configured failure announcement for an HTTP failure", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    const { result } = renderHook(() =>
      useAssistantSession("/admin/assistant", {
        endpoint: "/api/v1/admin/assistant/chat",
        failureAnnouncement: "测试暂时失败，请稍后重试。",
      }),
    );

    await act(() => result.current.submit("后台测试"));

    expect(result.current.requestStatus).toBe("failed");
    expect(result.current.latestAnnouncement).toBe(
      "测试暂时失败，请稍后重试。",
    );
  });

  it("retries exactly once without duplicating the user message", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(success("恢复后的回答"));
    const { result } = renderHook(() => useAssistantSession("/"));
    act(() => result.current.setDraft("重试问题"));
    await act(() => result.current.submit());
    await act(() => result.current.retry());

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("clears retry ownership after navigation", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(success("原请求回答"));
    const { result, rerender } = renderHook(
      ({ pathname }) => useAssistantSession(pathname),
      { initialProps: { pathname: "/docs" } },
    );
    act(() => result.current.setDraft("原请求"));
    await act(() => result.current.submit());
    rerender({ pathname: "/pricing" });
    await act(() => result.current.retry());

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.lastFailedMessage).toBeNull();
  });

  it("preserves an edited draft when retrying the previous failed message", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(success("A 的回答"));
    const { result } = renderHook(() => useAssistantSession("/pricing"));
    act(() => result.current.setDraft("问题 A"));
    await act(() => result.current.submit());
    act(() => result.current.setDraft("问题 B"));
    await act(() => result.current.retry());

    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)),
    ).toEqual({
      version: "2",
      message: "问题 A",
      history: [],
      page: { pathname: "/pricing", search: "" },
    });
    expect(
      result.current.messages.map(({ role, content }) => [role, content]),
    ).toEqual([
      ["user", "问题 A"],
      ["assistant", "A 的回答"],
    ]);
    expect(result.current.draft).toBe("问题 B");
  });

  it("does not leave an orphan user message when an endpoint change aborts a request", async () => {
    let resolveOld!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((done) => {
        resolveOld = done;
      }),
    );
    const { result, rerender } = renderHook(
      ({ endpoint }) => useAssistantSession("/docs", { endpoint }),
      { initialProps: { endpoint: "/api/v1/assistant/chat" } },
    );
    act(() => result.current.setDraft("被中止的问题"));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.submit();
    });
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    rerender({ endpoint: "/api/v1/admin/assistant/chat" });
    await act(async () => {
      await pending;
    });

    expect(signal?.aborted).toBe(true);
    expect(result.current.requestStatus).toBe("idle");
    expect(result.current.latestAnnouncement).toBe("");

    await act(async () => {
      resolveOld(success("过期回答"));
      await Promise.resolve();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.draft).toBe("被中止的问题");
  });

  it("keeps session state while a separate consumer unmounts and remounts", async () => {
    vi.mocked(fetch).mockResolvedValue(success("保留回答"));
    function Consumer({
      session,
    }: {
      session: ReturnType<typeof useAssistantSession>;
    }) {
      return (
        <div>
          <button onClick={() => void session.submit("保留问题")} type="button">
            提交
          </button>
          {session.messages.map((message) => (
            <p key={message.id}>{message.content}</p>
          ))}
        </div>
      );
    }
    function Controller({ visible }: { visible: boolean }) {
      const session = useAssistantSession("/");
      return visible ? <Consumer session={session} /> : null;
    }

    const view = render(<Controller visible />);
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    await waitFor(() => expect(screen.getByText("保留回答")).toBeVisible());
    view.rerender(<Controller visible={false} />);
    expect(screen.queryByText("保留回答")).not.toBeInTheDocument();
    view.rerender(<Controller visible />);
    expect(screen.getByText("保留回答")).toBeVisible();
  });

  it("clears session state after the full controller unmounts and remounts", async () => {
    vi.mocked(fetch).mockResolvedValue(success("旧回答"));
    function Controller() {
      const session = useAssistantSession("/");
      return (
        <div>
          <button onClick={() => void session.submit("旧问题")} type="button">
            提交
          </button>
          {session.messages.map((message) => (
            <p key={message.id}>{message.content}</p>
          ))}
        </div>
      );
    }

    const view = render(<Controller />);
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    await waitFor(() => expect(screen.getByText("旧回答")).toBeVisible());
    view.unmount();
    render(<Controller />);
    expect(screen.queryByText("旧回答")).not.toBeInTheDocument();
    expect(screen.queryByText("旧问题")).not.toBeInTheDocument();
  });

  it("keeps page memory only in React and never uses browser storage", async () => {
    const localGet = vi.spyOn(Storage.prototype, "getItem");
    const localSet = vi.spyOn(Storage.prototype, "setItem");
    const localRemove = vi.spyOn(Storage.prototype, "removeItem");
    vi.mocked(fetch).mockResolvedValue(success("内存回答"));
    const { result } = renderHook(() => useAssistantSession("/pricing"));

    await act(() => result.current.submit("只在内存"));

    expect(localGet).not.toHaveBeenCalled();
    expect(localSet).not.toHaveBeenCalled();
    expect(localRemove).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).not.toHaveProperty(
      "credentials",
    );
  });

  it("ignores an older response after a timeout change gives ownership to a newer request", async () => {
    let resolveOld!: (response: Response) => void;
    vi.mocked(fetch)
      .mockReturnValueOnce(new Promise((done) => (resolveOld = done)))
      .mockResolvedValueOnce(success("新回答"));
    const { result, rerender } = renderHook(
      ({ pathname, timeoutMs }) => useAssistantSession(pathname, { timeoutMs }),
      { initialProps: { pathname: "/docs", timeoutMs: 1_000 } },
    );
    act(() => result.current.setDraft("旧问题"));
    let old!: Promise<void>;
    act(() => {
      old = result.current.submit();
    });
    rerender({ pathname: "/pricing", timeoutMs: 2_000 });
    await act(async () => {
      await old;
    });
    act(() => result.current.setDraft("新问题"));
    await act(() => result.current.submit());
    await act(async () => {
      resolveOld(success("旧回答"));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(result.current.latestAnnouncement).toBe("新回答"),
    );
    expect(
      result.current.messages.some((message) => message.content === "旧回答"),
    ).toBe(false);
  });
});
