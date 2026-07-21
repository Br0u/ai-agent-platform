import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ADMIN_MODEL_PROVIDERS } from "@/features/assistant/admin-model-config-contract";
import { AssistantCapabilityRoadmap } from "./assistant-capability-roadmap";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AssistantCapabilityRoadmap", () => {
  it("renders four independent capability cards with honest fixed copy", () => {
    const { container } = render(<AssistantCapabilityRoadmap />);
    const cards = screen.getAllByTestId("assistant-capability-card");

    expect(cards).toHaveLength(4);
    expect(
      cards.map(
        (card) => within(card).getByRole("heading", { level: 3 }).textContent,
      ),
    ).toEqual(["本地算力", "Skill 加载", "知识库", "网页与操作工具"]);

    expect(within(cards[0]!).getByText("预留 / 未连接")).toBeVisible();
    expect(
      within(cards[0]!).getByText(
        "Ollama、vLLM、OpenAI-compatible、自有模型仓库",
      ),
    ).toBeVisible();
    expect(
      within(cards[1]!).getByText("Registry 已接入 / Agent 运行时待接"),
    ).toBeVisible();
    expect(
      within(cards[1]!).getByText("审核库可用，Agent 尚未加载任何 Skill"),
    ).toBeVisible();
    expect(within(cards[2]!).getByText("未接入")).toBeVisible();
    expect(
      within(cards[2]!).getByText("未来承载文档、网页内容和检索"),
    ).toBeVisible();
    expect(within(cards[3]!).getByText("未接入")).toBeVisible();
    expect(
      within(cards[3]!).getByText("未来承载外部动作、审批和浏览器操作"),
    ).toBeVisible();
    expect(container.textContent).not.toMatch(/(?:已连接|\b\d+\b)/u);
    expect(container.textContent?.match(/Registry 已接入/gu)).toHaveLength(1);
  });

  it("keeps every roadmap action inert and performs no external work", () => {
    const fetchMock = vi.fn();
    const xhrMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("XMLHttpRequest", xhrMock);
    const openMock = vi.spyOn(window, "open");
    const pushStateMock = vi.spyOn(window.history, "pushState");
    const replaceStateMock = vi.spyOn(window.history, "replaceState");
    const dispatchEventMock = vi.spyOn(window, "dispatchEvent");

    render(<AssistantCapabilityRoadmap />);
    const actions = screen.getAllByRole("button");
    expect(actions).toHaveLength(4);
    for (const action of actions) {
      expect(action).toBeDisabled();
      fireEvent.click(action);
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(xhrMock).not.toHaveBeenCalled();
    expect(openMock).not.toHaveBeenCalled();
    expect(pushStateMock).not.toHaveBeenCalled();
    expect(replaceStateMock).not.toHaveBeenCalled();
    expect(dispatchEventMock).not.toHaveBeenCalled();

    const source = readFileSync(
      "src/components/admin/assistant-capability-roadmap.tsx",
      "utf8",
    );
    expect(source).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|sendBeacon|location|localhost|analytics|health)\b|node:fs|fs\/promises/iu,
    );
  });

  it("does not add local compute to cloud model Provider choices", () => {
    expect(ADMIN_MODEL_PROVIDERS).toEqual([
      "openai",
      "anthropic",
      "google",
      "dashscope",
      "deepseek",
      "minimax",
    ]);
    expect(ADMIN_MODEL_PROVIDERS).not.toContain("local");
  });

  it("uses the shared admin stylesheet with a responsive card grid", () => {
    const component = readFileSync(
      "src/components/admin/assistant-capability-roadmap.tsx",
      "utf8",
    );
    const css = readFileSync(
      "src/components/admin/assistant-admin-page.css",
      "utf8",
    );

    expect(component).not.toContain("style=");
    expect(css).toContain(".assistant-capability-roadmap__grid");
    expect(css).toMatch(
      /@media \(max-width: 960px\)[\s\S]*\.assistant-capability-roadmap__grid/iu,
    );
  });
});
