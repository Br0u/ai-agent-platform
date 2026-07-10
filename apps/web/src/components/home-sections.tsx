import Image from "next/image";
import Link from "next/link";
import platformOverview from "../assets/huakun-yuanqi/platform-overview.png";
import wordmark from "../assets/huakun-yuanqi/wordmark.png";
import {
  capabilities,
  enterpriseProofs,
  platformLayers,
  resources,
  solutions,
} from "./home-content";
import "./home.css";

export function HeroEvidence() {
  return (
    <section className="home-section home-hero" aria-labelledby="hero-title">
      <div className="home-frame home-hero__grid">
        <div className="home-hero__copy">
          <Image
            className="home-hero__wordmark"
            src={wordmark}
            alt=""
            width={817}
            height={219}
            priority
          />
          <p className="home-technical-line">
            国产算力 · 私有化部署 · 企业级 AI 开发
          </p>
          <h1 id="hero-title">让企业 AI 从模型走向业务</h1>
          <p className="home-product-name">
            <span>华鲲元启 AI开发赋能平台</span>
            <small>TGDataXAI</small>
          </p>
          <p className="home-hero__summary">
            以异构算力智能调度为底座，把模型仓库、知识工程、流程编排、训练、推理与评估连接为一套企业级开发体系，让智能体开发像搭积木一样简单。
          </p>
          <div className="home-actions">
            <Link className="home-action home-action--primary" href="/product">
              了解平台
            </Link>
            <Link className="home-action" href="/docs">
              阅读文档
            </Link>
          </div>
        </div>
        <figure className="home-evidence">
          <div className="home-evidence__bar">
            <span>PLATFORM / UI-01</span>
            <span>TGDataXAI</span>
          </div>
          <Image
            src={platformOverview}
            alt="华鲲元启平台界面"
            width={1049}
            height={902}
            priority
            sizes="(max-width: 900px) 100vw, 48vw"
          />
          <figcaption>界面示意 · 来源于华鲲元启产品彩页</figcaption>
        </figure>
      </div>
    </section>
  );
}

export function CapabilityRail() {
  return (
    <section className="home-section" aria-label="平台关键能力">
      <div className="home-frame home-capability-rail">
        {capabilities.map((capability, index) => (
          <div className="home-capability" key={capability}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{capability}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PlatformFlow() {
  return (
    <section className="home-section" aria-labelledby="platform-flow-title">
      <div className="home-frame home-section-grid">
        <header>
          <p className="home-section-kicker">Platform / 01</p>
          <h2 id="platform-flow-title">一套平台，贯通企业 AI 开发全流程</h2>
          <p className="home-section-intro">
            从企业数据进入知识工程，到智能体发布与模型运行，能力被组织为可理解、可管理的开发路径。
          </p>
        </header>
        <div className="home-index-list">
          {platformLayers.map((layer) => (
            <article className="home-index-row" key={layer.code}>
              <span>{layer.code}</span>
              <h3>{layer.title}</h3>
              <p>{layer.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function EnterpriseProof() {
  return (
    <section
      className="home-section home-proof"
      aria-labelledby="enterprise-proof-title"
    >
      <div className="home-frame">
        <header className="home-proof__heading">
          <p className="home-section-kicker">Enterprise / 02</p>
          <h2 id="enterprise-proof-title">为企业边界而设计</h2>
        </header>
        <div className="home-proof__list">
          {enterpriseProofs.map((proof, index) => (
            <article className="home-proof__item" key={proof.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{proof.title}</h3>
              <p>{proof.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SolutionIndex() {
  return (
    <section className="home-section" aria-labelledby="solution-index-title">
      <div className="home-frame home-section-grid">
        <header>
          <p className="home-section-kicker">Solutions / 03</p>
          <h2 id="solution-index-title">从平台能力，走向行业场景</h2>
          <p className="home-section-intro">
            行业方案建立在统一平台之上。视觉检索是其中的多模态子能力，不是独立上位平台。
          </p>
        </header>
        <div className="home-solution-list">
          {solutions.map((solution, index) => (
            <article
              className={
                solution.subsetLabel
                  ? "home-solution home-solution--subset"
                  : "home-solution"
              }
              key={solution.title}
            >
              <span className="home-solution__code">S{index + 1}</span>
              <div>
                <h3>{solution.title}</h3>
                {solution.subsetLabel ? (
                  <strong className="home-subset-label">
                    {solution.subsetLabel}
                  </strong>
                ) : null}
                <p>{solution.description}</p>
              </div>
              <span className="home-row-arrow" aria-hidden="true">
                →
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ResourceTable() {
  return (
    <section
      className="home-section home-resources"
      aria-labelledby="resource-table-title"
    >
      <div className="home-frame home-section-grid">
        <header>
          <p className="home-section-kicker">Resources / 04</p>
          <h2 id="resource-table-title">下一步，从这里开始</h2>
        </header>
        <div className="home-resource-list">
          {resources.map((resource) => (
            <Link
              className="home-resource"
              href={resource.href}
              key={resource.href}
            >
              <strong>{resource.title}</strong>
              <span>{resource.description}</span>
              <span className="home-row-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PrivateDeploymentClose() {
  return (
    <section
      className="home-closing"
      aria-labelledby="private-deployment-title"
    >
      <div className="home-frame home-closing__grid">
        <div>
          <p className="home-section-kicker">Private Deployment</p>
          <h2 id="private-deployment-title">
            把企业数据、算力与 AI 应用，留在可控边界内。
          </h2>
          <p>
            面向企业私有化场景，了解华鲲元启的部署路径、平台能力与支持方式。
          </p>
        </div>
        <div className="home-actions">
          <Link className="home-action home-action--primary" href="/contact">
            联系商务
          </Link>
          <Link className="home-action" href="/docs">
            查看部署文档
          </Link>
        </div>
      </div>
    </section>
  );
}
