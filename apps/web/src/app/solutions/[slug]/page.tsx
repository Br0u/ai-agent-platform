import {
  getSolutionDetail,
  getSolutionReturnHref,
  solutionDetailSlugs,
  type CaseSolutionDetail,
  type CommonSolutionDetail,
  type IndustrySolutionDetail,
} from "@/components/solution-detail-content";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "./solution-detail.css";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ mode?: string }>;
};

type ScenarioSolutionDetail = CommonSolutionDetail | IndustrySolutionDetail;

function contactHref(
  detail: CommonSolutionDetail | IndustrySolutionDetail | CaseSolutionDetail,
) {
  const topic =
    detail.kind === "industry"
      ? `${detail.category}｜${detail.title}咨询`
      : detail.kind === "case"
        ? `${detail.title}｜类似项目咨询`
        : `${detail.title}咨询`;
  return `/contact?topic=${topic}`;
}

const caseApproachStages = [
  ["需求与资料梳理", "明确业务问题、使用对象、知识资料和数据边界。"],
  ["方案设计与能力准备", "确定知识处理、模型、智能体及应用的组合方式。"],
  ["场景建设与验证", "完成知识处理、智能体配置、业务测试和效果修正。"],
  [
    "上线使用与持续优化",
    "在授权范围内发布使用，并根据反馈维护知识和场景效果。",
  ],
] as const;

