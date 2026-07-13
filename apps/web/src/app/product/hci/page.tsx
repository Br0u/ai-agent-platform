import type { Metadata } from "next";
import {
  hciFeatures,
  hciHardwareConfigs,
  hciHighlights,
  hciIntro,
  hciProductInfo,
  hciSoftwareFunctions,
} from "./hci-content";
import "./hci.css";

export const metadata: Metadata = {
  title: "TGHCI 超融合解决方案 · 华鲲元启",
  description: hciIntro.title.replace("\n", ""),
};

export default function HCIPage() {
  return (
    <main className="hci-page">
      {/* S1: 破局首屏与传统架构对比 */}
      <section className="hci-hero">
        <div className="hci-container">
          <div className="hci-hero__header">
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "32px" }}>
              <img src="/logo.png" alt="华鲲元启" style={{ height: "40px" }} />
            </div>
            <span className="hci-hero__kicker">{hciIntro.kicker}</span>
            <h1 className="hci-hero__title">
              {hciIntro.title.split("\n").map((line, i) => (
                <span key={i}>{line}<br /></span>
              ))}
            </h1>
          </div>

          <div className="hci-hero__content">
            <div className="hci-hero__text">
              <h2>{hciIntro.slogan}</h2>
              <p>{hciIntro.description}</p>
            </div>
            
            {/* CSS 手绘：传统 IT 架构 VS 超融合架构 */}
            <div className="hci-arch-compare">
              {/* 传统 IT */}
              <div className="hci-arch-trad">
                <div className="hci-arch-node hci-arch-fw">防火墙</div>
                <div className="hci-arch-lines-top"></div>
                <div className="hci-arch-row">
                  <div className="hci-arch-node hci-arch-svr">商用服务器</div>
                  <div className="hci-arch-node hci-arch-svr">商用服务器</div>
                  <div className="hci-arch-node hci-arch-svr">商用服务器</div>
                </div>
                <div className="hci-arch-lines-mid"></div>
                <div className="hci-arch-node hci-arch-sw">FC交换机</div>
                <div className="hci-arch-lines-bot"></div>
                <div className="hci-arch-row">
                  <div className="hci-arch-node hci-arch-st">集中式存储阵列</div>
                  <div className="hci-arch-node hci-arch-st">集中式存储阵列</div>
                </div>
                <div className="hci-arch-label">传统IT架构</div>
              </div>

              {/* 融合箭头 */}
              <div className="hci-arch-arrow">融合 ➔</div>

              {/* 超融合 */}
              <div className="hci-arch-new">
                <div className="hci-arch-box">
                  <div className="hci-arch-box-top">
                    <span className="icon">💻</span> 计算
                    <span className="icon">💾</span> 存储
                    <span className="icon">🌐</span> 网络
                    <span className="icon">🛡️</span> 安全
                    <span className="icon">⚙️</span> 管理
                  </div>
                  <div className="hci-arch-box-mid">商用服务器</div>
                  <div className="hci-arch-box-bot">
                    <div className="node"></div><div className="node"></div><div className="node"></div><div className="node"></div>
                  </div>
                </div>
                <div className="hci-arch-lines-new"></div>
                <div className="hci-arch-node hci-arch-sw-new">以太交换机</div>
                <div className="hci-arch-label hci-arch-label--red">超融合架构</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S2: 方案亮点与全景拓扑图 */}
      <section className="hci-section">
        <div className="hci-container">
          <div className="hci-section-header">
            <h2>{hciProductInfo.title}</h2>
            <p>{hciProductInfo.desc}</p>
          </div>

          <div className="hci-highlights">
            {hciHighlights.map(hl => (
              <div className="hci-hl-card" key={hl.title}>
                <div className="hci-hl-icon">{hl.icon}</div>
                <div className="hci-hl-content">
                  <h3>{hl.title}</h3>
                  <p>{hl.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* CSS 手绘拓扑大图 */}
          <div className="hci-topology mt-16">
            <h3 className="hci-topo-title">TGHCI 超融合统一管理平台</h3>
            
            <div className="hci-topo-top">
              <div className="hci-topo-apps">
                <span>会议系统</span>
                <span>桌面云</span>
                <span>IOT</span>
                <span>OA</span>
                <span>ERP</span>
                <span>OpenGauss</span>
                <span>MySQL</span>
              </div>
              <div className="hci-topo-badge">多样化应用适配融合</div>
            </div>

            <div className="hci-topo-center">
              <div className="hci-server-rack">
                <div className="hci-server-rack-inner"></div>
              </div>
              <div className="hci-server-blade">
                <div className="hci-server-blade-inner"></div>
              </div>
            </div>

            <div className="hci-topo-bottom">
              <div className="hci-topo-badge hci-topo-badge--bottom">多元化基础设施融合</div>
              <div className="hci-topo-infra">
                <div className="hci-infra-col">
                  <div className="hci-infra-tag">计算虚拟化</div>
                  <div className="hci-infra-box">鲲鹏服务器</div>
                  <div className="hci-infra-box">X86服务器</div>
                </div>
                <div className="hci-infra-col">
                  <div className="hci-infra-tag">存储虚拟化</div>
                  <div className="hci-infra-box">GPU/NPU</div>
                </div>
                <div className="hci-infra-col">
                  <div className="hci-infra-tag">网络虚拟化</div>
                  <div className="hci-infra-box">网络交换</div>
                </div>
                <div className="hci-infra-col">
                  <div className="hci-infra-tag">安全虚拟化</div>
                  <div className="hci-infra-box">其他服务器</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S3: 三大特性深度解析 */}
      <section className="hci-section hci-bg-gray">
        <div className="hci-container">
          <div className="hci-section-header">
            <h2>TGHCI 超融合解决方案特性介绍</h2>
          </div>
          
          <div className="hci-features-list">
            {hciFeatures.map((feat, index) => (
              <div className="hci-feature-row" key={feat.title}>
                <div className="hci-feature-title-box">
                  <h3 className="hci-feature-title">
                    <span className="hci-feature-num">0{index + 1}</span>
                    {feat.title}
                  </h3>
                </div>
                <div className="hci-feature-desc">
                  {feat.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* S4: 系统软件功能全景 */}
      <section className="hci-section">
        <div className="hci-container">
          <div className="hci-section-header">
            <h2>TGHCI 超融合解决方案系统软件功能</h2>
          </div>
          
          <div className="hci-software-grid">
            {hciSoftwareFunctions.map(sw => (
              <div className="hci-sw-card" key={sw.category}>
                <div className="hci-sw-header">{sw.category}</div>
                <div className="hci-sw-body">{sw.items}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* S5: 硬件配置清单 */}
      <section className="hci-section hci-bg-gray">
        <div className="hci-container">
          <div className="hci-section-header">
            <h2>TGHCI 超融合解决方案典型场景推荐硬件配置</h2>
          </div>
          
          <div className="hci-table-wrapper">
            <table className="hci-hardware-table">
              <thead>
                <tr>
                  <th>适用场景</th>
                  <th>最小配置</th>
                  <th>典型配置</th>
                  <th>AI场景配置</th>
                </tr>
              </thead>
              <tbody>
                {/* Skip the first item as it's the header in our array mapping */}
                {hciHardwareConfigs.slice(1).map((row, index) => (
                  <tr key={index}>
                    <td className="hci-fw-bold">{row.category}</td>
                    <td className="hci-ws-pre">{row.min}</td>
                    <td className="hci-ws-pre">{row.typical}</td>
                    <td className="hci-ws-pre hci-text-red">{row.ai}</td>
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
