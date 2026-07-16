import { officeAgents } from "@/components/product-content";
import type { Metadata } from "next";
import Link from "next/link";
import "./office-agent.css";

export const metadata: Metadata = {
  title: "智能办公一体化解决方案 · 华鲲元启",
  description:
    "覆盖智能写作、合同审核、投标辅助与智能会议的企业级办公智能体应用套件。",
};

const solutionStats = [
  { value: "4", label: "办公核心场景" },
  { value: "私有化", label: "数据部署边界" },
  { value: "全流程", label: "从输入到交付" },
] as const;

const typicalConfigurations = [
  {
    label: "办公智能体套件",
    model: "HuaKun AT9508 G3",
    stack: "Qwen3.5-72B / 122B + 元启办公智能体",
    capability: "支持 8 个用户同时使用",
    includes: ["智能写作助手", "合同审核助手", "投标助手"],
  },
  {
    label: "智能会议方案",
    model: "HuaKun AT3500 G3（64G）",
    stack: "超融合 + 会控软件 + 大语言模型 + ASR / TTS",
    capability: "单机接入 100 路，并发录制 10 个会议",
    includes: ["线上线下会议", "自动转写纪要", "数据不出机房"],
  },
] as const;

export default function OfficeAgentPage() {
  return (
    <main className="office-solution">
      <section className="office-hero">
        <div className="office-hero__grid" aria-hidden="true" />
        <div className="office-shell office-hero__inner">
          <div className="office-hero__content">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="office-wordmark" src="/logo.png" alt="华鲲元启" />
            <p className="office-kicker">SMART OFFICE / INTEGRATED SOLUTION</p>
            <h1>把重复的工作交给 AI，聚焦更重要的工作</h1>
            <p className="office-hero__lead">
              以华鲲元启平台为统一底座，将写作、合同、投标和会议四类高频工作组合为可私有部署的企业办公智能体套件。
            </p>
            <div className="office-hero__actions">
              <Link
                href="#applications"
                className="office-button office-button--primary"
              >
                查看应用套件
              </Link>
              <Link
                href="/contact"
                className="office-button office-button--ghost"
              >
                咨询部署方案
              </Link>
            </div>
          </div>

          <div className="office-hero__visual" aria-label="智能办公应用套件">
            <div className="office-suite">
              <div className="office-suite__center">
                <span>华鲲元启</span>
                <strong>办公智能体</strong>
              </div>
              {officeAgents.map((agent, index) => (
                <div
                  className={`office-suite__item office-suite__item--${index + 1}`}
                  key={agent.code}
                >
                  <span>{agent.code}</span>
                  <strong>{agent.name}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="office-stat-rail" aria-label="方案特点">
        <div className="office-shell office-stat-rail__inner">
          {solutionStats.map((stat) => (
            <div key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="office-section" id="applications">
        <div className="office-shell">
          <header className="office-section__heading">
            <div>
              <p className="office-kicker">APPLICATION SUITE</p>
              <h2>四类核心办公应用</h2>
            </div>
            <p>
              每个应用都围绕真实交付物组织能力，让模型输出进入可审核、可修改、可复用的业务流程。
            </p>
          </header>

          <div className="office-agent-list">
            {officeAgents.map((agent, index) => (
              <article className="office-agent" key={agent.code}>
                <div className="office-agent__number">0{index + 1}</div>
                <div className="office-agent__content">
                  <div className="office-agent__title-row">
                    <div>
                      <p>{agent.code}</p>
                      <h3>{agent.name}</h3>
                    </div>
                    <span>{agent.model}</span>
                  </div>
                  <p className="office-agent__description">
                    {agent.description} {agent.detailDescription}
                  </p>
                  <div className="office-agent__columns">
                    <div>
                      <h4>核心能力</h4>
                      <ul>
                        {agent.capabilities.map((capability) => (
                          <li key={capability}>{capability}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4>业务亮点</h4>
                      <ul>
                        {agent.highlights.map((highlight) => (
                          <li key={highlight}>{highlight}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="office-section office-section--tinted">
        <div className="office-shell">
          <header className="office-section__heading office-section__heading--compact">
            <div>
              <p className="office-kicker">DELIVERY WORKFLOW</p>
              <h2>从业务输入到成果交付</h2>
            </div>
          </header>

          <div className="office-workflows">
            {officeAgents.map((agent) => (
              <article className="office-workflow" key={agent.code}>
                <h3>{agent.name}</h3>
                <ol>
                  {agent.workflow.map((item, index) => (
                    <li key={item.step}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{item.step}</strong>
                        <p>{item.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="office-section office-config-section">
        <div className="office-shell">
          <header className="office-section__heading">
            <div>
              <p className="office-kicker">REFERENCE CONFIGURATION</p>
              <h2>典型一体化配置</h2>
            </div>
            <p>
              以下为资料中的典型配置口径，最终硬件与并发能力以项目评估结果为准。
            </p>
          </header>

          <div className="office-config-grid">
            {typicalConfigurations.map((config) => (
              <article className="office-config" key={config.label}>
                <p>{config.label}</p>
                <h3>{config.model}</h3>
                <strong>{config.stack}</strong>
                <div className="office-config__capability">
                  {config.capability}
                </div>
                <ul>
                  {config.includes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="office-cta">
        <div className="office-shell office-cta__inner">
          <div>
            <p className="office-kicker">NEXT STEP</p>
            <h2>从一个高频办公任务开始验证</h2>
          </div>
          <div className="office-cta__actions">
            <Link
              href="/solutions"
              className="office-button office-button--ghost-light"
            >
              返回解决方案
            </Link>
            <Link
              href="/contact"
              className="office-button office-button--primary"
            >
              联系方案顾问
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