function SolutionHero({ detail }: { detail: ScenarioSolutionDetail }) {
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
              href={contactHref(detail)}
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

function ProductSupport({ detail }: { detail: ScenarioSolutionDetail }) {
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

function ClosingSection({
  detail,
  returnHref,
}: {
  detail: ScenarioSolutionDetail;
  returnHref: string;
}) {
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
        <div className="solution-detail-related">
          <h2>{industry ? "相关行业场景" : "相关解决方案"}</h2>
          <div
            className="solution-detail-products"
            data-testid="solution-related-list"
          >
            {detail.related.map((slug) => {
              const related = getSolutionDetail(slug);
              if (!related || related.kind === "case") return null;
              return (
                <article key={slug}>
                  <h3>
                    <Link href={`/solutions/${slug}`}>{related.title}</Link>
                  </h3>
                  {detail.kind === "common" ? <p>{related.summary}</p> : null}
                </article>
              );
            })}
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
              href={contactHref(detail)}
            >
              咨询当前方案
            </Link>
            <Link className="solution-detail-button" href="/trial">
              申请体验
            </Link>
            <a className="solution-detail-link" href={returnHref}>
              返回解决方案
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function CasePage({
  detail,
  returnHref,
}: {
  detail: CaseSolutionDetail;
  returnHref: string;
}) {
  const common = getSolutionDetail(detail.commonKey);
  const industry = getSolutionDetail(detail.industryKey);

  return (
    <main className="solution-detail" aria-label={`${detail.title}实践案例`}>
      <section className="solution-detail-hero">
        <div className="solution-detail-frame solution-detail-hero__layout">
          <div>
            <p className="solution-detail-eyebrow">实践案例｜待授权结构</p>
            <h1>{detail.title}</h1>
            <p className="solution-detail-lead">{detail.summary}</p>
            <p className="solution-detail-note">{detail.authorizationNotice}</p>
            <div className="solution-detail-tags" aria-label="案例基本信息">
              <span className="solution-detail-tag">{detail.customer}</span>
              <span className="solution-detail-tag">{detail.industry}</span>
              {detail.scenarios.map((scenario) => (
                <span className="solution-detail-tag" key={scenario}>
                  {scenario}
                </span>
              ))}
              {detail.products.map((product) => (
                <span className="solution-detail-tag" key={product}>
                  {product}
                </span>
              ))}
            </div>
            <div className="solution-detail-tags" aria-label="案例成果摘要">
              {detail.outcomes.map((outcome) => (
                <span className="solution-detail-tag" key={outcome}>
                  {outcome}
                </span>
              ))}
            </div>
            <div className="solution-detail-actions">
              <Link
                className="solution-detail-button solution-detail-button--primary"
                href={contactHref(detail)}
              >
                咨询类似项目
              </Link>
              <Link className="solution-detail-button" href="#case-related">
                查看关联解决方案
              </Link>
            </div>
          </div>
          <div className="solution-detail-visual">
            <span>客户 / 项目 / 应用效果素材</span>
            <small>未获公开授权前不展示真实客户或项目素材</small>
          </div>
        </div>
      </section>

      <section className="solution-detail-section">
        <div className="solution-detail-frame">
          <p className="solution-detail-eyebrow">
            02｜客户背景、业务挑战与建设目标
          </p>
          <h2>为什么建设这个项目</h2>
          <div className="solution-detail-components">
            {detail.profile.map(([label, value]) => (
              <article key={label}>
                <h3>{label}</h3>
                <p>{value}</p>
              </article>
            ))}
          </div>
          <h3 className="solution-detail-subheading">业务挑战与对应解决措施</h3>
          <p>
            点击挑战卡片，定位并高亮后续相应解决措施；当前内容均为结构占位。
          </p>
          <div className="solution-detail-components">
            {detail.challenges.map((challenge, index) => (
              <article key={challenge.name}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{challenge.name}</h3>
                <p>
                  <b>问题表现：</b>
                  {challenge.problem}
                </p>
                <p>
                  <b>业务影响：</b>
                  {challenge.impact}
                </p>
                <p>
                  <b>原有局限：</b>
                  {challenge.limitation}
                </p>
                <p>
                  <b>建设目标：</b>
                  {challenge.measure}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="solution-detail-section">
        <div className="solution-detail-frame">
          <p className="solution-detail-eyebrow">03｜整体思路与实施过程</p>
          <h2>从业务问题到场景上线的完整建设思路</h2>
          <p>
            围绕当前项目的业务目标，将企业知识与数据、模型和智能体能力组合为可使用的业务服务，并通过验证、上线和持续维护形成完整落地闭环。
          </p>
          <h3 className="solution-detail-subheading">核心建设内容</h3>
          <div className="solution-detail-components">
            {detail.architecture.map(([name, description]) => (
              <article key={name}>
                <h3>{name}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
          <h3 className="solution-detail-subheading">实施过程</h3>
          <p>
            说明项目从梳理到上线的主要阶段，不展开客户内部排期、人员安排和敏感交付细节。
          </p>
          <ol className="solution-detail-flow solution-detail-flow--described">
            {caseApproachStages.map(([name, description], index) => (
              <li data-testid="case-approach-stage" key={name}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <b>{name}</b>
                <p>{description}</p>
              </li>
            ))}
          </ol>
          <p className="solution-detail-note">
            页面只保留文字说明，不展示真实 IP
            地址、数据库结构、接口地址、部署参数或内部项目资料。
          </p>
        </div>
      </section>

      <section className="solution-detail-section">
        <div className="solution-detail-frame">
          <p className="solution-detail-eyebrow">04｜项目成果与素材展示</p>
          <h2>用经授权的事实说明项目成果</h2>
          <div className="solution-detail-products">
            {detail.results.map(([label, value]) => (
              <article key={label}>
                <h3>{label}</h3>
                <p>{value}</p>
              </article>
            ))}
          </div>
          <p className="solution-detail-note">
            量化成果必须标明统计口径或时间范围；没有可靠数据时不使用百分比、金额、排名或客户评价。
          </p>
          <h3 className="solution-detail-subheading">项目素材与成果展示</h3>
          <div className="solution-detail-products">
            {detail.materials.map(([label, value]) => (
              <article key={label}>
                <h3>{label}</h3>
                <p>{value}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="solution-detail-section solution-detail-closing"
        id="case-related"
      >
        <div className="solution-detail-frame">
          <p className="solution-detail-eyebrow">
            05｜关联方案、相关案例与行动收口
          </p>
          <h2>本案例为哪些解决方案提供实践证明</h2>
          <div className="solution-detail-products">
            {common?.kind === "common" ? (
              <article>
                <span className="solution-detail-tag">通用场景方案</span>
                <h3>{common.title}</h3>
                <p>说明本案例与对应业务问题及通用方案的实际关联。</p>
                <Link href={`/solutions/${detail.commonKey}`}>
                  查看通用场景方案 →
                </Link>
              </article>
            ) : null}
            {industry?.kind === "industry" ? (
              <article>
                <span className="solution-detail-tag">行业场景方案</span>
                <h3>{industry.title}</h3>
                <p>说明本案例在对应行业场景中的实践证明关系。</p>
                <Link href={`/solutions/${detail.industryKey}`}>
                  查看行业场景方案 →
                </Link>
              </article>
            ) : null}
          </div>
          <h3 className="solution-detail-subheading">相关案例</h3>
          <p className="solution-detail-note">
            首期没有第二个已授权案例时不强行推荐；后续可按相同行业、业务场景或建设方式展示
            2～3 个案例。
          </p>
          <div className="solution-detail-cta">
            <div>
              <h2>希望建设类似项目？</h2>
              <p>咨询表单将带入当前案例名称、行业、业务场景和关联产品能力。</p>
            </div>
            <div className="solution-detail-actions">
              <Link
                className="solution-detail-button solution-detail-button--primary"
                href={contactHref(detail)}
              >
                咨询类似项目
              </Link>
              <Link className="solution-detail-button" href="/trial">
                申请体验
              </Link>
              <a className="solution-detail-link" href={returnHref}>
                返回实践案例
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export function generateStaticParams() {
  return solutionDetailSlugs.map((slug) => ({ slug }));
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

export default async function Page({ params, searchParams }: PageProps) {
  const detail = getSolutionDetail((await params).slug);

  if (!detail) notFound();

  const returnHref = getSolutionReturnHref(detail, (await searchParams) ?? {});

  if (detail.kind === "case") {
    return <CasePage detail={detail} returnHref={returnHref} />;
  }

  return (
    <main className="solution-detail" aria-label={`${detail.title}解决方案`}>
      <SolutionHero detail={detail} />
      {detail.kind === "common" ? (
        <CommonSections detail={detail} />
      ) : (
        <IndustrySections detail={detail} />
      )}
      <ProductSupport detail={detail} />
      <ClosingSection detail={detail} returnHref={returnHref} />
    </main>
  );
}
