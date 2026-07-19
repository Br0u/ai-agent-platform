import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentCodeBlock } from "./document-code-block";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DocumentCodeBlock", () => {
  it("copies only its plain-text code and announces success accessibly", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<DocumentCodeBlock code={'curl "https://example.com"'} />);

    fireEvent.click(screen.getByRole("button", { name: "复制代码" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('curl "https://example.com"');
    });
    expect(screen.getByRole("status")).toHaveTextContent("代码已复制。");
  });

  it("fails safely when the clipboard API is unavailable", async () => {
    vi.stubGlobal("navigator", {});

    render(<DocumentCodeBlock code="pnpm test" />);
    fireEvent.click(screen.getByRole("button", { name: "复制代码" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "复制失败，请手动选择代码。",
      );
    });
    expect(screen.getByText("pnpm test")).toBeVisible();
  });
});
