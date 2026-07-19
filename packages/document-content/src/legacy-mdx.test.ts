import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type {
  SafeDocumentBodyV1,
  SafeHastElement,
  SafeHastNode,
  SafeHastRoot,
} from "./contracts";
import { compileSafeDocument } from "./markdown";
import {
  LEGACY_FIXTURE_CHECKSUMS,
  convertLegacyMdx,
  parseLegacyMeta,
} from "./legacy-mdx";

const fixtures = fileURLToPath(new URL("../fixtures/legacy/", import.meta.url));
const expectedFixtures = fileURLToPath(
  new URL("../fixtures/expected/", import.meta.url),
);

const expectedArtifactChecksums = {
  api: {
    source: "01bb42917ddee4c8cc0ab9d171dd939b9a83e9f860e2dde84ad1901e31bb1415",
    renderModel:
      "58ac25304069a3ab8c337e22857bc7337971bdbc49d8f54fe133943430b4fb26",
  },
  deployment: {
    source: "b3485fc8ad6444258e2d58d6321607bb1f5bbea3a77a6a4b754b3887bac5937d",
    renderModel:
      "6a0c6a90c515288e74ec0e382b6372bdb884022b31147aeede4cf434cf651469",
  },
  faq: {
    source: "eb8459780f8e617775066e5967a2feab0a3059e9436d55c514b831b60e12dfbc",
    renderModel:
      "55eb9a60c2a39c51da3c656acce0ea74f244ff64c98ebffac5493ca6deffbb53",
  },
  hardware: {
    source: "99dd8b900aec793c4d44631f27afe1afac82bbab230e6c370be5a51feeadba5e",
    renderModel:
      "4e55601277504fb91eb9b4cd8c0338a8ea1b74513ca6fdb77d40d47bc9606c2c",
  },
  operations: {
    source: "772c58dc60c96de53fab8b61742b06fa67b16321c2c164a2fbc02681e1900bed",
    renderModel:
      "13e0fc11162dc184ffdf69b69d7763677b5f8da8d8ad9a8865cd76e992e9b08e",
  },
  "quick-start": {
    source: "a5440950ebd4609eeefdaa110814bdfe505ef6276be81e382b8a55f8ad8ae6e0",
    renderModel:
      "2aad70332be397224164291ec72fdeba373c8a46a2f8ddb707d696c54e3d92aa",
  },
  upgrade: {
    source: "9a6bf33357a9bc9d6e2a62f75397e52c575bee6aa4372eefb5a5ecac741c0d16",
    renderModel:
      "3451209e312f2a9f488dab5ad43e21d7bb7c0eb48e015643540cd32165caac46",
  },
} as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

type RenderNode = SafeHastRoot | SafeHastNode;

function textContent(node: RenderNode): string {
  return node.type === "text"
    ? node.value
    : node.children.map(textContent).join("");
}

function findElements(node: RenderNode, tagName: string): SafeHastElement[] {
  const matches: SafeHastElement[] = [];
  if (node.type === "element" && node.tagName === tagName) matches.push(node);
  if (node.type !== "text") {
    for (const child of node.children) {
      matches.push(...findElements(child, tagName));
    }
  }
  return matches;
}

function extractReviewStructure(
  title: string,
  renderModel: SafeDocumentBodyV1["renderModel"],
) {
  const links = (node: RenderNode) =>
    findElements(node, "a").map((link) => ({
      href: link.properties.href,
      text: textContent(link),
    }));
  return {
    title,
    toc: renderModel.toc,
    codeBlocks: findElements(renderModel.root, "pre").flatMap((pre) => {
      const code = pre.children.find(
        (child): child is SafeHastElement =>
          child.type === "element" && child.tagName === "code",
      );
      if (!code) return [];
      const className = code.properties.className;
      const languageClass = Array.isArray(className)
        ? className[0]
        : typeof className === "string"
          ? className
          : "";
      return [
        {
          language: languageClass.replace(/^language-/u, ""),
          text: textContent(code),
        },
      ];
    }),
    links: links(renderModel.root),
    callouts: findElements(renderModel.root, "document-callout").map(
      (callout) => ({
        type: callout.properties.dataCalloutType,
        text: textContent(callout),
      }),
    ),
    steps: findElements(renderModel.root, "document-steps").map((steps) => ({
      headings: findElements(steps, "h3").map(textContent),
      childTags: steps.children
        .filter((child): child is SafeHastElement => child.type === "element")
        .map(({ tagName }) => tagName),
    })),
    cards: findElements(renderModel.root, "document-cards").map(links),
    filetrees: findElements(renderModel.root, "document-filetree").map(
      textContent,
    ),
  };
}

