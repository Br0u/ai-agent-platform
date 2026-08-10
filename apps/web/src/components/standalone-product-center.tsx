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
          <p className="product-portal-eyebrow">{content.hero.eyebrow}</p>
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
        aria-labelledby="center-matrix-title"
      >
        <div className="product-portal-frame">
          <header className="product-portal-heading">
            <p className="product-portal-eyebrow">01｜产品矩阵</p>
            <h2 id="center-matrix-title">三个独立产品，各自解决一类问题</h2>
          </header>
          <div className="product-portal-center-grid">
            {content.products.map((product) => (
              <article data-testid="standalone-product-card" key={product.slug}>
                {"recommended" in product ? (
                  <span className="product-portal-recommended">
                    {product.recommended}
                  </span>
                ) : null}
                <span className="product-portal-tag">{product.tag}</span>
                <h3>{product.title}</h3>
                <p>{product.description}</p>
                <ul>
                  {product.benefits.map((benefit) => (
                    <li key={benefit}>{benefit}</li>
                  ))}
                </ul>
                <Link href={product.action.href}>{product.action.label}</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="product-portal-section product-portal-section--tint"
        aria-labelledby="center-comparison-title"
      >
        <div className="product-portal-frame">
          <header className="product-portal-heading">
            <p className="product-portal-eyebrow">
              {content.comparison.eyebrow}
            </p>
            <h2 id="center-comparison-title">{content.comparison.title}</h2>
          </header>
          <div className="product-portal-table-wrap">
            <table aria-label={content.comparison.title}>
              <thead>
                <tr>
                  {content.comparison.columns.map((column) => (
                    <th scope="col" key={column}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {content.comparison.rows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, index) =>
                      index === 0 ? (
                        <th scope="row" key={cell}>
                          {cell}
                        </th>
                      ) : (
                        <td key={cell}>{cell}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="product-portal-note">{content.comparison.note}</p>
        </div>
      </section>

      <section
        className="product-portal-section"
        aria-labelledby="center-relations-title"
      >
        <div className="product-portal-frame">
          <header className="product-portal-heading">
            <p className="product-portal-eyebrow">
              {content.relations.eyebrow}
            </p>
            <h2 id="center-relations-title">{content.relations.title}</h2>
            <p>{content.relations.lead}</p>
          </header>
          <div className="product-portal-relation-grid">
            {content.relations.items.map((item) => (
              <article data-testid="platform-relation" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div className="product-portal-visual">{item.visual}</div>
                {"action" in item ? (
                  <Link href={item.action.href}>{item.action.label}</Link>
                ) : null}
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
