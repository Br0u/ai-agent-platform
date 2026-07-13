import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssistantExperienceProvider } from "@/components/assistant/assistant-experience-provider";
import AssistantPage, { metadata } from "./page";

describe("AssistantPage", () => {
  it("publishes the standalone public assistant workspace without a floating launcher", () => {
    render(
      <AssistantExperienceProvider pathname="/assistant">
        <AssistantPage />
      </AssistantExperienceProvider>,
    );

    expect(metadata).toMatchObject({
      title: "AI 助理 · AI Agent Platform",
    });
    expect(screen.getByRole("main", { name: "AI 助理工作区" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "打开 M 助手" })).toBeNull();
  });
});
