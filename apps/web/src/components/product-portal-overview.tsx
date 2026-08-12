import Link from "next/link";

import { productOverview, type PortalAction } from "./product-portal-content";
import "./product-portal.css";

function Actions({ actions }: { actions: readonly PortalAction[] }) {
  return (
    <div className="product-portal-actions">
      {actions.map((action) => (
        <Link
          className={
            action.variant === "primary"
              ? "product-portal-button product-portal-button--primary"
              : "product-portal-button"
          }
          href={action.href}
          key={`${action.href}-${action.label}`}
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}

function Flow({ items }: { items: readonly string[] }) {
  return (
    <ol className="product-portal-flow">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
}

export function ProductPortalOverview() {
  const content = productOverview;

  return (
    <main className="product-portal">
      <section className="product-portal-hero" aria-labelledby="product-title">
        <div className="product-portal-frame product-portal-hero__grid">
          <div>
            <p className="product-portal-eyebrow">{content.hero.eyebrow}</p>
            <h1 id="product-title">{content.hero.title}</h1>
            <p className="product-portal-lead">{content.hero.lead}</p>
            <div className="product-portal-tags" aria-label="产品价值">
              {content.hero.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <Actions actions={content.hero.actions} />
          </div>
          <div className="product-portal-paths" aria-label="企业 AI 产品双路径">
            <strong>企业 AI 产品双路径</strong>
            {content.hero.paths.map((path) => (
              <article key={path.label}>
                <span>{path.label}</span>
                <h3>{path.title}</h3>
                <p>{path.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="product-portal-section"
        id="products-challenges"
        aria-labelledby="product-challenges-title"
      >
        <div className="product-portal-frame">
          <header className="product-portal-heading">
            <p className="product-portal-eyebrow">
              {content.challenges.eyebrow}
            </p>
            <h2 id="product-challenges-title">{content.challenges.title}</h2>
            <p>{content.challenges.lead}</p>
          </header>
          <div className="product-portal-grid product-portal-grid--three">
            {content.challenges.items.map((item) => (
              <article
                className="product-portal-card product-portal-challenge"
                data-testid="product-challenge"
                key={item.number}
              >
                <span className="product-portal-number">{item.number}</span>
                <h3>{item.title}</h3>
                <p>{item.problem}</p>
                <p className="product-portal-answer">
                  <strong>答案：</strong>
                  {item.answer}
                </p>
                <Link href={item.action.href}>{item.action.label}</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="product-portal-section product-portal-section--tint"
        aria-labelledby="product-chain-title"
      >
        <div className="product-portal-frame">
          <header className="product-portal-heading">
            <p className="product-portal-eyebrow">{content.chain.eyebrow}</p>
            <h2 id="product-chain-title">{content.chain.title}</h2>
            <p>{content.chain.lead}</p>
          </header>
          <ol className="product-portal-chain">
            {content.chain.items.map((item) => (
              <li data-testid="product-chain-node" key={item.number}>
                <span className="product-portal-number">{item.number}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <Link href={item.action.href}>{item.action.label}</Link>
              </li>
            ))}
          </ol>
          <p className="product-portal-note">{content.chain.note}</p>
        </div>
      </section>

      <section
        className="product-portal-section"
        aria-labelledby="product-centers-title"
      >
        <div className="product-portal-frame">
          <header className="product-portal-heading">
            <p className="product-portal-eyebrow">{content.centers.eyebrow}</p>
            <h2 id="product-centers-title">{content.centers.title}</h2>
            <p>{content.centers.lead}</p>
          </header>
          <div className="product-portal-centers">
            <article
              className="product-portal-center-feature"
              data-testid="product-center"
            >
              <span className="product-portal-tag">
                {content.centers.featured.tag}
              </span>
              <h3>{content.centers.featured.title}</h3>
              <strong>{content.centers.featured.position}</strong>
              <p>{content.centers.featured.description}</p>
              <div className="product-portal-visual">
                {content.centers.featured.visual}
              </div>
              <Link href={content.centers.featured.action.href}>
                {content.centers.featured.action.label}
              </Link>
            </article>
            <div className="product-portal-center-list">
              {content.centers.items.map((item) => (
                <article data-testid="product-center" key={item.title}>
                  <div>
                    <h3>{item.title}</h3>
                    <small>{item.position}</small>
                  </div>
                  <p>{item.description}</p>
                  <Link href={item.action.href}>{item.action.label}</Link>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className="product-portal-section product-portal-section--tint"
        id="products-independent"
        aria-labelledby="independent-products-title"
        data-testid="independent-products"
      >
        <div className="product-portal-frame">
          <header className="product-portal-heading">
            <p className="product-portal-eyebrow">
              {content.independent.eyebrow}
            </p>
            <h2 id="independent-products-title">{content.independent.title}</h2>
            <p>{content.independent.lead}</p>
          </header>
          <div className="product-portal-product-list">
            {content.independent.items.map((item) => (
              <article data-testid="independent-product" key={item.title}>
                <div>
                  <span className="product-portal-tag">独立产品</span>
                  <h3>{item.title}</h3>
                  <strong>{item.position}</strong>
                  <p>{item.description}</p>
                  <Link href={item.href}>{item.action}</Link>
                </div>
                <div className="product-portal-visual">{item.visual}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="product-portal-section"
        aria-labelledby="product-business-title"
      >
        <div className="product-portal-frame">
          <header className="product-portal-heading">
            <p className="product-portal-eyebrow">{content.business.eyebrow}</p>
            <h2 id="product-business-title">{content.business.title}</h2>
            <p>{content.business.lead}</p>
          </header>
          <div className="product-portal-business">
            <div>
              <div className="product-portal-feature-list">
                {content.business.points.map((item) => (
                  <article key={item.title}>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </article>
                ))}
              </div>
              <div className="product-portal-value-list">
                {content.business.values.map((item) => (
                  <p key={item.title}>
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </p>
                ))}
              </div>
            </div>
            <aside className="product-portal-demo">
              <strong>{content.business.demo.title}</strong>
              {content.business.demo.messages.map((message, index) => (
                <p
                  className={index % 2 === 0 ? "is-user" : undefined}
                  key={message}
                >
                  {message}
                </p>
              ))}
            </aside>
          </div>
          <div className="product-portal-reason-grid">
            <article>
              <h3>它为什么能做到</h3>
              <Flow items={content.business.reason} />
              <h4>落地路径</h4>
              <Flow items={content.business.workflow} />
            </article>
            <article>
              <h3>带来什么价值</h3>
              {content.business.outcomes.map((item) => (
                <p key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </p>
              ))}
            </article>
          </div>
          <div className="product-portal-scenes">
            <div>
              <h3>应用场景</h3>
              <p>{content.business.scenesLead}</p>
            </div>
            {content.business.scenes.map((scene) => (
              <article key={scene.title}>
                <h3>{scene.title}</h3>
                <p>{scene.description}</p>
                <Link href={scene.action.href}>{scene.action.label}</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="product-portal-section product-portal-closing">
        <div className="product-portal-frame product-portal-cta">
          <div>
            <h2>{content.cta.title}</h2>
            <p>{content.cta.description}</p>
          </div>
          <Actions actions={content.cta.actions} />
        </div>
      </section>
    </main>
  );
}