describe("legacy Nextra MDX conversion", () => {
  it("pins the byte-identical legacy fixture inputs", () => {
    for (const [name, expected] of Object.entries(LEGACY_FIXTURE_CHECKSUMS)) {
      expect(sha256(readFileSync(`${fixtures}${name}`, "utf8")), name).toBe(
        expected,
      );
    }
  });

  it("parses the exact navigation metadata", () => {
    expect(
      parseLegacyMeta(readFileSync(`${fixtures}_meta.ts`, "utf8")),
    ).toEqual([
      ["quick-start", "快速开始"],
      ["deployment", "部署指南"],
      ["upgrade", "升级手册"],
      ["operations", "运维手册"],
      ["api", "API 文档"],
      ["hardware", "GPU / 硬件适配"],
      ["faq", "常见问题 FAQ"],
    ]);
  });

  it("maps description to summary and converts every supported component exactly", () => {
    const quickStart = convertLegacyMdx(
      readFileSync(`${fixtures}quick-start.mdx`, "utf8"),
    );
    expect(quickStart.summary).toBe(
      "从环境准备到第一个智能体，完成 AI Agent Platform 的最短上手路径。",
    );
    expect(quickStart.source).not.toContain("import ");
    expect(quickStart.source).toContain(
      ':::callout{type="info"}\n当前文档示例以本地 Docker\n环境为主，生产环境请结合企业网络、硬件和安全策略调整配置。\n:::',
    );
    expect(quickStart.source).toContain(":::steps\n\n### 准备环境");
    expect(quickStart.source).toContain(
      ":::cards\n- [部署指南](/docs/deployment)\n- [API 文档](/docs/api)\n- [常见问题 FAQ](/docs/faq)\n:::",
    );

    const deployment = convertLegacyMdx(
      readFileSync(`${fixtures}deployment.mdx`, "utf8"),
    );
    expect(deployment.source).toContain(
      "```filetree\nai-agent-platform/\n  .env\n  compose.yaml\n  .secrets/\n  apps/agent/\n  apps/web/\n  packages/database/\n```",
    );

    const operations = convertLegacyMdx(
      readFileSync(`${fixtures}operations.mdx`, "utf8"),
    );
    expect(operations.source).toContain(
      ":::cards\n- [环境兼容矩阵](/compatibility)\n- [支持与工单](/support)\n:::",
    );
  });

  it("rejects unknown imports, components and malformed known components", () => {
    const frontMatter = "---\ntitle: Test\ndescription: Test summary\n---\n\n";

    expect(() =>
      convertLegacyMdx(`${frontMatter}import Widget from "elsewhere";\n`),
    ).toThrow("LEGACY_MDX_UNSUPPORTED_IMPORT");
    expect(() =>
      convertLegacyMdx(`${frontMatter}<Widget value="x" />\n`),
    ).toThrow("LEGACY_MDX_UNSUPPORTED_COMPONENT:Widget");
    expect(() =>
      convertLegacyMdx(`${frontMatter}<Callout>missing type</Callout>\n`),
    ).toThrow("LEGACY_MDX_INVALID_CALLOUT");
    expect(() =>
      convertLegacyMdx(
        `${frontMatter}<Cards><Cards.Card title="Missing href" /></Cards>\n`,
      ),
    ).toThrow("LEGACY_MDX_INVALID_CARD");
    expect(() =>
      convertLegacyMdx(
        `${frontMatter}<FileTree><FileTree.Folder name="unclosed"></FileTree>\n`,
      ),
    ).toThrow("LEGACY_MDX_INVALID_FILETREE");
    expect(() =>
      convertLegacyMdx(
        `${frontMatter}<Callout type="error">\nunsupported\n</Callout>\n`,
      ),
    ).toThrow("LEGACY_MDX_INVALID_CALLOUT");
  });

  it("preserves fenced code byte-for-byte and transforms only prose", () => {
    const frontMatter =
      "---\ntitle: Fence safety\ndescription: Fence safety summary\n---\n\n";
    const backtickFence = [
      "````tsx",
      'import { Callout } from "nextra/components";',
      "```",
      "<Steps>",
      '<Widget value="untouched" />',
      "</Steps>",
      "````",
    ].join("\n");
    const tildeFence = [
      "~~~~text",
      "<FileTree>",
      '<Unknown name="untouched" />',
      "</FileTree>",
      "~~~~~",
    ].join("\n");
    const converted = convertLegacyMdx(
      `${frontMatter}import { Steps } from "nextra/components";\n\nimportant note\n\n<Steps>\n\n### Outside\n\n</Steps>\n\n${backtickFence}\n\n${tildeFence}\n`,
    );

    expect(converted.source).toBe(
      `important note\n\n:::steps\n\n### Outside\n\n:::\n\n${backtickFence}\n\n${tildeFence}\n`,
    );
    expect(() =>
      convertLegacyMdx(`${frontMatter}\`\`\`tsx\nconst open = true;\n`),
    ).toThrow("LEGACY_MDX_UNTERMINATED_FENCE");
  });

  it("fails closed on transform-like indented code and preserves ordinary indented code", () => {
    const frontMatter =
      "---\ntitle: Indented safety\ndescription: Indented safety summary\n---\n\n";

    for (const code of [
      '    import { Steps } from "nextra/components";',
      "    <Steps>",
      '\t<Widget value="untouched" />',
    ]) {
      expect(() => convertLegacyMdx(`${frontMatter}${code}\n`)).toThrow(
        "LEGACY_MDX_AMBIGUOUS_INDENTED_CODE",
      );
    }

    const ordinary = ["    const value = 1;", "\tconsole.log(value);"].join(
      "\n",
    );
    expect(convertLegacyMdx(`${frontMatter}${ordinary}\n`).source).toBe(
      `${ordinary}\n`,
    );
  });

  it("pins every converted safe source and production render model", () => {
    const actual: Record<string, { source: string; renderModel: string }> = {};
    const reviewStructure: Record<string, unknown> = {};
    for (const slug of Object.keys(expectedArtifactChecksums) as Array<
      keyof typeof expectedArtifactChecksums
    >) {
      const converted = convertLegacyMdx(
        readFileSync(`${fixtures}${slug}.mdx`, "utf8"),
      );
      const body = compileSafeDocument({
        slug,
        ...converted,
        navigation: { label: converted.title, code: "TEST", position: 0 },
      });
      actual[slug] = {
        source: sha256(converted.source),
        renderModel: sha256(JSON.stringify(body.renderModel)),
      };
      expect(converted.source, `${slug}:reviewable-safe-source`).toBe(
        readFileSync(`${expectedFixtures}${slug}.safe.md`, "utf8"),
      );
      expect(
        `${JSON.stringify(body.renderModel, null, 2)}\n`,
        `${slug}:reviewable-render-model`,
      ).toBe(readFileSync(`${expectedFixtures}${slug}.render.json`, "utf8"));
      reviewStructure[slug] = extractReviewStructure(
        converted.title,
        body.renderModel,
      );
    }
    expect(actual).toEqual(expectedArtifactChecksums);
    expect(reviewStructure).toEqual(
      JSON.parse(
        readFileSync(`${expectedFixtures}structure.json`, "utf8"),
      ) as unknown,
    );
  });
});
