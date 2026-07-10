import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home" aria-label="AI Agent Platform 首页">
      <section className="hero" aria-labelledby="hero-title">
        <p className="hero__eyebrow">Enterprise AI Delivery Platform</p>
        <h1 id="hero-title">AI Agent Platform</h1>
        <p className="hero__summary">
          统一构建、部署并运维企业级AI智能体，连接产品、文档与客户支持。
        </p>
        <Link className="hero__primary-action" href="/docs">
          阅读文档
        </Link>
      </section>
    </main>
  );
}
