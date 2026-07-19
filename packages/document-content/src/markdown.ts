import GithubSlugger from "github-slugger";
import { toString } from "mdast-util-to-string";
import rehypeSanitize from "rehype-sanitize";
import type { Options as SanitizeSchema } from "rehype-sanitize";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { Element, Root as HastRoot } from "hast";
import type { Root as MdastRoot } from "mdast";
import {
  DOCUMENT_LIMITS,
  DOCUMENT_HEADING_ID_PREFIX,
  SAFE_HAST_TAGS,
  computeSafeDocumentChecksum,
  isCalloutType,
  isSafeDocumentImage,
  isSafeDocumentSourceLink,
  parseSafeDocumentBodyV1,
  parseDocumentDraft,
  type Heading,
  type SafeDocumentBodyV1,
  type SafeHastNode,
  type SafeHastPropertyValue,
  type SafeHastRoot,
} from "./contracts";

type StructuralNode = {
  type: string;
  children?: StructuralNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
    hChildren?: Array<{ type: "text"; value: string }>;
  };
  value?: string;
  depth?: number;
  lang?: string | null;
  meta?: string | null;
  name?: string;
  attributes?: Record<string, string> | null;
  url?: string;
  checked?: boolean | null;
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
};

const supportedMdastTypes = new Set([
  "blockquote",
  "break",
  "code",
  "containerDirective",
  "delete",
  "emphasis",
  "heading",
  "image",
  "inlineCode",
  "link",
  "list",
  "listItem",
  "paragraph",
  "root",
  "strong",
  "table",
  "tableCell",
  "tableRow",
  "text",
  "thematicBreak",
]);

const sanitizeSchema: SanitizeSchema = {
  strip: ["script", "style"],
  clobber: ["id"],
  clobberPrefix: DOCUMENT_HEADING_ID_PREFIX,
  tagNames: [...SAFE_HAST_TAGS],
  attributes: {
    a: ["href"],
    code: ["className"],
    "document-callout": ["dataCalloutType"],
    h1: ["id"],
    h2: ["id"],
    h3: ["id"],
    h4: ["id"],
    h5: ["id"],
    h6: ["id"],
    img: ["src", "alt", "title"],
    input: [["type", "checkbox"], "checked", "disabled"],
    ol: ["start"],
    td: ["align"],
    th: ["align"],
  },
};

export function compileSafeDocument(input: unknown): SafeDocumentBodyV1 {
  const draft = parseDocumentDraft(input);
  const toc: Heading[] = [];
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(createSafeMarkdownPlugin(toc, draft.source))
    .use(remarkRehype)
    .use(rehypeSanitize, sanitizeSchema);

  const mdast = processor.parse(draft.source);
  const hast = processor.runSync(mdast) as HastRoot;
  assertTreeLimits(hast as StructuralNode, "hast");
  const root = toSafeHastRoot(hast);
  const renderModel = { version: 1 as const, root, toc };
  const unsignedBody = {
    format: "safe-markdown-v1" as const,
    source: draft.source,
    navigation: draft.navigation,
    renderModel,
  };
  const body = {
    ...unsignedBody,
    checksum: computeSafeDocumentChecksum(unsignedBody),
  };

  return parseSafeDocumentBodyV1(body);
}

function createSafeMarkdownPlugin(toc: Heading[], source: string) {
  return function safeMarkdownPlugin() {
    return function transform(tree: MdastRoot) {
      assertSafeMdast(tree as StructuralNode, source);
      const slugger = new GithubSlugger();

      visit(tree, "heading", (node) => {
        const title = toString(node).trim();
        if (!title || title.length > DOCUMENT_LIMITS.title) {
          throw new Error("DOCUMENT_MARKDOWN_LIMIT:heading-title");
        }
        const generated = slugger.slug(title);
        const slug = generated || slugger.slug("section");
        node.data = { ...node.data, hProperties: { id: slug } };
        toc.push({
          id: `${DOCUMENT_HEADING_ID_PREFIX}${slug}`,
          title,
          depth: node.depth,
        });
      });

      visit(tree, "link", (node) => {
        node.url = namespaceInternalFragment(node.url);
      });

      visit(tree, (node) => {
        const current = node as StructuralNode;
        if (current.type === "containerDirective") {
          current.data = {
            ...current.data,
            hName: `document-${current.name}`,
            hProperties:
              current.name === "callout"
                ? { dataCalloutType: current.attributes?.type }
                : {},
          };
        }
        if (current.type === "code" && current.lang === "filetree") {
          current.data = {
            ...current.data,
            hName: "document-filetree",
            hProperties: {},
            hChildren: [{ type: "text", value: current.value ?? "" }],
          };
        }
      });
    };
  };
}

