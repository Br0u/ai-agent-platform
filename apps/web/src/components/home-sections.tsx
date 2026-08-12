import Link from "next/link";

import { homeContent } from "./home-content";
import "./home.css";

function actionClass(variant: "primary" | "secondary") {
  return variant === "primary"
    ? "home-action home-action--primary"
    : "home-action";
}

export function HomeHero() {
  return (
    <section
      className="home-section home-hero"
      data-home-region="hero"
      aria-labelledby="home-hero-title"
    >
      <div className="home-frame">
        <div className="home-hero__layout">
          <div className="home-hero__copy">
            <p className="home-eyebrow">{homeContent.hero.eyebrow}</p>
            <h1 id="home-hero-title">{homeContent.hero.title}</h1>
            <p className="home-hero__lead">{homeContent.hero.lead}</p>
            <div className="home-value-tags" aria-label="平台能力">
              {homeContent.hero.tags.map((tag) => (
                <span className="home-value-tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            <div className="home-actions">
              {homeContent.hero.actions.map((action) => (
                <Link
                  className={actionClass(action.variant)}
                  href={action.href}
                  key={action.href}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </div>
          <div
            className="home-hero__visual home-glass-panel"
            aria-label={homeContent.hero.visualCaption}
          >
            <span>{homeContent.hero.visualCaption}</span>
          </div>
        </div>

        <div className="home-featured">
          {homeContent.featuredProducts.map((product) => (
            <article className="home-featured-card" key={product.href}>
              <span className="home-card-badge" aria-hidden="true">
                {product.badge}
              </span>
              <div>
                <h2>{product.title}</h2>
                <p>{product.description}</p>
                <Link href={product.href}>{product.cta}</Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AgentCapabilityGrid() {
  return (
    <section
      className="home-section home-agents"
      data-home-region="agents"
      data-home-reveal="true"
      aria-labelledby="home-agents-title"
    >
      <div className="home-frame">
        <header className="home-section-heading">
          <p className="home-eyebrow" data-home-reveal-item="text">
            {homeContent.agents.eyebrow}
          </p>
          <h2 id="home-agents-title" data-home-reveal-item="text">
            {homeContent.agents.title}
          </h2>
          <p className="home-section-intro" data-home-reveal-item="text">
            {homeContent.agents.lead}
          </p>
        </header>
        <div className="home-agent-grid">
          {homeContent.agents.items.map((item) => (
            <article
              className="home-agent-card"
              data-home-reveal-item="block"
              key={item.href}
            >
              <span className="home-card-badge" aria-hidden="true">
                {item.badge}
              </span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <Link href={item.href}>{item.cta}</Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomeSolutionGrid() {
  return (
    <section
      className="home-section home-solutions"
      data-home-region="solutions"
      data-home-reveal="true"
      aria-labelledby="home-solutions-title"
    >
      <div className="home-frame">
        <header className="home-section-heading">
          <p className="home-eyebrow" data-home-reveal-item="text">
            {homeContent.solutions.eyebrow}
          </p>
          <h2 id="home-solutions-title" data-home-reveal-item="text">
            {homeContent.solutions.title}
          </h2>
          <p className="home-section-intro" data-home-reveal-item="text">
            {homeContent.solutions.lead}
          </p>
        </header>
        <div className="home-solution-grid">
          {homeContent.solutions.items.map((item) => (
            <article
              className="home-solution-card"
              data-home-reveal-item="block"
              key={item.href}
            >
              <span className="home-solution-card__category">
                {item.category}
              </span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <Link href={item.href} aria-label={`${item.title}：查看方案`}>
                查看方案 →
              </Link>
            </article>
          ))}
        </div>
        <Link
          className="home-solutions__all"
          data-home-reveal-item="text"
          href={homeContent.solutions.allHref}
        >
          {homeContent.solutions.allLabel}
        </Link>
      </div>
    </section>
  );
}

export function HomeContactSection() {
  return (
    <section
      className="home-section home-contact"
      data-home-region="contact"
      data-home-reveal="true"
      aria-labelledby="home-contact-title"
    >
      <div className="home-frame home-contact__layout">
        <div className="home-contact__copy">
          <p className="home-eyebrow" data-home-reveal-item="text">
            {homeContent.contact.eyebrow}
          </p>
          <h2 id="home-contact-title" data-home-reveal-item="text">
            {homeContent.contact.title}
          </h2>
          <p className="home-section-intro" data-home-reveal-item="text">
            {homeContent.contact.lead}
          </p>
          <div className="home-actions" data-home-reveal-item="block">
            {homeContent.contact.actions.map((action) => (
              <Link
                className={actionClass(action.variant)}
                href={action.href}
                key={action.href}
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>
        <article className="home-contact-card" data-home-reveal-item="block">
          <h3>{homeContent.contact.cardTitle}</h3>
          <address>{homeContent.contact.address}</address>
          <p>{homeContent.contact.businessEmail}</p>
          <p>{homeContent.contact.hotline}</p>
          <p>{homeContent.contact.serviceHours}</p>
          <p>{homeContent.contact.description}</p>
          <small>{homeContent.contact.note}</small>
        </article>
      </div>
    </section>
  );
}
