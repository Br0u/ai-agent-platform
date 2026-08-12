import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import Page, { generateMetadata, generateStaticParams } from "./page";

const commonRelatedExpected = [
  [
    "private-yuanqi",
    [
      [
        "单机与集群算力规划方案",
        "根据模型任务和业务规模规划单机或集群资源组织与运行方式。",
        "/solutions/cluster-planning",
      ],
    ],
  ],
  [
    "cluster-planning",
    [
      [
        "算力监控与运行保障方案",
        "对 CPU、内存、磁盘、网络和 AI 卡等资源状态进行统一观察和运行保障。",
        "/solutions/compute-monitoring",
      ],
    ],
  ],
  [
    "compute-monitoring",
    [
      [
        "单机与集群算力规划方案",
        "根据模型任务和业务规模规划单机或集群资源组织与运行方式。",
        "/solutions/cluster-planning",
      ],
      [
        "企业模型部署与调用",
        "将已准备、训练或评估的模型部署为可管理、可调用的企业模型服务。",
        "/solutions/model-deployment",
      ],
    ],
  ],
  [
    "model-evaluation",
    [
      [
        "企业模型部署与调用",
        "将已准备、训练或评估的模型部署为可管理、可调用的企业模型服务。",
        "/solutions/model-deployment",
      ],
      [
        "企业知识库建设与持续运营",
        "围绕文档、分片、QA、术语、知识图谱和质量测试形成持续运营的企业知识资产。",
        "/solutions/knowledge-assets",
      ],
    ],
  ],
  [
    "model-deployment",
    [
      [
        "模型适配、训练与效果验证",
        "围绕实际业务任务完成模型选择、数据准备、训练评估和持续优化。",
        "/solutions/model-evaluation",
      ],
      [
        "企业内部智能助手",
        "组合企业知识、业务数据、模型和工具，为员工或岗位提供统一智能服务入口。",
        "/solutions/enterprise-assistant",
      ],
    ],
  ],
  [
    "knowledge-service",
    [
      [
        "文档理解、知识检索与智能审核",
        "组合文档解析、知识检索、智能体和流程能力，辅助完成复杂文档处理与审核。",
        "/solutions/document-intelligence",
      ],
      [
        "企业知识库建设与持续运营",
        "围绕文档、分片、QA、术语、知识图谱和质量测试形成持续运营的企业知识资产。",
        "/solutions/knowledge-assets",
      ],
      [
        "企业内部智能助手",
        "组合企业知识、业务数据、模型和工具，为员工或岗位提供统一智能服务入口。",
        "/solutions/enterprise-assistant",
      ],
    ],
  ],
  [
    "document-intelligence",
    [
      [
        "企业知识问答与知识服务",
        "将企业文档、制度、产品资料和专业知识转化为可检索、可问答的智能知识服务。",
        "/solutions/knowledge-service",
      ],
      [
        "非结构化数据处理与业务利用",
        "将文档等非结构化内容解析为结构化数据，衔接查询、分析、数据问答和业务流程。",
        "/solutions/unstructured-data",
      ],
      [
        "业务流程自动化与智能协同",
        "通过可视化流程将模型、知识、数据、工具和业务逻辑组合为可执行的智能工作流。",
        "/solutions/process-automation",
      ],
    ],
  ],
  [
    "data-insight",
    [
      [
        "非结构化数据处理与业务利用",
        "将文档等非结构化内容解析为结构化数据，衔接查询、分析、数据问答和业务流程。",
        "/solutions/unstructured-data",
      ],
      [
        "企业内部智能助手",
        "组合企业知识、业务数据、模型和工具，为员工或岗位提供统一智能服务入口。",
        "/solutions/enterprise-assistant",
      ],
      [
        "业务流程自动化与智能协同",
        "通过可视化流程将模型、知识、数据、工具和业务逻辑组合为可执行的智能工作流。",
        "/solutions/process-automation",
      ],
    ],
  ],
  [
    "knowledge-assets",
    [
      [
        "企业知识问答与知识服务",
        "将企业文档、制度、产品资料和专业知识转化为可检索、可问答的智能知识服务。",
        "/solutions/knowledge-service",
      ],
      [
        "文档理解、知识检索与智能审核",
        "组合文档解析、知识检索、智能体和流程能力，辅助完成复杂文档处理与审核。",
        "/solutions/document-intelligence",
      ],
      [
        "非结构化数据处理与业务利用",
        "将文档等非结构化内容解析为结构化数据，衔接查询、分析、数据问答和业务流程。",
        "/solutions/unstructured-data",
      ],
    ],
  ],
  [
    "unstructured-data",
    [
      [
        "数据问答、分析与业务洞察",
        "连接企业业务数据，通过自然语言问题生成查询并返回可理解的数据结果与分析线索。",
        "/solutions/data-insight",
      ],
      [
        "文档理解、知识检索与智能审核",
        "组合文档解析、知识检索、智能体和流程能力，辅助完成复杂文档处理与审核。",
        "/solutions/document-intelligence",
      ],
      [
        "企业知识库建设与持续运营",
        "围绕文档、分片、QA、术语、知识图谱和质量测试形成持续运营的企业知识资产。",
        "/solutions/knowledge-assets",
      ],
    ],
  ],
  [
    "process-automation",
    [
      [
        "文档理解、知识检索与智能审核",
        "组合文档解析、知识检索、智能体和流程能力，辅助完成复杂文档处理与审核。",
        "/solutions/document-intelligence",
      ],
      [
        "企业内部智能助手",
        "组合企业知识、业务数据、模型和工具，为员工或岗位提供统一智能服务入口。",
        "/solutions/enterprise-assistant",
      ],
      [
        "多智能体协同与复杂任务处理",
        "组合多个专业智能体及流程能力，协同完成单一智能体难以覆盖的复杂任务。",
        "/solutions/multi-agent",
      ],
    ],
  ],
  [
    "enterprise-assistant",
    [
      [
        "企业知识问答与知识服务",
        "将企业文档、制度、产品资料和专业知识转化为可检索、可问答的智能知识服务。",
        "/solutions/knowledge-service",
      ],
      [
        "数据问答、分析与业务洞察",
        "连接企业业务数据，通过自然语言问题生成查询并返回可理解的数据结果与分析线索。",
        "/solutions/data-insight",
      ],
      [
        "业务流程自动化与智能协同",
        "通过可视化流程将模型、知识、数据、工具和业务逻辑组合为可执行的智能工作流。",
        "/solutions/process-automation",
      ],
    ],
  ],
  [
    "multi-agent",
    [
      [
        "业务流程自动化与智能协同",
        "通过可视化流程将模型、知识、数据、工具和业务逻辑组合为可执行的智能工作流。",
        "/solutions/process-automation",
      ],
      [
        "企业内部智能助手",
        "组合企业知识、业务数据、模型和工具，为员工或岗位提供统一智能服务入口。",
        "/solutions/enterprise-assistant",
      ],
      [
        "数据问答、分析与业务洞察",
        "连接企业业务数据，通过自然语言问题生成查询并返回可理解的数据结果与分析线索。",
        "/solutions/data-insight",
      ],
    ],
  ],
  [
    "video-intelligence",
    [
      [
        "企业内部智能助手",
        "组合企业知识、业务数据、模型和工具，为员工或岗位提供统一智能服务入口。",
        "/solutions/enterprise-assistant",
      ],
      [
        "多智能体协同与复杂任务处理",
        "组合多个专业智能体及流程能力，协同完成单一智能体难以覆盖的复杂任务。",
        "/solutions/multi-agent",
      ],
    ],
  ],
] as const;

