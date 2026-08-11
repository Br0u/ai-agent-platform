import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import SkillsApplicationPage, {
  metadata as skillsApplicationMetadata,
} from "../app/product/skills-application/page";
import SkillsOfficePage, {
  metadata as skillsOfficeMetadata,
} from "../app/product/skills-office/page";
import SkillsProgrammingPage, {
  metadata as skillsProgrammingMetadata,
} from "../app/product/skills-programming/page";
import { getSkillSubpage } from "./skill-subpage-content";

afterEach(cleanup);

const expected = {
  "skills-programming": {
    h1: "编程类技能：让研发与工程更省心",
    sectionIds: [
      "skills-programming-position",
      "skills-programming-caps",
      "sk-eval",
      "sk-dify",
      "sk-aiknow",
    ],
    demoCount: 4,
    business: {
      header: "编程类技能 · 能力演示",
      messages: [
        "帮我评测一下这几个模型的工具调用能力",
        "已生成对比报告，给出选型建议。",
        "已生成工作流 DSL，可直接导入。",
      ],
    },
    visuals: [
      "技能列表界面截图素材槽位",
      "评测结果与模型对比报告示意",
      "工作流节点拓扑示意",
      "AI 系统知识地图与问答示意",
    ],
    links: [
      ["了解模型选择 →", "/product/model-assets"],
      ["了解流程编排 →", "/product/agent-orchestration"],
      ["返回技能中心 →", "/product/skills"],
    ],
  },
  "skills-application": {
    h1: "应用类技能：让业务应用更可靠",
    sectionIds: [
      "skills-application-position",
      "skills-application-caps",
      "sk-video",
      "sk-agentguard",
    ],
    demoCount: 3,
    business: {
      header: "应用类技能 · 能力演示",
      messages: [
        "创建离线布控任务，盯住厂区北门",
        "已创建布控任务，开始轮询预警。",
        "已扫描完成，生成安全健康报告。",
      ],
    },
    visuals: [
      "技能列表界面截图素材槽位",
      "离线布控任务与预警结果示意",
      "安全健康报告示意",
    ],
    links: [
      ["了解视频智能体 →", "/product/agent-video"],
      ["了解安全管控 →", "/product/governance"],
      ["返回技能中心 →", "/product/skills"],
    ],
  },
  "skills-office": {
    h1: "办公类技能：让日常工作更高效",
    sectionIds: [
      "skills-office-position",
      "skills-office-caps",
      "sk-meeting",
      "sk-hello",
    ],
    demoCount: 3,
    business: {
      header: "办公类技能 · 能力演示",
      messages: [
        "把今天的产品会录音转成纪要",
        "已生成纪要与 5 条任务清单。",
        "已按示例完成技能包结构与发布流程演示。",
      ],
    },
    visuals: [
      "技能列表界面截图素材槽位",
      "会议纪要生成流程示意",
      "技能包结构与发布流程示意",
    ],
    links: [
      ["了解办公写作应用 →", "/product/app-writing"],
      ["返回技能中心 →", "/product/skills"],
      ["了解技能中心 →", "/product/skills"],
    ],
  },
} as const;

const pageEntries = [
  {
    slug: "skills-programming",
    Page: SkillsProgrammingPage,
    metadata: skillsProgrammingMetadata,
  },
  {
    slug: "skills-application",
    Page: SkillsApplicationPage,
    metadata: skillsApplicationMetadata,
  },
  {
    slug: "skills-office",
    Page: SkillsOfficePage,
    metadata: skillsOfficeMetadata,
  },
] as const;

describe("skill subpage family", () => {
  it.each(pageEntries)(
    "wires and renders the complete dense $slug page",
    ({ slug, Page, metadata }) => {
      const page = getSkillSubpage(slug)!;
      const { container } = render(<Page />);

      expect(
        screen.getByRole("heading", {
          level: 1,
          name: expected[slug].h1,
        }),
      ).toBeVisible();
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expect(metadata.title).toBe(page.hero.title);
      expect(metadata.description).toBe(page.hero.lead);
      expect(screen.getAllByTestId("platform-center-section")).toHaveLength(
        expected[slug].sectionIds.length,
      );
      for (const id of expected[slug].sectionIds) {
        expect(container.querySelector(`#${id}`)).toBeTruthy();
      }
      expect(screen.getAllByTestId("platform-page-demo")).toHaveLength(
        expected[slug].demoCount,
      );
      expect(screen.getByTestId("platform-center-business")).toBeVisible();
      expect(screen.getByTestId("platform-center-cta")).toBeVisible();
      expect(container.querySelector("main")).toHaveClass(
        "platform-center--dense",
      );
      expect(
        container.querySelectorAll(".platform-center-groups"),
      ).toHaveLength(0);
      expect(container.querySelectorAll(".floating-assistant")).toHaveLength(0);
    },
  );

  it.each(pageEntries)(
    "renders the $slug miniature UI only inside its business demo",
    ({ slug, Page }) => {
      const { container } = render(<Page />);
      const business = screen.getByTestId("platform-center-business");
      const businessDemos =
        within(business).getAllByTestId("platform-page-demo");

      expect(businessDemos).toHaveLength(1);
      const demo = within(businessDemos[0]);
      const expectOnlyInsideBusinessDemo = (copy: string) => {
        expect(demo.getByText(copy, { exact: true })).toBeVisible();
        const matches = within(container).getAllByText(copy, { exact: true });

        expect(matches.length).toBeGreaterThan(0);
        for (const match of matches) {
          expect(businessDemos[0].contains(match)).toBe(true);
        }
      };

      expectOnlyInsideBusinessDemo(expected[slug].business.header);
      for (const copy of expected[slug].business.messages) {
        expectOnlyInsideBusinessDemo(copy);
      }
      expectOnlyInsideBusinessDemo("输入你的需求…");
      expectOnlyInsideBusinessDemo("发送");
    },
  );

  it.each(pageEntries)(
    "renders the $slug visual semantics and formal links",
    ({ slug, Page }) => {
      const { container } = render(<Page />);
      const visualLabels = Array.from(
        container.querySelectorAll(
          ".product-portal-visual strong, .product-portal-demo strong",
        ),
      );

      for (const visual of expected[slug].visuals) {
        expect(
          visualLabels.find((label) => label.textContent === visual),
        ).toBeVisible();
      }
      for (const [name, href] of expected[slug].links) {
        expect(screen.getByRole("link", { name })).toHaveAttribute(
          "href",
          href,
        );
      }
      for (const [name, href] of [
        ["申请体验", "/trial"],
        ["返回技能中心", "/product/skills"],
      ] as const) {
        const links = screen.getAllByRole("link", { name });

        expect(links.length).toBeGreaterThan(0);
        for (const link of links) expect(link).toHaveAttribute("href", href);
      }
    },
  );
});
