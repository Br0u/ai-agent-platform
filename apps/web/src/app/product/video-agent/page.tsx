import type { Metadata } from "next";
import {
  applicationScenarios,
  coreFeatures,
  hardwareConfig,
  videoAgentIntro,
  vsComparison,
} from "./video-agent-content";
import "./video-agent.css";

export const metadata: Metadata = {
  title: "华鲲元启视觉检索一体机 · 视频智能体",
  description: videoAgentIntro.description.substring(0, 100) + "...",
};

export default function VideoAgentPage() {
  return (
    <main className="va-page">
      {/* S1: AI 视觉首屏 */}
      <section className="va-hero">
        <div className="va-hero__bg">
          {/* 纯 CSS 模拟视觉扫描仪光效 */}
          <div className="va-scanner"></div>
          <div className="va-grid-lines"></div>
        </div>
        <div className="va-container va-hero__content">
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: "32px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="华鲲元启" style={{ height: "40px" }} />
          </div>
          <h1 className="va-hero__title">{videoAgentIntro.title}</h1>
          <p className="va-hero__desc">{videoAgentIntro.description}</p>
          <div className="va-hero__actions">
            <button className="va-btn va-btn--primary">申请设备演示</button>
            <button className="va-btn va-btn--outline">获取技术白皮书</button>
          </div>
        </div>
      </section>

      {/* S2: 双雄对抗卡片 VS */}
      <section className="va-section va-bg-dark">
        <div className="va-container">
          <div className="va-vs-container">
            {/* 左侧：传统小模型 */}
            <div className="va-vs-card va-vs-card--trad">
              <h2 className="va-vs-card__title">
                {vsComparison.traditional.title}
              </h2>
              <ul className="va-vs-list">
                {vsComparison.traditional.items.map((item) => (
                  <li key={item.label}>
                    <span className="va-vs-label">{item.label}:</span>
                    <span className="va-vs-desc">{item.desc}</span>
                  </li>
                ))}
              </ul>
              <div className="va-vs-footer">
                {vsComparison.traditional.footer}
              </div>
            </div>

            {/* 中间超大 VS */}
            <div className="va-vs-badge">VS</div>

            {/* 右侧：视觉大模型 */}
            <div className="va-vs-card va-vs-card--ai">
              <h2 className="va-vs-card__title">
                {vsComparison.largeModel.title}
              </h2>
              <ul className="va-vs-list">
                {vsComparison.largeModel.items.map((item) => (
                  <li key={item.label}>
                    <span className="va-vs-label">{item.label}:</span>
                    <span className="va-vs-desc">{item.desc}</span>
                  </li>
                ))}
              </ul>
              <div className="va-vs-footer">
                {vsComparison.largeModel.footer}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S3: 能力矩阵 */}
      <section className="va-section">
        <div className="va-container">
          <div className="va-features-grid">
            {coreFeatures.map((feature, index) => (
              <div className="va-feature-card" key={index}>
                <div className="va-feature-icon">0{index + 1}</div>
                <h3 className="va-feature-title">{feature.title}</h3>
                <ul className="va-feature-list">
                  {feature.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* S4: 泛化场景网格 */}
      <section className="va-section va-bg-gray">
        <div className="va-container">
          <div className="va-section-header">
            <h2>应用场景</h2>
          </div>
          <div className="va-scenarios-grid">
            {applicationScenarios.map((scenario) => (
              <div className="va-scenario-tag" key={scenario}>
                <span className="va-scenario-dot"></span>
                {scenario}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* S5: 一体机极客选型表 */}
      <section className="va-section">
        <div className="va-container">
          <div className="va-section-header">
            <h2>一体机典型配置</h2>
          </div>

          <div className="va-hw-panel">
            <div className="va-hw-overview">
              <h3 className="va-hw-name">{hardwareConfig.modelName}</h3>
              <p className="va-hw-sub">{hardwareConfig.coreComponents}</p>

              {/* CSS 手工绘制 2U 服务器带指示灯 */}
              <div className="va-server-mockup">
                <div className="va-server-chassis">
                  <div className="va-server-ears"></div>
                  <div className="va-server-face">
                    <div className="va-server-disk-array">
                      {[...Array(8)].map((_, i) => (
                        <div className="va-server-disk" key={i}>
                          <span className="va-disk-led"></span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="va-server-ears"></div>
                </div>
                <div className="va-server-label">开箱即用</div>
              </div>
            </div>

            <div className="va-hw-table-wrapper">
              <table className="va-hw-table">
                <thead>
                  <tr>
                    <th>产品名称</th>
                    <th>产品描述</th>
                  </tr>
                </thead>
                <tbody>
                  {hardwareConfig.tableData.map((row, index) => (
                    <tr key={index}>
                      <td className="va-hw-cat">{row.category}</td>
                      <td className="va-hw-det">
                        {row.details.map((detail, i) => (
                          <div key={i}>{detail}</div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
