import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import platformLoop from "../assets/home/platform-loop.webp";
import resourcesFolder from "../assets/home/resources-folder.webp";
import solutionsPlatform from "../assets/home/solutions-platform.webp";
import platformOverview from "../assets/huakun-yuanqi/platform-overview.png";
import {
  capabilities,
  enterpriseProofs,
  homeCopy,
  platformLayers,
  resources,
  solutions,
} from "./home-content";
import { HomeIcon } from "./home-icon";
import "./home.css";

type GradientHeadingCopy = {
  before: string;
  emphasis: string;
  after: string;
};

function GradientHeadingText({
  copy,
  beforeBreakAt,
}: {
  copy: GradientHeadingCopy;
  beforeBreakAt?: number;
}) {
  const beforeLead = beforeBreakAt
    ? copy.before.slice(0, beforeBreakAt)
    : copy.before;
  const beforeTail = beforeBreakAt ? copy.before.slice(beforeBreakAt) : "";

  return (
    <>
      <span
        className={beforeBreakAt ? "home-heading-line" : "home-heading-before"}
      >
        {beforeLead}
      </span>
      {beforeTail ? (
        <span className="home-heading-before">{beforeTail}</span>
      ) : null}
      <span className="home-gradient-text">{copy.emphasis}</span>
      <span className="home-heading-after">{copy.after}</span>
    </>
  );
}

function gradientHeadingLabel(copy: GradientHeadingCopy) {
  return `${copy.before}${copy.emphasis}${copy.after}`;
}

export function HeroEvidence() {
  return (
    <section
      className="home-section home-hero"
      data-home-region="hero"
      aria-labelledby="hero-title"
    >
      <div className="home-frame home-hero__grid">
        <div className="home-hero__copy">
          <p className="home-technical-line">{homeCopy.hero.technicalLine}</p>
          <h1
            id="hero-title"
            aria-label={gradientHeadingLabel(homeCopy.hero.heading)}
          >
            <GradientHeadingText copy={homeCopy.hero.heading} />
          </h1>
          <p className="home-product-name">
            <span>{homeCopy.hero.productName}</span>
            <small>{homeCopy.hero.productCode}</small>
          </p>
          <p className="home-hero__summary">{homeCopy.hero.summary}</p>
          <div className="home-actions">
            <Link
              className="home-action home-action--primary"
              href={homeCopy.hero.primaryCta.href}
            >
              {homeCopy.hero.primaryCta.label}
            </Link>
            <Link
              className="home-action"
              href={homeCopy.hero.secondaryCta.href}
            >
              {homeCopy.hero.secondaryCta.label}
            </Link>
          </div>
        </div>
        <figure className="home-evidence home-glass-panel">
          <div className="home-evidence__bar">
            <span>{homeCopy.hero.evidenceLabel}</span>
            <span>{homeCopy.hero.evidenceProduct}</span>
          </div>
          <Image
            src={platformOverview}
            alt="华鲲元启应用广场界面"
            width={3178}
            height={1730}
            priority
          />
          <figcaption>{homeCopy.hero.evidenceCaption}</figcaption>
        </figure>
      </div>
    </section>
  );
}

