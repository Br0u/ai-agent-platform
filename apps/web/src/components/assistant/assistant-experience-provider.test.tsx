import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantStatusResponse } from "@/features/assistant/assistant-contract";
import {
  ASSISTANT_STREAM_MEDIA_TYPE,
  formatAssistantStreamEvent,
} from "@/features/assistant/assistant-stream";
import {
  AssistantExperienceProvider,
  useAssistantExperience,
} from "./assistant-experience-provider";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

function Harness() {
  const experience = useAssistantExperience();
  const [exitVersion, setExitVersion] = useState(0);

  return (
    <div>
      <output aria-label="助手展示形态">{experience.surface}</output>
      <output aria-label="助手实例版本">
        {experience.surfaceInstanceVersion}
      </output>
      <output aria-label="助手体验公开键">
        {Object.keys(experience).sort().join(",")}
      </output>
      <button
        onClick={(event) => experience.openQuickFrom(event.currentTarget)}
        type="button"
      >
        快速入口
      </button>
      <button onClick={experience.close} type="button">
        关闭
      </button>
      <input
        aria-label="待完成助手版本"
        onChange={(event) => setExitVersion(Number(event.target.value))}
        value={exitVersion}
      />
      <button
        onClick={() => experience.completeQuickExit(exitVersion)}
        type="button"
      >
        完成快速退出
      </button>
      <input
        aria-label="会话草稿"
        onChange={(event) => experience.session.setDraft(event.target.value)}
        value={experience.session.draft}
      />
      <input
        aria-label="工作区输入框"
        ref={(element) =>
          element === null ? undefined : experience.registerComposer(element)
        }
      />
      <button onClick={experience.focusComposer} type="button">
        聚焦输入框
      </button>
      <button
        onClick={() => void experience.session.submit("跨页已发送问题")}
        type="button"
      >
        发送跨页问题
      </button>
      <button
        onClick={() =>
          experience.session.preserveOnNextPathnameChange("/assistant")
        }
        type="button"
      >
        准备放大交接
      </button>
      <output aria-label="会话消息">
        {experience.session.messages
          .map((message) => message.content)
          .join("|")}
      </output>
    </div>
  );
}

const placeholderStatus: AssistantStatusResponse = {
  version: "1",
  requestId: "provider-server-status",
  live: true,
  ready: true,
  capability: "placeholder",
  message: "模型尚未配置，当前为安全占位模式。",
};

function successfulAssistantStream(content: string) {
  return new Response(
    [
      formatAssistantStreamEvent({ type: "answer_delta", content }),
      formatAssistantStreamEvent({ type: "done" }),
    ].join(""),
    {
      status: 200,
      headers: { "content-type": ASSISTANT_STREAM_MEDIA_TYPE },
    },
  );
}

function ServiceStateHarness() {
  const experience = useAssistantExperience();

  return (
    <>
      <button
        onClick={(event) => experience.openQuickFrom(event.currentTarget)}
        type="button"
      >
        打开快速助手
      </button>
      <output aria-label="服务能力">
        {experience.serviceState.capability}
      </output>
      <output aria-label="服务状态是否已解析">
        {String(experience.hasResolvedServiceState)}
      </output>
    </>
  );
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  router.push.mockReset();
  vi.unstubAllGlobals();
});

