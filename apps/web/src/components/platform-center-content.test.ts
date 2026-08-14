import { describe, expect, it } from "vitest";

import { agentSubpageSlugs, getAgentSubpage } from "./agent-subpage-content";
import {
  applicationSubpageSlugs,
  getApplicationSubpage,
} from "./application-subpage-content";
import {
  capabilityFoundationSlugs,
  getCapabilityFoundation,
} from "./capability-foundation-content";
import { codingSubpageSlugs, getCodingSubpage } from "./coding-subpage-content";
import { getModelSubpage, modelSubpageSlugs } from "./model-subpage-content";
import {
  getPlatformCenter,
  platformCenterSlugs,
} from "./platform-center-content";
import type { PlatformDemo, PlatformPage } from "./platform-page-types";
import { getSkillSubpage, skillSubpageSlugs } from "./skill-subpage-content";

function collectDemos(page: PlatformPage) {
  const demos: PlatformDemo[] = [];

  if (page.hero.visual?.messages) {
    demos.push({
      title: page.hero.visual.title,
      messages: page.hero.visual.messages,
      footer: page.hero.visual.footer,
      note: page.hero.visual.note,
    });
  }
  for (const section of page.sections)
    if (section.demo) demos.push(section.demo);
  if (page.business?.demo) demos.push(page.business.demo);

  return demos;
}

const allPages = [
  ...platformCenterSlugs.map(getPlatformCenter),
  ...capabilityFoundationSlugs.map(getCapabilityFoundation),
  ...modelSubpageSlugs.map(getModelSubpage),
  ...codingSubpageSlugs.map(getCodingSubpage),
  ...agentSubpageSlugs.map(getAgentSubpage),
  ...applicationSubpageSlugs.map(getApplicationSubpage),
  ...skillSubpageSlugs.map(getSkillSubpage),
].filter((page): page is PlatformPage => page !== undefined);

const v2Centers = [
  {
    slug: "model",
    title: "模型中心：覆盖模型全生命周期的企业模型工程",
    tags: 4,
    capabilities: [
      "model-assets",
      "model-deploy",
      "model-training",
      "model-evaluation",
    ],
    stepCounts: [3, 3, 2, 2],
    images: 5,
  },
  {
    slug: "agents",
    title: "智能体中心：零代码快速搭建，低代码灵活编排",
    tags: 4,
    capabilities: [
      "agent-knowledge",
      "agent-data",
      "agent-video",
      "agent-orchestration",
    ],
    stepCounts: [3, 3, 3, 2],
    images: 8,
  },
  {
    slug: "applications",
    title: "行业应用中心：高频业务场景，成熟应用开箱即用",
    tags: 3,
    capabilities: ["app-writing", "app-bidding", "app-contract"],
    stepCounts: [2, 3, 3],
    images: 3,
  },
  {
    slug: "skills",
    title: "技能中心：专业能力标准封装，统一管理、随取随用",
    tags: 3,
    capabilities: ["skill-programming", "skill-application", "skill-office"],
    stepCounts: [3, 2, 2],
    images: 1,
  },
  {
    slug: "coding",
    title: "码多多：自然语言驱动开发，双模式执行与工具链落地",
    tags: 3,
    capabilities: ["coding-assistant", "coding-workflow", "coding-tools"],
    stepCounts: [3, 3, 3],
    images: 2,
  },
  {
    slug: "governance",
    title: "权限中心：用户角色授权统一管理，权限边界清晰可控",
    tags: 4,
    capabilities: ["gov-caps"],
    stepCounts: [4],
    images: 1,
  },
] as const;

describe("platform center content", () => {
  it("registers only the seven public centers", () => {
    expect(platformCenterSlugs).toStrictEqual([
      "model",
      "knowledge",
      "agents",
      "applications",
      "skills",
      "coding",
      "governance",
    ]);
    expect(getPlatformCenter("unknown")).toBeUndefined();
  });

  it.each(v2Centers)("matches the V2 $slug structure", (expected) => {
    const center = getPlatformCenter(expected.slug)!;
    const images = [
      ...(center.hero.visual?.images ?? []),
      ...(center.capabilities?.flatMap(
        (capability) => capability.images ?? [],
      ) ?? []),
    ];

    expect(center.hero.title).toBe(expected.title);
    expect(center.hero.tags).toHaveLength(expected.tags);
    expect(center.sections).toHaveLength(1);
    expect(center.sections[0]?.cards).toHaveLength(2);
    expect(center.capabilities?.map(({ id }) => id)).toStrictEqual(
      expected.capabilities,
    );
    expect(center.capabilities?.map(({ steps }) => steps.length)).toStrictEqual(
      expected.stepCounts,
    );
    expect(images).toHaveLength(expected.images);
    expect(center.business).toBeUndefined();
    expect(center.cta?.actions).toHaveLength(2);
  });

  it("keeps the governance directory anchors on their matching controls", () => {
    expect(
      getPlatformCenter("governance")?.capabilities?.[0]?.steps.map(
        ({ id }) => id,
      ),
    ).toStrictEqual(["gov-users", "gov-roles", "gov-menu", "gov-permission"]);
  });

  it("keeps the existing knowledge center route intact", () => {
    const center = getPlatformCenter("knowledge")!;

    expect(center.sections).toHaveLength(4);
    expect(center.sections[1]?.cards).toHaveLength(6);
    expect(
      center.sections[2]?.cards?.map((card) => card.actions?.[0]?.href),
    ).toStrictEqual(["/product/agent-knowledge", "/product/applications"]);
    expect(center.cta?.actions).toHaveLength(2);
  });

  it("keeps controls and citations out of demo message bodies", () => {
    const demos = allPages.flatMap(collectDemos);

    expect(demos.length).toBeGreaterThan(0);
    for (const demo of demos) {
      const texts = demo.messages.map((message) =>
        typeof message === "string" ? message : message.text,
      );
      if (demo.footer) {
        expect(texts).not.toContain(demo.footer.placeholder);
        expect(texts).not.toContain(demo.footer.action);
      }
      for (const message of demo.messages) {
        if (typeof message !== "string" && message.cite) {
          expect(message.role).toBe("assistant");
          expect(message.text).not.toContain(message.cite);
        }
      }
    }
  });
});
