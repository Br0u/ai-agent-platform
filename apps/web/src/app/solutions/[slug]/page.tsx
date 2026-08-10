import {
  getSolutionDetail,
  type CommonSolutionDetail,
  type IndustrySolutionDetail,
  type SolutionDetail,
} from "@/components/solution-detail-content";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "./solution-detail.css";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function contactHref(title: string) {
  return `/contact?topic=${title}咨询`;
}

function SolutionHero({ detail }: { detail: SolutionDetail }) {
  return (
    <section className="solution-detail-hero">
      <div className="solution-detail-frame solution-detail-hero__layout">
        <div>
          <p className="solution-detail-eyebrow">
            {detail.kind === "common"
              ? `${detail.category}｜通用场景方案`
              : `行业解决方案｜${detail.category}`}
          </p>
          <h1>{detail.title}</h1>
          <p className="solution-detail-lead">{detail.summary}</p>
          <p className="solution-detail-audience">
            <b>适用对象：</b>
            {detail.audience}
          </p>
          <div className="solution-detail-tags" aria-label="方案价值">
            {detail.tags.map((tag) => (
              <span className="solution-detail-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
          <div className="solution-detail-actions">
            <Link
              className="solution-detail-button solution-detail-button--primary"
              href={contactHref(detail.title)}
            >
              {detail.kind === "common" ? "商务咨询" : "咨询当前行业场景"}
            </Link>
            <Link className="solution-detail-button" href="/trial">
              申请体验
            </Link>
            <Link className="solution-detail-link" href="#solution-products">
              查看相关产品能力 →
            </Link>
          </div>
        </div>
        <div className="solution-detail-visual">
          <span>{detail.title}</span>
          <small>总体架构 / 应用效果主视觉素材槽位</small>
        </div>
      </div>
    </section>
  );
}

function CommonSections({ detail }: { detail: CommonSolutionDetail }) {
  return (
    <>
      <section
        className="solution-detail-section"
        aria-labelledby="solution-problems-title"
      >
        <div className="solution-detail-frame">
          <p className="solution-detail-eyebrow">03｜业务问题与适用对象</p>
          <h2 id="solution-problems-title">先明确问题、影响与建设目标</h2>
          <div className="solution-detail-problem-grid">
            {detail.problems.map((problem) => (
              <article data-testid="solution-problem" key={problem}>
                <b>当前问题</b>
                <p>{problem}</p>
              </article>
            ))}
          </div>
          <div className="solution-detail-outcomes">
            <article>
              <b>业务影响</b>
              <p>信息、资源或流程使用链路较长，依赖人工查找、处理和协调。</p>
              <p>已有知识、数据和平台能力难以形成统一业务服务。</p>
            </article>
            <article>
              <b>建设目标</b>
              <p>{detail.summary}</p>
              <p>形成可维护、可验证、可继续扩展的企业 AI 能力。</p>
            </article>
          </div>
          <h3 className="solution-detail-subheading">重点适用场景</h3>
          <div className="solution-detail-scenarios">
            {detail.scenarios.map((scenario) => (
              <span key={scenario}>{scenario}</span>
            ))}
          </div>
        </div>
      </section>

      <section
        className="solution-detail-section"
        aria-labelledby="solution-components-title"
      >
        <div className="solution-detail-frame">
          <p className="solution-detail-eyebrow">
            04｜核心方案组成与业务运行流程
          </p>
          <h2 id="solution-components-title">方案如何组合并实际运行</h2>
          <p className="solution-detail-intro">
            仅组合当前场景需要的能力，不强制展示无关产品模块。
          </p>
          <div className="solution-detail-components">
            {detail.components.map((component, index) => (
              <article data-testid="solution-component" key={component}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{component}</h3>
                <p>
                  <b>模块作用：</b>说明该模块在“{detail.title}”中的职责和价值。
                </p>
                <p>
                  <b>输入与输出：</b>
                  预留输入条件、处理过程和输出结果说明位置。
                </p>
                <p>
                  <b>关联产品能力：</b>
                  {detail.products[index % detail.products.length].name}
                </p>
              </article>
            ))}
          </div>
          <h3 className="solution-detail-subheading">业务运行流程</h3>
          <ol className="solution-detail-flow">
            {detail.flow.map((step, index) => (
              <li data-testid="solution-flow-step" key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <b>{step}</b>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}

function IndustrySections({ detail }: { detail: IndustrySolutionDetail }) {
  return (
    <>
      <section
        className="solution-detail-section"
        aria-labelledby="solution-problems-title"
      >
        <div className="solution-detail-frame">
          <p className="solution-detail-eyebrow">02｜业务问题与适用对象</p>
          <h2 id="solution-problems-title">从行业问题到场景目标</h2>
          <div className="solution-detail-industry-problems">
            {detail.problems.map((item) => (
              <article data-testid="solution-problem" key={item.problem}>
                <div>
                  <b>问题</b>
                  <p>{item.problem}</p>
                </div>
                <div>
                  <b>影响</b>
                  <p>{item.impact}</p>
                </div>
                <div>
                  <b>目标</b>
                  <p>{item.goal}</p>
                </div>
              </article>
            ))}
          </div>
          <p className="solution-detail-note">
            <b>适用范围：</b>
            {detail.audience}。
            <span>
              页面不虚构客户痛点、量化结果或行业判断；医疗场景只用于信息处理、知识服务、运营及行政辅助。
            </span>
          </p>
        </div>
      </section>

      <section
        className="solution-detail-section"
        aria-labelledby="solution-components-title"
      >
        <div className="solution-detail-frame">
          <p className="solution-detail-eyebrow">03｜核心方案组成与运行流程</p>
          <h2 id="solution-components-title">组合能力完成当前行业场景</h2>
          <p className="solution-detail-intro">
            核心组成说明方案如何形成，不重复产品后台全部功能；每张卡片只保留作用、输入、输出和关联能力。
          </p>
          <div className="solution-detail-components solution-detail-components--industry">
            {detail.components.map((component, index) => (
              <article data-testid="solution-component" key={component.name}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{component.name}</h3>
                <p>{component.role}</p>
                <p>
                  <b>输入：</b>
                  {component.input}
                </p>
                <p>
                  <b>输出：</b>
                  {component.output}
                </p>
                <small>{component.product}</small>
              </article>
            ))}
          </div>
          <h3 className="solution-detail-subheading">业务运行流程</h3>
          <ol className="solution-detail-flow solution-detail-flow--described">
            {detail.flow.map((step, index) => (
              <li data-testid="solution-flow-step" key={step.label}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <b>{step.label}</b>
                <p>{step.description}</p>
                <small>{step.media}</small>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}

function ProductSupport({ detail }: { detail: SolutionDetail }) {
  return (
    <section
      className="solution-detail-section"
      id="solution-products"
      aria-labelledby="solution-products-title"
    >
      <div className="solution-detail-frame">
        <p className="solution-detail-eyebrow">05｜华鲲产品能力支撑</p>
        <h2 id="solution-products-title">当前方案实际使用的产品能力</h2>
        <p className="solution-detail-intro">
          仅说明产品能力在本方案中的作用，完整功能和界面进入对应产品页面查看。
        </p>
        <div className="solution-detail-products">
          {detail.products.map((product) => (
            <article data-testid="solution-product" key={product.href}>
              <h3>{product.name}</h3>
              <p>{product.role}</p>
              <p>
                <b>在本方案中的作用：</b>支撑“{detail.title}
                ”对应模块与业务流程。
              </p>
              <Link href={product.href}>查看对应产品能力 →</Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingSection({ detail }: { detail: SolutionDetail }) {
  const industry = detail.kind === "industry";

  return (
    <section className="solution-detail-section solution-detail-closing">
      <div className="solution-detail-frame">
        <p className="solution-detail-eyebrow">
          {industry ? "05" : "06"}｜实践案例、相关方案与行动收口
        </p>
        <div className="solution-detail-case">
          <div className="solution-detail-case__visual">
            客户 / 项目 / 应用效果素材
            <br />
            待公开授权后补充
          </div>
          <div>
            <h2>案例内容待授权补充</h2>
            <p>
              {industry
                ? "后续填写行业、业务问题、建设内容、使用产品能力和已经授权公开的成果摘要。"
                : "客户或行业、面临问题、使用方案、关联产品能力及公开成果均待授权。"}
            </p>
            <p className="solution-detail-note">
              {industry
                ? "正式官网没有可公开案例时隐藏案例区域，不虚构客户名称和成果数据。"
                : "正式官网没有可公开案例时隐藏案例内容，不虚构客户名称、成果和数字。"}
            </p>
          </div>
        </div>
        <div className="solution-detail-cta">
          <div>
            <h2>
              {industry
                ? `沟通“${detail.title}”的实际建设需求`
                : `需要进一步评估“${detail.title}”？`}
            </h2>
            <p>
              咨询表单将带入方案名称、来源产品页面和浏览路径；私有化部署、数据接入和系统集成需求优先进入商务咨询。
            </p>
          </div>
          <div className="solution-detail-actions">
            <Link
              className="solution-detail-button solution-detail-button--primary"
              href={contactHref(detail.title)}
            >
              咨询当前方案
            </Link>
            <Link className="solution-detail-button" href="/trial">
              申请体验
            </Link>
            <Link className="solution-detail-link" href="/solutions">
              返回解决方案
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const detail = getSolutionDetail((await params).slug);

  if (!detail) return { title: "解决方案未找到 · 华鲲" };

  return {
    title: `${detail.title} · 华鲲解决方案`,
    description: detail.summary,
  };
}

export default async function Page({ params }: PageProps) {
  const detail = getSolutionDetail((await params).slug);

  if (!detail) notFound();

  return (
    <main className="solution-detail" aria-label={`${detail.title}解决方案`}>
      <SolutionHero detail={detail} />
      {detail.kind === "common" ? (
        <CommonSections detail={detail} />
      ) : (
        <IndustrySections detail={detail} />
      )}
      <ProductSupport detail={detail} />
      <ClosingSection detail={detail} />
    </main>
  );
}
