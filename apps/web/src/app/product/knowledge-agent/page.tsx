import type { Metadata } from "next";
import {
  hardwareConfigs,
  knowledgeAgentIntro,
  productFeatures,
  targetUnits,
  workflowSteps,
} from "./knowledge-agent-content";
import "./knowledge-agent.css";

export const metadata: Metadata = {
  title: "华鲲元启智能导办一体机 · 知识智能体",
  description: knowledgeAgentIntro.solution.substring(0, 100) + "...",
};

export default function KnowledgeAgentPage() {
  return (
    <main className="ka-page">
      {/* S1: AI 破局首屏 */}
      <section className="ka-hero">
        <div className="ka-container ka-hero__inner">
          <div className="ka-hero__text">
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "24px" }}>
              <img src="/logo.png" alt="华鲲元启" style={{ height: "40px" }} />
            </div>
            <h1 className="ka-hero__title">{knowledgeAgentIntro.title}</h1>
            
            <div className="ka-hero__pain-point">
              <span className="ka-pain-icon">⚠️</span>
              <p>
                <strong>痛点：</strong>
                {knowledgeAgentIntro.painPoint.split("约60%的申请人会因材料问题至少跑两趟")[0]}
                <span className="ka-text-highlight">约60%的申请人会因材料问题至少跑两趟</span>
                {knowledgeAgentIntro.painPoint.split("约60%的申请人会因材料问题至少跑两趟")[1]}
              </p>
            </div>
            
            <div className="ka-hero__solution">
              <p>{knowledgeAgentIntro.solution}</p>
            </div>
          </div>
          
          <div className="ka-hero__visual">
            {/* CSS 模拟智能导办对话框 */}
            <div className="ka-mock-ui">
              <div className="ka-mock-header">
                <div className="ka-mock-dots"><span></span><span></span><span></span></div>
                <div className="ka-mock-title">智能导办助手</div>
              </div>
              <div className="ka-mock-body">
                <div className="ka-chat-bubble ka-chat--left">
                  您好！我是政务导办助手，请问您想办理什么业务？
                </div>
                <div className="ka-chat-bubble ka-chat--right">
                  我想开一家餐饮店，需要准备什么材料？
                </div>
                <div className="ka-chat-bubble ka-chat--left">
                  <div className="ka-chat-typing"><span></span><span></span><span></span></div>
                </div>
                {/* 浮动表单 */}
                <div className="ka-mock-form">
                  <div className="ka-form-check">✓ 营业执照生成完毕</div>
                  <div className="ka-form-check">✓ 食品经营许可已提取</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S2: 导办通关四大流程 */}
      <section className="ka-section ka-bg-light">
        <div className="ka-container">
          <div className="ka-section-header">
            <h2>全流程智能化升级</h2>
            <p>从“群众适应流程”转变为“流程适应群众”</p>
          </div>
          
          <div className="ka-timeline">
            {workflowSteps.map((step, index) => (
              <div className="ka-timeline-item" key={index}>
                <div className="ka-timeline-marker">{index + 1}</div>
                <div className="ka-timeline-content">
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* S3: 9大产品功能矩阵 */}
      <section className="ka-section">
        <div className="ka-container">
          <div className="ka-section-header">
            <h2>产品核心功能</h2>
          </div>
          
          <div className="ka-features-grid">
            {productFeatures.map((feat, index) => (
              <div className="ka-feature-card" key={index}>
                <div className="ka-feature-icon-wrapper">
                  <span className="ka-feature-icon-text">{feat.title.substring(0, 1)}</span>
                </div>
                <h3>{feat.title}</h3>
                <p>{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* S4: 需求单位卡片 */}
      <section className="ka-section ka-bg-purple-light">
        <div className="ka-container">
          <div className="ka-section-header">
            <h2>需求单位</h2>
            <p>广泛赋能各类政务与代办机构</p>
          </div>
          
          <div className="ka-units-wrapper">
            {targetUnits.map(unit => (
              <div className="ka-unit-card" key={unit.name}>
                <div className="ka-unit-icon">{unit.icon}</div>
                <div className="ka-unit-name">{unit.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* S5: 双旗舰一体机配置 */}
      <section className="ka-section">
        <div className="ka-container">
          <div className="ka-section-header">
            <h2>一体机典型配置</h2>
            <p>全国产化算力，提供最佳性能与极具性价比的双重选择</p>
          </div>
          
          <div className="ka-table-wrapper">
            <table className="ka-table">
              <thead>
                <tr>
                  {hardwareConfigs.columns.map((col, i) => (
                    <th key={i}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hardwareConfigs.rows.map((row, i) => (
                  <tr key={i} className={row.highlight ? "ka-tr-highlight" : ""}>
                    <td className="ka-td-form">{row.form}</td>
                    <td className="ka-td-desc">
                      {row.desc.split("\n").map((line, j) => (
                        <div key={j} className={line.includes("HuaKun") ? "ka-model-name" : ""}>
                          {line}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