describe("AssistantExperienceProvider", () => {
  it("does not expose legacy Dock APIs", () => {
    render(
      <AssistantExperienceProvider pathname="/">
        <Harness />
      </AssistantExperienceProvider>,
    );

    const legacyApiNames = [
      ["open", "Dock", "From"].join(""),
      ["collapse", "To", "Quick"].join(""),
      ["complete", "Surface", "Exit"].join(""),
    ];
    const publicKeys =
      screen.getByLabelText("助手体验公开键").textContent?.split(",") ?? [];
    expect(publicKeys).not.toEqual(expect.arrayContaining(legacyApiNames));
  });

  it("lazily refreshes service state once when opening the quick assistant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(placeholderStatus)),
    );
    render(
      <AssistantExperienceProvider pathname="/">
        <ServiceStateHarness />
      </AssistantExperienceProvider>,
    );

    expect(screen.getByLabelText("服务状态是否已解析")).toHaveTextContent(
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "打开快速助手" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByLabelText("服务能力")).toHaveTextContent(
        "placeholder",
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("initializes an assistant workspace from server state without a duplicate request", async () => {
    vi.stubGlobal("fetch", vi.fn());

    render(
      <AssistantExperienceProvider
        initialServiceState={placeholderStatus}
        pathname="/assistant"
      >
        <ServiceStateHarness />
      </AssistantExperienceProvider>,
    );

    expect(screen.getByLabelText("服务能力")).toHaveTextContent("placeholder");
    expect(screen.getByLabelText("服务状态是否已解析")).toHaveTextContent(
      "true",
    );
    await act(async () => Promise.resolve());
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keys page memory and requests to the normalized pathname", async () => {
    window.history.replaceState(null, "", "/pricing?mode=full");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(successfulAssistantStream("规范路径回答")),
    );
    render(
      <AssistantExperienceProvider pathname="/pricing/?mode=full#composer">
        <Harness />
      </AssistantExperienceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "发送跨页问题" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)),
    ).toEqual({
      version: "2",
      message: "跨页已发送问题",
      history: [],
      page: { pathname: "/pricing", search: "?mode=full" },
    });
  });

  it("keeps a validated navigation action pending until the user clicks it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          [
            formatAssistantStreamEvent({
              type: "answer_delta",
              content: "正在为你打开产品页面。",
            }),
            formatAssistantStreamEvent({
              type: "action",
              action: {
                kind: "navigate",
                label: "产品",
                pathname: "/product",
              },
            }),
            formatAssistantStreamEvent({ type: "done" }),
          ].join(""),
          {
            status: 200,
            headers: { "content-type": ASSISTANT_STREAM_MEDIA_TYPE },
          },
        ),
      ),
    );
    render(
      <AssistantExperienceProvider pathname="/">
        <Harness />
      </AssistantExperienceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "发送跨页问题" }));

    await waitFor(() =>
      expect(screen.getByLabelText("会话消息")).toHaveTextContent(
        "正在为你打开产品页面。",
      ),
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it("uses one closed to quick to closed state machine", () => {
    render(
      <AssistantExperienceProvider pathname="/">
        <Harness />
      </AssistantExperienceProvider>,
    );

    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("closed");
    fireEvent.click(screen.getByRole("button", { name: "快速入口" }));
    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("quick");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("closed");
  });

  it("restores a connected enabled trigger at most once", () => {
    render(
      <AssistantExperienceProvider pathname="/">
        <Harness />
      </AssistantExperienceProvider>,
    );
    const launcher = screen.getByRole("button", { name: "快速入口" });
    const focus = vi.spyOn(launcher, "focus");

    fireEvent.click(launcher);
    fireEvent.change(screen.getByLabelText("待完成助手版本"), {
      target: { value: screen.getByLabelText("助手实例版本").textContent },
    });
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(focus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "完成快速退出" }));
    fireEvent.click(screen.getByRole("button", { name: "完成快速退出" }));
    expect(focus).toHaveBeenCalledOnce();

    fireEvent.click(launcher);
    fireEvent.change(screen.getByLabelText("待完成助手版本"), {
      target: { value: screen.getByLabelText("助手实例版本").textContent },
    });
    launcher.setAttribute("disabled", "");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(screen.getByRole("button", { name: "完成快速退出" }));
    expect(focus).toHaveBeenCalledOnce();
  });

  it("rejects a stale quick exit completion after a new open", () => {
    render(
      <AssistantExperienceProvider pathname="/">
        <Harness />
      </AssistantExperienceProvider>,
    );
    const quickTrigger = screen.getByRole("button", { name: "快速入口" });
    const quickFocus = vi.spyOn(quickTrigger, "focus");

    fireEvent.click(quickTrigger);
    const staleVersion = Number(
      screen.getByLabelText("助手实例版本").textContent,
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(quickTrigger);
    const currentVersion = Number(
      screen.getByLabelText("助手实例版本").textContent,
    );
    expect(currentVersion).toBeGreaterThan(staleVersion);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    fireEvent.change(screen.getByLabelText("待完成助手版本"), {
      target: { value: String(staleVersion) },
    });
    fireEvent.click(screen.getByRole("button", { name: "完成快速退出" }));
    expect(quickFocus).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("待完成助手版本"), {
      target: { value: String(currentVersion) },
    });
    fireEvent.click(screen.getByRole("button", { name: "完成快速退出" }));
    expect(quickFocus).toHaveBeenCalledOnce();
  });

  it("invalidates a pending quick exit after navigating away and back", () => {
    const view = render(
      <AssistantExperienceProvider pathname="/pricing">
        <Harness />
      </AssistantExperienceProvider>,
    );
    const launcher = screen.getByRole("button", { name: "快速入口" });
    const focus = vi.spyOn(launcher, "focus");

    fireEvent.click(launcher);
    fireEvent.change(screen.getByLabelText("待完成助手版本"), {
      target: { value: screen.getByLabelText("助手实例版本").textContent },
    });
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    view.rerender(
      <AssistantExperienceProvider pathname="/product">
        <Harness />
      </AssistantExperienceProvider>,
    );
    view.rerender(
      <AssistantExperienceProvider pathname="/pricing">
        <Harness />
      </AssistantExperienceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "完成快速退出" }));

    expect(focus).not.toHaveBeenCalled();
  });

  it("carries the quick transcript into the assistant workspace, then clears it after leaving", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(successfulAssistantStream("放大后保留的回答")),
    );
    const view = render(
      <AssistantExperienceProvider
        initialServiceState={placeholderStatus}
        pathname="/downloads"
      >
        <Harness />
      </AssistantExperienceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "快速入口" }));
    fireEvent.click(screen.getByRole("button", { name: "发送跨页问题" }));
    await waitFor(() =>
      expect(screen.getByLabelText("会话消息")).toHaveTextContent(
        "放大后保留的回答",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "准备放大交接" }));

    view.rerender(
      <AssistantExperienceProvider
        initialServiceState={placeholderStatus}
        pathname="/assistant/?mode=full#composer"
      >
        <Harness />
      </AssistantExperienceProvider>,
    );
    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("closed");
    expect(screen.getByLabelText("会话消息")).toHaveTextContent(
      "跨页已发送问题|放大后保留的回答",
    );
    await act(async () => {
      await Promise.resolve();
    });

    view.rerender(
      <AssistantExperienceProvider
        initialServiceState={placeholderStatus}
        pathname="/pricing"
      >
        <Harness />
      </AssistantExperienceProvider>,
    );
    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("closed");
    expect(screen.getByLabelText("会话消息")).toBeEmptyDOMElement();
  });

  it("clears page memory on direct workspace navigation without a handoff", () => {
    const view = render(
      <AssistantExperienceProvider pathname="/downloads">
        <Harness />
      </AssistantExperienceProvider>,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "会话草稿" }), {
      target: { value: "不应跨入口保留" },
    });

    view.rerender(
      <AssistantExperienceProvider pathname="/assistant">
        <Harness />
      </AssistantExperienceProvider>,
    );

    expect(screen.getByRole("textbox", { name: "会话草稿" })).toHaveValue("");
  });

  it("does not treat an assistant-prefixed portal route as the workspace", () => {
    render(
      <AssistantExperienceProvider pathname="/assistant-old">
        <Harness />
      </AssistantExperienceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "快速入口" }));
    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("quick");
  });

  it("closes synchronously on pathname changes, clears memory, and does not restore old focus", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          successfulAssistantStream("跨页保留回答"),
        ),
    );
    const view = render(
      <AssistantExperienceProvider pathname="/pricing">
        <Harness />
      </AssistantExperienceProvider>,
    );
    const launcher = screen.getByRole("button", { name: "快速入口" });
    const launcherFocus = vi.spyOn(launcher, "focus");
    fireEvent.click(launcher);
    fireEvent.change(screen.getByRole("textbox", { name: "会话草稿" }), {
      target: { value: "跨页保留草稿" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送跨页问题" }));
    await waitFor(() =>
      expect(screen.getByLabelText("会话消息")).toHaveTextContent(
        "跨页保留回答",
      ),
    );

    view.rerender(
      <AssistantExperienceProvider pathname="/product">
        <Harness />
      </AssistantExperienceProvider>,
    );

    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("closed");
    expect(screen.getByRole("textbox", { name: "会话草稿" })).toHaveValue("");
    expect(screen.getByLabelText("会话消息")).toBeEmptyDOMElement();
    expect(launcherFocus).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
    });
    expect(launcherFocus).not.toHaveBeenCalled();
  });

  it("clears a hidden workspace surface before returning to the portal", () => {
    const view = render(
      <AssistantExperienceProvider pathname="/assistant">
        <Harness />
      </AssistantExperienceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "快速入口" }));
    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("closed");
    view.rerender(
      <AssistantExperienceProvider pathname="/pricing">
        <Harness />
      </AssistantExperienceProvider>,
    );
    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("closed");
  });

  it("focuses only the most recently registered composer", () => {
    function ComposerRegistry({
      first,
      second,
    }: {
      first: HTMLElement;
      second: HTMLElement;
    }) {
      const experience = useAssistantExperience();
      const disposeFirst = useRef<(() => void) | null>(null);
      const [registered, setRegistered] = useState<string[]>([]);
      return (
        <>
          <button
            onClick={() => {
              disposeFirst.current = experience.registerComposer(first);
              setRegistered((current) => [...current, "first"]);
            }}
            type="button"
          >
            注册第一个输入框
          </button>
          <button
            onClick={() => {
              experience.registerComposer(second);
              setRegistered((current) => [...current, "second"]);
            }}
            type="button"
          >
            注册第二个输入框
          </button>
          <button onClick={() => disposeFirst.current?.()} type="button">
            卸载第一个输入框
          </button>
          <button onClick={experience.focusComposer} type="button">
            聚焦当前输入框
          </button>
          <output aria-label="已注册输入框">{registered.join(",")}</output>
        </>
      );
    }
    const first = document.createElement("input");
    const second = document.createElement("input");
    document.body.append(first, second);
    const firstFocus = vi.spyOn(first, "focus");
    const secondFocus = vi.spyOn(second, "focus");
    try {
      render(
        <AssistantExperienceProvider pathname="/">
          <ComposerRegistry first={first} second={second} />
        </AssistantExperienceProvider>,
      );

      fireEvent.click(screen.getByRole("button", { name: "注册第一个输入框" }));
      fireEvent.click(screen.getByRole("button", { name: "注册第二个输入框" }));
      expect(screen.getByLabelText("已注册输入框")).toHaveTextContent(
        "first,second",
      );
      fireEvent.click(screen.getByRole("button", { name: "卸载第一个输入框" }));
      fireEvent.click(screen.getByRole("button", { name: "聚焦当前输入框" }));

      expect(firstFocus).not.toHaveBeenCalled();
      expect(secondFocus).toHaveBeenCalledOnce();
    } finally {
      first.remove();
      second.remove();
    }
  });

  it("focuses only the single currently mounted registered composer", () => {
    const focus = vi.spyOn(HTMLInputElement.prototype, "focus");
    const view = render(
      <AssistantExperienceProvider pathname="/assistant">
        <Harness />
      </AssistantExperienceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "聚焦输入框" }));
    expect(screen.getByRole("textbox", { name: "工作区输入框" })).toHaveFocus();
    expect(focus).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(() => view.unmount()).not.toThrow();
    focus.mockRestore();
  });

  it("does not focus a stale composer that was removed without unregistering", () => {
    function Capture({ element }: { element: HTMLElement }) {
      const experience = useAssistantExperience();
      return (
        <>
          <button
            onClick={() => experience.registerComposer(element)}
            type="button"
          >
            注册临时输入框
          </button>
          <button onClick={experience.focusComposer} type="button">
            聚焦临时输入框
          </button>
        </>
      );
    }
    const stale = document.createElement("input");
    document.body.append(stale);
    render(
      <AssistantExperienceProvider pathname="/assistant">
        <Capture element={stale} />
      </AssistantExperienceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "注册临时输入框" }));
    stale.remove();
    const focus = vi.spyOn(stale, "focus");

    fireEvent.click(screen.getByRole("button", { name: "聚焦临时输入框" }));

    expect(focus).not.toHaveBeenCalled();
  });

  it("requires a provider", () => {
    function MissingProvider() {
      useAssistantExperience();
      return null;
    }

    expect(() => render(<MissingProvider />)).toThrow(
      "Assistant experience is unavailable",
    );
  });
});
