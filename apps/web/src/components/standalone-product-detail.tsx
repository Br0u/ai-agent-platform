import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getStandaloneProduct,
  type PortalAction,
  type ProductFeature,
} from "./product-portal-content";
import "./product-portal.css";

function Actions({
  actions,
  testId,
}: {
  actions: readonly PortalAction[];
  testId?: string;
}) {
  return (
    <div className="product-portal-actions">
      {actions.map((action) => (
        <Link
          className={
            action.variant === "primary"
              ? "product-portal-button product-portal-button--primary"
              : "product-portal-button"
          }
          data-testid={testId}
          href={action.href}
          key={`${action.href}-${action.label}`}
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}

function FeatureList({ items }: { items: readonly ProductFeature[] }) {
  return (
    <div className="product-detail-feature-list">
      {items.map((item) => (
        <div key={item.title}>
          <span aria-hidden="true">✓</span>
          <p>
            <strong>{item.title}</strong>
            {item.description}
          </p>
        </div>
      ))}
    </div>
  );
}

function Flow({
  items,
  testId,
}: {
  items: readonly string[];
  testId?: string;
}) {
  return (
    <ol className="product-portal-flow" data-testid={testId}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
}

export function StandaloneProductDetail({ slug }: { slug: string }) {
  const product = getStandaloneProduct(slug);

  if (!product) {
    notFound();
  }

  return (
    <main className="product-portal product-detail">
      <section className="product-portal-hero" aria-labelledby="detail-title">
        <div className="product-portal-frame product-detail-hero">
          <div>
            <p className="product-portal-eyebrow">{product.hero.eyebrow}</p>
            <h1 id="detail-title">{product.hero.title}</h1>
            <p className="product-portal-lead">{product.hero.lead}</p>
            <div className="product-portal-tags" aria-label="产品价值">
              {product.hero.tags.map((tag) => (
                <span data-testid="detail-hero-tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            <Actions
              actions={product.hero.actions}
              testId="detail-hero-action"
            />
          </div>
          <div>
            <p className="product-detail-demo-note">{product.hero.demo.note}</p>
            <aside className="product-portal-demo">
              <strong>{product.hero.demo.title}</strong>
              {product.hero.demo.messages.map((message, index) => (
                <p
                  className={index % 2 === 0 ? "is-user" : undefined}
                  key={message}
                >
                  {message}
                </p>
              ))}
            </aside>
            <p className="product-portal-note">{product.hero.demo.visual}</p>
          </div>
        </div>
      </section>

      <section
        className="product-portal-section"
        aria-labelledby="detail-introduction-title"
      >
        <div className="product-portal-frame">
          <header className="product-portal-heading">
            <p className="product-portal-eyebrow">
              {product.introduction.eyebrow}
            </p>
            <h2 id="detail-introduction-title">{product.introduction.title}</h2>
            <p>{product.introduction.lead}</p>
          </header>
          <div className="product-detail-introduction-grid">
            {product.introduction.items.map((item) => (
              <article data-testid="detail-introduction-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div className="product-portal-visual">{item.visual}</div>
                {item.action ? (
                  <Link href={item.action.href}>{item.action.label}</Link>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="product-portal-section product-portal-section--tint"
        aria-labelledby="detail-capabilities-title"
      >
        <div className="product-portal-frame">
          <header className="product-portal-heading">
            <p className="product-portal-eyebrow">
              {product.capabilities.eyebrow}
            </p>
            <h2 id="detail-capabilities-title">{product.capabilities.title}</h2>
            <p>{product.capabilities.lead}</p>
          </header>
          <div className="product-detail-capabilities">
            {product.capabilities.items.map((capability) => (
              <article data-testid="detail-capability" key={capability.title}>
                <div>
                  <span className="product-portal-tag">{capability.tag}</span>
                  <h3>{capability.title}</h3>
                  <p>{capability.description}</p>
                  <FeatureList items={capability.features} />
                  {capability.note ? (
                    <p className="product-portal-note">{capability.note}</p>
                  ) : null}
                </div>
                <div className="product-portal-visual">{capability.visual}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {product.security ? (
        <section className="product-portal-section product-detail-security">
          <div className="product-portal-frame">
            <div className="product-detail-security__heading">
              <div>
                <h2>{product.security.title}</h2>
                <p>{product.security.description}</p>
              </div>
              <Link href={product.security.action.href}>
                {product.security.action.label}
              </Link>
            </div>
            <div className="product-detail-security__grid">
              {product.security.items.map((item) => (
                <article data-testid="detail-security-item" key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section
        className="product-portal-section"
        aria-labelledby="detail-experience-title"
      >
        <div className="product-portal-frame product-detail-experience">
          <p className="product-portal-eyebrow">{product.experience.eyebrow}</p>
          <h2 id="detail-experience-title">{product.experience.title}</h2>
          <p>{product.experience.lead}</p>
          <Flow
            items={product.experience.flow}
            testId="detail-experience-flow"
          />
          <div className="product-portal-visual">
            {product.experience.visual}
          </div>
        </div>
      </section>

      <section
        className="product-portal-section product-portal-section--tint"
        aria-labelledby="detail-business-title"
      >
        <div className="product-portal-frame">
          <header className="product-portal-heading">
            <p className="product-portal-eyebrow">{product.business.eyebrow}</p>
            <h2 id="detail-business-title">{product.business.title}</h2>
            <p>{product.business.lead}</p>
          </header>
          <div className="product-portal-business">
            <div>
              <div className="product-portal-feature-list">
                {product.business.points.map((item) => (
                  <article key={item.title}>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </article>
                ))}
              </div>
              <div className="product-portal-value-list">
                {product.business.values.map((item) => (
                  <p key={item.title}>
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </p>
                ))}
              </div>
            </div>
            <aside className="product-portal-demo">
              <strong>{product.business.demo.title}</strong>
              {product.business.demo.messages.map((message, index) => (
                <p
                  className={index % 2 === 0 ? "is-user" : undefined}
                  key={message}
                >
                  {message}
                </p>
              ))}
              <small>{product.business.demo.note}</small>
            </aside>
          </div>
          <div className="product-portal-reason-grid">
            <article>
              <h3>它为什么能做到</h3>
              <Flow items={product.business.reason} />
              <h4>
                {product.slug === "aippt"
                  ? "创作工作流"
                  : product.slug === "aishrek"
                    ? "设计工作流"
                    : "开发工作流"}
              </h4>
              <Flow items={product.business.workflow} />
            </article>
            <article>
              <h3>带来什么价值</h3>
              {product.business.outcomes.map((item) => (
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
              <p>{product.business.scenesLead}</p>
            </div>
            {product.business.scenes.map((scene) => (
              <article data-testid="detail-scene" key={scene.title}>
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
            <h2>{product.cta.title}</h2>
            <p>{product.cta.description}</p>
          </div>
          <Actions actions={product.cta.actions} />
        </div>
      </section>
    </main>
  );
}
