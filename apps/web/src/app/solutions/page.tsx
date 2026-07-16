import type { Metadata } from "next";
import Link from "next/link";
import "./solutions.css";

export const metadata: Metadata = {
  title: "解决方案 · AI Agent Platform",
  description:
    "面向智能办公、政务导办、视觉检索、企业智能体开发与 AI 超融合私有部署的解决方案入口。",
};

const solutions = [
  {
    id: "office",
    group: "scenario",
    index: "01",
    eyebrow: "智能办公",
    title: "把高频工作交给可控的智能体",
    description:
      "覆盖智能写作、合同审核、投标辅助和智能会议，让办公成果可生成、可审核、可追踪。",
    points: ["智能写作与材料生成", "合同审查与风险提示", "投标辅助与会议纪要"],
    href: "/solutions/smart-office",
  },
  {
    id: "guidance",
    group: "scenario",
    index: "02",
    eyebrow: "智能导办",
    title: "让群众一次问清、一次办成",
    description:
      "围绕政策咨询、材料识别、表单填写与辅助审核，构建 24 小时在线的政务服务智能入口。",
    points: ["多轮意图引导", "材料信息智能提取", "规范驱动的辅助审核"],
    href: "/solutions/intelligent-guidance",
  },
  {
    id: "vision",
    group: "scenario",
    index: "03",
    eyebrow: "视觉检索",
    title: "从视频与图像中定位业务线索",
    description:
      "以视觉大模型和检索能力为基础，支持即时检索、持续布控与预警管理，让复杂场景分钟级生效。",
    points: ["自然语言检索", "多条件场景布控", "预警结果闭环管理"],
    href: "/solutions/visual-search",
  },
  {
    id: "agent",
    group: "platform",
    index: "04",
    eyebrow: "企业智能体开发",
    title: "从模型能力走向业务交付",
    description:
      "将模型、知识、工作流和算力连接为统一平台，帮助团队以低代码方式完成智能体构建、调优与发布。",
    points: ["企业级知识工程", "低代码工作流编排", "图形化训练与权限管控"],
    href: "/solutions/agent-development",
  },
  {
    id: "private",
    group: "platform",
    index: "05",
    eyebrow: "AI 超融合与私有部署",
    title: "在企业边界内构建 AI 能力",
    description:
      "以 TGHCI 为底座，统一承载计算、存储、网络与 AI 算力，为模型训练、推理和业务系统提供可控的私有化环境。",
    points: [
      "异构 CPU / GPU / NPU 调度",
      "计算存储网络安全虚拟化",
      "统一运维与弹性扩展",
    ],
    href: "/solutions/ai-infrastructure",
  },
] as const;

const solutionGroups = [
  {
    id: "scenario",
    label: "场景方案",
    description: "从明确的业务任务切入，让应用价值和交付边界可以被快速验证。",
  },
  {
    id: "platform",
    label: "平台方案",
    description: "围绕开发平台与算力底座，建立可持续扩展的企业 AI 能力。",
  },
] as const;

const deliveryPhases = [
  {
    index: "01",
    title: "咨询与规划",
    description:
      "从业务问题和现有环境出发，确认场景边界、数据条件、系统接口与算力需求。",
    items: ["场景需求梳理", "方案与部署设计", "试点范围确认"],
  },
  {
    index: "02",
    title: "实施与落地",
    description:
      "协同完成算力部署、模型适配、平台实施和智能体配置，形成可验证的业务闭环。",
    items: ["软硬件环境部署", "模型与知识调优", "业务系统集成"],
  },
  {
    index: "03",
    title: "运维与优化",
    description:
      "围绕运行状态、业务反馈和知识更新持续优化，保障方案在企业边界内稳定演进。",
    items: ["健康巡检与保障", "性能与效果调优", "培训与持续支持"],
  },
] as const;

export default function SolutionsPage() {
  return (
    <main className="solutions-page">
      <section className="solutions-hero">
        <div className="solutions-hero__grid" aria-hidden="true" />
        <div className="solutions-hero__content">
          <p className="solutions-kicker">SOLUTION CATALOG / 2026</p>
          <h1>从一个场景，开始构建企业 AI</h1>
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
            <h2 id="solutions-catalog-title">五类方案，覆盖从试点到规模化</h2>
          </div>
          <p>
            当前页面是方案入口和能力索引，具体交付范围、数据接入与硬件配置会在项目评估后确认。
          </p>
        </div>

        <div className="solutions-groups">
          {solutionGroups.map((group) => (
            <section
              className={`solutions-group solutions-group--${group.id}`}
              key={group.id}
            >
              <header className="solutions-group__heading">
                <h3>{group.label}</h3>
                <p>{group.description}</p>
              </header>
              <div className="solutions-grid">
                {solutions
                  .filter((solution) => solution.group === group.id)
                  .map((solution) => (
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
                      <Link
                        href={solution.href}
                        className="solution-card__link"
                      >
                        查看方案详情 <span aria-hidden="true">↗</span>
                      </Link>
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section
        className="solutions-delivery"
        aria-labelledby="solutions-delivery-title"
      >
        <div className="solutions-delivery__inner">
          <header className="solutions-delivery__heading">
            <p className="solutions-kicker">DELIVERY / SERVICE</p>
            <h2 id="solutions-delivery-title">从方案评估，到持续运营</h2>
            <p>
              以业务验证为起点，将咨询、部署、调优和服务组织为连续交付过程。
            </p>
          </header>
          <div className="solutions-delivery__grid">
            {deliveryPhases.map((phase) => (
              <article className="solutions-delivery-card" key={phase.index}>
                <span>{phase.index}</span>
                <h3>{phase.title}</h3>
                <p>{phase.description}</p>
                <ul>
                  {phase.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="solutions-cta">
        <div className="solutions-cta__inner">
          <div>
            <p className="solutions-kicker">NEXT STEP</p>
            <h2>从一个可验证的业务问题开始</h2>
          </div>
          <Link
            href="/assistant"
            className="solutions-button solutions-button--primary"
          >
            访问 AI 助理
          </Link>
        </div>
      </section>
    </main>
  );
}
