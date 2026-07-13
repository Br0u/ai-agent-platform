import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ContactPage from "./page";

describe("ContactPage", () => {
  it("awaits pricing search params and renders the normalized summary inside the scaffold", async () => {
    const { container } = render(
      await ContactPage({
        searchParams: Promise.resolve({
          source: "pricing",
          deployment: "dedicated-cloud",
          scale: "enterprise",
          modules: "workflow,unknown,agent-studio",
          term: "3y",
        }),
      }),
    );

    const summary = within(container).getByRole("region", {
      name: "价格计算需求摘要",
    });
    expect(summary).toHaveTextContent("部署方式：专有云");
    expect(summary).toHaveTextContent("功能模块：AI Agent Studio、Workflow");
    expect(summary.closest(".feature-shell__inner")).not.toBeNull();
    expect(container).not.toHaveTextContent("unknown");
  });

  it.each([{}, { source: "other", modules: '<script>alert("x")</script>' }])(
    "renders no pricing summary for a missing or invalid source",
    async (query) => {
      const { container } = render(
        await ContactPage({ searchParams: Promise.resolve(query) }),
      );
      const renderedPage = within(container);

      expect(
        renderedPage.queryByRole("region", { name: "价格计算需求摘要" }),
      ).not.toBeInTheDocument();
      expect(renderedPage.queryByText(/alert/u)).not.toBeInTheDocument();
    },
  );
});
