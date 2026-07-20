import {
  safeDocumentBodyV1Schema,
  type SafeHastNode,
} from "@ai-agent-platform/document-content";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import type { ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { DocumentCodeBlock } from "./document-code-block";

type RuntimeComponentProps = {
  children?: ReactNode;
  "data-callout-type"?: unknown;
  dataCalloutType?: unknown;
  node?: { children?: SafeHastNode[] };
};

function textContent(nodes: readonly SafeHastNode[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((node) =>
      node.type === "text" ? node.value : textContent(node.children),
    )
    .join("");
}

function DocumentCallout(props: RuntimeComponentProps) {
  const { children } = props;
  const dataCalloutType = props.dataCalloutType ?? props["data-callout-type"];
  const calloutType =
    typeof dataCalloutType === "string" ? dataCalloutType : "info";
  return (
    <aside
      className={`nextra-callout document-callout document-callout--${calloutType}`}
      role="note"
    >
      {children}
    </aside>
  );
}

function DocumentSteps({ children }: RuntimeComponentProps) {
  return <div className="nextra-steps document-steps">{children}</div>;
}

function DocumentCards({ children }: RuntimeComponentProps) {
  return <div className="nextra-cards document-cards">{children}</div>;
}

function DocumentFileTree({ node }: RuntimeComponentProps) {
  return (
    <div className="document-filetree" role="group" aria-label="文件树">
      <DocumentCodeBlock code={textContent(node?.children)} />
    </div>
  );
}

function SafePre({ node }: RuntimeComponentProps) {
  const children = node?.children ?? [];
  const meaningfulChildren = children.filter(
    (child) => child.type !== "text" || child.value.trim().length > 0,
  );
  const isFileTree =
    meaningfulChildren.length === 1 &&
    meaningfulChildren[0]?.type === "element" &&
    meaningfulChildren[0].tagName === "document-filetree";
  const codeBlock = <DocumentCodeBlock code={textContent(children)} />;
  return isFileTree ? (
    <div className="document-filetree" role="group" aria-label="文件树">
      {codeBlock}
    </div>
  ) : (
    codeBlock
  );
}

const components = {
  "document-callout": DocumentCallout,
  "document-cards": DocumentCards,
  "document-filetree": DocumentFileTree,
  "document-steps": DocumentSteps,
  pre: SafePre,
};

function UnavailableDocument() {
  return (
    <p className="document-content-unavailable" role="alert">
      内容暂不可用
    </p>
  );
}

export function SafeDocumentRenderer({ body }: { body: unknown }) {
  const parsed = safeDocumentBodyV1Schema.safeParse(body);
  if (!parsed.success) return <UnavailableDocument />;

  try {
    return toJsxRuntime(parsed.data.renderModel.root, {
      Fragment,
      jsx,
      jsxs,
      passNode: true,
      components: components as never,
    });
  } catch {
    return <UnavailableDocument />;
  }
}
