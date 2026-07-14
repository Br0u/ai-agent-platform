import Image from "next/image";
import Link from "next/link";
import wordmark from "@/assets/huakun-yuanqi/wordmark.png";
import type {
  Solution,
  SolutionScene,
} from "@/components/solutions/solution-content";
import "./contact-page.css";

export function ContactPage({
  solution,
  scene,
}: {
  solution?: Solution;
  scene?: SolutionScene;
}) {
  const contextTitle = scene?.title ?? solution?.title ?? "通用方案咨询";
  const contextSummary = scene?.summary ?? solution?.summary;
  const contextNote = scene
    ? "已关联当前场景方案"
    : solution
      ? "已关联当前解决方案"
      : "尚未选择具体方案，可直接联系或先浏览方案";
  return (
    <main className="contact-page">
      <section className="contact-hero">
        <div className="contact-frame contact-hero__grid">
          <div>
            <Image
              className="contact-wordmark"
              src={wordmark}
              alt="华鲲元启"
              width={817}
              height={219}
              priority
            />
            <p className="contact-kicker">Solution consultation</p>
            <h1>把业务现场，变成一份可评估的方案</h1>
            <p className="contact-hero__lead">
              方案团队会围绕场景、数据、算力、并发、系统接口和交付边界开展评估。当前页面不模拟在线提交，真实联系渠道和所需资料均在下方列明。
            </p>
          </div>
          <aside className="contact-context" aria-label="当前咨询上下文">
            <span>当前咨询主题</span>
            <h2>{contextTitle}</h2>
            {contextSummary ? <p>{contextSummary}</p> : null}
            <div>
              <strong>
                {scene ? "场景方案" : solution ? "解决方案" : "商务咨询"}
              </strong>
              <small>{contextNote}</small>
            </div>
            {solution ? (
              <Link href={`/solutions/${solution.slug}`}>返回方案详情 →</Link>
            ) : (
              <Link href="/solutions">选择解决方案 →</Link>
            )}
          </aside>
        </div>
      </section>
      <section
        className="contact-prepare"
        aria-labelledby="contact-prepare-title"
      >
        <div className="contact-frame">
          <header>
            <p className="contact-kicker">Before we talk / 01</p>
            <h2 id="contact-prepare-title">准备六项信息，方案沟通会更有效</h2>
          </header>
          <div className="contact-prepare__grid">
            {[
              ["01", "业务场景", "希望改善的流程、现状阻力和主要使用角色。"],
              ["02", "数据条件", "文档、数据库、视频或业务数据的类型与边界。"],
              ["03", "现有环境", "服务器、加速卡、网络、机房和已有平台情况。"],
              ["04", "规模目标", "用户、并发、视频路数、模型规模或业务峰值。"],
              [
                "05",
                "系统接口",
                "需要连接的 OA、业务系统、视频或身份认证平台。",
              ],
              [
                "06",
                "验收要求",
                "功能、性能、效果、安全、交付周期和服务范围。",
              ],
            ].map(([code, title, description]) => (
              <article key={code}>
                <span>{code}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section
        className="contact-process"
        aria-labelledby="contact-process-title"
      >
        <div className="contact-frame contact-process__grid">
          <header>
            <p className="contact-kicker">What happens next / 02</p>
            <h2 id="contact-process-title">从首次沟通到形成配置建议</h2>
            <p>是否进入测试、现场评估或正式方案阶段，由双方在沟通后确认。</p>
          </header>
          <ol>
            {[
              ["需求沟通", "明确目标、范围、角色与现有条件。"],
              ["资料核对", "确认可用数据、环境、接口和待验证项。"],
              ["场景评估", "判断技术可行性、交付边界与主要风险。"],
              ["配置建议", "形成软硬件组合、实施阶段和验收口径建议。"],
            ].map(([title, description], index) => (
              <li key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section
        className="contact-channels"
        id="contact-channels"
        aria-labelledby="contact-channels-title"
      >
        <div className="contact-frame">
          <header>
            <p className="contact-kicker">Contact channels / 03</p>
            <h2 id="contact-channels-title">使用已公开渠道联系方案团队</h2>
          </header>
          <div className="contact-channels__grid">
            <a href="tel:4008550189">
              <span>PHONE</span>
              <strong>400-855-0189</strong>
              <small>拨打官方服务热线 →</small>
            </a>
            <a href="https://www.schkzy.com" target="_blank" rel="noreferrer">
              <span>OFFICIAL WEBSITE</span>
              <strong>www.schkzy.com</strong>
              <small>访问华鲲振宇官网 →</small>
            </a>
            <div>
              <span>ADDRESS</span>
              <strong>四川省成都市高新区</strong>
              <small>天府大道北段 28 号茂业中心 C 座 24F</small>
            </div>
          </div>
          <div className="contact-interface-note">
            <span>INTERFACE RESERVED</span>
            <div>
              <strong>在线预约接口已预留，尚未接入表单后端</strong>
              <p>
                后续拿到
                CRM、邮件或工单接口后，可在这里加入真实提交能力；在此之前不展示无法完成的“提交成功”。
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
