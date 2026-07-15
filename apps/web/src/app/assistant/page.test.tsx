import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantExperienceProvider } from "@/components/assistant/assistant-experience-provider";
import AssistantPage, { metadata } from "./page";

const runtime = vi.hoisted(() => ({
  readSafeAssistantRuntimeStatus: vi.fn(),
}));

vi.mock("@/server/assistant/assistant-runtime", () => ({
  readSafeAssistantRuntimeStatus: runtime.readSafeAssistantRuntimeStatus,
}));

describe("AssistantPage", () => {
  beforeEach(() => {
    runtime.readSafeAssistantRuntimeStatus.mockResolvedValue({
      live: true,
      ready: true,
      capability: "placeholder",
      message: "模型尚未配置，当前为安全占位模式。",
    });
  });

  it("publishes the standalone workspace from shared cached runtime status", async () => {
    const page = await AssistantPage();
    render(
      <AssistantExperienceProvider pathname="/assistant">
        {page}
      </AssistantExperienceProvider>,
    );

    expect(runtime.readSafeAssistantRuntimeStatus).toHaveBeenCalledOnce();
    expect(metadata).toMatchObject({
      title: "AI 助理 · AI Agent Platform",
    });
    expect(screen.getByRole("main", { name: "AI 助理工作区" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "打开 M 助手" })).toBeNull();
    expect(screen.getByText("模型尚未配置")).toBeVisible();
  });
});
