import type { Metadata } from "next";
import Link from "next/link";
import {
  faqs,
  prebuiltAgents,
  successCases,
  supportServices,
  techSpecs,
  tgdataxaiAdvantages,
  tgdataxaiArchitecture,
  tgdataxaiFeatures,
  tgdataxaiIntro,
} from "./tgdataxai-content";
import "./tgdataxai.css";

export const metadata: Metadata = {
  title: "AI开发赋能平台 (TGDataXAI) · 华鲲元启",
  description: tgdataxaiIntro.slogan,
};

export default function TGDataXAIPage() {
  return (
    <main className="tg-page">
      {/* S1: 破局首屏 */}
      <section className="tg-hero">
        <div className="tg-container tg-hero__content">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "32px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="华鲲元启" style={{ height: "40px" }} />
          </div>
          <p className="tg-hero__kicker">LLMOPS TECHNOLOGY</p>
          <h1 className="tg-hero__title">{tgdataxaiIntro.title}</h1>
          <p className="tg-hero__slogan">{tgdataxaiIntro.slogan}</p>
          <p className="tg-hero__desc">{tgdataxaiIntro.description}</p>
          <div className="tg-hero__actions">
            <Link href="/contact" className="tg-btn tg-btn--primary">
              申请私有化试用
            </Link>
            <Link href="/docs" className="tg-btn tg-btn--outline">
              查看文档
            </Link>
          </div>
        </div>
      </section>

      {/* S2: 极度复杂的纯 CSS 架构图 */}
      <section className="tg-section tg-bg-gray">
        <div className="tg-container">
          <div className="tg-section-header">
            <h2>产品架构图</h2>
            <p>基于 LLMOPS 理念打造的极简、高效、全流程管理的 AI 基础设施</p>
          </div>
          
          <div className="tg-arch-diagram">
            {/* 左侧：模型仓库 + 部署 */}
            <div className="tg-arch-col tg-arch-col--models">
              <div className="tg-arch-block">
                <div className="tg-arch-block-title">模型仓库</div>
                {tgdataxaiArchitecture.modelRepo.groups.map(group => (
                  <div className="tg-arch-model-group" key={group.name}>
                    {group.tags.map(tag => (
                      <span className="tg-arch-tag" key={tag}>{tag}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* 中间区：知识工程 / 推理 / 训练 / 数据工厂 / 智能体分类 */}
            <div className="tg-arch-col tg-arch-col--main">
              {/* Top Row: 知识工程 & 智能体分类 & 推理中心 */}
              <div className="tg-arch-row">
                {/* 知识工程 */}
                <div className="tg-arch-block tg-arch-block--wide">
                  <div className="tg-arch-block-title">知识工程</div>
                  <div className="tg-arch-grid-2">
                    {tgdataxaiArchitecture.knowledgeEng.modules.map(mod => (
                      <div className="tg-arch-subblock" key={mod.title}>
                        <div className="tg-arch-sub-title">{mod.title}</div>
                        <div className="tg-arch-grid-tags">
                          {mod.items.map(item => (
                            <span className="tg-arch-tag-sm" key={item}>{item}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="tg-arch-col-split">
                  {/* 智能体分类 */}
                  <div className="tg-arch-block">
                    <div className="tg-arch-block-title">智能体分类</div>
                    <div className="tg-arch-grid-tags">
                      {tgdataxaiArchitecture.agentCategory.items.map(item => (
                        <span className="tg-arch-tag-sm" key={item}>{item}</span>
                      ))}
                    </div>
                  </div>
                  {/* 推理中心 */}
                  <div className="tg-arch-block">
                    <div className="tg-arch-block-title">推理中心</div>
                    {tgdataxaiArchitecture.inferenceCenter.modules.map(mod => (
                      <div className="tg-arch-subblock" key={mod.title}>
                        <div className="tg-arch-sub-title">{mod.title}</div>
                        <div className="tg-arch-grid-tags">
                          {mod.items.map(item => (
                            <span className="tg-arch-tag-sm" key={item}>{item}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Mid Row: 数据工厂 & 训练中心 */}
              <div className="tg-arch-row mt-4">
                <div className="tg-arch-block tg-arch-block--wide">
                  <div className="tg-arch-block-title">数据工厂</div>
                  <div className="tg-arch-grid-tags tg-arch-grid-tags--horizontal">
                    {tgdataxaiArchitecture.dataFactory.items.map(item => (
                      <span className="tg-arch-tag-md" key={item}>{item}</span>
                    ))}
                  </div>
                </div>
                <div className="tg-arch-block tg-arch-block--wide">
                  <div className="tg-arch-block-title">训练中心</div>
                  <div className="tg-arch-grid-tags">
                    {tgdataxaiArchitecture.trainingCenter.items.map(item => (
                      <span className="tg-arch-tag-sm" key={item}>{item}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom Row: 评估中心 */}
              <div className="tg-arch-row mt-4">
                <div className="tg-arch-block tg-arch-block--full">
                  <div className="tg-arch-block-title">评估中心</div>
                  <div className="tg-arch-grid-4">
                    {tgdataxaiArchitecture.evalCenter.items.map(item => (
                      <div className="tg-arch-eval-box" key={item}>{item}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Base Row: 权限管理 */}
          <div className="tg-arch-diagram-base mt-4">
            <div className="tg-arch-block tg-arch-block--full">
              <div className="tg-arch-block-title tg-text-center">权限管理</div>
              <div className="tg-arch-grid-6">
                {tgdataxaiArchitecture.permissionMgt.items.map(item => (
                  <div className="tg-arch-base-box" key={item}>{item}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S4: 三步构建智能体 */}
      <section className="tg-section">
        <div className="tg-container">
          <div className="tg-section-header">
            <h2>三步构建智能体，让 AI 开发像搭积木一样简单！</h2>
          </div>
          <div className="tg-steps">
            <div className="tg-step-item">
              <div className="tg-step-icon">1</div>
              <div className="tg-step-puzzle">
                <div className="tg-puzzle-icon cube"></div>
              </div>
              <div className="tg-step-text">选择模型任务</div>
              <div className="tg-step-logos">DeepSeek / Qwen3</div>
            </div>
            <div className="tg-step-divider">→</div>
            <div className="tg-step-item">
              <div className="tg-step-icon">2</div>
              <div className="tg-step-puzzle">
                <div className="tg-puzzle-icon book"></div>
              </div>
              <div className="tg-step-text">选择知识库/知识图谱</div>
              <div className="tg-step-logos">Word / PDF / Excel</div>
            </div>
            <div className="tg-step-divider">→</div>
            <div className="tg-step-item">
              <div className="tg-step-icon">3</div>
              <div className="tg-step-puzzle">
                <div className="tg-puzzle-icon brain"></div>
              </div>
              <div className="tg-step-text">发布智能体应用</div>
              <div className="tg-step-logos">AI 问答助手</div>
            </div>
          </div>
        </div>
      </section>

      {/* S3: 核心功能 */}
      <section className="tg-section tg-bg-gray">
        <div className="tg-container">
          <div className="tg-section-header">
            <h2>核心功能</h2>
          </div>
          <div className="tg-features-grid">
            {tgdataxaiFeatures.map(feat => (
              <div className="tg-feature-card" key={feat.title}>
                {/* 拟物化界面图 */}
                <div className="tg-feature-mock">
                  <div className="tg-mock-top"></div>
                  <div className="tg-mock-body">
                    <div className="tg-mock-sidebar"></div>
                    <div className="tg-mock-content"></div>
                  </div>
                </div>
                <h3>{feat.title}</h3>
                <p>{feat.desc}</p>
              </div>
            ))}
          </div>

          {/* 通用预置智能体雷达 */}
          <div className="tg-agents-radar mt-16">
            <h3 className="tg-text-center mb-8">预置通用智能体</h3>
            <div className="tg-radar-wrapper">
              <div className="tg-radar-center">预置通用<br/>智能体</div>
              {prebuiltAgents.map((agent, index) => (
                <div className={`tg-radar-node tg-radar-node-${index + 1}`} key={agent}>
                  {agent}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* S5: 产品优势 */}
      <section className="tg-section">
        <div className="tg-container">
          <div className="tg-section-header">
            <h2>产品优势</h2>
          </div>
          <div className="tg-advantages-grid">
            {tgdataxaiAdvantages.map((adv, index) => (
              <div className="tg-adv-card" key={index}>
                <div className="tg-adv-card-header">
                  <span className="tg-adv-icon">★</span>
                  <h3>{adv.title}</h3>
                </div>
                <p>{adv.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* S6: 技术规格与参数 */}
      <section className="tg-section tg-bg-gray">
        <div className="tg-container">
          <div className="tg-section-header">
            <h2>技术规格与参数</h2>
          </div>
          <div className="tg-table-wrapper">
            <table className="tg-tech-table">
              <thead>
                <tr>
                  <th>软件版本</th>
                  <th>主要模型</th>
                  <th>业务场景</th>
                  <th>功能特性</th>
                  <th>典型配置</th>
                </tr>
              </thead>
              <tbody>
                {techSpecs.map(spec => (
                  <tr key={spec.version}>
                    <td className="tg-fw-bold">{spec.version}</td>
                    <td className="tg-ws-pre">{spec.models}</td>
                    <td className="tg-ws-pre">{spec.scenarios}</td>
                    <td className="tg-ws-pre">{spec.features}</td>
                    <td className="tg-fw-bold tg-text-blue">{spec.hardware}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* S7: 案例、FAQ 与保障 */}
      <section className="tg-section">
        <div className="tg-container">
          {/* 成功案例 */}
          <div className="mb-16">
            <h2 className="tg-section-title tg-text-center mb-8">成功案例</h2>
            <div className="tg-cases-grid">
              {successCases.map(c => (
                <div className="tg-case-card" key={c.industry}>
                  <div className="tg-case-img">
                    <div className="tg-case-tag">{c.industry}</div>
                  </div>
                  <div className="tg-case-content">
                    <h4>{c.title}</h4>
                    <p>{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="tg-faq-support-grid mt-16">
            {/* FAQ */}
            <div className="tg-faq">
              <h2 className="tg-section-title mb-6">常见问题解答 (FAQ)</h2>
              <div className="tg-accordion">
                {faqs.map((faq, i) => (
                  <details className="tg-details" key={i} open={i === 0}>
                    <summary className="tg-summary">{faq.q}</summary>
                    <div className="tg-details-content">{faq.a}</div>
                  </details>
                ))}
              </div>
            </div>

            {/* 服务与保障 */}
            <div className="tg-support">
              <h2 className="tg-section-title mb-6">服务与保障</h2>
              <div className="tg-support-list">
                {supportServices.map(srv => (
                  <div className="tg-support-item" key={srv.title}>
                    <div className="tg-support-title">{srv.title}</div>
                    <ul>
                      {srv.items.map(item => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
