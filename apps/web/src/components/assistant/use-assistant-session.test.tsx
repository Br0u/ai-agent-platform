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
import { useAssistantSession } from "./use-assistant-session";

const success = (message: string) =>
  new Response(
    JSON.stringify({ mode: "placeholder", message, suggestedActions: [] }),
    { status: 200 },
  );

describe("useAssistantSession", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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

  it("rejects blank and more than 500 Unicode code points", async () => {
    const { result } = renderHook(() => useAssistantSession("/"));
    act(() => result.current.setDraft("   "));
    await act(() => result.current.submit());
    act(() => result.current.setDraft("😀".repeat(501)));
    await act(() => result.current.submit());
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
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

  it("retains the draft and user message on failure without a false answer", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    const { result } = renderHook(() => useAssistantSession("/support"));
    act(() => result.current.setDraft("需要帮助"));
    await act(() => result.current.submit());

    expect(result.current.requestStatus).toBe("failed");
    expect(result.current.draft).toBe("需要帮助");
    expect(result.current.lastFailedMessage).toBe("需要帮助");
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      content: "需要帮助",
    });
    expect(result.current.latestAnnouncement).toBe("");
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
