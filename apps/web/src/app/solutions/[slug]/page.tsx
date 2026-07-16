import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSolutionDetail,
  solutionSlugs,
  type SolutionDetail,
} from "../solution-detail-content";
import "./solution-detail.css";

type SolutionDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return solutionSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: SolutionDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const solution = getSolutionDetail(slug);

  if (!solution) {
    return { title: "解决方案未找到 · 华鲲元启" };
  }

  return {
    title: `${solution.name}解决方案 · 华鲲元启`,
    description: solution.summary,
  };
}

function SolutionDetailView({ solution }: { solution: SolutionDetail }) {
  return (
    <main className="solution-detail">
      <section className="solution-detail-hero">
        <div className="solution-detail-hero__grid" aria-hidden="true" />
        <div className="solution-detail-shell solution-detail-hero__inner">
          <div className="solution-detail-hero__content">
            <nav className="solution-detail-breadcrumb" aria-label="面包屑">
              <Link href="/solutions">解决方案</Link>
              <span aria-hidden="true">/</span>
              <span>{solution.name}</span>
            </nav>
            <p className="solution-detail-kicker">
              {solution.category} / {solution.code}
            </p>
            <h1>{solution.title}</h1>
            <p className="solution-detail-hero__summary">{solution.summary}</p>
            <p className="solution-detail-hero__scope">{solution.scope}</p>
            <div className="solution-detail-actions">
              <Link
                href="#solution-path"
                className="solution-detail-button solution-detail-button--primary"
              >
                查看方案路径
              </Link>
              <Link
                href="/contact"
                className="solution-detail-button solution-detail-button--ghost"
              >
                咨询方案顾问
              </Link>
            </div>
          </div>

          <div
            className="solution-detail-visual"
            role="img"
            aria-label={`${solution.name}方案流程`}
          >
            <div className="solution-detail-visual__label">
              <span>{solution.code}</span>
              <strong>{solution.visualLabel}</strong>
            </div>
            <div className="solution-detail-visual__flow">
              {solution.visualNodes.map((node, index) => (
                <div className="solution-detail-visual__node" key={node}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{node}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="solution-detail-metrics" aria-label="方案关键指标">
        <div className="solution-detail-shell solution-detail-metrics__inner">
          {solution.metrics.map((metric) => (
            <article key={metric.label}>
              <strong>{metric.value}</strong>
              <div>
                <h2>{metric.label}</h2>
                <p>{metric.note}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="solution-detail-section solution-detail-overview">
        <div className="solution-detail-shell">
          <header className="solution-detail-heading">
            <div>
              <p className="solution-detail-kicker">SOLUTION OVERVIEW</p>
              <h2>方案概述</h2>
            </div>
            <p>
              内容依据现有方案资料整理，具体功能组合、交付范围与配置以项目评估为准。
            </p>
          </header>
          <div className="solution-detail-overview__grid">
            <div className="solution-detail-overview__content">
              <h3>{solution.overview.title}</h3>
              <p>{solution.overview.description}</p>
              <ul>
                {solution.overview.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
            <figure className="solution-detail-media">
              <div className="solution-detail-media__viewport">
                <Image
                  src={solution.media.src}
                  alt={solution.media.alt}
                  fill
                  sizes="(max-width: 820px) calc(100vw - 32px), 620px"
                  style={{ objectPosition: solution.media.position }}
                />
              </div>
              <figcaption>{solution.media.caption}</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="solution-detail-section solution-detail-challenges">
        <div className="solution-detail-shell">
          <header className="solution-detail-heading">
            <div>
              <p className="solution-detail-kicker">BUSINESS CHALLENGES</p>
              <h2>先明确业务问题，再确定技术边界</h2>
            </div>
            <p>
              方案从真实工作过程出发，先确认需要解决的问题、参与角色和交付结果，再评估数据、系统与算力条件。
            </p>
          </header>
          <div className="solution-detail-challenge-grid">
            {solution.challenges.map((challenge, index) => (
              <article key={challenge.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{challenge.title}</h3>
                <p>{challenge.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="solution-detail-section solution-detail-features">
        <div className="solution-detail-shell">
          <header className="solution-detail-heading">
            <div>
              <p className="solution-detail-kicker">SOLUTION FEATURES</p>
              <h2>方案特性</h2>
            </div>
            <p>以下特性来自对应方案资料，只呈现目前能够确认的能力范围。</p>
          </header>
          <div className="solution-detail-feature-grid">
            {solution.features.map((feature) => (
              <article key={feature.code}>
                <span>{feature.code}</span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="solution-detail-section solution-detail-path"
        id="solution-path"
      >
        <div className="solution-detail-shell">
          <header className="solution-detail-heading solution-detail-heading--light">
            <div>
              <p className="solution-detail-kicker">SOLUTION PATH</p>
              <h2>从输入到交付的完整方案路径</h2>
            </div>
            <p>
              每一步都对应可检查的输入、处理过程与成果，方便在试点阶段确认效果和实施范围。
            </p>
          </header>
          <div className="solution-detail-stage-list">
            {solution.stages.map((stage, index) => (
              <article key={stage.title}>
                <div className="solution-detail-stage-list__number">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="solution-detail-stage-list__content">
                  <h3>{stage.title}</h3>
                  <p>{stage.description}</p>
                  <ul>
                    {stage.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="solution-detail-section solution-detail-architecture">
        <div className="solution-detail-shell">
          <header className="solution-detail-heading">
            <div>
              <p className="solution-detail-kicker">SOLUTION ARCHITECTURE</p>
              <h2>业务、平台与基础设施分层协同</h2>
            </div>
            <p>
              详情页展示的是方案逻辑架构，实际部署会结合现有系统、数据安全要求和硬件环境进一步设计。
            </p>
          </header>
          <div className="solution-detail-layer-stack">
            {solution.layers.map((layer) => (
              <article key={layer.code}>
                <span>{layer.code}</span>
                <div>
                  <h3>{layer.title}</h3>
                  <p>{layer.description}</p>
                </div>
                <ul>
                  {layer.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="solution-detail-section solution-detail-scenarios">
        <div className="solution-detail-shell">
          <header className="solution-detail-heading">
            <div>
              <p className="solution-detail-kicker">TYPICAL SCENARIOS</p>
              <h2>从边界清晰的典型场景开始</h2>
            </div>
            <p>
              优先选择规则可描述、数据可获得、结果可验证的场景，降低首次实施的不确定性。
            </p>
          </header>
          <div className="solution-detail-scenario-grid">
            {solution.scenarios.map((scenario) => (
              <article key={scenario.title}>
                <p>{scenario.label}</p>
                <h3>{scenario.title}</h3>
                <span>{scenario.description}</span>
                <ul>
                  {scenario.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {solution.cases?.length ? (
        <section className="solution-detail-section solution-detail-cases">
          <div className="solution-detail-shell">
            <header className="solution-detail-heading">
              <div>
                <p className="solution-detail-kicker">REFERENCE CASES</p>
                <h2>典型案例</h2>
              </div>
              <p>
                案例名称、场景和结果均来自现有资料；匿名案例继续保留匿名口径。
              </p>
            </header>
            <div className="solution-detail-case-grid">
              {solution.cases.map((caseItem, index) => (
                <article key={caseItem.title}>
                  <div className="solution-detail-case-grid__topline">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <p>{caseItem.label}</p>
                  </div>
                  <h3>{caseItem.title}</h3>
                  <p>{caseItem.description}</p>
                  <ul>
                    {caseItem.results.map((result) => (
                      <li key={result}>{result}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="solution-detail-reference">
        <div className="solution-detail-shell solution-detail-reference__inner">
          <div className="solution-detail-reference__content">
            <p className="solution-detail-kicker">
              {solution.reference.eyebrow}
            </p>
            <h2>{solution.reference.title}</h2>
            <p>{solution.reference.description}</p>
          </div>
          <div className="solution-detail-reference__results">
            {solution.reference.results.map((result) => (
              <article key={result.label}>
                <strong>{result.value}</strong>
                <h3>{result.label}</h3>
                <p>{result.note}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="solution-detail-section solution-detail-related">
        <div className="solution-detail-shell">
          <header className="solution-detail-heading">
            <div>
              <p className="solution-detail-kicker">RELATED PRODUCTS</p>
              <h2>支撑本方案的产品能力</h2>
            </div>
            <p>
              以下为方案中可组合的产品能力。产品页用于查看功能和配置，方案页用于理解完整业务路径。
            </p>
          </header>
          <div className="solution-detail-related__grid">
            {solution.relatedProducts.map((product) => (
              <Link href={product.href} key={product.href}>
                <p>{product.label}</p>
                <h3>{product.title}</h3>
                <span>{product.description}</span>
                <strong>
                  查看产品 <i aria-hidden="true">↗</i>
                </strong>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {solution.faqs?.length ? (
        <section className="solution-detail-section solution-detail-faq">
          <div className="solution-detail-shell solution-detail-faq__inner">
            <header>
              <p className="solution-detail-kicker">FAQ</p>
              <h2>常见问题解答</h2>
              <span>
                以下回答依据当前方案资料整理，涉及部署和兼容性的结论需结合项目环境确认。
              </span>
            </header>
            <div className="solution-detail-faq__list">
              {solution.faqs.map((faq, index) => (
                <details key={faq.question} open={index === 0}>
                  <summary>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {faq.question}
                  </summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="solution-detail-cta">
        <div className="solution-detail-shell solution-detail-cta__inner">
          <div>
            <p className="solution-detail-kicker">NEXT STEP</p>
            <h2>从一个可验证的业务场景开始</h2>
            <span>联系我们确认场景边界、数据条件、系统接口与部署方式。</span>
          </div>
          <div className="solution-detail-cta__actions">
            <Link
              href="/solutions"
              className="solution-detail-button solution-detail-button--ghost-light"
            >
              返回方案总览
            </Link>
            <Link
              href="/contact"
              className="solution-detail-button solution-detail-button--primary"
            >
              联系方案顾问
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default async function SolutionDetailPage({
  params,
}: SolutionDetailPageProps) {
  const { slug } = await params;
  const solution = getSolutionDetail(slug);

  if (!solution) notFound();

  return <SolutionDetailView solution={solution} />;
}
