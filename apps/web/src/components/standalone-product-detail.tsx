import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getStandaloneProduct,
  type PortalAction,
} from "./product-portal-content";
import { filterPublicEntries } from "../config/public-entry-policy";
import "./product-portal.css";

function Actions({
  actions,
  testId,
}: {
  actions: readonly PortalAction[];
  testId?: string;
}) {
  const publicActions = filterPublicEntries(actions);
  if (publicActions.length === 0) return null;

  return (
    <div className="product-portal-actions">
      {publicActions.map((action) => (
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
          <figure className="product-detail-hero-image">
            <Image
              alt={product.hero.image.alt}
              height={product.hero.image.height}
              priority
              sizes="(max-width: 900px) 100vw, 46vw"
              src={product.hero.image.src}
              width={product.hero.image.width}
            />
          </figure>
        </div>
      </section>

      <section
        className="product-portal-section"
        aria-labelledby="detail-introduction-title"
      >
        <div className="product-portal-frame">
          <header className="product-portal-heading">
            <h2 id="detail-introduction-title">{product.introduction.title}</h2>
            <p>{product.introduction.lead}</p>
          </header>
          <div className="product-detail-introduction-grid">
            {product.introduction.items.map((item) => (
              <article data-testid="detail-introduction-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div className="product-detail-tag-list">
                  {item.tags.map((tag) => (
                    <span data-testid="detail-introduction-tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <div className="product-detail-use-tags" aria-label="产品特点">
            {product.introduction.useTags.map((tag) => (
              <span data-testid="detail-use-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {product.capabilities.map((capability, index) => (
        <section
          className={
            index % 2 === 0
              ? "product-portal-section product-portal-section--tint"
              : "product-portal-section"
          }
          id={capability.id}
          key={capability.title}
        >
          <article
            className={`product-portal-frame product-detail-capability${
              index % 2 === 1 ? " product-detail-capability--reverse" : ""
            }`}
            data-testid="detail-capability"
          >
            <div className="product-detail-capability-copy">
              <h2>{capability.title}</h2>
              <p className="product-portal-lead">{capability.lead}</p>
              <div className="product-detail-steps">
                {capability.steps.map((step) => (
                  <div data-testid="detail-capability-step" key={step.title}>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                    <div className="product-detail-tag-list">
                      {step.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <Actions actions={[capability.action]} />
            </div>
            <figure className="product-detail-capability-media">
              <Image
                alt={capability.image.alt}
                height={capability.image.height}
                sizes="(max-width: 900px) 100vw, 44vw"
                src={capability.image.src}
                width={capability.image.width}
              />
              <figcaption data-testid="detail-capability-note">
                {capability.contextNote}
              </figcaption>
            </figure>
          </article>
        </section>
      ))}

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
