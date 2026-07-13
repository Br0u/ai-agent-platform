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

describe("useAssistantSession", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses the public endpoint and named 15 second timeout by default", () => {
    expect(ASSISTANT_REQUEST_TIMEOUT_MS).toBe(15_000);
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

  it("turns a timeout into a retryable failure and releases the sending lock", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce(success("重试成功"));
    const { result } = renderHook(() =>
      useAssistantSession("/admin/assistant", {
        endpoint: "/api/v1/admin/assistant/chat",
        failureAnnouncement: "测试暂时失败，请稍后重试。",
        timeoutMs: 25,
      }),
    );

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.submit("超时问题");
    });
    expect(result.current.requestStatus).toBe("sending");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25);
      await pending;
    });
    expect(result.current.requestStatus).toBe("failed");
    expect(result.current.lastFailedMessage).toBe("超时问题");
    expect(result.current.latestAnnouncement).toBe(
      "测试暂时失败，请稍后重试。",
    );

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

  it("trims a valid Unicode message and sends the current pathname", async () => {
    vi.mocked(fetch).mockResolvedValue(success("回答"));
    const { result } = renderHook(() => useAssistantSession("/pricing"));

    act(() => result.current.setDraft("  你好 👋  "));
    await act(() => result.current.submit());

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/assistant/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "你好 👋",
          context: { pathname: "/pricing" },
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

  it("retries the exact failed request pathname after navigation", async () => {
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

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.map((call) => JSON.parse(String(call[1]?.body))),
    ).toEqual([
      { message: "原请求", context: { pathname: "/docs" } },
      { message: "原请求", context: { pathname: "/docs" } },
    ]);
  });

  it("preserves an edited draft when retrying the previous failed message", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(success("A 的回答"));
    const { result } = renderHook(() => useAssistantSession("/docs"));
    act(() => result.current.setDraft("问题 A"));
    await act(() => result.current.submit());
    act(() => result.current.setDraft("问题 B"));
    await act(() => result.current.retry());

    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)),
    ).toEqual({
      message: "问题 A",
      context: { pathname: "/docs" },
    });
    expect(
      result.current.messages.map(({ role, content }) => [role, content]),
    ).toEqual([
      ["user", "问题 A"],
      ["assistant", "A 的回答"],
    ]);
    expect(result.current.draft).toBe("问题 B");
  });

  it("does not leave an orphan user message when navigation aborts a request", async () => {
    let resolveOld!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((done) => {
        resolveOld = done;
      }),
    );
    const { result, rerender } = renderHook(
      ({ pathname }) => useAssistantSession(pathname),
      { initialProps: { pathname: "/docs" } },
    );
    act(() => result.current.setDraft("被中止的问题"));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.submit();
    });
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    rerender({ pathname: "/pricing" });
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

  it("ignores an older response after a newer request owns the session", async () => {
    let resolveOld!: (response: Response) => void;
    vi.mocked(fetch)
      .mockReturnValueOnce(new Promise((done) => (resolveOld = done)))
      .mockResolvedValueOnce(success("新回答"));
    const { result, rerender } = renderHook(
      ({ pathname }) => useAssistantSession(pathname),
      { initialProps: { pathname: "/docs" } },
    );
    act(() => result.current.setDraft("旧问题"));
    let old!: Promise<void>;
    act(() => {
      old = result.current.submit();
    });
    rerender({ pathname: "/pricing" });
    act(() => result.current.setDraft("新问题"));
    await act(() => result.current.submit());
    await act(async () => {
      resolveOld(success("旧回答"));
      await old;
    });

    await waitFor(() =>
      expect(result.current.latestAnnouncement).toBe("新回答"),
    );
    expect(
      result.current.messages.some((message) => message.content === "旧回答"),
    ).toBe(false);
  });
});