function CapabilityRail() {
  return (
    <div className="home-capability-rail">
      {capabilities.map((capability, index) => (
        <Fragment key={capability.code}>
          <article
            className="home-capability-card"
            data-home-reveal-item="block"
          >
            <span className="home-capability-card__code">
              {capability.code}
            </span>
            <div className="home-capability-card__copy">
              <h3>{capability.title}</h3>
              <p>{capability.description}</p>
            </div>
            <span className="home-icon-shell">
              <HomeIcon name={capability.icon} />
            </span>
          </article>
          {index < capabilities.length - 1 ? (
            <span className="home-capability-connector" aria-hidden="true">
              ›
            </span>
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}

function PlatformFlow() {
  return (
    <div className="home-platform__grid">
      <header className="home-platform__intro home-glass-panel">
        <p className="home-section-kicker" data-home-reveal-item="text">
          {homeCopy.platform.kicker}
        </p>
        <h2
          aria-label={gradientHeadingLabel(homeCopy.platform.heading)}
          data-home-reveal-item="text"
        >
          <GradientHeadingText
            copy={homeCopy.platform.heading}
            beforeBreakAt={homeCopy.platform.heading.before.indexOf("贯通")}
          />
        </h2>
        <p className="home-section-intro" data-home-reveal-item="text">
          {homeCopy.platform.intro}
        </p>
        <div className="home-actions" data-home-reveal-item="block">
          <Link
            className="home-action home-action--primary"
            href={homeCopy.platform.primaryCta.href}
          >
            {homeCopy.platform.primaryCta.label}
          </Link>
          <Link
            className="home-action"
            href={homeCopy.platform.secondaryCta.href}
          >
            {homeCopy.platform.secondaryCta.label}
          </Link>
        </div>
        <Image
          className="home-platform__illustration"
          src={platformLoop}
          alt=""
          width={1448}
          height={1086}
          aria-hidden="true"
          data-home-decoration="true"
          data-home-reveal-item="block"
        />
      </header>
      <div className="home-platform__list home-glass-panel">
        {platformLayers.map((layer) => (
          <article
            className="home-platform-row"
            data-home-reveal-item="block"
            key={layer.code}
          >
            <span className="home-icon-shell">
              <HomeIcon name={layer.icon} />
            </span>
            <span className="home-platform-row__code">{layer.code}</span>
            <h3>{layer.title}</h3>
            <p>{layer.description}</p>
            <span className="home-row-arrow" aria-hidden="true">
              ›
            </span>
          </article>
        ))}
      </div>
    </div>
  );
}

export function PlatformOverview() {
  return (
    <section
      className="home-section home-platform-overview"
      data-home-region="platform"
      data-home-reveal="true"
      aria-label="平台能力与开发流程"
    >
      <div className="home-frame">
        <CapabilityRail />
        <PlatformFlow />
      </div>
    </section>
  );
}

export function EnterpriseProof() {
  return (
    <section
      className="home-section home-enterprise"
      data-home-region="enterprise"
      data-home-reveal="true"
      aria-labelledby="enterprise-proof-title"
    >
      <div className="home-frame home-enterprise__layout">
        <header className="home-enterprise__heading home-glass-panel">
          <p className="home-section-kicker" data-home-reveal-item="text">
            {homeCopy.enterprise.kicker}
          </p>
          <h2 id="enterprise-proof-title" data-home-reveal-item="text">
            {homeCopy.enterprise.heading}
          </h2>
          <span className="home-enterprise__underline" aria-hidden="true" />
        </header>
        <div className="home-enterprise__list home-glass-panel">
          {enterpriseProofs.map((proof, index) => (
            <article
              className="home-enterprise-row"
              data-home-reveal-item="block"
              key={proof.title}
            >
              <span className="home-icon-shell">
                <HomeIcon name={proof.icon} />
              </span>
              <span className="home-enterprise-row__code">
                {String(index + 1).padStart(2, "0")}
              </span>
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
    <section
      className="home-section home-solutions"
      data-home-region="solutions"
      data-home-reveal="true"
      aria-labelledby="solution-index-title"
    >
      <div className="home-frame home-solutions__grid">
        <header className="home-solutions__intro home-glass-panel">
          <p className="home-section-kicker" data-home-reveal-item="text">
            {homeCopy.solutions.kicker}
          </p>
          <h2
            id="solution-index-title"
            aria-label={gradientHeadingLabel(homeCopy.solutions.heading)}
            data-home-reveal-item="text"
          >
            <GradientHeadingText
              copy={homeCopy.solutions.heading}
              beforeBreakAt={homeCopy.solutions.heading.before.indexOf("走向")}
            />
          </h2>
          <p className="home-section-intro" data-home-reveal-item="text">
            {homeCopy.solutions.intro}
          </p>
          <Image
            className="home-solutions__illustration"
            src={solutionsPlatform}
            alt=""
            width={1448}
            height={1086}
            aria-hidden="true"
            data-home-decoration="true"
            data-home-reveal-item="block"
          />
        </header>
        <div className="home-solution-list home-glass-panel">
          {solutions.map((solution, index) => (
            <article
              className={
                solution.subsetLabel
                  ? "home-solution-row home-solution-row--subset"
                  : "home-solution-row"
              }
              data-home-reveal-item="block"
              key={solution.title}
            >
              <span className="home-icon-shell">
                <HomeIcon name={solution.icon} />
              </span>
              <span className="home-solution-row__code">S{index + 1}</span>
              <div className="home-solution-row__copy">
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
      data-home-region="resources"
      data-home-reveal="true"
      aria-labelledby="resource-table-title"
    >
      <div className="home-frame home-resources__grid">
        <header className="home-resources__intro home-glass-panel">
          <p className="home-section-kicker" data-home-reveal-item="text">
            {homeCopy.resources.kicker}
          </p>
          <h2
            id="resource-table-title"
            aria-label={gradientHeadingLabel(homeCopy.resources.heading)}
            data-home-reveal-item="text"
          >
            <GradientHeadingText
              copy={homeCopy.resources.heading}
              beforeBreakAt={homeCopy.resources.heading.before.indexOf(
                "从这里",
              )}
            />
          </h2>
          <p className="home-section-intro" data-home-reveal-item="text">
            {homeCopy.resources.intro}
          </p>
          <Image
            className="home-resources__illustration"
            src={resourcesFolder}
            alt=""
            width={1448}
            height={1086}
            aria-hidden="true"
            data-home-decoration="true"
            data-home-reveal-item="block"
          />
        </header>
        <div className="home-resource-list home-glass-panel">
          {resources.map((resource) => (
            <Link
              className="home-resource"
              data-home-reveal-item="block"
              href={resource.href}
              key={resource.href}
            >
              <span className="home-icon-shell">
                <HomeIcon name={resource.icon} />
              </span>
              <span className="home-resource__copy">
                <strong>{resource.title}</strong>
                <span>{resource.description}</span>
              </span>
              <span className="home-resource__arrow" aria-hidden="true">
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
      data-home-region="closing"
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
