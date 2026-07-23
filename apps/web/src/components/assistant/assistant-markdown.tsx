"use client";

import { memo, type ComponentPropsWithoutRef } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import "./assistant-markdown.css";

const ALLOWED_ELEMENTS = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "input",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
] as const;

const REMARK_PLUGINS = [remarkGfm];

type MarkdownAnchorProps = ComponentPropsWithoutRef<"a"> & {
  node?: unknown;
};

function safeAssistantUrl(value: string): string {
  const url = value.trim();
  if (!url) return "";

  if (url.startsWith("#") || url.startsWith("?")) return url;
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) {
    return url;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}

function AssistantMarkdownLink({
  href,
  node,
  ...props
}: MarkdownAnchorProps) {
  void node;
  if (!href) return <>{props.children}</>;

  const external = href.startsWith("https://");
  return (
    <a
      {...props}
      href={href}
      rel={external ? "noreferrer noopener" : undefined}
      target={external ? "_blank" : undefined}
    />
  );
}

const COMPONENTS = {
  a: AssistantMarkdownLink,
} satisfies Components;

export const AssistantMarkdown = memo(function AssistantMarkdown({
  content,
}: {
  content: string;
}) {
  return (
    <div className="assistant-markdown">
      <Markdown
        allowedElements={ALLOWED_ELEMENTS}
        components={COMPONENTS}
        remarkPlugins={REMARK_PLUGINS}
        skipHtml
        urlTransform={safeAssistantUrl}
      >
        {content}
      </Markdown>
    </div>
  );
});
