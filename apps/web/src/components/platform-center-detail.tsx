import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";

import { getPlatformCenter } from "./platform-center-content";
import type {
  PlatformDemo,
  PlatformImage,
  PlatformPage,
} from "./platform-page-types";
import type { PortalAction } from "./product-portal-content";
import "./product-portal.css";

function Actions({
  actions,
  testId,
}: {
  actions: readonly PortalAction[];
  testId?: string;
}) {
  if (actions.length === 0) return null;

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

function Flow({
  items,
  testId,
}: {
  items: readonly string[];
  testId?: string;
}) {
  return (
    <ol className="product-portal-flow" data-testid={testId}>
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ol>
  );
}

function Visual({
  description,
  note,
  title,
}: {
  description?: string;
  note?: string;
  title: string;
}) {
  return (
    <div className="product-portal-visual">
      <div>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
        {note ? <small>{note}</small> : null}
      </div>
    </div>
  );
}

function ImageGallery({
  images,
  note,
  preload = false,
}: {
  images: readonly PlatformImage[];
  note?: string;
  preload?: boolean;
}) {
  return (
    <figure className="platform-center-media">
      <div
        aria-label={images.length > 1 ? "产品界面截图，可横向滚动" : undefined}
        className="platform-center-gallery"
        data-image-count={images.length}
        role={images.length > 1 ? "region" : undefined}
        tabIndex={images.length > 1 ? 0 : undefined}
      >
        {images.map((image, index) => (
          <Image
            alt={image.alt}
            height={image.height}
            key={image.src}
            preload={preload && index === 0}
            sizes="(max-width: 900px) calc(100vw - 40px), 44vw"
            src={image.src}
            width={image.width}
          />
        ))}
      </div>
      {note ? <figcaption>{note}</figcaption> : null}
    </figure>
  );
}

function Capability({
  capability,
  index,
}: {
  capability: NonNullable<PlatformPage["capabilities"]>[number];
  index: number;
}) {
  return (
    <section
      aria-labelledby={`${capability.id}-title`}
      className={`platform-center-capability${index % 2 === 1 ? " is-reversed" : ""}${capability.images?.length ? "" : " has-no-media"}`}
      data-testid="platform-center-capability"
      id={capability.id}
    >
      <div className="platform-center-capability__copy">
        <h2 id={`${capability.id}-title`}>{capability.title}</h2>
        <p className="product-portal-lead">{capability.lead}</p>
        <div className="platform-center-capability__steps">
          {capability.steps.map((step) => (
            <article id={step.id} key={step.title}>
              {step.number ? (
                <span className="product-portal-number">{step.number}</span>
              ) : null}
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <div className="platform-center-capability__tags">
                {step.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
        <Actions actions={capability.actions} />
      </div>
      {capability.images?.length ? (
        <ImageGallery images={capability.images} note={capability.note} />
      ) : null}
    </section>
  );
}

function Demo({ demo, testId }: { demo: PlatformDemo; testId?: string }) {
  return (
    <aside className="product-portal-demo" data-testid={testId}>
      <strong>{demo.title}</strong>
      {demo.messages.map((message, index) => {
        const text = typeof message === "string" ? message : message.text;
        const role =
          typeof message === "string"
            ? index % 2 === 0
              ? "user"
              : "assistant"
            : message.role;

        return (
          <p
            className={role === "user" ? "is-user" : undefined}
            data-message-role={role}
            data-testid="platform-demo-message"
            key={`${index}-${text}`}
          >
            {text}
            {typeof message !== "string" && message.cite ? (
              <small className="product-portal-demo-cite">{message.cite}</small>
            ) : null}
          </p>
        );
      })}
      {demo.footer ? (
        <div className="product-portal-demo-footer">
          <input
            aria-label={demo.footer.placeholder}
            disabled
            placeholder={demo.footer.placeholder}
            type="text"
          />
          <button disabled type="button">
            {demo.footer.action}
          </button>
        </div>
      ) : null}
      {demo.note ? <small>{demo.note}</small> : null}
      {demo.caption ? (
        <p className="product-portal-demo-caption">{demo.caption}</p>
      ) : null}
    </aside>
  );
}

function Card({
  card,
}: {
  card: NonNullable<PlatformPage["sections"][number]["cards"]>[number];
}) {
  return (
    <article
      className={`product-portal-card${card.lead ? " platform-center-card--feature" : ""}`}
      data-testid="platform-center-card"
    >
      {card.tag ? <span className="product-portal-tag">{card.tag}</span> : null}
      {card.number ? (
        <span className="product-portal-number">{card.number}</span>
      ) : null}
      <h3>{card.title}</h3>
      {card.lead ? (
        <p className="platform-center-card-lead">{card.lead}</p>
      ) : null}
      {card.value ? (
        <strong className="platform-center-card-value">{card.value}</strong>
      ) : null}
      {card.description ? <p>{card.description}</p> : null}
      {card.answer ? (
        <p className="product-portal-answer">
          <strong>答案：</strong>
          {card.answer}
        </p>
      ) : null}
      {card.points ? (
        <ul className="platform-center-points">
          {card.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : null}
      {card.tags ? (
        <div className="platform-center-capability__tags">
          {card.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
      {card.flow ? <Flow items={card.flow} /> : null}
      {card.visual ? <Visual title={card.visual} /> : null}
      {card.actions ? <Actions actions={card.actions} /> : null}
    </article>
  );
}

function ContentSection({
  index,
  section,
  slug,
}: {
  index: number;
  section: PlatformPage["sections"][number];
  slug: string;
}) {
  const headingId = `platform-center-${slug}-${index}-title`;

  return (
    <section
      className={`product-portal-section${section.tone === "soft" ? " product-portal-section--tint" : ""}${section.demo ? " platform-center-section--with-demo" : ""}`}
      data-testid="platform-center-section"
      id={section.id}
      aria-labelledby={headingId}
    >
      <div className="product-portal-frame">
        <header className="product-portal-heading">
          {section.eyebrow ? (
            <p className="product-portal-eyebrow">{section.eyebrow}</p>
          ) : null}
          <h2 id={headingId}>{section.title}</h2>
          {section.lead ? <p>{section.lead}</p> : null}
          {section.body ? (
            <p className="platform-center-body">{section.body}</p>
          ) : null}
        </header>

        {section.subheading ? <h3>{section.subheading}</h3> : null}

        {section.demo ? (
          <Demo demo={section.demo} testId="platform-page-demo" />
        ) : null}

        {section.cards ? (
          <div className="platform-center-card-grid">
            {section.cards.map((card) => (
              <Card card={card} key={`${card.title}-${card.tag ?? ""}`} />
            ))}
          </div>
        ) : null}

        {section.table ? (
          <div className="product-portal-table-wrap">
            <table>
              <thead>
                <tr>
                  {section.table.columns.map((column) => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.table.rows.map((row) => (
                  <tr data-testid="platform-center-table-row" key={row[0]}>
                    {row.map((cell, cellIndex) =>
                      cellIndex === 0 ? (
                        <th key={cell} scope="row">
                          {cell}
                        </th>
                      ) : (
                        <td key={`${cellIndex}-${cell}`}>{cell}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {section.flow ? (
          <div className="platform-center-section-flow">
            <Flow items={section.flow} />
          </div>
        ) : null}

        {section.groups ? (
          <div className="platform-center-groups">
            {section.groups.map((group) => (
              <article id={group.id} key={group.id}>
                {group.tag ? (
                  <span className="product-portal-tag">{group.tag}</span>
                ) : null}
                <h3>{group.title}</h3>
                {group.lead ? <p>{group.lead}</p> : null}
                <div className="platform-center-card-grid">
                  {group.cards.map((card) => (
                    <div className="product-portal-card" key={card.title}>
                      <h4>{card.title}</h4>
                      {card.description ? <p>{card.description}</p> : null}
                      {card.points ? (
                        <ul className="platform-center-points">
                          {card.points.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      ) : null}
                      {card.visual ? <Visual title={card.visual} /> : null}
                    </div>
                  ))}
                </div>
                {group.subheading ? <h4>{group.subheading}</h4> : null}
                {group.flow ? (
                  <Flow items={group.flow} testId="platform-page-group-flow" />
                ) : null}
                {group.visual ? <Visual title={group.visual} /> : null}
              </article>
            ))}
          </div>
        ) : null}

        {section.visual ? <Visual title={section.visual} /> : null}
        {section.note ? (
          <p className="product-portal-note">{section.note}</p>
        ) : null}
        {section.actions ? <Actions actions={section.actions} /> : null}
        {section.tags ? (
          <div className="product-portal-tags platform-center-section-tags">
            {section.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function BusinessSection({
  business,
}: {
  business: NonNullable<PlatformPage["business"]>;
}) {
  return (
    <section
      className="product-portal-section product-portal-section--tint"
      data-testid="platform-center-business"
      aria-labelledby="platform-center-business-title"
    >
      <div className="product-portal-frame">
        <header className="product-portal-heading">
          <p className="product-portal-eyebrow">{business.eyebrow}</p>
          <h2 id="platform-center-business-title">{business.title}</h2>
          <p>{business.lead}</p>
        </header>
        <div className="product-portal-business">
          <div>
            <div className="product-portal-feature-list">
              {business.points.map((item) => (
                <article key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
            <div className="product-portal-value-list">
              {business.values.map((item) => (
                <p key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </p>
              ))}
            </div>
          </div>
          {business.demo ? (
            <Demo demo={business.demo} testId="platform-page-demo" />
          ) : business.visual ? (
            <Visual title={business.visual} />
          ) : null}
        </div>
        <div className="product-portal-reason-grid">
          <article>
            <h3>它为什么能做到</h3>
            <Flow items={business.reason} />
            {business.workflow ? (
              <>
                {business.workflowLabel ? (
                  <h4>{business.workflowLabel}</h4>
                ) : null}
                <Flow
                  items={business.workflow}
                  testId="platform-center-workflow"
                />
              </>
            ) : null}
          </article>
          <article>
            <h3>带来什么价值</h3>
            {business.outcomes.map((item) => (
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
            <p>{business.scenesLead}</p>
          </div>
          {business.scenes.map((scene) => (
            <article data-testid="platform-center-scene" key={scene.title}>
              <h3>{scene.title}</h3>
              <p>{scene.description}</p>
              <Actions actions={scene.actions} />
            </article>
          ))}
        </div>
        {business.note ? (
          <p className="product-portal-note">{business.note}</p>
        ) : null}
      </div>
    </section>
  );
}

export function PlatformPageDetail({
  dense = true,
  page: center,
}: {
  dense?: boolean;
  page: PlatformPage;
}) {
  return (
    <main
      className={`product-portal platform-center${dense ? " platform-center--dense" : ""}`}
    >
      <section
        className="product-portal-hero"
        aria-labelledby="platform-center-title"
      >
        <div
          className={`product-portal-frame product-detail-hero${center.hero.visual ? "" : " has-no-media"}`}
        >
          <div>
            {center.hero.eyebrow ? (
              <p className="product-portal-eyebrow">{center.hero.eyebrow}</p>
            ) : null}
            <h1 id="platform-center-title">{center.hero.title}</h1>
            <p className="product-portal-lead">{center.hero.lead}</p>
            <div className="product-portal-tags" aria-label="产品价值">
              {center.hero.tags.map((tag) => (
                <span data-testid="platform-center-hero-tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            <Actions
              actions={center.hero.actions}
              testId="platform-center-hero-action"
            />
          </div>
          {center.hero.visual?.images ? (
            <ImageGallery images={center.hero.visual.images} preload />
          ) : center.hero.visual?.messages ? (
            <Demo
              demo={{
                title: center.hero.visual.title,
                messages: center.hero.visual.messages,
                footer: center.hero.visual.footer,
                note: center.hero.visual.note,
              }}
            />
          ) : center.hero.visual ? (
            <Visual {...center.hero.visual} />
          ) : null}
        </div>
      </section>

      {center.sections.map((section, index) => (
        <ContentSection
          index={index}
          key={`${center.slug}-${section.id ?? section.title}`}
          section={section}
          slug={center.slug}
        />
      ))}

      {center.capabilities?.map((capability, index) => (
        <Capability capability={capability} index={index} key={capability.id} />
      ))}

      {center.business ? <BusinessSection business={center.business} /> : null}

      {center.cta ? (
        <section
          className="product-portal-section product-portal-closing"
          data-testid="platform-center-cta"
        >
          <div className="product-portal-frame product-portal-cta">
            <div>
              <h2>{center.cta.title}</h2>
              <p>{center.cta.description}</p>
            </div>
            <Actions actions={center.cta.actions} />
          </div>
        </section>
      ) : null}
    </main>
  );
}

export function PlatformCenterDetail({ slug }: { slug: string }) {
  const center = getPlatformCenter(slug);

  if (!center) {
    notFound();
  }

  return <PlatformPageDetail dense={false} page={center} />;
}
