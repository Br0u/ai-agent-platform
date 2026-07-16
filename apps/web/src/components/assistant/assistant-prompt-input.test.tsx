import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantPromptInput } from "./assistant-prompt-input";

function renderPrompt(
  overrides: Partial<React.ComponentProps<typeof AssistantPromptInput>> = {},
) {
  function Harness() {
    const [value, setValue] = React.useState(overrides.value ?? "");
    return (
      <AssistantPromptInput
        {...overrides}
        ariaLabel={overrides.ariaLabel ?? "AI 助理对话"}
        disabled={overrides.disabled ?? false}
        inputLabel={overrides.inputLabel ?? "输入问题"}
        onChange={setValue}
        onSubmit={overrides.onSubmit ?? vi.fn()}
        registerComposer={overrides.registerComposer ?? (() => () => undefined)}
        value={value}
        variant={overrides.variant ?? "workspace"}
      />
    );
  }

  return render(<Harness />);
}

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AssistantPromptInput", () => {
  it("submits controlled text and preserves the Shift+Enter contract", () => {
    const onSubmit = vi.fn();
    renderPrompt({ onSubmit });
    const input = screen.getByRole("textbox", { name: "输入问题" });

    fireEvent.change(input, { target: { value: "如何部署？" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      value: "如何部署？",
      attachments: [],
    });
  });

  it("keeps the send action disabled for invalid or unavailable submissions", () => {
    renderPrompt({ value: "𠮷".repeat(501) });

    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    expect(screen.getByText("501 / 500")).toBeInTheDocument();
  });

  it("adds image attachments, shows previews, and removes them safely", async () => {
    renderPrompt();
    const file = new File(["image"], "部署架构.png", { type: "image/png" });
    const input = screen.getByLabelText("选择图片附件");

    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByRole("button", { name: "预览 部署架构.png" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("附件已添加，等待多模态模型接入。"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "预览 部署架构.png" }));
    const preview = screen.getByRole("dialog", { name: "预览 部署架构.png" });
    expect(
      within(preview).getByRole("img", { name: "部署架构.png" }),
    ).toHaveAttribute("src", "blob:部署架构.png");
    fireEvent.click(within(preview).getByRole("button", { name: "关闭预览" }));

    fireEvent.click(screen.getByRole("button", { name: "移除 部署架构.png" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "预览 部署架构.png" }),
      ).toBeNull(),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:部署架构.png");
  });

  it("caps image attachments at six and keeps attachment submission blocked", () => {
    const onSubmit = vi.fn();
    renderPrompt({ onSubmit });
    const files = Array.from(
      { length: 7 },
      (_, index) =>
        new File([String(index)], `image-${index}.png`, { type: "image/png" }),
    );

    fireEvent.change(screen.getByLabelText("选择图片附件"), {
      target: { files },
    });

    expect(screen.getAllByRole("button", { name: /预览 image-/ })).toHaveLength(
      6,
    );
    expect(screen.getByText("最多添加 6 个图片附件。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("exposes future model and voice entries without pretending they are live", () => {
    renderPrompt();

    fireEvent.click(
      screen.getByRole("button", { name: "选择模型，当前 AI 助理" }),
    );
    expect(screen.getByRole("menu", { name: "模型选择" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /视觉模型.*即将开放/ }),
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: "语音输入（即将开放）" }),
    );
    expect(screen.getByText("语音输入即将开放。")).toBeInTheDocument();
  });
});
