import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AssistantMarkdown } from "./assistant-markdown";

afterEach(cleanup);

describe("AssistantMarkdown", () => {
  it("renders Markdown link labels as plain text without an anchor", () => {
    render(
      <AssistantMarkdown content="阅读 [产品中心](/product) 或 [外部资料](https://example.com/docs)。" />,
    );

    expect(screen.getByText(/产品中心/u)).toHaveTextContent(
      "阅读 产品中心 或 外部资料。",
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
});
