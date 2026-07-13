// @ts-expect-error Vitest provides Node at runtime; the package deliberately omits Node types.
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantHeaderEntry } from "./assistant-header-entry";

afterEach(cleanup);

describe("AssistantHeaderEntry", () => {
  it("exposes one named control and activates it without exposing the decorative mark", () => {
    const onActivate = vi.fn();
    render(<AssistantHeaderEntry onActivate={onActivate} />);

    const button = screen.getByRole("button", { name: "打开 AI 助理" });
    expect(button).toHaveClass("assistant-header-entry");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("generates local gradient identifiers for every rendered mark", () => {
    const { container } = render(
      <>
        <AssistantHeaderEntry onActivate={() => undefined} />
        <AssistantHeaderEntry onActivate={() => undefined} />
      </>,
    );

    const gradients = [...container.querySelectorAll("linearGradient")];
    expect(gradients).toHaveLength(2);
    expect(gradients[0]?.id).toBeTruthy();
    expect(gradients[1]?.id).toBeTruthy();
    expect(gradients[0]?.id).not.toBe(gradients[1]?.id);

    const marks = [...container.querySelectorAll("svg")];
    expect(marks[0]?.querySelector("path")?.getAttribute("stroke")).toBe(
      `url(#${gradients[0]?.id})`,
    );
    expect(marks[1]?.querySelector("path")?.getAttribute("stroke")).toBe(
      `url(#${gradients[1]?.id})`,
    );
  });

  it("keeps the hit target accessible and the six-second loop transform-only", () => {
    const appShellCss = readFileSync("src/app-shell.css", "utf8");

    expect(appShellCss).toMatch(
      /\.assistant-header-entry\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/u,
    );
    expect(appShellCss).toMatch(
      /\.assistant-header-entry__mark\s*\{[\s\S]*?transform-origin:\s*center;[\s\S]*?animation:\s*assistant-mobius-rotate\s+6s\s+linear\s+infinite;/u,
    );
    expect(appShellCss).toMatch(
      /@keyframes\s+assistant-mobius-rotate\s*\{\s*to\s*\{\s*transform:\s*rotate\(360deg\);\s*\}\s*\}/u,
    );
    expect(appShellCss).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.assistant-header-entry__mark\s*\{\s*animation:\s*none;\s*\}/u,
    );
  });
});
