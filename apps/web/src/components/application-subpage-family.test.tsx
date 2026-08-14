import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import AppBiddingPage, {
  metadata as appBiddingMetadata,
} from "../app/product/app-bidding/page";
import AppContractPage, {
  metadata as appContractMetadata,
} from "../app/product/app-contract/page";
import AppWritingPage, {
  metadata as appWritingMetadata,
} from "../app/product/app-writing/page";
import { getApplicationSubpage } from "./application-subpage-content";

afterEach(cleanup);

const expected = {
  "app-writing": {
    h1: "通用文本写作：一句话起稿，AI 帮你写完全文",
    sectionCount: 5,
    groupCount: 0,
    demo: {
      header: "通用文本写作助手",
      placeholder: "请输入你的写作要求…",
      highlights: ["已上传 5 份相关文件"],
    },
    visuals: ["写作工作台首页", "写作工作台全景", "通用写作任务面板"],
    anchors: [
      [
        "了解通用文稿创作 →",
        "/product/app-writing#writing-caps",
        "writing-caps",
      ],
      [
        "了解公文撰写流程 →",
        "/product/app-writing#writing-flow",
        "writing-flow",
      ],
      [
        "了解智能公文校审 →",
        "/product/app-writing#writing-trace",
        "writing-trace",
      ],
    ],
  },
  "app-bidding": {
    h1: "投标智能助手：把投标从「加班赶」变成「有条理」",
    sectionCount: 4,
    groupCount: 1,
    traceGroupId: "bidding-trace",
    demo: {
      header: "智能投标助手",
      placeholder: "请输入你的问题…",
      highlights: ["识别 3 个得分关键点与 2 处潜在风险", "预计约 122 页"],
    },
    visuals: ["投标项目首页", "投标智能助手工作台", "生成大纲", "正文格式"],
    anchors: [
      [
        "了解投标全流程 →",
        "/product/app-bidding#bidding-workflow",
        "bidding-workflow",
      ],
      ["了解撰写能力 →", "/product/app-bidding#bidding-caps", "bidding-caps"],
      ["了解质量保障 →", "/product/app-bidding#bidding-trace", "bidding-trace"],
    ],
  },
  "app-contract": {
    h1: "合同智能审查：条款逐条核对，风险早发现",
    sectionCount: 4,
    groupCount: 1,
    traceGroupId: "contract-trace",
    demo: {
      header: "合同智能审查助手",
      placeholder: "请输入你的审查问题…",
      highlights: ["检测 19 处合同风险：常规 4 处、次要 12 处、重要 3 处"],
    },
    visuals: [
      "合同审查项目首页",
      "合同审查结果详情",
      "合同审查对话",
      "审查要求设置",
    ],
    anchors: [
      [
        "了解审查全流程 →",
        "/product/app-contract#contract-workflow",
        "contract-workflow",
      ],
      [
        "了解审查能力 →",
        "/product/app-contract#contract-caps",
        "contract-caps",
      ],
      [
        "了解质量保障 →",
        "/product/app-contract#contract-trace",
        "contract-trace",
      ],
    ],
  },
} as const;

const pageEntries = [
  {
    slug: "app-writing",
    Page: AppWritingPage,
    metadata: appWritingMetadata,
  },
  {
    slug: "app-bidding",
    Page: AppBiddingPage,
    metadata: appBiddingMetadata,
  },
  {
    slug: "app-contract",
    Page: AppContractPage,
    metadata: appContractMetadata,
  },
] as const;

describe("application subpage family", () => {
  it.each(pageEntries)(
    "wires and renders the complete dense $slug page",
    ({ slug, Page, metadata }) => {
      const page = getApplicationSubpage(slug)!;
      const { container } = render(<Page />);

      expect(
        screen.getByRole("heading", { level: 1, name: expected[slug].h1 }),
      ).toBeVisible();
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expect(metadata.title).toBe(page.hero.title);
      expect(metadata.description).toBe(page.hero.lead);
      expect(screen.getAllByTestId("platform-center-section")).toHaveLength(
        expected[slug].sectionCount,
      );
      expect(screen.getByTestId("platform-center-business")).toBeVisible();
      expect(screen.getByTestId("platform-center-cta")).toBeVisible();
      expect(container.querySelector("main")).toHaveClass(
        "platform-center--dense",
      );
      expect(container.querySelectorAll(".floating-assistant")).toHaveLength(0);
    },
  );

  it.each(pageEntries)(
    "renders the $slug miniature UI only inside its demo",
    ({ slug, Page }) => {
      const { container } = render(<Page />);
      const demoContainers = screen.getAllByTestId("platform-page-demo");
      const demo = within(screen.getByTestId("platform-page-demo"));

      const expectOnlyInsideDemo = (text: string, exact: boolean) => {
        expect(demo.getByText(text, { exact })).toBeVisible();

        const matches = within(container).getAllByText(text, { exact });

        expect(matches.length).toBeGreaterThan(0);
        for (const match of matches) {
          expect(
            demoContainers.some((demoContainer) =>
              demoContainer.contains(match),
            ),
          ).toBe(true);
        }
      };

      expectOnlyInsideDemo(expected[slug].demo.header, true);
      const input = demo.getByPlaceholderText(expected[slug].demo.placeholder);
      expect(input).toBeDisabled();
      expect(
        within(container).getAllByPlaceholderText(
          expected[slug].demo.placeholder,
        ),
      ).toEqual([input]);
      const sendButton = demo.getByRole("button", { name: "发送" });
      expect(sendButton).toBeDisabled();
      expect(
        within(container).getAllByRole("button", { name: "发送" }),
      ).toEqual([sendButton]);
      for (const text of expected[slug].demo.highlights) {
        expectOnlyInsideDemo(text, false);
      }
    },
  );

  it.each(pageEntries)(
    "renders the $slug visual semantics and formal links",
    ({ slug, Page }) => {
      const { container } = render(<Page />);
      const visualLabels = Array.from(
        container.querySelectorAll(".product-portal-visual strong"),
      );

      for (const visual of expected[slug].visuals) {
        expect(
          visualLabels.find((label) => label.textContent === visual),
        ).toBeVisible();
      }
      for (const [name, href] of [
        ["查看文档智能方案 →", "/solutions/finance-compliance"],
        ["查看实践案例 →", "/solutions/finance-compliance"],
      ] as const) {
        const links = screen.getAllByRole("link", { name });

        expect(links.length).toBeGreaterThan(0);
        for (const link of links) {
          expect(link).toBeVisible();
          expect(link).toHaveAttribute("href", href);
        }
      }
    },
  );

  it.each(pageEntries)(
    "keeps the $slug self links, targets and group copy",
    ({ slug, Page }) => {
      const { container } = render(<Page />);

      for (const [name, href, targetId] of expected[slug].anchors) {
        expect(screen.getByRole("link", { name })).toHaveAttribute(
          "href",
          href,
        );
        expect(container.querySelector(`#${targetId}`)).toBeTruthy();
      }

      expect(
        container.querySelectorAll(".platform-center-groups"),
      ).toHaveLength(expected[slug].groupCount);

      if ("traceGroupId" in expected[slug]) {
        const traceGroup = container.querySelector(
          `#${expected[slug].traceGroupId}`,
        );

        expect(traceGroup).toBeTruthy();
        for (const node of traceGroup!.querySelectorAll(
          ":scope > .product-portal-tag, :scope > p",
        )) {
          expect(node.textContent?.trim()).not.toBe("");
        }
      }
    },
  );
});
