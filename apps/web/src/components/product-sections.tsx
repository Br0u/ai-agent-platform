/**
 * 产品介绍页各区块 React 组件
 * 聚焦企业用户认知，无冗余营销内容，极简白灰色调
 */
import Link from "next/link";
import {
  coreModules,
  customerValues,
  fullStackArchitecture,
  industrySolutions,
  officeAgents,
  productCapabilities,
  supportedModels,
} from "./product-content";
import "./product.css";

/* ========== S1: Hero — 产品定位 ========== */
export function ProductHero() {
  return (
    <section className="product-section product-hero" id="overview">
      <div className="product-frame product-hero__grid">
        <div className="product-hero__copy">
          <p className="product-hero__kicker">
            ENTERPRISE AI DEVELOPMENT PLATFORM
          </p>
          <h1 className="product-hero__title">
            华鲲元启
            <br />
            AI开发赋能平台
          </h1>
          <p className="product-hero__tagline">
            TGDataXAI <span className="product-hero__brand">BY 华鲲振宇</span>
          </p>
          <p className="product-hero__summary">
            以异构算力智能调度为底座，把模型仓库、知识工程、流程编排、训练、推理与评估连接为一套企业级开发体系。面向企业私有化场景，让智能体开发像搭积木一样简单。
          </p>
          <div className="product-hero__actions">
            <Link
              className="product-action product-action--primary"
              href="/docs"
            >
              阅读文档
            </Link>
            <Link
              className="product-action product-action--outline"
              href="/contact"
            >
              联系商务
            </Link>
          </div>
        </div>

        <div className="product-hero__stats">
          <div className="product-hero__stat-card">
            <span className="product-hero__stat-value">6</span>
            <span className="product-hero__stat-label">核心功能模块</span>
          </div>
          <div className="product-hero__stat-card">
            <span className="product-hero__stat-value">4</span>
            <span className="product-hero__stat-label">办公智能体应用</span>
          </div>
          <div className="product-hero__stat-card">
            <span className="product-hero__stat-value">4</span>
            <span className="product-hero__stat-label">平台技术架构</span>
          </div>
          <div className="product-hero__stat-card">
            <span className="product-hero__stat-value">6+</span>
            <span className="product-hero__stat-label">行业应用场景</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ========== S2: 核心能力条 ========== */
export function ProductCapabilityRail() {
  return (
    <section className="product-capability-strip" aria-label="平台核心能力">
      <div className="product-frame product-capability-rail">
        {productCapabilities.map((capability, index) => (
          <div className="product-capability" key={capability}>
            <span className="product-capability__num">
              {String(index + 1).padStart(2, "0")}
            </span>
            <strong className="product-capability__text">{capability}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ========== S3: 纯 CSS 华鲲振宇AI全栈解决方案全景图 ========== */
export function ProductArchitecture() {
  const {
    apps,
    aiDev,
    skills,
    coding,
    modelEngineering,
    modelManagement,
    computeIntegration,
    hardware,
  } = fullStackArchitecture;

  return (
    <section className="product-section" id="architecture">
      <div className="product-frame">
        <header className="product-section-head text-center">
          <h2 className="product-section-title">
            华鲲振宇AI全栈解决方案全景图
          </h2>
        </header>

        {/* CSS 架构大图容器 */}
        <div className="hk-arch-diagram">
          {/* L1: 智能应用广场 */}
          <div className="hk-arch-layer hk-arch-apps">
            <div className="hk-arch-box hk-arch-box--accent">
              <strong>{apps.title}</strong>
            </div>
            {apps.items.map((item) => (
              <div key={item} className="hk-arch-box">
                {item}
              </div>
            ))}
          </div>

          {/* L2: 开发中心层 */}
          <div className="hk-arch-layer hk-arch-devcenter">
            {/* 左侧：元启AI开发平台 */}
            <div className="hk-arch-dev-main">
              <div className="hk-arch-dev-main__brand">
                <strong>{aiDev.platform.split(" · ")[0]}</strong>
                <span>{aiDev.platform.split(" · ")[1]}</span>
              </div>
              <div className="hk-arch-dev-main__content">
                <div className="hk-arch-dev-title">{aiDev.title}</div>
                <div className="hk-arch-dev-grid">
                  {aiDev.categories.map((cat) => (
                    <div key={cat.name} className="hk-arch-dev-col">
                      <div className="hk-arch-box-title">{cat.name}</div>
                      {cat.items.map((i) => (
                        <div key={i} className="hk-arch-box-sm">
                          {i}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 右侧：技能与编程中心 */}
            <div className="hk-arch-dev-side">
              {/* 技能开发中心 */}
              <div className="hk-arch-dev-side__block">
                <div className="hk-arch-dev-title">{skills.title}</div>
                <div className="hk-arch-dev-side-grid">
                  {skills.items.map((i) => (
                    <div key={i} className="hk-arch-box-sm">
                      {i}
                    </div>
                  ))}
                </div>
              </div>
              {/* 智能编程中心 */}
              <div className="hk-arch-dev-side__block">
                <div className="hk-arch-dev-title">{coding.title}</div>
                <div className="hk-arch-dev-side-grid">
                  {coding.items.map((i) => (
                    <div key={i} className="hk-arch-box-sm">
                      {i}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* L3: 模型工程中心 */}
          <div className="hk-arch-layer hk-arch-model-eng">
            <div className="hk-arch-dev-title">{modelEngineering.title}</div>
            <div className="hk-arch-model-eng-grid">
              {modelEngineering.items.map((i) => (
                <div key={i} className="hk-arch-box-sm">
                  {i}
                </div>
              ))}
            </div>
          </div>

          {/* L4: 模型管理平台 */}
          <div className="hk-arch-layer hk-arch-model-mgt">
            <div className="hk-arch-layer-title">{modelManagement.title}</div>
            <div className="hk-arch-model-mgt-grid">
              {modelManagement.models.map((m) => (
                <div key={m.name} className="hk-arch-model-item">
                  <span className={`hk-arch-logo ${m.logo}`}></span>
                  <span className="hk-arch-model-name">{m.name}</span>
                  <span className="hk-arch-model-desc">{m.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* L5: 算力融合平台 */}
          <div className="hk-arch-layer hk-arch-compute">
            <div className="hk-arch-layer-title">
              {computeIntegration.title}
            </div>
            <div className="hk-arch-compute-grid">
              {computeIntegration.items.map((i) => (
                <div key={i} className="hk-arch-box-fill">
                  {i}
                </div>
              ))}
            </div>
          </div>

          {/* L6: 算力硬件平台 */}
          <div className="hk-arch-layer hk-arch-hardware">
            <div className="hk-arch-layer-title">{hardware.title}</div>
            <div className="hk-arch-hardware-grid">
              {hardware.items.map((h) => (
                <div key={h.name} className="hk-arch-hw-box">
                  <div className="hk-arch-hw-icon"></div>
                  <strong>{h.name}</strong>
                  <span>{h.spec}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ========== S4: 核心功能模块 ========== */
export function ProductModules() {
  return (
    <section className="product-section bg-gray" id="modules">
      <div className="product-frame">
        <header className="product-section-head text-center">
          <p className="product-kicker">Core Modules</p>
          <h2 className="product-section-title">核心功能模块</h2>
        </header>
        <div className="product-modules-grid">
          {coreModules.map((mod) => (
            <article className="product-module-card" key={mod.code}>
              <div className="product-module-card__head">
                <span className="product-module-card__code">{mod.code}</span>
                <span className="product-module-card__name">{mod.name}</span>
              </div>
              <h3 className="product-module-card__title">{mod.title}</h3>
              <p className="product-module-card__desc">{mod.description}</p>
              <div className="product-module-card__caps">
                {mod.capabilities.map((cap) => (
                  <span className="product-module-card__cap" key={cap}>
                    {cap}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========== S5: 办公智能体应用 ========== */
export function OfficeAgents() {
  return (
    <section className="product-section" id="agents">
      <div className="product-frame">
        <header className="product-section-head text-center">
          <p className="product-kicker">Office Agents</p>
          <h2 className="product-section-title">办公智能体应用</h2>
        </header>

        <div className="product-agents-grid">
          {officeAgents.map((agent) => (
            <article className="product-agent-card" key={agent.code}>
              <div className="product-agent-card__header">
                <h3>{agent.name}</h3>
                <span className="product-agent-card__model">{agent.model}</span>
              </div>
              <p className="product-agent-card__desc">{agent.description}</p>

              <div className="product-agent-card__caps">
                <strong>核心能力</strong>
                <ul>
                  {agent.capabilities.map((cap) => (
                    <li key={cap}>{cap}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========== S6: 适配模型 ========== */
export function SupportedModelsSection() {
  return (
    <section className="product-section bg-gray" id="models">
      <div className="product-frame">
        <header className="product-section-head text-center">
          <p className="product-kicker">Supported Models</p>
          <h2 className="product-section-title">全面适配主流大模型</h2>
        </header>
        <div className="product-models-wrap">
          {supportedModels.map((group) => (
            <div className="product-model-group" key={group.category}>
              <h3 className="product-model-group__title">{group.category}</h3>
              <div className="product-model-group__list">
                {group.models.map((model) => (
                  <span className="product-model-tag" key={model}>
                    {model}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========== S7: 行业应用场景 ========== */
export function IndustrySolutions() {
  return (
    <section className="product-section" id="industries">
      <div className="product-frame">
        <header className="product-section-head text-center">
          <p className="product-kicker">Industry Scenarios</p>
          <h2 className="product-section-title">行业应用场景</h2>
        </header>
        <div className="product-industry-grid">
          {industrySolutions.map((solution) => (
            <article className="product-industry-card" key={solution.code}>
              <div className="product-industry-card__icon">{solution.icon}</div>
              <h3 className="product-industry-card__title">{solution.title}</h3>
              <p className="product-industry-card__desc">
                {solution.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========== S8: 客户价值 ========== */
export function CustomerValue() {
  return (
    <section className="product-section bg-gray" id="value">
      <div className="product-frame">
        <header className="product-section-head text-center">
          <p className="product-kicker">Customer Value</p>
          <h2 className="product-section-title">客户价值</h2>
        </header>
        <div className="product-value-grid">
          {customerValues.map((value, index) => (
            <article className="product-value-card" key={value.title}>
              <span className="product-value-card__num">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="product-value-card__title">{value.title}</h3>
              <p className="product-value-card__desc">{value.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========== S9: CTA 收口 ========== */
export function ProductCTA() {
  return (
    <section className="product-cta">
      <div className="product-frame product-cta__content">
        <h2 className="product-cta__title">
          把企业数据、算力与 AI 应用，留在可控边界内
        </h2>
        <div className="product-hero__actions justify-center mt-8">
          <Link
            className="product-action product-action--primary"
            href="/contact"
          >
            联系商务
          </Link>
          <Link
            className="product-action product-action--outline bg-white"
            href="/docs"
          >
            查看部署文档
          </Link>
        </div>
      </div>
    </section>
  );
}
