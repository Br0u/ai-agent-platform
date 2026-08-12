import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

import { ContactBackButton } from "./contact-back-button";

type NavigationEntry = { index: number; url: string };

function setNavigationEntries(
  entries: NavigationEntry[],
  currentIndex: number,
) {
  Object.defineProperty(window, "navigation", {
    configurable: true,
    value: {
      currentEntry: { index: currentIndex },
      entries: () => entries,
    },
  });
}

afterEach(() => {
  replace.mockReset();
  vi.restoreAllMocks();
});

describe("ContactBackButton", () => {
  it("返回同源内部来源", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    setNavigationEntries(
      [
        { index: 0, url: `${window.location.origin}/trial` },
        { index: 1, url: `${window.location.origin}/contact` },
      ],
      1,
    );
    render(<ContactBackButton />);

    fireEvent.click(screen.getByRole("button", { name: "返回上一个浏览页面" }));

    expect(back).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    { entries: [] },
    {
      entries: [
        { index: 0, url: "https://outside.example/source" },
        { index: 1, url: `${window.location.origin}/contact` },
      ],
    },
  ])("冷启动或外部来源回到首页", ({ entries }) => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    setNavigationEntries(entries, entries.length - 1);
    render(<ContactBackButton />);

    fireEvent.click(screen.getByRole("button", { name: "返回上一个浏览页面" }));

    expect(back).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/");
  });
});
