import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantActivity } from "./assistant-activity";

vi.mock("./assistant-orb", () => ({
  AssistantOrb: ({ size, state }: { size: number; state: string }) => (
    <span aria-label={`orb:${state}:${size}`} role="img" />
  ),
}));

const activities = [
  {
    type: "activity" as const,
    phase: "reading" as const,
    label: "正在读取页面",
  },
  {
    type: "activity" as const,
    phase: "analyzing" as const,
    label: "正在分析问题",
  },
];

afterEach(cleanup);

describe("AssistantActivity", () => {
  it("shows only the current phase with a working Orb and the sole live region", () => {
    render(<AssistantActivity activities={activities} inProgress />);

    const current = screen.getByRole("status");
    expect(current).toHaveAttribute("aria-live", "polite");
    expect(current).toHaveTextContent("正在分析问题");
    expect(screen.queryByText("正在读取页面")).toBeNull();
    expect(
      screen.getByRole("img", { name: "orb:analyzing:20" }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
  });

  it("moves completed phases into a native disclosure closed by default", () => {
    render(<AssistantActivity activities={activities} inProgress={false} />);

    const disclosure = screen.getByText("已完成 2 个步骤").closest("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure).not.toHaveAttribute("open");
    expect(disclosure).not.toHaveAttribute("aria-live");
    expect(
      within(disclosure as HTMLElement).getByText("正在读取页面"),
    ).toBeInTheDocument();
    expect(
      within(disclosure as HTMLElement).getByText("正在分析问题"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "orb:completed:20" }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(0);
  });

  it("renders nothing when no safe activity exists", () => {
    const { container } = render(
      <AssistantActivity activities={[]} inProgress />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
