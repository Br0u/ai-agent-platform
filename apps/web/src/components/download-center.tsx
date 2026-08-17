"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DownloadResourcePublicDto } from "@/server/downloads/contracts";
import { AssistantSkillModal } from "./admin/assistant-skill-modal";
import {
  downloadHeroNote,
  downloadJourney,
  downloadOverview,
  downloadSections,
  formatFileSize,
  formatPublishedAt,
  permissionHint,
} from "./download-center-content";
import {
  DirectoryProgressRail,
  useDirectoryProgress,
} from "./directory-progress";

function ResourceCover({ resource }: { resource: DownloadResourcePublicDto }) {
  const cover = (
    <Image
      alt={`${resource.name}封面`}
      className="download-card__cover-image"
      height={252}
      src={resource.coverUrl}
      unoptimized
      width={180}
    />
  );

  return resource.previewPolicy === "public" ? (
    <Link
      className="download-card__cover"
      href={`/downloads/preview/${resource.key}`}
    >
      {cover}
    </Link>
  ) : (
    <div className="download-card__cover">{cover}</div>
  );
}

function ResourceCard({
  onContact,
  resource,
}: {
  onContact: (
    resource: DownloadResourcePublicDto,
    trigger: HTMLButtonElement,
  ) => void;
  resource: DownloadResourcePublicDto;
}) {
  const canPreview = resource.previewPolicy === "public";
  const canDownload = resource.downloadPolicy === "public";

  return (
    <article
      className="download-card"
      data-download-key={resource.key}
      id={`dl-${resource.key}`}
    >
      <ResourceCover resource={resource} />
      <div className="download-card__body">
        <div className="download-card__labels">
          <span>{resource.product}</span>
          <span>{resource.resourceType}</span>
        </div>
        <h3>{resource.name}</h3>
        <p className="download-card__description">{resource.description}</p>
        <dl className="download-card__metadata">
          <div>
            <dt>页数</dt>
            <dd>{resource.pageCount} 页</dd>
          </div>
          <div>
            <dt>大小</dt>
            <dd>{formatFileSize(resource.byteSize)}</dd>
          </div>
          <div>
            <dt>发布时间</dt>
            <dd>
              <time dateTime={resource.updatedAt}>
                发布于 {formatPublishedAt(resource.updatedAt)}
              </time>
            </dd>
          </div>
        </dl>
        <p className="download-card__policy">
          {permissionHint(resource.previewPolicy, resource.downloadPolicy)}
        </p>
        <div className="download-actions">
          {canPreview ? (
            <Link
              aria-label={`在线预览${resource.name}`}
              href={`/downloads/preview/${resource.key}`}
            >
              在线预览
            </Link>
          ) : null}
          {canDownload ? (
            <a
              aria-label={`下载 PDF ${resource.name}`}
              className="download-button--primary"
              href={`/api/v1/downloads/${resource.key}/download`}
            >
              下载 PDF
            </a>
          ) : (
            <button
              aria-label={`${canPreview ? "下载资料" : "联系获取"}${resource.name}`}
              className="download-button--primary"
              onClick={(event) => onContact(resource, event.currentTarget)}
              type="button"
            >
              {canPreview ? "下载资料" : "联系获取"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function DownloadCenter({
  resources,
}: {
  resources: DownloadResourcePublicDto[];
}) {
  const [contactResource, setContactResource] =
    useState<DownloadResourcePublicDto | null>(null);
  const [directoryCollapsed, setDirectoryCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const contactTrigger = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const directory = useRef<HTMLElement>(null);
  const orderedResources = [...resources].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const directoryAnchors = [
    "dl-hero",
    ...downloadSections.flatMap((section) => [
      section.anchor,
      ...orderedResources
        .filter(({ category }) => category === section.category)
        .map(({ key }) => `dl-${key}`),
    ]),
  ];
  const { activeHash, progress } = useDirectoryProgress(directoryAnchors);

  const closeContact = () => {
    setContactResource(null);
    queueMicrotask(() => contactTrigger.current?.focus());
  };

  const closeMobile = (returnFocus = true) => {
    setMobileOpen(false);
    if (returnFocus) mobileTrigger.current?.focus();
  };

  useEffect(() => {
    if (!mobileOpen) return;
    const frame = requestAnimationFrame(() =>
      directory.current?.querySelector<HTMLAnchorElement>("a")?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobile();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  return (
    <main className="download-page">
      <button
        aria-controls="download-directory"
        aria-expanded={mobileOpen}
        className="download-directory-mobile"
        onClick={() => setMobileOpen(true)}
        ref={mobileTrigger}
        type="button"
      >
        下载中心目录
      </button>
      <button
        aria-label="关闭下载中心目录"
        className="download-directory-backdrop"
        data-open={mobileOpen}
        onClick={() => closeMobile()}
        type="button"
      />
      <div
        className="download-shell"
        data-directory-collapsed={directoryCollapsed}
      >
        <aside
          aria-label="下载中心目录"
          aria-modal={mobileOpen ? "true" : undefined}
          className="download-directory"
          data-mobile-open={mobileOpen}
          id="download-directory"
          ref={directory}
          role={mobileOpen ? "dialog" : undefined}
        >
          <DirectoryProgressRail
            collapsed={directoryCollapsed}
            progress={progress}
          />
          <div className="download-directory__tools">
            <strong>资源目录</strong>
            <button
              aria-expanded={!directoryCollapsed}
              aria-label={`${directoryCollapsed ? "展开" : "收起"}下载中心目录`}
              className="download-directory__desktop-collapse"
              onClick={() => setDirectoryCollapsed((value) => !value)}
              type="button"
            >
              <span aria-hidden="true">{directoryCollapsed ? "›" : "‹"}</span>
            </button>
            <button
              aria-label="关闭下载中心目录"
              className="download-directory__mobile-close"
              onClick={() => closeMobile()}
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <nav aria-label="下载中心完整目录" id="download-directory-nav">
            <Link
              aria-current={activeHash === "#dl-hero" ? "location" : undefined}
              href="/downloads#dl-hero"
              onClick={() => closeMobile(false)}
            >
              下载中心总览
            </Link>
            {downloadSections.map((section) => {
              const sectionResources = orderedResources.filter(
                ({ category }) => category === section.category,
              );
              return (
                <div key={section.category}>
                  <Link
                    aria-current={
                      activeHash === `#${section.anchor}`
                        ? "location"
                        : undefined
                    }
                    href={`/downloads#${section.anchor}`}
                    onClick={() => closeMobile(false)}
                  >
                    {section.label}
                  </Link>
                  {sectionResources.length ? (
                    <ul>
                      {sectionResources.map((resource) => (
                        <li key={resource.key}>
                          <Link
                            aria-current={
                              activeHash === `#dl-${resource.key}`
                                ? "location"
                                : undefined
                            }
                            href={`/downloads#dl-${resource.key}`}
                            onClick={() => closeMobile(false)}
                          >
                            {resource.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </nav>
        </aside>

        <div className="download-main" inert={mobileOpen ? true : undefined}>
          <section className="download-hero" id="dl-hero">
            <h1>{downloadOverview.title}</h1>
            <p className="download-hero__lead">{downloadOverview.lead}</p>
            <div className="download-tags" aria-label="资源类型">
              {downloadOverview.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="download-hero__actions">
              <Link className="download-button--primary" href="/product">
                了解产品
              </Link>
              <Link href="/trial">申请体验</Link>
            </div>
            <div className="download-journey" aria-label="获取资源路径">
              {downloadJourney.map((step, index) => (
                <article className="download-journey__step" key={step.title}>
                  <span>{index + 1}</span>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                  <Link href={step.href}>{step.title}</Link>
                </article>
              ))}
            </div>
            <p className="download-hero__note">{downloadHeroNote}</p>
          </section>

          {downloadSections.map((section) => {
            const sectionResources = orderedResources.filter(
              ({ category }) => category === section.category,
            );
            return (
              <section
                className="download-section"
                id={section.anchor}
                key={section.category}
              >
                <header>
                  <h2>
                    {section.no}｜{section.label}
                  </h2>
                </header>
                {sectionResources.length ? (
                  <div className="download-grid">
                    {sectionResources.map((resource) => (
                      <ResourceCard
                        key={resource.key}
                        onContact={(selected, trigger) => {
                          contactTrigger.current = trigger;
                          setContactResource(selected);
                        }}
                        resource={resource}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="download-empty">暂无可用资源</p>
                )}
              </section>
            );
          })}

          <section className="download-cta">
            <div>
              <h2>需要进一步了解产品？</h2>
              <p>联系我们，获取适合您业务场景的资料与产品支持。</p>
            </div>
            <Link href="/contact?topic=下载与资料咨询">联系我们</Link>
          </section>
        </div>
      </div>

      {contactResource ? (
        <AssistantSkillModal
          initialFocusRef={cancelButton}
          labelledBy="download-contact-title"
          onClose={closeContact}
        >
          <section className="download-contact-dialog">
            <h2 id="download-contact-title">联系获取资料</h2>
            <p>
              “{contactResource.name}
              ”暂未开放直接下载。请联系我们并说明您的需求，成为客户后可申请获取资料。
            </p>
            <div className="download-contact-dialog__actions">
              <button onClick={closeContact} ref={cancelButton} type="button">
                取消
              </button>
              <Link
                href={`/contact?${new URLSearchParams({ topic: `申请获取${contactResource.name}` }).toString()}`}
              >
                联系我们
              </Link>
            </div>
          </section>
        </AssistantSkillModal>
      ) : null}
    </main>
  );
}
