import Image from "next/image";
import Link from "next/link";
import wordmark from "@/assets/huakun-yuanqi/wordmark.png";
import {
  deliveryMethod,
  discoveryGoals,
  industryCoverage,
  solutionGroups,
  solutions,
  type ResourceState,
  type Solution,
  type SolutionScene,
  type SolutionStatus,
  type SolutionVariant,
} from "./solution-content";
import "./solutions.css";

function StatusBadge({ status }: { status: SolutionStatus }) {
  return (
    <span className={"solution-status solution-status--" + status}>
      {status === "published" ? "已发布" : "方案预览"}
    </span>
  );
}

function ResourceStateBadge({ state }: { state: ResourceState }) {
  const label = {
    live: "可访问",
    scaffold: "内容待补",
    placeholder: "接口预留",
  }[state];

  return (
    <span
      className={"solution-resource-state solution-resource-state--" + state}
    >
      {label}
    </span>
  );
}

function Wordmark({ priority = false }: { priority?: boolean }) {
  return (
    <Image
      className="solutions-wordmark"
      src={wordmark}
      alt="华鲲元启"
      width={817}
      height={219}
      priority={priority}
    />
  );
}

function SolutionMotif({
  variant,
  compact = false,
}: {
  variant: SolutionVariant;
  compact?: boolean;
}) {
  const labels = {
    studio: ["场景", "知识", "模型", "智能体", "评测", "运营"],
    vision: ["视频", "解析", "规则", "复核", "处置", "反馈"],
    service: ["问", "定", "传", "填", "预审", "办"],
    office: ["写作", "合同", "投标", "会议", "知识", "复核"],
    "full-stack": ["应用", "智能体", "平台", "模型", "资源", "算力"],
    infrastructure: ["负载", "管控", "虚拟化", "AI", "硬件", "运维"],
  }[variant];

  return (
    <div
      className={
        "solution-motif solution-motif--" +
        variant +
        (compact ? " solution-motif--compact" : "")
      }
      aria-label={labels.join("到") + "的方案链路"}
    >
      <div className="solution-motif__top">
        <span>{variant.replace("-", " ").toUpperCase()}</span>
        <i />
        <small>READY FOR ASSESSMENT</small>
      </div>
      <div className="solution-motif__flow">
        {labels.map((label, index) => (
          <div
            key={label}
            className={index === labels.length - 1 ? "is-last" : undefined}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </div>
      <div className="solution-motif__pulse" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

export function SolutionsPageContent() {
  const businessSolutions = solutions.filter(
    (solution) => solution.category === "business",
  );
  const foundationSolutions = solutions.filter(
    (solution) => solution.category === "foundation",
  );

  return (
    <main className="solutions-page">
      <section className="solutions-hero" aria-labelledby="solutions-title">
        <div className="solutions-frame solutions-hero__grid">
          <div className="solutions-hero__copy">
            <Wordmark priority />
            <p className="solutions-kicker">HUAKUN ENTERPRISE SOLUTIONS</p>
            <h1 id="solutions-title">
              从业务问题出发，把 AI 交付成可运行的系统
            </h1>
            <p className="solutions-hero__lead">
              不是简单介绍某个产品，而是围绕客户目标，把元启平台、行业智能体、模型、算力、现有系统和专家服务组合成可部署、可验收、可持续运营的方案。
            </p>
            <div className="solutions-actions">
              <a
                className="solutions-button solutions-button--primary"
                href="#solution-selector"
              >
                按业务目标选择方案
              </a>
              <Link className="solutions-button" href="/contact">
                发起方案评估
              </Link>
            </div>
            <div
              className="solutions-hero__principles"
              aria-label="解决方案原则"
            >
              <span>客户场景优先</span>
              <span>私有化可选</span>
              <span>人工责任明确</span>
              <span>指标按环境验收</span>
            </div>
          </div>
          <aside
            className="solution-decision-board"
            aria-label="解决方案决策路径"
          >
            <div className="solution-decision-board__head">
              <span>SOLUTION DECISION PATH</span>
              <strong>先回答三个问题</strong>
            </div>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>要改变哪个业务流程？</strong>
                  <small>定义用户、问题与目标结果</small>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>现有数据与系统是什么？</strong>
                  <small>确认知识、视频、接口与安全边界</small>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>怎样部署、交付和验收？</strong>
                  <small>形成组合、阶段、责任与指标</small>
                </div>
              </li>
            </ol>
            <div className="solution-decision-board__result">
              <span>OUTPUT</span>
              <strong>可评估的企业 AI 方案</strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="solution-value-chain" aria-label="解决方案价值链">
        <div className="solutions-frame">
          {["业务问题", "方案组合", "技术与部署", "交付与验收", "持续运营"].map(
            (item, index) => (
              <div key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item}</strong>
              </div>
            ),
          )}
        </div>
      </section>

      <section
        className="solutions-section solution-selector"
        id="solution-selector"
        aria-labelledby="selector-title"
      >
        <div className="solutions-frame">
          <header className="solutions-heading solutions-heading--split">
            <div>
              <p className="solutions-kicker">START WITH YOUR GOAL / 01</p>
              <h2 id="selector-title">你现在最需要解决什么？</h2>
            </div>
            <p>
              客户不必先知道产品名。选择最接近的业务目标，再进入产品组合、部署条件和实施路径。
            </p>
          </header>
          <div className="solution-goal-grid">
            {discoveryGoals.map((goal, index) => (
              <Link
                href={goal.href}
                key={goal.code}
                className="solution-goal-card"
              >
                <div>
                  <span>{goal.code}</span>
                  <small>{String(index + 1).padStart(2, "0")}</small>
                </div>
                <h3>{goal.title}</h3>
                <p>{goal.description}</p>
                <strong>
                  进入方案 <span aria-hidden="true">↗</span>
                </strong>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section
        className="solutions-section solution-catalog"
        aria-labelledby="catalog-title"
      >
        <div className="solutions-frame">
          <header className="solutions-heading solutions-heading--split">
            <div>
              <p className="solutions-kicker">SOLUTION PORTFOLIO / 02</p>
              <h2 id="catalog-title">四个业务方案，两层技术底座</h2>
            </div>
            <p>
              业务方案负责形成现场闭环；全栈与超融合负责跨场景的平台、资源和运营能力。
            </p>
          </header>
          {solutionGroups.map((group) => {
            const groupSolutions =
              group.id === "business" ? businessSolutions : foundationSolutions;
            return (
              <div className="solution-group" key={group.id}>
                <div className="solution-group__intro">
                  <span>{group.code}</span>
                  <h3>{group.title}</h3>
                  <p>{group.description}</p>
                </div>
                <div className={"solution-cards solution-cards--" + group.id}>
                  {groupSolutions.map((solution) => (
                    <article
                      className={
                        "solution-card solution-card--" + solution.variant
                      }
                      key={solution.slug}
                    >
                      <div className="solution-card__meta">
                        <StatusBadge status={solution.status} />
                        <span>{solution.eyebrow}</span>
                      </div>
                      <SolutionMotif variant={solution.variant} compact />
                      <p className="solution-card__official">
                        {solution.officialName}
                      </p>
                      <h4>{solution.title}</h4>
                      <p className="solution-card__statement">
                        {solution.statement}
                      </p>
                      <div className="solution-card__fit">
                        <span>适合</span>
                        <strong>
                          {solution.audience.slice(0, 2).join(" · ")}
                        </strong>
                      </div>
                      <Link href={"/solutions/" + solution.slug}>
                        查看完整方案 <span aria-hidden="true">→</span>
                      </Link>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section
        className="solutions-section solutions-section--dark solution-foundation-map"
        aria-labelledby="foundation-title"
      >
        <div className="solutions-frame solution-foundation-map__grid">
          <header className="solutions-heading">
            <p className="solutions-kicker">REFERENCE ARCHITECTURE / 03</p>
            <h2 id="foundation-title">
              业务方案共享底座，但不共享同一种业务流程
            </h2>
            <p>
              同一套平台、模型和算力可以服务多个场景；每个场景仍需独立定义输入、人工责任、系统接口和验收指标。
            </p>
            <div className="solutions-actions">
              <Link
                className="solutions-button solutions-button--light"
                href="/solutions/yuanqi-ai-full-stack"
              >
                查看全栈建设
              </Link>
              <Link
                className="solutions-button solutions-button--dark-outline"
                href="/solutions/tghci-ai"
              >
                查看超融合底座
              </Link>
            </div>
          </header>
          <div className="solution-stack-map" aria-label="企业 AI 六层参考架构">
            {[
              ["L01", "行业与业务应用", "办公 · 政务 · 视觉 · 行业智能体"],
              ["L02", "智能体与工作流", "任务 · 工具 · 人工节点 · 业务系统"],
              ["L03", "元启 TGDataXAI", "知识 · 模型 · 评测 · 权限 · 发布"],
              ["L04", "模型服务", "语言 · 多模态 · 视觉 · 语音"],
              ["L05", "TGHCI 资源管理", "集群 · 资源池 · 调度 · 运维"],
              ["L06", "鲲鹏 / 昇腾基础设施", "训练 · 推理 · 存储 · 网络"],
            ].map(([code, title, description]) => (
              <div key={code}>
                <span>{code}</span>
                <strong>{title}</strong>
                <small>{description}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="solutions-section solution-industry-index"
        aria-labelledby="industry-title"
      >
        <div className="solutions-frame">
          <header className="solutions-heading solutions-heading--split">
            <div>
              <p className="solutions-kicker">DISCOVER BY INDUSTRY / 04</p>
              <h2 id="industry-title">行业是发现入口，不是重复建设六套页面</h2>
            </div>
            <p>
              每个行业可组合多个业务方案与技术底座。正式行业详情页应在具备场景、产品组合、交付边界和公开案例后再发布。
            </p>
          </header>
          <div className="solution-industry-grid">
            {industryCoverage.map((industry, index) => (
              <div key={industry}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{industry}</strong>
                <small>关联方案将在 CMS 中按标签聚合</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="solutions-section solution-delivery-method"
        aria-labelledby="delivery-title"
      >
        <div className="solutions-frame">
          <header className="solutions-heading solutions-heading--split">
            <div>
              <p className="solutions-kicker">FROM POC TO PRODUCTION / 05</p>
              <h2 id="delivery-title">
                每个阶段都有产出，不把演示当作生产交付
              </h2>
            </div>
            <p>
              实际周期与范围由场景、数据、网络、系统接口和安全要求共同决定。
            </p>
          </header>
          <ol className="solution-delivery-grid">
            {deliveryMethod.map((step) => (
              <li key={step.code}>
                <span>{step.code}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="solutions-section solution-resource-hub"
        aria-labelledby="resource-hub-title"
      >
        <div className="solutions-frame solution-resource-hub__grid">
          <div>
            <p className="solutions-kicker">EVIDENCE & RESOURCES / 06</p>
            <h2 id="resource-hub-title">
              让产品、文档、兼容、下载和案例各自承担真实职责
            </h2>
            <p>
              解决方案页解释为什么选、如何组合与怎样落地；具体产品能力、部署文档、兼容数据和制品下载由对应中心维护。
            </p>
          </div>
          <div className="solution-resource-links">
            {[
              [
                "产品中心",
                "查看 TGDataXAI、TGHCI 与行业智能体",
                "/product",
                "可访问",
              ],
              [
                "部署文档",
                "查看部署、升级与运维入口",
                "/docs/deployment",
                "内容待补",
              ],
              [
                "兼容矩阵",
                "核对硬件、系统、加速卡与依赖",
                "/compatibility",
                "内容待补",
              ],
              ["下载中心", "正式制品仓库尚未接入", "/downloads", "接口预留"],
              ["客户案例", "只展示已授权案例与完整口径", "/cases", "内容待补"],
            ].map(([title, description, href, state]) => (
              <Link href={href} key={title}>
                <span>{state}</span>
                <strong>{title}</strong>
                <small>{description}</small>
                <b aria-hidden="true">↗</b>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SolutionCTA />
    </main>
  );
}

function SolutionLocalNav({ solution }: { solution: Solution }) {
  return (
    <nav
      className="solution-local-nav"
      aria-label={solution.shortTitle + "页内导航"}
    >
      <div className="solutions-frame">
        <Link href="/solutions">全部方案</Link>
        <div>
          {[
            ["overview", "方案概览"],
            ["challenges", "客户挑战"],
            ["composition", "产品组合"],
            ["architecture", "架构与流程"],
            ["delivery", "部署交付"],
            ["resources", "资料与接口"],
          ].map(([href, label]) => (
            <a href={"#" + href} key={href}>
              {label}
            </a>
          ))}
        </div>
        <Link href={"/contact?solution=" + solution.slug}>方案评估</Link>
      </div>
    </nav>
  );
}

function DecisionSummary({ solution }: { solution: Solution }) {
  const items = [
    ["适合谁", solution.audience.slice(0, 3).join(" · ")],
    ["何时启动", solution.triggerEvents[0]],
    ["主要部署", solution.deploymentSummary],
    ["内容成熟度", solution.maturityNote],
  ];
  return (
    <aside className="solution-decision-summary" aria-label="方案决策摘要">
      <div className="solution-decision-summary__head">
        <span>DECISION SUMMARY</span>
        <strong>先判断是否适合你</strong>
      </div>
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <p>{value}</p>
        </div>
      ))}
    </aside>
  );
}

function SolutionProblemMap({ solution }: { solution: Solution }) {
  return (
    <section
      className="solutions-section solution-problem-map"
      id="composition"
      aria-labelledby="composition-title"
    >
      <div className="solutions-frame">
        <header className="solutions-heading solutions-heading--split">
          <div>
            <p className="solutions-kicker">
              PROBLEM → COMBINATION → OUTCOME / 03
            </p>
            <h2 id="composition-title">
              每一个组件，都必须解释它为何出现在方案里
            </h2>
          </div>
          <p>
            产品中心负责介绍产品；这里说明它在当前业务问题中的角色、必选程度和连接关系。
          </p>
        </header>
        <div className="solution-map">
          <div className="solution-map__column solution-map__column--problem">
            <div className="solution-map__title">
              <span>01</span>
              <strong>业务问题</strong>
            </div>
            {solution.challenges.slice(0, 3).map((challenge) => (
              <article key={challenge.title}>
                <h3>{challenge.title}</h3>
                <p>{challenge.impact}</p>
              </article>
            ))}
          </div>
          <div className="solution-map__connector" aria-hidden="true">
            →
          </div>
          <div className="solution-map__column solution-map__column--component">
            <div className="solution-map__title">
              <span>02</span>
              <strong>产品与能力组合</strong>
            </div>
            {solution.components.map((component) => (
              <article key={component.name}>
                <div>
                  <span>{component.type}</span>
                  <small>{component.requirement}</small>
                </div>
                {component.href ? (
                  <Link href={component.href}>{component.name} ↗</Link>
                ) : (
                  <h3>{component.name}</h3>
                )}
                <p>{component.role}</p>
              </article>
            ))}
          </div>
          <div className="solution-map__connector" aria-hidden="true">
            →
          </div>
          <div className="solution-map__column solution-map__column--outcome">
            <div className="solution-map__title">
              <span>03</span>
              <strong>目标结果</strong>
            </div>
            {solution.outcomes.map((outcome) => (
              <article key={outcome.title}>
                <h3>{outcome.title}</h3>
                <p>{outcome.description}</p>
              </article>
            ))}
            <div className="solution-map__deployment">
              <span>DEPLOYMENT</span>
              <strong>{solution.deploymentSummary}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SolutionWorkflow({ solution }: { solution: Solution }) {
  return (
    <section
      className={
        "solutions-section solution-workflow solution-workflow--" +
        solution.variant
      }
      id="architecture"
      aria-labelledby="workflow-title"
    >
      <div className="solutions-frame">
        <header className="solutions-heading solutions-heading--split">
          <div>
            <p className="solutions-kicker">{solution.signature.eyebrow}</p>
            <h2 id="workflow-title">{solution.signature.title}</h2>
          </div>
          <p>{solution.signature.description}</p>
        </header>
        <div className="solution-workflow__stage">
          <div className="solution-workflow__rail" aria-hidden="true">
            <span>{solution.variant.toUpperCase()}</span>
            <i />
            <small>BUSINESS FLOW</small>
          </div>
          <ol>
            {solution.workflow.map((step, index) => (
              <li key={step.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <strong>{step.output}</strong>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function SolutionArchitecture({ solution }: { solution: Solution }) {
  return (
    <section
      className="solutions-section solutions-section--dark solution-architecture"
      aria-labelledby="architecture-title"
    >
      <div className="solutions-frame">
        <header className="solutions-heading solutions-heading--split">
          <div>
            <p className="solutions-kicker">REFERENCE ARCHITECTURE</p>
            <h2 id="architecture-title">业务流、数据流和运营流在这里汇合</h2>
          </div>
          <p>
            参考架构用于解释责任关系，不替代项目的网络、容量、HA、安全和接口设计。
          </p>
        </header>
        <div className="solution-architecture__layers">
          {solution.architecture.map((layer, index) => (
            <article key={layer.code}>
              <div>
                <span>{layer.code}</span>
                <small>L{String(index + 1).padStart(2, "0")}</small>
              </div>
              <h3>{layer.title}</h3>
              <p>{layer.description}</p>
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
  );
}

function SolutionDelivery({ solution }: { solution: Solution }) {
  return (
    <>
      <section
        className="solutions-section solution-deployment"
        id="delivery"
        aria-labelledby="deployment-title"
      >
        <div className="solutions-frame">
          <header className="solutions-heading solutions-heading--split">
            <div>
              <p className="solutions-kicker">DEPLOYMENT & INTEGRATION / 07</p>
              <h2 id="deployment-title">
                部署方式由现场条件决定，接口状态必须透明
              </h2>
            </div>
            <p>
              “内容待补”代表已有页面框架但缺正式资料；“接口预留”代表尚未连接真实外部系统。
            </p>
          </header>
          <div className="solution-deployment__grid">
            <div className="solution-deployment__modes">
              {solution.deploymentModes.map((mode) => (
                <article key={mode.title}>
                  <span>{mode.state}</span>
                  <h3>{mode.title}</h3>
                  <p>{mode.fit}</p>
                  <ul>
                    {mode.includes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <aside className="solution-integration-panel">
              <div>
                <span>INTEGRATION STATUS</span>
                <strong>系统连接</strong>
              </div>
              {solution.integrations.map((integration) => (
                <article key={integration.name}>
                  <div>
                    <h3>{integration.name}</h3>
                    <ResourceStateBadge state={integration.state} />
                  </div>
                  <p>{integration.purpose}</p>
                </article>
              ))}
            </aside>
          </div>
        </div>
      </section>

      <section
        className="solutions-section solution-implementation"
        aria-labelledby="implementation-title"
      >
        <div className="solutions-frame">
          <header className="solutions-heading solutions-heading--split">
            <div>
              <p className="solutions-kicker">IMPLEMENTATION / 08</p>
              <h2 id="implementation-title">从评估到运营移交</h2>
            </div>
            <p>每个阶段都有明确活动和交付物，避免只交付服务器或只完成演示。</p>
          </header>
          <ol>
            {solution.implementation.map((step, index) => (
              <li key={step.phase}>
                <div>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <small>{step.phase}</small>
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <strong>{step.output}</strong>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="solutions-section solution-readiness"
        aria-labelledby="readiness-title"
      >
        <div className="solutions-frame">
          <header className="solutions-heading solutions-heading--split">
            <div>
              <p className="solutions-kicker">DELIVERY READINESS / 09</p>
              <h2 id="readiness-title">华鲲交付什么，客户需要准备什么</h2>
            </div>
            <p>最终合同、软件版本和服务范围以项目确认文件为准。</p>
          </header>
          <div className="solution-readiness__grid">
            <div>
              <div className="solution-subhead">
                <span>DELIVERABLES</span>
                <strong>标准交付组成</strong>
              </div>
              {solution.deliverables.map((item, index) => (
                <article key={item.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                </article>
              ))}
            </div>
            <div>
              <div className="solution-subhead">
                <span>PREREQUISITES</span>
                <strong>前置条件与责任方</strong>
              </div>
              {solution.prerequisites.map((item) => (
                <article key={item.title}>
                  <span>{item.owner}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function SolutionResources({ solution }: { solution: Solution }) {
  return (
    <section
      className="solutions-section solution-resources"
      id="resources"
      aria-labelledby="resources-title"
    >
      <div className="solutions-frame">
        <header className="solutions-heading solutions-heading--split">
          <div>
            <p className="solutions-kicker">ACCEPTANCE & RESOURCES / 10</p>
            <h2 id="resources-title">先定义怎样证明有效，再决定公开哪些数字</h2>
          </div>
          <p>
            没有软硬件版本、输入条件、测试方法和授权的数字不会进入公开指标。
          </p>
        </header>
        <div className="solution-acceptance">
          <div className="solution-acceptance__table">
            <div className="solution-acceptance__row solution-acceptance__row--head">
              <span>验收维度</span>
              <span>验收方式</span>
              <span>状态</span>
            </div>
            {solution.acceptance.map((item) => (
              <div className="solution-acceptance__row" key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <span>{item.state}</span>
              </div>
            ))}
          </div>
          <aside className="solution-resource-panel">
            <div>
              <span>RELATED RESOURCES</span>
              <strong>对应中心与预留接口</strong>
            </div>
            {solution.resources.map((resource) => (
              <Link href={resource.href} key={resource.label}>
                <div>
                  <strong>{resource.label}</strong>
                  <ResourceStateBadge state={resource.state} />
                </div>
                <p>{resource.description}</p>
                <span>进入对应入口 →</span>
              </Link>
            ))}
          </aside>
        </div>
      </div>
    </section>
  );
}

function SolutionFaq({ solution }: { solution: Solution }) {
  return (
    <section
      className="solutions-section solution-faq"
      aria-labelledby="faq-title"
    >
      <div className="solutions-frame solution-faq__grid">
        <header className="solutions-heading">
          <p className="solutions-kicker">IMPLEMENTATION FAQ / 11</p>
          <h2 id="faq-title">实施前常见问题</h2>
          <p>这里回答方案边界；具体产品使用和故障处理进入文档与支持中心。</p>
        </header>
        <div>
          {solution.faqs.map((faq, index) => (
            <details key={faq.question} open={index === 0}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SolutionDetail({ solution }: { solution: Solution }) {
  return (
    <main
      className={
        "solutions-page solution-detail solution-detail--" + solution.variant
      }
    >
      <SolutionLocalNav solution={solution} />
      <section
        className="solution-detail-hero"
        id="overview"
        aria-labelledby="solution-title"
      >
        <div className="solutions-frame">
          <div className="solution-detail-hero__meta">
            <Link href="/solutions">解决方案</Link>
            <span>/</span>
            <span>{solution.shortTitle}</span>
            <StatusBadge status={solution.status} />
          </div>
          <div className="solution-detail-hero__grid">
            <div>
              <Wordmark />
              <p className="solutions-kicker">{solution.eyebrow}</p>
              <p className="solution-detail-hero__official">
                {solution.officialName}
              </p>
              <h1 id="solution-title">{solution.title}</h1>
              <p className="solution-detail-hero__statement">
                {solution.statement}
              </p>
              <p className="solution-detail-hero__summary">
                {solution.summary}
              </p>
              <div className="solutions-actions">
                <Link
                  className="solutions-button solutions-button--primary"
                  href={"/contact?solution=" + solution.slug}
                >
                  预约方案评估
                </Link>
                <a className="solutions-button" href="#composition">
                  查看产品组合
                </a>
              </div>
              <div className="solution-detail-hero__review">
                <span>{solution.contentStatus}</span>
                <span>最近审核 {solution.lastReviewed}</span>
              </div>
            </div>
            <div>
              <SolutionMotif variant={solution.variant} />
              <DecisionSummary solution={solution} />
            </div>
          </div>
        </div>
      </section>

      <section className="solution-outcome-rail" aria-label="方案目标结果">
        <div className="solutions-frame">
          {solution.outcomes.map((outcome, index) => (
            <div key={outcome.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{outcome.title}</strong>
              <small>{outcome.description}</small>
            </div>
          ))}
        </div>
      </section>

      <section
        className="solutions-section solution-challenges"
        id="challenges"
        aria-labelledby="challenges-title"
      >
        <div className="solutions-frame">
          <header className="solutions-heading solutions-heading--split">
            <div>
              <p className="solutions-kicker">CUSTOMER CHALLENGES / 01</p>
              <h2 id="challenges-title">先把当前业务阻力讲清楚</h2>
            </div>
            <p>{solution.objective}</p>
          </header>
          <div className="solution-challenge-grid">
            {solution.challenges.map((challenge, index) => (
              <article key={challenge.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{challenge.title}</h3>
                <p>{challenge.current}</p>
                <strong>{challenge.impact}</strong>
              </article>
            ))}
          </div>
          <div className="solution-trigger-strip">
            <span>建议启动评估的信号</span>
            {solution.triggerEvents.map((trigger) => (
              <strong key={trigger}>{trigger}</strong>
            ))}
          </div>
        </div>
      </section>

      <SolutionProblemMap solution={solution} />

      <section
        className="solutions-section solution-capabilities"
        aria-labelledby="capabilities-title"
      >
        <div className="solutions-frame">
          <header className="solutions-heading solutions-heading--split">
            <div>
              <p className="solutions-kicker">CORE CAPABILITIES / 04</p>
              <h2 id="capabilities-title">能力必须连接业务价值</h2>
            </div>
            <p>
              这里不重复产品功能大全，只保留对当前方案结果有直接作用的能力。
            </p>
          </header>
          <div className="solution-capability-grid">
            {solution.capabilities.map((capability, index) => (
              <article key={capability.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
                <strong>{capability.value}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <SolutionWorkflow solution={solution} />
      <SolutionArchitecture solution={solution} />

      <section
        className="solutions-section solution-scenarios"
        aria-labelledby="scenarios-title"
      >
        <div className="solutions-frame">
          <header className="solutions-heading solutions-heading--split">
            <div>
              <p className="solutions-kicker">BUSINESS SCENARIOS / 06</p>
              <h2 id="scenarios-title">先从一个能形成闭环的场景开始</h2>
            </div>
            <Link
              href={
                "/solutions/" +
                solution.slug +
                "/scenarios/" +
                solution.scene.slug
              }
            >
              查看场景蓝图：{solution.scene.title} →
            </Link>
          </header>
          <div className="solution-scenario-grid">
            {solution.scenarios.map((scenario, index) => (
              <article key={scenario.title}>
                <div>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <small>{scenario.users}</small>
                </div>
                <h3>{scenario.title}</h3>
                <p>{scenario.description}</p>
              </article>
            ))}
          </div>
          <Link
            className="solution-featured-scene"
            href={
              "/solutions/" +
              solution.slug +
              "/scenarios/" +
              solution.scene.slug
            }
          >
            <div>
              <span>FEATURED SCENARIO</span>
              <h3>{solution.scene.title}</h3>
              <p>{solution.scene.summary}</p>
            </div>
            <strong>
              查看输入、流程、集成、治理与待核实资料{" "}
              <span aria-hidden="true">↗</span>
            </strong>
          </Link>
        </div>
      </section>

      <SolutionDelivery solution={solution} />
      <SolutionResources solution={solution} />
      <SolutionFaq solution={solution} />
      <SolutionCTA solution={solution} />
    </main>
  );
}

export function SolutionScenarioPage({
  solution,
  scene,
}: {
  solution: Solution;
  scene: SolutionScene;
}) {
  const contactHref =
    "/contact?solution=" + solution.slug + "&scene=" + scene.slug;

  return (
    <main
      className={
        "solutions-page solution-scene solution-scene--" + solution.variant
      }
    >
      <section className="scene-hero">
        <div className="solutions-frame">
          <div className="scene-hero__meta">
            <Link href={"/solutions/" + solution.slug}>
              ← 返回{solution.shortTitle}
            </Link>
            <span>{scene.status}</span>
          </div>
          <div className="scene-hero__grid">
            <div>
              <Wordmark />
              <p className="solutions-kicker">{scene.eyebrow}</p>
              <h1>{scene.title}</h1>
              <p className="scene-hero__tagline">{scene.tagline}</p>
              <p className="scene-hero__summary">{scene.summary}</p>
              <div className="solutions-actions">
                <Link
                  className="solutions-button solutions-button--primary"
                  href={contactHref}
                >
                  提交场景评估
                </Link>
                <a className="solutions-button" href="#scenario-blueprint">
                  查看落地蓝图
                </a>
              </div>
            </div>
            <div className="scene-outcome-panel">
              <span>EXPECTED OUTCOMES</span>
              {scene.outcomes.map((outcome, index) => (
                <article key={outcome.title}>
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <div>
                    <strong>{outcome.title}</strong>
                    <p>{outcome.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="scene-stakeholders" aria-label="场景参与角色">
        <div className="solutions-frame">
          <span>参与角色</span>
          {scene.stakeholders.map((item) => (
            <strong key={item}>{item}</strong>
          ))}
        </div>
      </section>

      <section
        className="solutions-section scene-blueprint"
        id="scenario-blueprint"
        aria-labelledby="scene-blueprint-title"
      >
        <div className="solutions-frame">
          <header className="solutions-heading solutions-heading--split">
            <div>
              <p className="solutions-kicker">SCENARIO BLUEPRINT / 01</p>
              <h2 id="scene-blueprint-title">从业务定义到持续运营</h2>
            </div>
            <p>每一步都包含可检查的输出，避免场景停留在演示界面。</p>
          </header>
          <ol>
            {scene.journey.map((step, index) => (
              <li key={step.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <strong>{step.output}</strong>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="solutions-section solutions-section--dark scene-operating"
        aria-labelledby="operating-title"
      >
        <div className="solutions-frame">
          <header className="solutions-heading">
            <p className="solutions-kicker">OPERATING MODEL / 02</p>
            <h2 id="operating-title">输入、系统连接和治理必须同时成立</h2>
          </header>
          <div>
            {[
              ["INPUT", "所需输入", scene.inputs],
              ["CONNECT", "系统连接", scene.integrations],
              ["CONTROL", "治理机制", scene.governance],
            ].map(([code, title, items]) => (
              <article key={String(code)}>
                <span>{String(code)}</span>
                <h3>{String(title)}</h3>
                <ul>
                  {(items as readonly string[]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="solutions-section scene-boundaries"
        aria-labelledby="boundaries-title"
      >
        <div className="solutions-frame scene-boundaries__grid">
          <div>
            <p className="solutions-kicker">CHALLENGES</p>
            <h2 id="boundaries-title">需要解决的现场阻力</h2>
            <ul>
              {scene.challenges.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <aside>
            <span>RESPONSIBILITY BOUNDARY</span>
            <h3>能力边界与人工责任</h3>
            <ul>
              {scene.boundaries.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section
        className="solutions-section scene-verification"
        aria-labelledby="verification-title"
      >
        <div className="solutions-frame scene-verification__grid">
          <div>
            <p className="solutions-kicker">RESERVED INTERFACES / 03</p>
            <h2 id="verification-title">真实资料从这些接口补入</h2>
            <p>缺少版本、测试报告、客户授权或接口文档的内容不会被编造。</p>
          </div>
          <ol>
            {scene.verificationItems.map((item, index) => (
              <li key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item}</strong>
                <small>待补充</small>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="solutions-cta">
        <div className="solutions-frame solutions-cta__grid">
          <div>
            <p className="solutions-kicker">DISCUSS THIS SCENARIO</p>
            <h2>把现场条件带进下一次方案评估</h2>
            <p>
              咨询页会显示当前方案和场景；在线提交后端尚未接入，不会制造假提交成功。
            </p>
          </div>
          <div className="solutions-actions">
            <Link
              className="solutions-button solutions-button--light"
              href={contactHref}
            >
              联系方案团队
            </Link>
            <Link
              className="solutions-button solutions-button--dark-outline"
              href={"/solutions/" + solution.slug}
            >
              返回方案详情
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function SolutionCTA({ solution }: { solution?: Solution }) {
  const href = solution ? "/contact?solution=" + solution.slug : "/contact";
  return (
    <section className="solutions-cta" aria-labelledby="solution-cta-title">
      <div className="solutions-frame solutions-cta__grid">
        <div>
          <p className="solutions-kicker">START WITH A REAL SCENARIO</p>
          <h2 id="solution-cta-title">
            {solution ? "让这套方案进入你的实际环境" : "从一个真实业务场景开始"}
          </h2>
          <p>
            准备业务目标、数据条件、现有系统、规模与验收要求，方案团队将据此评估产品组合、部署路径和交付边界。
          </p>
        </div>
        <div className="solutions-actions">
          <Link
            className="solutions-button solutions-button--light"
            href={href}
          >
            {solution ? "联系方案团队" : "预约方案评估"}
          </Link>
          <Link
            className="solutions-button solutions-button--dark-outline"
            href="/docs/deployment"
          >
            查看部署文档
          </Link>
        </div>
      </div>
    </section>
  );
}