function assertSafeMdast(root: StructuralNode, source: string): void {
  assertTreeLimits(root, "mdast");
  let headingCount = 0;
  const stack = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) break;

    if (!supportedMdastTypes.has(node.type)) {
      throw new Error(`DOCUMENT_MARKDOWN_UNSUPPORTED:${node.type}`);
    }
    if (node.type === "heading") {
      headingCount += 1;
      if (headingCount > DOCUMENT_LIMITS.headings) {
        throw new Error("DOCUMENT_MARKDOWN_LIMIT:headings");
      }
    }
    if (node.type === "code") validateCode(node);
    if (
      node.type === "link" &&
      (!isSafeDocumentSourceLink(node.url) ||
        hasEncodedDestination(node, source))
    ) {
      throw new Error("DOCUMENT_URL_INVALID:link");
    }
    if (
      node.type === "image" &&
      (!isSafeDocumentImage(node.url) || hasEncodedDestination(node, source))
    ) {
      throw new Error("DOCUMENT_URL_INVALID:image");
    }
    if (node.type === "containerDirective") validateDirective(node);
    if (node.type === "text") validateText(node.value ?? "");

    if (node.children) stack.push(...node.children);
  }

  let documentText = "";
  visit(root as MdastRoot, "text", (node) => {
    documentText += `\n${node.value}`;
  });
  if (/\{[^{}]*\}/u.test(documentText)) {
    throw new Error("DOCUMENT_MARKDOWN_UNSUPPORTED:expression");
  }
}

function hasEncodedDestination(node: StructuralNode, source: string): boolean {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (start === undefined || end === undefined) return true;
  const rawNode = source.slice(start, end);
  const delimiter = rawNode.lastIndexOf("](");
  const closing = rawNode.lastIndexOf(")");
  const destination =
    delimiter >= 0 && closing > delimiter
      ? rawNode.slice(delimiter + 2, closing)
      : rawNode;
  return /&(?:#(?:[xX][0-9A-Fa-f]+|\d+)|[A-Za-z][A-Za-z0-9]+);/u.test(
    destination,
  );
}

function namespaceInternalFragment(url: string): string {
  if (url.startsWith("https://")) return url;
  const hashIndex = url.indexOf("#");
  if (hashIndex < 0) return url;
  const fragment = url.slice(hashIndex + 1);
  const normalized = new GithubSlugger().slug(fragment);
  return `${url.slice(0, hashIndex + 1)}${DOCUMENT_HEADING_ID_PREFIX}${normalized}`;
}

function validateText(value: string): void {
  const trimmed = value.trimStart();
  if (isEsmDeclaration(trimmed)) {
    throw new Error("DOCUMENT_MARKDOWN_UNSUPPORTED:module-syntax");
  }
  if (/\{[^{}]*\}/u.test(value)) {
    if (value.includes(":::")) {
      throw new Error("DOCUMENT_DIRECTIVE_INVALID:expression");
    }
    throw new Error("DOCUMENT_MARKDOWN_UNSUPPORTED:expression");
  }
  if (/(?:^|\n):::[A-Za-z]/u.test(value)) {
    throw new Error("DOCUMENT_DIRECTIVE_INVALID:syntax");
  }
}

