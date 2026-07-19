import { cleanup, render, screen, within } from "@testing-library/react";
import {
  computeSafeDocumentChecksum,
  type SafeDocumentBodyV1,
  type SafeHastRoot,
} from "@ai-agent-platform/document-content";
import { afterEach, describe, expect, it } from "vitest";
import { SafeDocumentRenderer } from "./safe-document-renderer";

afterEach(cleanup);

function bodyWithRoot(root: SafeHastRoot): SafeDocumentBodyV1 {
  const unsigned = {
    format: "safe-markdown-v1" as const,
    source: "# 安全文档",
    navigation: { label: "安全文档", code: "SAFE", position: 1 },
    renderModel: {
      version: 1 as const,
      root,
      toc: [{ id: "doc-content-safe", title: "安全标题", depth: 2 }],
    },
  };
  return { ...unsigned, checksum: computeSafeDocumentChecksum(unsigned) };
}

describe("SafeDocumentRenderer", () => {
  it("renders the complete validated version-1 model with safe document components", () => {
    const body = bodyWithRoot({
      type: "root",
      children: [
        {
          type: "element",
          tagName: "h2",
          properties: { id: "doc-content-safe" },
          children: [{ type: "text", value: "安全标题" }],
        },
        {
          type: "element",
          tagName: "document-callout",
          properties: { dataCalloutType: "warning" },
          children: [
            {
              type: "element",
              tagName: "p",
              properties: {},
              children: [{ type: "text", value: "注意事项" }],
            },
          ],
        },
        {
          type: "element",
          tagName: "document-steps",
          properties: {},
          children: [
            {
              type: "element",
              tagName: "p",
              properties: {},
              children: [{ type: "text", value: "第一步" }],
            },
          ],
        },
        {
          type: "element",
          tagName: "document-cards",
          properties: {},
          children: [
            {
              type: "element",
              tagName: "a",
              properties: { href: "/docs/api" },
              children: [{ type: "text", value: "API 文档" }],
            },
          ],
        },
        {
          type: "element",
          tagName: "table",
          properties: {},
          children: [
            {
              type: "element",
              tagName: "tbody",
              properties: {},
              children: [
                {
                  type: "element",
                  tagName: "tr",
                  properties: {},
                  children: [
                    {
                      type: "element",
                      tagName: "td",
                      properties: {},
                      children: [{ type: "text", value: "单元格" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "element",
          tagName: "input",
          properties: { type: "checkbox", checked: true, disabled: true },
          children: [],
        },
        {
          type: "element",
          tagName: "img",
          properties: { src: "/assets/docs-background.webp", alt: "文档背景" },
          children: [],
        },
        {
          type: "element",
          tagName: "pre",
          properties: {},
          children: [
            {
              type: "element",
              tagName: "code",
              properties: { className: ["language-shell"] },
              children: [{ type: "text", value: "pnpm test\n" }],
            },
          ],
        },
        {
          type: "element",
          tagName: "pre",
          properties: {},
          children: [
            {
              type: "element",
              tagName: "document-filetree",
              properties: {},
              children: [{ type: "text", value: "apps/\n  web/" }],
            },
          ],
        },
      ],
    });

    render(<SafeDocumentRenderer body={body} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "安全标题" }),
    ).toHaveAttribute("id", "doc-content-safe");
    expect(screen.getByRole("note")).toHaveTextContent("注意事项");
    expect(screen.getByRole("note")).toHaveClass("document-callout--warning");
    expect(
      screen.getByText("第一步").closest(".document-steps"),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "API 文档" })).toHaveAttribute(
      "href",
      "/docs/api",
    );
    expect(screen.getByRole("cell", { name: "单元格" })).toBeVisible();
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("img", { name: "文档背景" })).toHaveAttribute(
      "src",
      "/assets/docs-background.webp",
    );
    const copyButtons = screen.getAllByRole("button", { name: "复制代码" });
    expect(copyButtons).toHaveLength(2);
    expect(
      within(copyButtons[0].parentElement!).getByText("pnpm test"),
    ).toBeVisible();
    const fileTree = within(copyButtons[1].parentElement!).getByText(/apps/);
    expect(fileTree).toBeVisible();
    expect(fileTree.closest(".document-filetree")).not.toBeNull();
    expect(screen.getByRole("group", { name: "文件树" })).toContainElement(
      fileTree,
    );
  });

  it.each([
    {
      name: "unknown tag",
      body: bodyWithRoot({
        type: "root",
        children: [
          {
            type: "element",
            tagName: "script",
            properties: {},
            children: [{ type: "text", value: "unsafe script" }],
          },
        ],
      } as SafeHastRoot),
    },
    {
      name: "unknown property",
      body: bodyWithRoot({
        type: "root",
        children: [
          {
            type: "element",
            tagName: "p",
            properties: { onClick: "unsafe event" },
            children: [{ type: "text", value: "partial content" }],
          },
        ],
      } as SafeHastRoot),
    },
    {
      name: "unknown version",
      body: {
        ...bodyWithRoot({ type: "root", children: [] }),
        renderModel: {
          version: 2,
          root: { type: "root", children: [] },
          toc: [],
        },
      },
    },
    {
      name: "unsafe task input",
      body: bodyWithRoot({
        type: "root",
        children: [
          {
            type: "element",
            tagName: "input",
            properties: { type: "text" },
            children: [],
          },
        ],
      } as SafeHastRoot),
    },
    { name: "malformed body", body: { format: "safe-markdown-v1" } },
  ])(
    "fails closed for a $name without rendering partial content",
    ({ body }) => {
      const { container } = render(<SafeDocumentRenderer body={body} />);

      expect(screen.getByRole("alert")).toHaveTextContent("内容暂不可用");
      expect(screen.queryByText("partial content")).not.toBeInTheDocument();
      expect(container.querySelector("script, style")).toBeNull();
      expect(container.innerHTML).not.toMatch(/on(click|load|error)=/iu);
    },
  );
});
