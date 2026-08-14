import Link from "next/link";

import { homeContent } from "./home-content";
import { HomeIcon } from "./home-icon";
import "./home.css";

function actionClass(variant: "primary" | "secondary") {
  return variant === "primary"
    ? "home-action home-action--primary"
    : "home-action";
}

function AccentTitle({
  className,
  title,
}: {
  className: string;
  title: string;
}) {
  const [before, after] = title.split("AI");
  return (
    <>
      {before}
      <span className={className}>AI</span>
      {after}
    </>
  );
}

export function HomeHero() {
  return (
    <section
      className="home-section home-hero"
      data-home-region="hero"
      data-home-theme="dual-track-light"
      aria-labelledby="home-hero-title"
    >
      <div className="home-frame">
        <div className="home-hero__copy">
          <h1 id="home-hero-title">
            <AccentTitle
              className="home-hero__title-accent"
              title={homeContent.hero.title}
            />
          </h1>
          <p className="home-lead home-hero__lead">{homeContent.hero.lead}</p>
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
        <div className="home-featured">
          {homeContent.featuredProducts.map((product) => (
            <article className="home-featured-card" key={product.href}>
              <span className="home-card-badge" aria-hidden="true">
                <HomeIcon name={product.icon} />
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

export function HomeCenterGrid() {
  const featured = homeContent.centers.items.slice(0, 2);
  const remaining = homeContent.centers.items.slice(2);

  return (
    <section
      className="home-section home-centers"
      data-home-region="centers"
      data-home-reveal="true"
      aria-labelledby="home-centers-title"
    >
      <div className="home-frame">
        <h2 id="home-centers-title">{homeContent.centers.title}</h2>
        <p className="home-lead">{homeContent.centers.lead}</p>
        <div className="centers-layout">
          <div className="centers-featured">
            {featured.map((item) => (
              <article className="center-feature" key={item.href}>
                <span className="home-card-badge" aria-hidden="true">
                  <HomeIcon name={item.icon} />
                </span>
                <div>
                  {"tag" in item ? (
                    <span className="home-tag">{item.tag}</span>
                  ) : null}
                  <h3>{item.title}</h3>
                  <p className="center-position">{item.position}</p>
                  <p>{item.description}</p>
                  <Link href={item.href}>{item.cta}</Link>
                </div>
              </article>
            ))}
          </div>
          <div className="centers-list">
            {remaining.map((item) => (
              <article className="center-row" key={item.href}>
                <span className="home-card-badge" aria-hidden="true">
                  <HomeIcon name={item.icon} />
                </span>
                <div className="center-row__head">
                  <h3>{item.title}</h3>
                  <p>{item.position}</p>
                </div>
                <p>{item.description}</p>
                <Link href={item.href}>{item.cta}</Link>
              </article>
            ))}
          </div>
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
        <h2 id="home-solutions-title">
          <AccentTitle
            className="home-solutions__title-accent"
            title={homeContent.solutions.title}
          />
        </h2>
        <p className="home-lead">{homeContent.solutions.lead}</p>
        <div className="home-sol">
          {homeContent.solutions.items.map((item, index) => (
            <article
              className="home-sol-card home-solution-card"
              key={item.href}
            >
              <div className="home-solution-card__meta">
                <span className="home-solution-card__icon">
                  <span className="home-card-badge" aria-hidden="true">
                    <HomeIcon name={item.icon} />
                  </span>
                  <span
                    className="home-solution-card__index"
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </span>
                <span className="home-tag">{item.category}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <Link href={item.href} aria-label={`${item.title}：查看方案`}>
                查看方案 →
              </Link>
            </article>
          ))}
        </div>
        <div className="home-solutions__more">
          <Link href={homeContent.solutions.allHref}>
            {homeContent.solutions.allLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

const contactItems = [
  ["location", "公司地址", homeContent.contact.address],
  ["mail", "商务合作", homeContent.contact.businessEmail],
  ["phone", "客服热线", homeContent.contact.hotline],
  ["clock", "服务时间", homeContent.contact.serviceHours],
] as const;

export function HomeContactSection() {
  return (
    <section
      className="home-section home-contact-section"
      data-home-region="contact"
      data-home-reveal="true"
      aria-labelledby="home-contact-title"
    >
      <div className="home-frame">
        <h2 id="home-contact-title">
          <AccentTitle
            className="home-contact__title-accent"
            title={homeContent.contact.title}
          />
        </h2>
        <p className="home-lead">{homeContent.contact.lead}</p>
        <div className="home-contact__layout">
          <article className="home-contact-card">
            <h3>{homeContent.contact.cardTitle}</h3>
            <dl>
              {contactItems.map(([icon, label, value]) => (
                <div key={label}>
                  <dt>
                    <span className="home-contact-card__icon">
                      <HomeIcon name={icon} />
                    </span>
                    {label}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </article>
          <div className="home-contact__copy">
            <p>{homeContent.contact.description}</p>
            <div className="home-actions">
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
            <p className="home-context-note">{homeContent.contact.note}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
