import { describe, expect, it } from "vitest";
import {
  DOCUMENT_LIMITS,
  compileSafeDocument,
  type DocumentDraftInput,
} from "./index";

const draft = (source: string): DocumentDraftInput => ({
  slug: "quick-start",
  title: "Quick start",
  summary: "A safe guide.",
  source,
  navigation: { label: "Quick start", code: "QS", position: 1 },
});

const compile = (source: string) => compileSafeDocument(draft(source));

describe("compileSafeDocument", () => {
  it("compiles Markdown, GFM and the four controlled components", () => {
    const body = compile(
      `# Hello\n\n## Table\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n:::callout{type="info"}\nBe careful.\n:::\n\n:::steps\n1. First\n2. Second\n:::\n\n:::cards\n- [API](/docs/api)\n:::\n\n\`\`\`filetree\napps/\n  web/\n\`\`\``,
    );

    expect(body.format).toBe("safe-markdown-v1");
    expect(body.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(body.renderModel.toc).toEqual([
      { id: "doc-content-hello", title: "Hello", depth: 1 },
      { id: "doc-content-table", title: "Table", depth: 2 },
    ]);

    const json = JSON.stringify(body.renderModel);
    expect(json).toContain("document-callout");
    expect(json).toContain("document-steps");
    expect(json).toContain("document-cards");
    expect(json).toContain("document-filetree");
    expect(json).toContain("table");
    expect(json).not.toMatch(
      /script|onClick|dangerouslySetInnerHTML|javascript:|"style"/i,
    );
  });

  it("assigns deterministic unique heading ids and checksum", () => {
    const first = compile("# Same\n\n## Same");
    const second = compile("# Same\n\n## Same");

    expect(first.renderModel.toc.map(({ id }) => id)).toEqual([
      "doc-content-same",
      "doc-content-same-1",
    ]);
    expect(second).toEqual(first);
  });

  it("accommodates duplicate suffixes at the maximum heading-title length", () => {
    const heading = "a".repeat(DOCUMENT_LIMITS.title);
    const toc = compile(`# ${heading}\n\n## ${heading}`).renderModel.toc;

    expect(toc.map(({ id }) => id)).toEqual([
      `doc-content-${heading}`,
      `doc-content-${heading}-1`,
    ]);
  });

  it("accepts safe github-slugger ids that start with punctuation", () => {
    expect(compile("# -foo").renderModel.toc).toEqual([
      { id: "doc-content--foo", title: "-foo", depth: 1 },
    ]);
  });

  it("namespaces DOM-global heading names and matching fragments", () => {
    const body = compile(
      `# current\n\n## name\n\n## \\_\\_proto\\_\\_\n\n[Current](#current) [Name](#name) [Proto](#__proto__)`,
    );

    expect(body.renderModel.toc.map(({ id }) => id)).toEqual([
      "doc-content-current",
      "doc-content-name",
      "doc-content-__proto__",
    ]);
    const json = JSON.stringify(body.renderModel.root);
    expect(json).toContain('"id":"doc-content-current"');
    expect(json).toContain('"href":"#doc-content-current"');
    expect(json).toContain('"href":"#doc-content-name"');
    expect(json).toContain('"href":"#doc-content-__proto__"');
  });

  it("uses github-slug normalization consistently for percent headings and fragments", () => {
    const body = compile("# 100% ready\n\n[Jump](#100-ready)");

    expect(body.renderModel.toc[0]?.id).toBe("doc-content-100-ready");
    expect(JSON.stringify(body.renderModel.root)).toContain(
      '"href":"#doc-content-100-ready"',
    );
  });

  it("preserves checked and unchecked GFM task-list semantics", () => {
    const json = JSON.stringify(
      compile("- [x] shipped\n- [ ] pending").renderModel,
    );

    expect(json).toContain('"tagName":"input"');
    expect(json).toContain('"checked":true');
    expect(json).toContain('"checked":false');
    expect(json).toContain('"type":"checkbox"');
    expect(json).toContain('"disabled":true');
  });

  it.each([
    "<script>alert(1)</script>",
    "import x from 'x'",
    "export const x = 1",
    "# Hello {process.env.SECRET}",
    "# Hello {\nprocess.env.SECRET\n}",
    "<Unknown onClick={evil} />",
    ":::unknown\ntext\n:::",
  ])("rejects executable or unknown syntax: %s", (source) => {
    expect(() => compile(source)).toThrowError(
      /^DOCUMENT_MARKDOWN_UNSUPPORTED:/,
    );
  });

  it.each([
    ":::callout\ntext\n:::",
    ':::callout{type="info" extra="x"}\ntext\n:::',
    ":::callout{type={danger}}\ntext\n:::",
    ':::callout{type="danger"}\ntext\n:::',
    ':::steps{start="1"}\ntext\n:::',
    ':::cards{columns="3"}\n- [A](/a)\n:::',
    "\`\`\`filetree extra\na/\n\`\`\`",
  ])("rejects invalid directive attributes: %s", (source) => {
    expect(() => compile(source)).toThrowError(/^DOCUMENT_DIRECTIVE_INVALID:/);
  });

  it.each([
    "[x](javascript:alert(1))",
    "[x](http://example.com)",
    "[x](//example.com/x)",
    "[x](docs/api)",
    "[x](../api)",
    "[x](/docs\\api)",
    "[x](/docs/%2e%2e/admin)",
    "[x](#100%25-ready)",
    "[x](javascript&colon;alert(1))",
    "[x](https&colon;//example.com/docs)",
    "[x](/docs//api)",
  ])("rejects an unsafe link: %s", (source) => {
    expect(() => compile(source)).toThrowError("DOCUMENT_URL_INVALID:link");
  });

  it("accepts normalized internal paths and fragments", () => {
    const json = JSON.stringify(
      compile("[Home](/) [API](/docs/api) [Section](#section)").renderModel,
    );
    expect(json).toContain('"href":"/"');
    expect(json).toContain("/docs/api");
    expect(json).toContain("#doc-content-section");
  });

  it("accepts normalized HTTPS links", () => {
    const json = JSON.stringify(
      compile(
        "[Reference](https://example.com/docs?q=safe&lang=en#section)\n\nhttps://example.com/gfm",
      ).renderModel,
    );
    expect(json).toContain("https://example.com/docs?q=safe&lang=en#section");
    expect(json).toContain("https://example.com/gfm");
  });

  it("allows ordinary prose that starts with export", () => {
    expect(() => compile("export data from the dashboard")).not.toThrow();
  });

  it.each([
    "![x](https://attacker.invalid/x.png)",
    "![x](//attacker.invalid/x.png)",
    "![x](/images/x.png)",
    "![x](/assets/../secret.png)",
    "![x](/assets/%2e%2e/secret.png)",
    "![x](/assets/a%2fb.png)",
    "![x](/assets/a\\b.png)",
    "![x](/assets//x.png)",
  ])("rejects an unsafe image: %s", (source) => {
    expect(() => compile(source)).toThrowError("DOCUMENT_URL_INVALID:image");
  });

  it("accepts only a normalized /assets image path", () => {
    expect(
      JSON.stringify(
        compile("![Diagram](/assets/docs/diagram.webp)").renderModel,
      ),
    ).toContain("/assets/docs/diagram.webp");
  });

  it("rejects UTF-8 overflow before Markdown syntax is considered", () => {
    const oversizedExecutableSource =
      "é".repeat(Math.floor(DOCUMENT_LIMITS.sourceBytes / 2) + 1) +
      "<script>alert(1)</script>";

    expect(() => compile(oversizedExecutableSource)).toThrowError(
      "DOCUMENT_INPUT_TOO_LARGE:source",
    );
  });

  it.each([
    ["nodes", `- item\n`.repeat(DOCUMENT_LIMITS.astNodes + 1)],
    ["depth", `${"> ".repeat(DOCUMENT_LIMITS.nestingDepth + 1)}deep`],
    ["headings", "# h\n".repeat(DOCUMENT_LIMITS.headings + 1)],
    [
      "code-block",
      `\`\`\`text\n${"x".repeat(DOCUMENT_LIMITS.codeBlockBytes + 1)}\n\`\`\``,
    ],
  ])("enforces the %s resource limit", (_limit, source) => {
    expect(() => compile(source)).toThrowError(/^DOCUMENT_MARKDOWN_LIMIT:/);
  });
});
