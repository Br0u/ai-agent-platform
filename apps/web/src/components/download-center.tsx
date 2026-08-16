"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import type { DownloadResourcePublicDto } from "@/server/downloads/contracts";
import { AssistantSkillModal } from "./admin/assistant-skill-modal";
import {
  downloadOverview,
  downloadSections,
  formatFileSize,
  formatPublishedAt,
  permissionHint,
} from "./download-center-content";

function ResourceCover({ resource }: { resource: DownloadResourcePublicDto }) {
  const cover = (
    <Image
      alt={`${resource.name}封面`}
      className="download-card__cover-image"
      height={252}
      src={resource.coverUrl}
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
  const contactTrigger = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const orderedResources = [...resources].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );

  const closeContact = () => {
    setContactResource(null);
    queueMicrotask(() => contactTrigger.current?.focus());
  };

  return (
    <main className="download-page">
      <div className="download-shell">
        <aside className="download-directory" aria-label="下载中心目录">
          <strong>资源目录</strong>
          <nav aria-label="下载中心完整目录">
            <Link href="/downloads#dl-hero">下载中心总览</Link>
            {downloadSections.map((section) => {
              const sectionResources = orderedResources.filter(
                ({ category }) => category === section.category,
              );
              return (
                <div key={section.category}>
                  <Link href={`/downloads#${section.anchor}`}>
                    {section.label}
                  </Link>
                  {sectionResources.length ? (
                    <ul>
                      {sectionResources.map((resource) => (
                        <li key={resource.key}>
                          <Link href={`/downloads#dl-${resource.key}`}>
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

        <div className="download-main">
          <section className="download-hero" id="dl-hero">
            <span className="download-hero__label">下载中心</span>
            <h1>{downloadOverview.title}</h1>
            <p>{downloadOverview.lead}</p>
            <div className="download-tags" aria-label="资源类型">
              {downloadOverview.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
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
