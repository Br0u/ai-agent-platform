import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantStatusResponse } from "@/features/assistant/assistant-contract";
import {
  AssistantExperienceProvider,
  useAssistantExperience,
} from "./assistant-experience-provider";

function Harness() {
  const experience = useAssistantExperience();

  return (
    <div>
      <output aria-label="助手展示形态">{experience.surface}</output>
      <button
        onClick={(event) => experience.openQuickFrom(event.currentTarget)}
        type="button"
      >
        快速入口
      </button>
      <button
        onClick={(event) => experience.openDockFrom(event.currentTarget)}
        type="button"
      >
        停靠入口
      </button>
      <button onClick={experience.collapseToQuick} type="button">
        收起到快速窗口
      </button>
      <button onClick={experience.close} type="button">
        关闭
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
      <button
        onClick={(event) => experience.openDockFrom(event.currentTarget)}
        type="button"
      >
        打开停靠助手
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
  vi.unstubAllGlobals();
});

describe("AssistantExperienceProvider", () => {
  it.each([
    ["快速助手", "打开快速助手"],
    ["停靠助手", "打开停靠助手"],
  ])(
    "lazily refreshes service state once when opening %s",
    async (_name, buttonName) => {
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
      fireEvent.click(screen.getByRole("button", { name: buttonName }));

      await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      await waitFor(() =>
        expect(screen.getByLabelText("服务能力")).toHaveTextContent(
          "placeholder",
        ),
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("lets an assistant workspace child adopt server state without a duplicate request", async () => {
    vi.stubGlobal("fetch", vi.fn());

    function ServerStateChild() {
      const { adoptServiceState, serviceState } = useAssistantExperience();
      useEffect(() => {
        adoptServiceState(placeholderStatus);
      }, [adoptServiceState]);
      return (
        <output aria-label="工作区服务能力">{serviceState.capability}</output>
      );
    }

    render(
      <AssistantExperienceProvider pathname="/assistant">
        <ServerStateChild />
      </AssistantExperienceProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("工作区服务能力")).toHaveTextContent(
        "placeholder",
      ),
    );
    await act(async () => Promise.resolve());
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses one closed to quick to dock to quick to closed state machine", () => {
    render(
      <AssistantExperienceProvider pathname="/">
        <Harness />
      </AssistantExperienceProvider>,
    );

    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("closed");
    fireEvent.click(screen.getByRole("button", { name: "快速入口" }));
    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("quick");
    fireEvent.click(screen.getByRole("button", { name: "停靠入口" }));
    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("dock");
    fireEvent.click(screen.getByRole("button", { name: "收起到快速窗口" }));
    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("quick");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("closed");
  });

  it("preserves the original launcher when an internal quick action opens dock", () => {
    function FocusHarness() {
      const experience = useAssistantExperience();
      return (
        <>
          <button
            onClick={(event) => experience.openQuickFrom(event.currentTarget)}
            type="button"
          >
            原始启动器
          </button>
          {experience.surface === "quick" ? (
            <button
              onClick={(event) => experience.openDockFrom(event.currentTarget)}
              type="button"
            >
              快速窗口内打开停靠助手
            </button>
          ) : null}
          {experience.surface === "dock" ? (
            <button onClick={experience.close} type="button">
              关闭停靠助手
            </button>
          ) : null}
        </>
      );
    }
    render(
      <AssistantExperienceProvider pathname="/">
        <FocusHarness />
      </AssistantExperienceProvider>,
    );
    const launcher = screen.getByRole("button", { name: "原始启动器" });
    const launcherFocus = vi.spyOn(launcher, "focus");

    fireEvent.click(launcher);
    const internalTrigger = screen.getByRole("button", {
      name: "快速窗口内打开停靠助手",
    });
    const internalFocus = vi.spyOn(internalTrigger, "focus");
    fireEvent.click(internalTrigger);

    expect(internalTrigger.isConnected).toBe(false);
    expect(launcherFocus).not.toHaveBeenCalled();
    expect(internalFocus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "关闭停靠助手" }));
    expect(launcherFocus).toHaveBeenCalledOnce();
    expect(internalFocus).not.toHaveBeenCalled();
  });

  it("derives a closed assistant workspace surface synchronously and keeps the session", async () => {
    const view = render(
      <AssistantExperienceProvider pathname="/">
        <Harness />
      </AssistantExperienceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "快速入口" }));
    fireEvent.change(screen.getByRole("textbox", { name: "会话草稿" }), {
      target: { value: "保留中的问题" },
    });

    view.rerender(
      <AssistantExperienceProvider pathname="/assistant/?mode=full#composer">
        <Harness />
      </AssistantExperienceProvider>,
    );
    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("closed");
    expect(screen.getByRole("textbox", { name: "会话草稿" })).toHaveValue(
      "保留中的问题",
    );
    await act(async () => {
      await Promise.resolve();
    });

    view.rerender(
      <AssistantExperienceProvider pathname="/pricing">
        <Harness />
      </AssistantExperienceProvider>,
    );
    expect(screen.getByLabelText("助手展示形态")).toHaveTextContent("closed");
    expect(screen.getByRole("textbox", { name: "会话草稿" })).toHaveValue(
      "保留中的问题",
    );
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

  it("closes synchronously on ordinary pathname changes without clearing the session or restoring old focus", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          version: "1",
          requestId: "request-route-change",
          mode: "placeholder",
          session: {
            temporary: true,
            expiresAt: "2026-07-15T12:00:00.000Z",
          },
          message: {
            id: "message-route-change",
            role: "assistant",
            content: "跨页保留回答",
          },
          suggestedActions: [],
        }),
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
    expect(screen.getByRole("textbox", { name: "会话草稿" })).toHaveValue(
      "跨页保留草稿",
    );
    expect(screen.getByLabelText("会话消息")).toHaveTextContent("跨页保留回答");
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