const industryRelatedExpected = [
  [
    "government-knowledge",
    [
      ["政务数据问答与分析", "/solutions/government-data"],
      ["政策公文理解与辅助审核", "/solutions/government-document"],
      ["政务事项流程自动化与协同", "/solutions/government-process"],
    ],
  ],
  [
    "government-data",
    [
      ["政务知识问答与政策服务", "/solutions/government-knowledge"],
      ["政策公文理解与辅助审核", "/solutions/government-document"],
      ["政务事项流程自动化与协同", "/solutions/government-process"],
    ],
  ],
  [
    "government-document",
    [
      ["政务知识问答与政策服务", "/solutions/government-knowledge"],
      ["政务数据问答与分析", "/solutions/government-data"],
      ["政务事项流程自动化与协同", "/solutions/government-process"],
    ],
  ],
  [
    "government-process",
    [
      ["政务知识问答与政策服务", "/solutions/government-knowledge"],
      ["政务数据问答与分析", "/solutions/government-data"],
      ["政策公文理解与辅助审核", "/solutions/government-document"],
    ],
  ],
  [
    "finance-knowledge",
    [
      ["经营数据问答与业务分析", "/solutions/finance-data"],
      ["金融文档理解与合规辅助审核", "/solutions/finance-document"],
      ["金融客户服务智能助手", "/solutions/finance-assistant"],
    ],
  ],
  [
    "finance-data",
    [
      ["金融制度与产品知识服务", "/solutions/finance-knowledge"],
      ["金融文档理解与合规辅助审核", "/solutions/finance-document"],
      ["金融客户服务智能助手", "/solutions/finance-assistant"],
    ],
  ],
  [
    "finance-document",
    [
      ["金融制度与产品知识服务", "/solutions/finance-knowledge"],
      ["经营数据问答与业务分析", "/solutions/finance-data"],
      ["金融客户服务智能助手", "/solutions/finance-assistant"],
    ],
  ],
  [
    "finance-assistant",
    [
      ["金融制度与产品知识服务", "/solutions/finance-knowledge"],
      ["经营数据问答与业务分析", "/solutions/finance-data"],
      ["金融文档理解与合规辅助审核", "/solutions/finance-document"],
    ],
  ],
  [
    "healthcare-knowledge",
    [
      ["医院运营数据问答与分析", "/solutions/healthcare-data"],
      ["医疗文档信息提取与辅助审核", "/solutions/healthcare-document"],
      ["医院行政流程自动化与协同", "/solutions/healthcare-process"],
    ],
  ],
  [
    "healthcare-data",
    [
      ["医院知识与制度问答", "/solutions/healthcare-knowledge"],
      ["医疗文档信息提取与辅助审核", "/solutions/healthcare-document"],
      ["医院行政流程自动化与协同", "/solutions/healthcare-process"],
    ],
  ],
  [
    "healthcare-document",
    [
      ["医院知识与制度问答", "/solutions/healthcare-knowledge"],
      ["医院运营数据问答与分析", "/solutions/healthcare-data"],
      ["医院行政流程自动化与协同", "/solutions/healthcare-process"],
    ],
  ],
  [
    "healthcare-process",
    [
      ["医院知识与制度问答", "/solutions/healthcare-knowledge"],
      ["医院运营数据问答与分析", "/solutions/healthcare-data"],
      ["医疗文档信息提取与辅助审核", "/solutions/healthcare-document"],
    ],
  ],
  [
    "enterprise-knowledge",
    [
      ["企业经营数据分析与洞察", "/solutions/enterprise-data"],
      ["企业文档理解与智能审核", "/solutions/enterprise-document"],
      ["企业流程自动化与智能协同", "/solutions/enterprise-process"],
    ],
  ],
  [
    "enterprise-data",
    [
      ["企业内部知识助手", "/solutions/enterprise-knowledge"],
      ["企业文档理解与智能审核", "/solutions/enterprise-document"],
      ["企业流程自动化与智能协同", "/solutions/enterprise-process"],
    ],
  ],
  [
    "enterprise-document",
    [
      ["企业内部知识助手", "/solutions/enterprise-knowledge"],
      ["企业经营数据分析与洞察", "/solutions/enterprise-data"],
      ["企业流程自动化与智能协同", "/solutions/enterprise-process"],
    ],
  ],
  [
    "enterprise-process",
    [
      ["企业内部知识助手", "/solutions/enterprise-knowledge"],
      ["企业经营数据分析与洞察", "/solutions/enterprise-data"],
      ["企业文档理解与智能审核", "/solutions/enterprise-document"],
    ],
  ],
  [
    "enterprise-multi-agent",
    [
      ["企业内部知识助手", "/solutions/enterprise-knowledge"],
      ["企业经营数据分析与洞察", "/solutions/enterprise-data"],
      ["企业文档理解与智能审核", "/solutions/enterprise-document"],
    ],
  ],
] as const;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SolutionDetailPage", () => {
  it("renders the complete common solution structure", async () => {
    render(
      await Page({ params: Promise.resolve({ slug: "knowledge-service" }) }),
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "企业知识问答与知识服务",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "需要建设员工知识助手、客户服务知识入口或专业知识服务的组织。",
      ),
    ).toBeVisible();
    expect(document.querySelectorAll(".solution-detail-tag")).toHaveLength(4);
    expect(screen.getAllByTestId("solution-problem")).toHaveLength(3);
    expect(screen.getAllByTestId("solution-component")).toHaveLength(6);
    expect(screen.getAllByTestId("solution-flow-step")).toHaveLength(7);
    expect(screen.getAllByTestId("solution-product")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "咨询当前方案" })).toHaveAttribute(
      "href",
      "/contact?topic=企业知识问答与知识服务咨询",
    );
    expect(screen.getAllByRole("link", { name: "申请体验" })).toHaveLength(2);
    for (const link of screen.getAllByRole("link", { name: "申请体验" })) {
      expect(link).toHaveAttribute("href", "/trial");
    }
    expect(screen.getByText("案例内容待授权补充")).toBeVisible();
    expect(
      screen.getByText(
        "正式官网没有可公开案例时隐藏案例内容，不虚构客户名称、成果和数字。",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "返回解决方案" })).toHaveAttribute(
      "href",
      "/solutions?view=scenarios&category=knowledge#solution-scenarios-directory",
    );
  });

  it("restores the exact common problem, architecture, and current-flow panel", async () => {
    render(
      await Page({ params: Promise.resolve({ slug: "knowledge-service" }) }),
    );

    const problems = screen
      .getByRole("heading", {
        level: 2,
        name: "先明确问题、影响与建设目标",
      })
      .closest("section");
    expect(problems).not.toBeNull();
    const problemCards = within(problems!).getAllByRole("article");
    expect(problemCards).toHaveLength(3);
    expect(
      problemCards.map(
        (card) =>
          within(card).getByText(/^(当前问题|业务影响|建设目标)$/).textContent,
      ),
    ).toStrictEqual(["当前问题", "业务影响", "建设目标"]);
    for (const problem of [
      "知识分散且更新频繁，查找路径长",
      "传统关键词检索难以理解自然语言问题",
      "回答质量、知识来源和持续维护缺少闭环",
    ]) {
      expect(
        within(problemCards[0]).getByText(problem, { exact: true }),
      ).toBeVisible();
    }

    const architecture = within(screen.getByTestId("solution-architecture"));
    expect(
      architecture.getAllByRole("link").map((link) => link.textContent),
    ).toStrictEqual([
      "业务使用入口",
      "智能体或应用服务",
      "知识、数据、流程与工具",
      "模型与算力资源",
    ]);
    expect(
      architecture.getByText("安全中心横向贯穿", { exact: true }),
    ).toBeVisible();

    const currentFlow = within(screen.getByTestId("solution-flow-current"));
    expect(currentFlow.getByText("当前步骤", { exact: true })).toBeVisible();
    expect(
      currentFlow.getByText("企业资料接入", { exact: true }),
    ).toBeVisible();
    expect(currentFlow.getByText("步骤说明", { exact: true })).toBeVisible();
    expect(
      currentFlow.getByText("说明该步骤的参与角色、输入、处理逻辑和输出。", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      currentFlow.getByText("企业资料接入对应产品界面或效果素材槽位", {
        exact: true,
      }),
    ).toBeVisible();
  });

  it("renders the complete industry solution structure", async () => {
    render(await Page({ params: Promise.resolve({ slug: "finance-data" }) }));

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "经营数据问答与业务分析",
      }),
    ).toBeVisible();
    expect(screen.getByText("经营管理、产品运营与数据分析团队")).toBeVisible();
    expect(screen.getAllByTestId("solution-problem")).toHaveLength(1);
    expect(screen.getAllByTestId("solution-component")).toHaveLength(4);
    expect(screen.getAllByTestId("solution-flow-step")).toHaveLength(4);
    expect(screen.getAllByTestId("solution-product")).toHaveLength(3);
    expect(screen.getByText("查询结果与分析说明")).toBeVisible();
    expect(
      screen.getByText(
        "页面不虚构客户痛点、量化结果或行业判断；医疗场景只用于信息处理、知识服务、运营及行政辅助。",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "返回解决方案" })).toHaveAttribute(
      "href",
      "/solutions?view=industries&industry=finance#industry-solutions-list",
    );
  });

  it.each(commonRelatedExpected)(
    "renders the exact related common solution cards for %s",
    async (slug, expected) => {
      render(await Page({ params: Promise.resolve({ slug }) }));

      const related = within(screen.getByTestId("solution-related-list"));
      const cards = related.getAllByRole("article");
      expect(cards).toHaveLength(expected.length);
      expected.forEach(([title, summary, href], index) => {
        expect(
          within(cards[index]).getByRole("heading", {
            level: 3,
            name: title,
          }),
        ).toBeVisible();
        expect(
          within(cards[index]).getByText(summary, { exact: true }),
        ).toBeVisible();
        expect(
          within(cards[index]).getByRole("link", {
            name: "查看相关方案 →",
          }),
        ).toHaveAttribute("href", href);
      });
    },
  );

  it.each(industryRelatedExpected)(
    "renders the exact related industry scenario links for %s",
    async (slug, expected) => {
      render(await Page({ params: Promise.resolve({ slug }) }));

      const related = within(screen.getByTestId("solution-related-list"));
      const cards = related.getAllByRole("article");
      expect(cards).toHaveLength(expected.length);
      expected.forEach(([title, href], index) => {
        expect(
          within(cards[index]).getByRole("heading", {
            level: 3,
            name: title,
          }),
        ).toBeVisible();
        expect(
          within(cards[index]).getByRole("link", {
            name: "查看场景方案 →",
          }),
        ).toHaveAttribute("href", href);
      });
    },
  );

  it("restores the exact common and industry closing contracts", async () => {
    render(
      await Page({ params: Promise.resolve({ slug: "knowledge-service" }) }),
    );

    const commonClosing = screen
      .getByText("06｜实践案例、相关方案与行动收口", { exact: true })
      .closest("section");
    expect(commonClosing).not.toBeNull();
    expect(
      within(commonClosing!).getByRole("heading", {
        level: 2,
        name: "相关实践案例",
      }),
    ).toBeVisible();
    expect(
      within(commonClosing!).getByRole("heading", {
        level: 3,
        name: "相关解决方案",
      }),
    ).toBeVisible();
    expect(
      within(commonClosing!).getAllByRole("link", {
        name: "查看相关方案 →",
      }),
    ).toHaveLength(3);

    cleanup();
    render(await Page({ params: Promise.resolve({ slug: "finance-data" }) }));

    const industryClosing = screen
      .getByText("05｜案例、相关场景与下一步", { exact: true })
      .closest("section");
    expect(industryClosing).not.toBeNull();
    expect(
      within(industryClosing!).getByRole("heading", {
        level: 2,
        name: "相关行业实践案例",
      }),
    ).toBeVisible();
    expect(
      within(industryClosing!).getByRole("heading", {
        level: 2,
        name: "相关行业场景",
      }),
    ).toBeVisible();
    expect(
      within(industryClosing!).getAllByRole("link", {
        name: "查看场景方案 →",
      }),
    ).toHaveLength(3);
  });

  it.each([
    [
      "knowledge-service",
      [
        ["查看案例详情", "/solutions/case-pending-enterprise-knowledge"],
        [
          "查看全部相关案例",
          "/solutions?view=cases&mode=all#practice-cases-hero",
        ],
      ],
    ],
    [
      "finance-data",
      [["查看相关案例 →", "/solutions/case-pending-enterprise-knowledge"]],
    ],
  ] as const)(
    "restores the exact prototype case-card actions for %s",
    async (slug, expected) => {
      render(await Page({ params: Promise.resolve({ slug }) }));

      const closing = screen
        .getByText(
          slug === "knowledge-service"
            ? "06｜实践案例、相关方案与行动收口"
            : "05｜案例、相关场景与下一步",
          { exact: true },
        )
        .closest("section");
      expect(closing).not.toBeNull();
      const card = closing!.querySelector(".solution-detail-case");
      expect(card).not.toBeNull();
      expect(
        within(card as HTMLElement)
          .getAllByRole("link")
          .map((link) => [link.textContent, link.getAttribute("href")]),
      ).toStrictEqual(expected);
    },
  );

  it("renders one H1 and the exact content status for the pending case", async () => {
    render(
      await Page({
        params: Promise.resolve({ slug: "case-pending-enterprise-knowledge" }),
        searchParams: Promise.resolve({ mode: "scenario" }),
      }),
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "案例详情结构占位（待授权案例）",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent ===
            "内容状态：低保真评审占位，不代表真实公开项目。客户名称、项目范围、图片和成果数据必须在获得公开授权后替换。",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "当前案例未获公开授权，不代表真实公开项目；客户、建设内容与成果均须在获得授权后替换。",
        { exact: true },
      ),
    ).toBeVisible();
    for (const product of [
      "企业知识库",
      "智能体中心",
      "行业应用中心",
      "安全中心",
    ]) {
      expect(screen.getByText(product, { exact: true })).toBeVisible();
    }
    for (const outcome of [
      "企业知识服务能力结构占位",
      "智能体应用建设成果占位",
      "实际业务成果待授权补充",
    ]) {
      expect(screen.getByText(outcome, { exact: true })).toBeVisible();
    }
    expect(
      screen.getByText("没有统计口径和授权前不展示百分比、金额或排名。"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "返回实践案例" })).toHaveAttribute(
      "href",
      "/solutions?view=cases&mode=scenario#practice-cases-list",
    );
  });

  it("restores the exact pending-case hero copy and positions", async () => {
    render(
      await Page({
        params: Promise.resolve({ slug: "case-pending-enterprise-knowledge" }),
        searchParams: Promise.resolve({ mode: "scenario" }),
      }),
    );

    const hero = document.querySelector("main > .solution-detail-hero");
    expect(hero).not.toBeNull();
    const heroCopy = hero!.querySelector(
      ".solution-detail-hero__layout > div:first-child",
    );
    expect(heroCopy).not.toBeNull();
    expect(
      within(heroCopy as HTMLElement).getByText("实践案例｜企业智能化", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      within(heroCopy as HTMLElement).getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent === "客户：某企业客户（脱敏占位）",
      ),
    ).toBeVisible();
    const actions = heroCopy!.querySelector(".solution-detail-actions");
    expect(actions).not.toBeNull();
    expect(
      within(actions as HTMLElement)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toStrictEqual([
      [
        "咨询类似项目",
        "/contact?topic=案例详情结构占位（待授权案例）｜类似项目咨询",
      ],
      ["查看关联解决方案", "#case-related"],
      [
        "返回案例列表",
        "/solutions?view=cases&mode=scenario#practice-cases-list",
      ],
    ]);
    const status = within(heroCopy as HTMLElement).getByText(
      (_, element) =>
        element?.tagName === "P" &&
        element.textContent ===
          "内容状态：低保真评审占位，不代表真实公开项目。客户名称、项目范围、图片和成果数据必须在获得公开授权后替换。",
    );
    expect(status).toBeVisible();
    expect(actions!.nextElementSibling).toBe(status);

    const visual = hero!.querySelector(".solution-detail-visual");
    expect(visual?.textContent).toBe(
      "案例详情结构占位（待授权案例）案例主视觉 / 项目现场 / 产品效果素材槽位",
    );
  });

  it("restores the exact prototype case sections 02–05 and related solution cards", async () => {
    render(
      await Page({
        params: Promise.resolve({ slug: "case-pending-enterprise-knowledge" }),
      }),
    );

    expect(
      screen.getAllByText(/^0[2-5]｜/).map((eyebrow) => eyebrow.textContent),
    ).toStrictEqual([
      "02｜客户背景、业务挑战与建设目标",
      "03｜整体思路与实施过程",
      "04｜项目成果与素材展示",
      "05｜关联方案、相关案例与行动收口",
    ]);
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toStrictEqual([
      "为什么建设这个项目",
      "从业务问题到场景上线的完整建设思路",
      "用经授权的事实说明项目成果",
      "本案例为哪些解决方案提供实践证明",
      "希望建设类似项目？",
    ]);
    for (const copy of [
      "点击挑战卡片，定位并高亮后续相应解决措施；当前内容均为结构占位。",
      "围绕当前项目的业务目标，将企业知识与数据、模型和智能体能力组合为可使用的业务服务，并通过验证、上线和持续维护形成完整落地闭环。",
      "说明项目从梳理到上线的主要阶段，不展开客户内部排期、人员安排和敏感交付细节。",
      "页面只保留文字说明，不展示真实 IP 地址、数据库结构、接口地址、部署参数或内部项目资料。",
      "量化成果必须标明统计口径或时间范围；没有可靠数据时不使用百分比、金额、排名或客户评价。",
      "说明本案例与对应业务问题及通用方案的实际关联。",
      "说明本案例在对应行业场景中的实践证明关系。",
      "首期没有第二个已授权案例时不强行推荐；后续可按相同行业、业务场景或建设方式展示 2～3 个案例。",
      "咨询表单将带入当前案例名称、行业、业务场景和关联产品能力。",
    ]) {
      expect(screen.getByText(copy, { exact: true })).toBeVisible();
    }
    expect(
      screen.getByRole("heading", { level: 3, name: "核心建设内容" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 3, name: "实施过程" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 3, name: "项目素材与成果展示" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 3, name: "相关案例" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 3, name: "企业知识问答与知识服务" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 3, name: "企业内部知识助手" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "查看通用场景方案 →" }),
    ).toHaveAttribute("href", "/solutions/knowledge-service");
    expect(
      screen.getByRole("link", { name: "查看行业场景方案 →" }),
    ).toHaveAttribute("href", "/solutions/enterprise-knowledge");
  });

  it("renders the exact four prototype-visible case approach stages", async () => {
    render(
      await Page({
        params: Promise.resolve({ slug: "case-pending-enterprise-knowledge" }),
      }),
    );

    const expected = [
      ["需求与资料梳理", "明确业务问题、使用对象、知识资料和数据边界。"],
      ["方案设计与能力准备", "确定知识处理、模型、智能体及应用的组合方式。"],
      ["场景建设与验证", "完成知识处理、智能体配置、业务测试和效果修正。"],
      [
        "上线使用与持续优化",
        "在授权范围内发布使用，并根据反馈维护知识和场景效果。",
      ],
    ] as const;
    const stages = screen.getAllByTestId("case-approach-stage");
    expect(stages).toHaveLength(4);
    expected.forEach(([name, description], index) => {
      expect(
        within(stages[index]).getByText(name, { exact: true }),
      ).toBeVisible();
      expect(
        within(stages[index]).getByText(description, { exact: true }),
      ).toBeVisible();
    });
  });

  it.each([
    ["knowledge-service", "/contact?topic=企业知识问答与知识服务咨询"],
    ["finance-data", "/contact?topic=金融｜经营数据问答与业务分析咨询"],
    [
      "case-pending-enterprise-knowledge",
      "/contact?topic=案例详情结构占位（待授权案例）｜类似项目咨询",
    ],
  ] as const)(
    "uses the exact prototype CTA topic for %s",
    async (slug, href) => {
      render(await Page({ params: Promise.resolve({ slug }) }));

      expect(
        screen
          .getAllByRole("link")
          .filter((link) => link.getAttribute("href")?.startsWith("/contact"))
          .map((link) => link.getAttribute("href")),
      ).toStrictEqual([href, href]);
    },
  );

  it("generates all 32 detail pages as static params", () => {
    expect(generateStaticParams()).toStrictEqual(
      [
        "private-yuanqi",
        "cluster-planning",
        "compute-monitoring",
        "model-evaluation",
        "model-deployment",
        "knowledge-service",
        "document-intelligence",
        "data-insight",
        "knowledge-assets",
        "unstructured-data",
        "process-automation",
        "enterprise-assistant",
        "multi-agent",
        "video-intelligence",
        "government-knowledge",
        "government-data",
        "government-document",
        "government-process",
        "finance-knowledge",
        "finance-data",
        "finance-document",
        "finance-assistant",
        "healthcare-knowledge",
        "healthcare-data",
        "healthcare-document",
        "healthcare-process",
        "enterprise-knowledge",
        "enterprise-data",
        "enterprise-document",
        "enterprise-process",
        "enterprise-multi-agent",
        "case-pending-enterprise-knowledge",
      ].map((slug) => ({ slug })),
    );
  });

  it("renders exactly one H1 for every static solution detail page", async () => {
    for (const { slug } of generateStaticParams()) {
      cleanup();
      render(await Page({ params: Promise.resolve({ slug }) }));
      expect(screen.getAllByRole("heading", { level: 1 }), slug).toHaveLength(
        1,
      );
    }
  });

  it("generates metadata from the exact solution title and summary", async () => {
    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "process-automation" }),
      }),
    ).resolves.toEqual({
      title: "业务流程自动化与智能协同 · 华鲲解决方案",
      description:
        "通过可视化流程将模型、知识、数据、工具和业务逻辑组合为可执行的智能工作流。",
    });
  });

  it.each(["unknown-solution", "toString", "constructor", "__proto__"])(
    "returns not found for unregistered slug %s",
    async (slug) => {
      await expect(Page({ params: Promise.resolve({ slug }) })).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );
      expect(mocks.notFound).toHaveBeenCalledTimes(1);
    },
  );

  it("does not duplicate the shell-owned assistant", async () => {
    render(
      await Page({
        params: Promise.resolve({ slug: "government-knowledge" }),
      }),
    );

    expect(document.querySelector(".floating-assistant")).toBeNull();
  });
});
