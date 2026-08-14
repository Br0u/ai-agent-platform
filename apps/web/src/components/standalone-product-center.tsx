import Link from "next/link";

import { standaloneCenter, type PortalAction } from "./product-portal-content";
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

export function StandaloneProductCenter() {
  const content = standaloneCenter;

  return (
    <main className="product-portal product-portal-center-page">
      <section className="product-portal-hero" aria-labelledby="center-title">
        <div className="product-portal-frame product-portal-center-hero">
          <h1 id="center-title">{content.hero.title}</h1>
          <p className="product-portal-lead">{content.hero.lead}</p>
          <div className="product-portal-tags" aria-label="独立产品">
            {content.hero.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <Actions actions={content.hero.actions} />
        </div>
      </section>

      <section
        className="product-portal-section"
        aria-labelledby="center-value-title"
      >
        <div className="product-portal-frame">
          <header className="product-portal-heading">
            <h2 id="center-value-title">{content.introduction.title}</h2>
            <p>{content.introduction.lead}</p>
          </header>
          <div className="product-portal-value-grid">
            {content.values.map((value) => (
              <article data-testid="standalone-value-card" key={value.title}>
                <span className="product-portal-tag">{value.tag}</span>
                <h3>{value.title}</h3>
                <p>{value.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="product-portal-section product-portal-section--tint"
        aria-labelledby="center-matrix-title"
      >
        <div className="product-portal-frame">
          <header className="product-portal-heading">
            <h2 id="center-matrix-title">三个独立产品，各自解决一类问题</h2>
            <p>点击卡片查看产品详情。</p>
          </header>
          <div className="product-portal-center-grid">
            {content.products.map((product) => (
              <article data-testid="standalone-product-card" key={product.slug}>
                <span className="product-portal-tag">{product.tag}</span>
                <h3>{product.title}</h3>
                <p>{product.description}</p>
                <Link
                  aria-label={`查看${product.title}产品详情`}
                  href={product.action.href}
                >
                  {product.action.label}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="product-portal-section"
        aria-labelledby="center-faq-title"
      >
        <div className="product-portal-frame">
          <header className="product-portal-heading">
            <h2 id="center-faq-title">关于独立产品，你可能关心的问题</h2>
            <p>围绕独立产品的使用方式与落地价值，以问答形式简要说明。</p>
          </header>
          <div className="product-portal-faq-grid">
            {content.faqs.map((faq) => (
              <article data-testid="standalone-faq-card" key={faq.number}>
                <span>{faq.number}</span>
                <h3>{faq.title}</h3>
                <p>{faq.description}</p>
                <p>
                  <strong>答案：</strong>
                  {faq.answer}
                </p>
                <div>
                  {faq.tags.map((tag) => (
                    <small key={tag}>{tag}</small>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <p className="product-portal-note">{content.note}</p>
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