function isEsmDeclaration(value: string): boolean {
  const importDeclaration =
    /^import\s+(?:["']|(?:(?:[\p{L}_$][\p{L}\p{N}_$]*\s*,\s*)?(?:[\p{L}_$][\p{L}\p{N}_$]*|\*\s+as\s+[\p{L}_$][\p{L}\p{N}_$]*|\{[^}]*\}))\s+from\s+["'])/u;
  const dynamicImport = /^import\s*\(/u;
  const exportDeclaration =
    /^export\s+(?:default\b|async\s+function\b|(?:const|let|var|function|class|type|interface|enum|namespace)\b|\{|\*)/u;
  return (
    importDeclaration.test(value) ||
    dynamicImport.test(value) ||
    exportDeclaration.test(value)
  );
}

function validateCode(node: StructuralNode): void {
  if (
    Buffer.byteLength(node.value ?? "", "utf8") > DOCUMENT_LIMITS.codeBlockBytes
  ) {
    throw new Error("DOCUMENT_MARKDOWN_LIMIT:code-block");
  }
  if (node.meta) {
    const prefix =
      node.lang === "filetree"
        ? "DOCUMENT_DIRECTIVE_INVALID"
        : "DOCUMENT_MARKDOWN_UNSUPPORTED";
    throw new Error(`${prefix}:code-meta`);
  }
  if (node.lang && !/^[A-Za-z0-9_+-]{1,32}$/u.test(node.lang)) {
    throw new Error("DOCUMENT_MARKDOWN_UNSUPPORTED:code-language");
  }
}

function validateDirective(node: StructuralNode): void {
  const attributes = node.attributes ?? {};
  if (node.name === "callout") {
    if (
      Object.keys(attributes).length !== 1 ||
      !Object.hasOwn(attributes, "type") ||
      !isCalloutType(attributes.type)
    ) {
      throw new Error("DOCUMENT_DIRECTIVE_INVALID:callout");
    }
    return;
  }
  if (node.name === "steps" || node.name === "cards") {
    if (Object.keys(attributes).length !== 0) {
      throw new Error(`DOCUMENT_DIRECTIVE_INVALID:${node.name}`);
    }
    return;
  }
  throw new Error(
    `DOCUMENT_MARKDOWN_UNSUPPORTED:directive-${node.name ?? "unknown"}`,
  );
}

function assertTreeLimits(root: StructuralNode, phase: "mdast" | "hast"): void {
  const stack = [{ node: root, depth: 0 }];
  let nodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    nodes += 1;
    if (nodes > DOCUMENT_LIMITS.astNodes) {
      throw new Error(`DOCUMENT_MARKDOWN_LIMIT:${phase}-nodes`);
    }
    if (current.depth > DOCUMENT_LIMITS.nestingDepth) {
      throw new Error(`DOCUMENT_MARKDOWN_LIMIT:${phase}-depth`);
    }
    if (current.node.children) {
      for (const child of current.node.children) {
        stack.push({ node: child, depth: current.depth + 1 });
      }
    }
  }
}

function toSafeHastRoot(root: HastRoot): SafeHastRoot {
  return {
    type: "root",
    children: root.children.map(toSafeHastNode),
  };
}

function toSafeHastNode(node: HastRoot["children"][number]): SafeHastNode {
  if (node.type === "text") return { type: "text", value: node.value };
  if (node.type !== "element") {
    throw new Error(`DOCUMENT_RENDER_MODEL_INVALID:${node.type}`);
  }

  return {
    type: "element",
    tagName: node.tagName,
    properties: toSafeProperties(node),
    children: node.children.map(toSafeHastNode),
  };
}

function toSafeProperties(
  element: Element,
): Record<string, SafeHastPropertyValue> {
  const result: Record<string, SafeHastPropertyValue> = {};
  for (const [key, value] of Object.entries(element.properties)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      result[key] = value;
      continue;
    }
    if (
      Array.isArray(value) &&
      value.every((item) => typeof item === "string")
    ) {
      result[key] = value;
      continue;
    }
    throw new Error(`DOCUMENT_RENDER_MODEL_INVALID:property-${key}`);
  }
  return result;
}
