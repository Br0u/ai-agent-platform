import type { Metadata } from "next";
import "./code-agent.css";

export const metadata: Metadata = {
  title: "码多多 · 私有化 AI 编程助手",
  description: "码多多+VSCode=智能编码，效率狂飙。私有化部署的 AI 编程助手，开箱即用，全流程协同开发，一站式完成代码全生命周期构建。",
};

export default function CodeAgentPage() {
  const features = [
    "智能代码编辑器",
    "智能问答",
    "工程级变更",
    "记忆感知",
    "文件编辑",
    "行间会话",
    "编程智能体",
    "工程自动感知",
    "终端命令执行",
    "编程工具使用",
    "行间建议预测",
  ];

  return (
    <main className="code-agent-page">
      {/* S1: Hero Section */}
      <section className="ca-hero">
        <div className="ca-container ca-hero__grid">
          {/* 左侧文案与交互区 */}
          <div className="ca-hero__content">
            <div className="ca-hero__logo">
              {/* CSS 模拟蓝底六边形 / 铲子 icon */}
              <div className="ca-icon-hex">
                <div className="ca-icon-hex-inner"></div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "24px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="华鲲元启" style={{ height: "40px" }} />
            </div>
            
            <h1 className="ca-hero__title">
              码多多+VSCode=智能编码，效率狂飙
            </h1>
            <p className="ca-hero__subtitle">
              私有化部署的 <span>AI 编程助手</span>
            </p>

            <div className="ca-features">
              <span className="ca-features__label">功能特性</span>
              <div className="ca-features__tags">
                {features.map((feature) => (
                  <span key={feature} className="ca-feature-tag">
                    {feature}
                  </span>
                ))}
              </div>
            </div>

            <div className="ca-download-panel">
              {/* VSCode 下载框 */}
              <div className="ca-dl-box">
                <div className="ca-dl-box__head">
                  <span className="ca-icon-vscode"></span> 下载VSCode
                </div>
                <a href="https://code.visualstudio.com/" target="_blank" rel="noreferrer" className="ca-btn ca-btn--outline">
                  <span className="ca-icon-download"></span> 去下载
                </a>
              </div>

              {/* 模型选择框 */}
              <div className="ca-dl-box ca-dl-box--main">
                <div className="ca-select-group">
                  <select className="ca-select" defaultValue="windows">
                    <option value="windows">Windows</option>
                    <option value="macos">macOS</option>
                    <option value="linux">Linux</option>
                  </select>
                  <select className="ca-select" defaultValue="minimax">
                    <option value="minimax">MiniMax-M2.7-code</option>
                    <option value="deepseek">DeepSeek-Coder-V3</option>
                    <option value="qwen">Qwen2.5-Coder-32B</option>
                  </select>
                </div>
                <button className="ca-btn ca-btn--primary">
                  <span className="ca-icon-export"></span> 导出码多多
                </button>
                <p className="ca-dl-note">macOS 12 及以上 · Windows 10 及以上</p>
              </div>
            </div>
          </div>

          {/* 右侧 3D 悬浮组件区 */}
          <div className="ca-hero__visual">
            <div className="ca-3d-scene">
              {/* 发光底座 */}
              <div className="ca-3d-base">
                <div className="ca-3d-base-rings"></div>
              </div>
              
              {/* 核心 3D 几何体 (CSS 绘制) */}
              <div className="ca-3d-cube-group">
                <div className="ca-3d-cube ca-3d-cube--1"></div>
                <div className="ca-3d-cube ca-3d-cube--2"></div>
                <div className="ca-3d-cube ca-3d-cube--3"></div>
              </div>

              {/* 环绕代码丝带 */}
              <div className="ca-ribbon ca-ribbon--1">print &apos;码多多&apos;</div>
              <div className="ca-ribbon ca-ribbon--2">print &apos;Hello World&apos;</div>
              <div className="ca-ribbon ca-ribbon--3">print &apos;码多多&apos;</div>
            </div>
          </div>
        </div>
      </section>

      {/* S2: 安装步骤 */}
      <section className="ca-steps">
        <div className="ca-container">
          <h2 className="ca-section-title">安装步骤</h2>
          <div className="ca-steps__grid">
            
            {/* Step 1 */}
            <article className="ca-step-card">
              <span className="ca-step-watermark">01</span>
              <h3 className="ca-step-title">第一步</h3>
              <p className="ca-step-desc">若您还没有安装Visual Studio Code，请先去下载安装</p>
              <div className="ca-step-img ca-step-img--1">
                <div className="ca-mock-box">
                  <div className="ca-mock-dl-btn">
                    ↓ 去下载
                    <div className="ca-mock-tooltip">点击上方此处，前往官网下载VSCode</div>
                  </div>
                </div>
              </div>
            </article>

            {/* Step 2 */}
            <article className="ca-step-card">
              <span className="ca-step-watermark">02</span>
              <h3 className="ca-step-title">第二步</h3>
              <p className="ca-step-desc">请选择编程模型，去导出码多多</p>
              <div className="ca-step-img ca-step-img--2">
                <div className="ca-mock-box">
                  <div className="ca-mock-dl-btn ca-mock-dl-btn--primary">
                    [→] 导出码多多
                    <div className="ca-mock-tooltip ca-mock-tooltip--left">点击上方此处，选择模型，导出码多多</div>
                  </div>
                </div>
              </div>
            </article>

            {/* Step 3 */}
            <article className="ca-step-card">
              <span className="ca-step-watermark">03</span>
              <h3 className="ca-step-title">第三步</h3>
              <p className="ca-step-desc">重启Visual Studio Code，即刻开启智能编码之旅</p>
              <div className="ca-step-img ca-step-img--3">
                <div className="ca-mock-vscode-window">
                  <div className="ca-mock-vscode-header"></div>
                  <div className="ca-mock-vscode-body">
                    <div className="ca-mock-vscode-sidebar">
                      <div className="ca-mock-mdd-icon">
                        <div className="ca-mock-tooltip ca-mock-tooltip--small">此处显示码多多图标，证明安装成功</div>
                      </div>
                    </div>
                    <div className="ca-mock-vscode-main">
                      <span className="ca-mock-vscode-logo">ma duo duo</span>
                    </div>
                  </div>
                </div>
              </div>
            </article>

          </div>
        </div>
      </section>
    </main>
  );
}
