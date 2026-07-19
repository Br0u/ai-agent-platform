import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DOCUMENT_LIMITS,
  compileSafeDocument,
  parseDocumentDraft,
  parseSafeDocumentBodyV1,
  safeDocumentBodyV1Schema,
  safeHastRootSchema,
  type DocumentNavigation,
  type SafeDocumentBodyV1,
  type SafeHastRoot,
} from "./index";

const validDraft = {
  slug: "quick-start",
  title: "Quick start",
  summary: "Start safely.",
  source: "# Hello",
  navigation: { label: "Quick start", code: "QS", position: 1 },
};

describe("document content contracts", () => {
  it("exposes the stable navigation and safe body contracts", () => {
    expectTypeOf<DocumentNavigation>().toEqualTypeOf<{
      label: string;
      code: string;
      position: number;
    }>();

    expectTypeOf<SafeDocumentBodyV1>().toEqualTypeOf<{
      format: "safe-markdown-v1";
      source: string;
      checksum: string;
      navigation: DocumentNavigation;
      renderModel: {
        version: 1;
        root: SafeHastRoot;
        toc: { id: string; title: string; depth: number }[];
      };
    }>();
  });

  it("rejects a non-canonical slug with a stable field error", () => {
    expect(() =>
      parseDocumentDraft({ ...validDraft, slug: "Bad Slug" }),
    ).toThrowError("DOCUMENT_INPUT_INVALID:slug");
  });

  it.each([
    ["slug", { slug: `a${"b".repeat(DOCUMENT_LIMITS.slug)}` }],
    ["title", { title: "t".repeat(DOCUMENT_LIMITS.title + 1) }],
    ["summary", { summary: "s".repeat(DOCUMENT_LIMITS.summary + 1) }],
    [
      "navigation.label",
      {
        navigation: {
          ...validDraft.navigation,
          label: "l".repeat(DOCUMENT_LIMITS.navigationLabel + 1),
        },
      },
    ],
    [
      "navigation.code",
      {
        navigation: {
          ...validDraft.navigation,
          code: "C".repeat(DOCUMENT_LIMITS.navigationCode + 1),
        },
      },
    ],
    [
      "navigation.position",
      {
        navigation: {
          ...validDraft.navigation,
          position: DOCUMENT_LIMITS.position + 1,
        },
      },
    ],
  ])("bounds %s", (field, override) => {
    expect(() =>
      parseDocumentDraft({ ...validDraft, ...override }),
    ).toThrowError(`DOCUMENT_INPUT_INVALID:${field}`);
  });

  it("measures source limits in UTF-8 bytes", () => {
    expect(() =>
      parseDocumentDraft({
        ...validDraft,
        source: "é".repeat(Math.floor(DOCUMENT_LIMITS.sourceBytes / 2) + 1),
      }),
    ).toThrowError("DOCUMENT_INPUT_TOO_LARGE:source");
  });

  it("publishes explicit structural limits for parser enforcement", () => {
    expect(DOCUMENT_LIMITS).toMatchObject({
      astNodes: expect.any(Number),
      nestingDepth: expect.any(Number),
      headings: expect.any(Number),
      codeBlockBytes: expect.any(Number),
    });
    expect(DOCUMENT_LIMITS.codeBlockBytes).toBeLessThan(
      DOCUMENT_LIMITS.sourceBytes,
    );
  });

  it("rejects malformed stored render models", () => {
    const malformedBody = {
      format: "safe-markdown-v1",
      source: "# Hello",
      checksum: "f".repeat(64),
      navigation: validDraft.navigation,
      renderModel: {
        version: 1,
        root: {
          type: "root",
          children: [
            {
              type: "element",
              tagName: "script",
              properties: {},
              children: [{ type: "text", value: "bad" }],
            },
          ],
        },
        toc: [],
      },
    };

    expect(safeDocumentBodyV1Schema.safeParse(malformedBody).success).toBe(
      false,
    );
    expect(() => parseSafeDocumentBodyV1(malformedBody)).toThrowError(
      /^DOCUMENT_INPUT_INVALID:renderModel/,
    );
  });

  it.each([
    ["code", { className: true }],
    ["ol", { start: "1" }],
    ["th", { align: "diagonal" }],
    ["img", { src: "/assets/x.png", alt: true }],
    ["h2", { id: "doc-content-100%" }],
  ])(
    "rejects invalid %s property values in stored models",
    (tagName, properties) => {
      expect(
        safeHastRootSchema.safeParse({
          type: "root",
          children: [
            {
              type: "element",
              tagName,
              properties,
              children: [],
            },
          ],
        }).success,
      ).toBe(false);
    },
  );

  it("bounds deeply nested unknown HAST before recursive schema validation", () => {
    let nested: unknown = { type: "text", value: "safe" };
    for (let index = 0; index < 2_000; index += 1) {
      nested = {
        type: "element",
        tagName: "p",
        properties: {},
        children: [nested],
      };
    }
    const root = { type: "root", children: [nested] };
    const body = {
      format: "safe-markdown-v1",
      source: "safe",
      checksum: "f".repeat(64),
      navigation: validDraft.navigation,
      renderModel: {
        version: 1,
        root,
        toc: [],
      },
    };

    expect(() => safeHastRootSchema.safeParse(root)).not.toThrow(RangeError);
    expect(safeHastRootSchema.safeParse(root).success).toBe(false);
    expect(() => safeDocumentBodyV1Schema.safeParse(body)).not.toThrow(
      RangeError,
    );
    expect(safeDocumentBodyV1Schema.safeParse(body).success).toBe(false);
    expect(() => parseSafeDocumentBodyV1(body)).toThrowError(
      /^DOCUMENT_INPUT_INVALID:renderModel/,
    );
  });

  it("bounds render-model payload independently of a small source", () => {
    const body = {
      format: "safe-markdown-v1",
      source: "safe",
      checksum: "f".repeat(64),
      navigation: validDraft.navigation,
      renderModel: {
        version: 1,
        root: {
          type: "root",
          children: [
            {
              type: "text",
              value: "x".repeat(DOCUMENT_LIMITS.renderModelBytes + 1),
            },
          ],
        },
        toc: [],
      },
    };

    expect(() => parseSafeDocumentBodyV1(body)).toThrowError(
      /^DOCUMENT_INPUT_INVALID:renderModel/,
    );

    const oversizedPropertiesRoot = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "img",
          properties: {
            src: "/assets/x.png",
            alt: "x".repeat(DOCUMENT_LIMITS.renderModelBytes + 1),
          },
          children: [],
        },
      ],
    };
    expect(safeHastRootSchema.safeParse(oversizedPropertiesRoot).success).toBe(
      false,
    );
  });

  it.each(["source", "navigation", "root", "toc"])(
    "detects %s tampering through the checksum",
    (field) => {
      const body = compileSafeDocument(validDraft);
      if (field === "source") body.source += " changed";
      if (field === "navigation") body.navigation.label += " changed";
      if (field === "root") {
        body.renderModel.root.children.push({ type: "text", value: "changed" });
      }
      if (field === "toc") body.renderModel.toc[0]!.title += " changed";

      expect(safeDocumentBodyV1Schema.safeParse(body).success).toBe(false);
      expect(() => parseSafeDocumentBodyV1(body)).toThrowError(
        "DOCUMENT_INPUT_INVALID:checksum",
      );
    },
  );
});
