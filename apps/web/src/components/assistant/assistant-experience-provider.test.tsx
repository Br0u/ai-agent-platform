import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AssistantExperienceProvider,
  useAssistantExperience,
} from "./assistant-experience-provider";

function Harness() {
  const experience = useAssistantExperience();

  return (
    <div>
      <button
        onClick={(event) => experience.openFrom(event.currentTarget)}
        type="button"
      >
        顶部入口
      </button>
      <button
        onClick={(event) => experience.openFrom(event.currentTarget)}
        type="button"
      >
        浮动入口
      </button>
      <input
        aria-label="工作区输入框"
        ref={(element) => experience.registerComposer(element)}
      />
      <button onClick={experience.focusComposer} type="button">
        聚焦输入框
      </button>
      {experience.session.open ? (
        <div role="dialog">
          <button onClick={experience.close} type="button">
            关闭
          </button>
        </div>
      ) : null}
    </div>
  );
}

afterEach(cleanup);

describe("AssistantExperienceProvider", () => {
  it("returns focus to the exact trigger that opened the drawer", () => {
    render(
      <AssistantExperienceProvider pathname="/">
        <Harness />
      </AssistantExperienceProvider>,
    );
    const top = screen.getByRole("button", { name: "顶部入口" });
    const floating = screen.getByRole("button", { name: "浮动入口" });

    fireEvent.click(top);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(top).toHaveFocus();

    fireEvent.click(floating);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(floating).toHaveFocus();
  });

  it("focuses only a currently mounted registered composer", () => {
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
