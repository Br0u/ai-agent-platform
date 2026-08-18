import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSolutionDetail,
  solutionDetailSlugs,
} from "@/components/solution-detail-content";
import { SolutionOverview } from "@/components/solution-overview";
import { isPublicEntryVisible } from "@/config/public-entry-policy";
import "../solutions.css";
import "./solution-detail.css";

type PageProps = { params: Promise<{ slug: string }> };

const productRoutes: Record<string, string> = {
  agents: "/product/agents",
  applications: "/product/applications",
  coding: "/product/coding",
  governance: "/product/governance",
  knowledge: "/product/agents",
  model: "/product/model",
};

function capabilityHref(product: string, anchor?: string) {
  const href = productRoutes[product] ?? "/product";
  return anchor ? `${href}#${anchor}` : href;
}

export function generateStaticParams() {
  return solutionDetailSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const detail = getSolutionDetail((await params).slug);
  if (!detail) return {};
  return { title: `${detail.title} · 华鲲元启`, description: detail.summary };
}

export default async function SolutionDetailPage({ params }: PageProps) {
  const detail = getSolutionDetail((await params).slug);
  if (!detail) notFound();

  return (
    <SolutionOverview>
      <article className="solution-detail-page">
        <section className="solution-detail-hero">
          <div>
            <h1>{detail.title}</h1>
            <p className="solution-detail-lead">{detail.summary}</p>
            <p className="solution-detail-audience">
              <b>适用对象：</b>
              {detail.audience}
            </p>
            <div className="solution-detail-tags" aria-label="方案价值">
              {detail.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="solution-detail-actions">
              <Link
                className="solution-detail-button solution-detail-button--primary"
                href={`/contact?topic=${detail.category}｜${detail.title}咨询`}
              >
                商务咨询
              </Link>
              {isPublicEntryVisible("/trial") ? (
                <Link className="solution-detail-button" href="/trial">
                  申请体验
                </Link>
              ) : null}
            </div>
          </div>
          <figure className="solution-detail-image solution-detail-image--hero">
            <Image
              fill
              priority
              alt={`${detail.title}首屏`}
              src={detail.images.main}
              sizes="(max-width: 780px) 100vw, 44vw"
            />
          </figure>
        </section>

        <section className="solution-detail-section solution-detail-scene">
          <div>
            <h2>业务场景与问题</h2>
            <p className="solution-detail-lead">{detail.summary}</p>
            <p>
              <b>业务痛点：</b>
              {detail.problem}
            </p>
            <p>
              <b>建设目标：</b>
              {detail.summary}
            </p>
            <p>
              <b>适用对象：</b>
              {detail.audience}
            </p>
            <p>
              围绕{detail.category}行业的实际业务运行，本方案将
              {detail.summary}
              ，通过平台能力组合形成可落地、可复用的智能化应用，帮助企业解决高频业务问题、提升作业效率、降低人工与风险成本。
            </p>
          </div>
          <figure className="solution-detail-image">
            <Image
              fill
              alt={`${detail.title}场景`}
              src={detail.images.scene}
              sizes="(max-width: 780px) 100vw, 42vw"
            />
          </figure>
        </section>

        <section className="solution-detail-section">
          <h2>落地效果与价值</h2>
          <div className="solution-detail-result">
            <div>
              {detail.case ? (
                <>
                  <h3>
                    {detail.case.client} · {detail.title}
                  </h3>
                  <p>
                    <b>业务挑战：</b>
                    {detail.case.problem}
                  </p>
                  <p>
                    <b>建设内容：</b>
                    {detail.case.solution}
                  </p>
                  <p>
                    <b>落地效果：</b>
                    {detail.case.effect}
                  </p>
                  {detail.case.closing ? <p>{detail.case.closing}</p> : null}
                </>
              ) : (
                <p>
                  {detail.summary}，通过组合{detail.category}
                  行业场景所需的能力，实现业务问题的自动化、智能化处理，形成可复制、可推广的解决方案。
                </p>
              )}
            </div>
            {detail.images.result ? (
              <figure className="solution-detail-image">
                <Image
                  fill
                  alt={`${detail.title}效果`}
                  src={detail.images.result}
                  sizes="(max-width: 780px) 100vw, 42vw"
                />
              </figure>
            ) : (
              <div className="solution-detail-metrics">
                {(
                  detail.metrics ?? [
                    {
                      title: "落地效果",
                      desc: "通过平台能力组合实现业务落地。",
                    },
                  ]
                ).map((metric) => (
                  <article key={metric.title}>
                    <b>{metric.title}</b>
                    <span>{metric.desc}</span>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="solution-detail-section">
          <h2>解决方案落地</h2>
          <p className="solution-detail-lead">
            本方案由以下核心能力组合构成，各能力相互协同，完整支撑
            {detail.title}的业务闭环。
          </p>
          <div className="solution-detail-capabilities">
            {detail.capabilities.map((capability, index) => (
              <article key={capability.name}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{capability.name}</h3>
                <p>{capability.desc}</p>
                <div>
                  {capability.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <p>
                  依托{" "}
                  <Link
                    href={capabilityHref(capability.product, capability.anchor)}
                  >
                    {capability.anchorLabel ?? "平台能力"} →
                  </Link>
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="solution-detail-section">
          <div className="solution-detail-cta">
            <div>
              <h2>需要落地行业 AI 解决方案？</h2>
              <p>
                如需了解金融、铁路、电力、半导体、公安、应急等行业的场景方案与落地实践，欢迎与华鲲团队联系。
              </p>
            </div>
            <Link
              className="solution-detail-button solution-detail-button--primary"
              href="/contact?topic=解决方案咨询"
            >
              联系我们
            </Link>
          </div>
        </section>
      </article>
    </SolutionOverview>
  );
}
