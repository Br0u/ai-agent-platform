import type { Metadata } from "next";
import Link from "next/link";
import "./solutions.css";

export const metadata: Metadata = {
  title: "解决方案 · AI Agent Platform",
  description:
    "面向企业办公、知识问答、视觉检索、数据分析与私有化部署的 AI 解决方案入口。",
};

const solutions = [
  {
    id: "office",
    index: "01",
    eyebrow: "办公智能",
    title: "把高频工作交给可控的智能体",
    description:
      "从公文写作、合同审核到流程编排，连接企业知识与业务系统，减少重复操作和跨部门沟通成本。",
    points: ["公文与材料生成", "合同审查与风险提示", "流程自动化与协同"],
    href: "/product/office-agent",
  },
  {
    id: "knowledge",
    index: "02",
    eyebrow: "行业知识问答",
    title: "让企业知识变成可信的工作入口",
    description:
      "沉淀制度、手册、项目资料和行业知识，通过检索增强问答提供可追溯的答案与引用。",
    points: ["多源知识接入", "权限隔离与版本管理", "引用溯源与反馈闭环"],
    href: "/product/knowledge-base",
  },
  {
    id: "vision",
    index: "03",
    eyebrow: "视觉检索",
    title: "从视频与图像中定位业务线索",
    description:
      "以视觉大模型和检索能力为基础，支持场景理解、目标定位和事件回溯，先从可验证的业务场景开始。",
    points: ["视频内容检索", "目标与事件理解", "边缘部署适配"],
    href: "/product/video-agent",
  },
  {
    id: "agent",
    index: "04",
    eyebrow: "企业智能体开发",
    title: "从模型能力走向业务交付",
    description:
      "在统一的 Agent Studio 中组合模型、工具、知识库和工作流，建立可测试、可观测、可运营的交付链路。",
    points: ["Agent Studio", "Workflow 编排", "运行时监控与审计"],
    href: "/product/agent-studio",
  },
  {
    id: "data",
    index: "05",
    eyebrow: "数据分析与决策",
    title: "让数据回答业务问题",
    description:
      "将结构化数据、指标口径和自然语言分析连接起来，帮助团队更快完成查询、解释和决策准备。",
    points: ["自然语言取数", "指标口径管理", "分析结果可视化"],
    href: "/product/data-agent",
  },
  {
    id: "private",
    index: "06",
    eyebrow: "国产化私有部署",
    title: "在企业边界内构建 AI 能力",
    description:
      "围绕数据不出域、权限可控和环境可运维的要求，支持企业自建数据库、容器化部署和硬件适配。",
    points: ["Docker / Compose 部署", "国产算力适配", "权限、审计与运维"],
    href: "/docs/deployment",
  },
] as const;

export default function SolutionsPage() {
  return (
    <main className="solutions-page">
      <section className="solutions-hero">
        <div className="solutions-hero__grid" aria-hidden="true" />
        <div className="solutions-hero__content">
          <p className="solutions-kicker">SOLUTION CATALOG / 2026</p>
          <h1>从一个场景，开始构建企业 AI。</h1>
          <p className="solutions-hero__lead">
            用可组合的模型、知识、工作流和运行时，把 AI 能力落到真实业务流程中。
          </p>
          <div className="solutions-hero__actions">
            <Link
              href="#office"
              className="solutions-button solutions-button--primary"
            >
              浏览方案
            </Link>
            <Link
              href="/contact"
              className="solutions-button solutions-button--ghost"
            >
              联系方案顾问
            </Link>
          </div>
        </div>
        <div className="solutions-hero__stamp" aria-hidden="true">
          <span>AI</span>
          <small>
            BUSINESS
            <br />
            READY
          </small>
        </div>
      </section>

      <section
        className="solutions-catalog"
        aria-labelledby="solutions-catalog-title"
      >
        <div className="solutions-section-heading">
          <div>
            <p className="solutions-kicker">USE CASES / PLATFORM</p>
            <h2 id="solutions-catalog-title">六类方案，覆盖从试点到规模化。</h2>
          </div>
          <p>
            当前页面是方案入口和能力索引，具体交付范围、数据接入与硬件配置会在项目评估后确认。
          </p>
        </div>

        <div className="solutions-grid">
          {solutions.map((solution) => (
            <article
              className="solution-card"
              id={solution.id}
              key={solution.id}
            >
              <div className="solution-card__topline">
                <span>{solution.index}</span>
                <span>{solution.eyebrow}</span>
              </div>
              <h3>{solution.title}</h3>
              <p>{solution.description}</p>
              <ul>
                {solution.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <Link href={solution.href} className="solution-card__link">
                查看相关能力 <span aria-hidden="true">↗</span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="solutions-cta">
        <div>
          <p className="solutions-kicker">NEXT STEP</p>
          <h2>从一个可验证的业务问题开始。</h2>
        </div>
        <Link
          href="/assistant"
          className="solutions-button solutions-button--primary"
        >
          访问 AI 助理
        </Link>
      </section>
    </main>
  );
}
