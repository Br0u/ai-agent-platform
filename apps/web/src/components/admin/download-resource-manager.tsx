"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { AssistantSkillModal } from "./assistant-skill-modal";
import {
  createDownloadResourceAction,
  discardDownloadDraftAction,
  downlineDownloadResourceAction,
  publishDownloadResourceAction,
  removeDownloadDraftFileAction,
  saveDownloadDraftAction,
} from "@/server/downloads/server-actions";
import {
  DOWNLOAD_RESOURCE_CATEGORIES,
  downloadResourceAdminDtoSchema,
  suggestDownloadPolicies,
  type DownloadResourceAdminDto,
} from "@/server/downloads/contracts";

type ActionState = {
  kind: string;
  fieldErrors?: Record<string, string[]>;
  resource?: DownloadResourceAdminDto;
};

type ServerAction = (
  previous: ActionState,
  formData: FormData,
) => Promise<ActionState>;

const idle: ActionState = { kind: "idle" };
const categoryLabels = {
  materials: "彩页与产品资料",
  software: "软件与客户端",
  deployment: "部署手册与说明",
  whitepapers: "白皮书与技术资料",
} as const;

const statusLabels = {
  文件失效: "文件失效",
  有待发布更改: "有待发布更改",
  已发布: "已发布",
  已下线: "已下线",
  待发布: "待发布",
  待上传: "待上传",
  空记录: "空记录",
} as const;

function message(state: ActionState) {
  if (state.kind === "validation_error") return "请检查标出的字段。";
  if (state.kind === "conflict") return "资源已被更新，请刷新后重试。";
  if (state.kind === "access_error") return "当前账号不能执行此操作。";
  if (state.kind === "authentication_required")
    return "登录状态已失效，请重新登录。";
  if (state.kind === "domain_error") return "当前资源状态不允许此操作。";
  if (state.kind === "internal_error") return "操作未完成，请稍后重试。";
  if (state.kind === "success") return "操作已完成。";
  return "";
}

function getCategory(resource: DownloadResourceAdminDto) {
  const revision = resource.draftRevision ?? resource.publishedRevision;
  if (revision) return revision.category;
  return resource.key === "mdd2-client" ? "software" : "materials";
}

function formatTime(value: string | null) {
  if (value === null) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function replaceResource(
  resources: DownloadResourceAdminDto[],
  next: DownloadResourceAdminDto,
) {
  const index = resources.findIndex((resource) => resource.id === next.id);
  if (index < 0) return [...resources, next];
  return resources.map((resource) =>
    resource.id === next.id ? next : resource,
  );
}

function FormMessage({ state }: { state: ActionState }) {
  return (
    <p
      aria-live="polite"
      className="download-resource-manager__message"
      role="status"
    >
      {message(state)}
    </p>
  );
}

function LifecycleForm({
  action,
  confirm,
  disabled = false,
  label,
  resource,
  onResource,
  tone = "secondary",
}: {
  action: ServerAction;
  confirm?: string;
  disabled?: boolean;
  label: string;
  resource: DownloadResourceAdminDto;
  onResource(resource: DownloadResourceAdminDto): void;
  tone?: "primary" | "secondary" | "danger";
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  useEffect(() => {
    if (state.kind === "success" && state.resource) onResource(state.resource);
  }, [state, onResource]);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <input name="id" type="hidden" value={resource.id} />
      <input
        name="expectedRowVersion"
        type="hidden"
        value={resource.rowVersion}
      />
      <button
        className={`download-resource-manager__button download-resource-manager__button--${tone}`}
        disabled={disabled || pending}
        type="submit"
      >
        {pending ? "正在处理…" : label}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

function CreateResourceDialog({
  onClose,
  onCreated,
}: {
  onClose(): void;
  onCreated(resource: DownloadResourceAdminDto): void;
}) {
  const keyRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(
    createDownloadResourceAction as ServerAction,
    idle,
  );
  useEffect(() => {
    if (state.kind !== "success" || !state.resource) return;
    onCreated(state.resource);
    onClose();
  }, [state, onClose, onCreated]);
  const errors =
    state.kind === "validation_error" ? (state.fieldErrors ?? {}) : {};

  return (
    <AssistantSkillModal
      closeDisabled={pending}
      initialFocusRef={keyRef}
      labelledBy="new-download-resource-heading"
      onClose={onClose}
    >
      <section className="download-resource-manager__dialog">
        <header>
          <p>Resource record</p>
          <h2 id="new-download-resource-heading">新增下载资源</h2>
          <span>先创建资源档案，再补充资料和 PDF 文件。</span>
        </header>
        <form
          action={formAction}
          className="download-resource-manager__dialog-form"
        >
          <label>
            资源键
            <input
              aria-invalid={errors.key ? true : undefined}
              aria-describedby={
                errors.key ? "new-resource-key-error" : undefined
              }
              maxLength={120}
              name="key"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="product-introduction"
              ref={keyRef}
              required
            />
            {errors.key ? (
              <small id="new-resource-key-error">{errors.key[0]}</small>
            ) : null}
          </label>
          <label>
            后台名称
            <input
              aria-invalid={errors.adminLabel ? true : undefined}
              aria-describedby={
                errors.adminLabel ? "new-resource-label-error" : undefined
              }
              maxLength={160}
              name="adminLabel"
              required
            />
            {errors.adminLabel ? (
              <small id="new-resource-label-error">
                {errors.adminLabel[0]}
              </small>
            ) : null}
          </label>
          <div className="download-resource-manager__dialog-actions">
            <button
              className="download-resource-manager__button download-resource-manager__button--secondary"
              disabled={pending}
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button
              className="download-resource-manager__button"
              disabled={pending}
              type="submit"
            >
              {pending ? "正在创建…" : "创建资源"}
            </button>
          </div>
          <FormMessage state={state} />
        </form>
      </section>
    </AssistantSkillModal>
  );
}

function Editor({
  resource,
  uploading,
  onAbortUpload,
  onResource,
  onUpload,
}: {
  resource: DownloadResourceAdminDto;
  uploading: boolean;
  onAbortUpload(): void;
  onResource(resource: DownloadResourceAdminDto): void;
  onUpload(file: File): void;
}) {
  const revision = resource.draftRevision ?? resource.publishedRevision;
  const [state, formAction, pending] = useActionState(
    saveDownloadDraftAction as ServerAction,
    idle,
  );
  const [explicitPolicy, setExplicitPolicy] = useState(false);
  const [category, setCategory] = useState(
    revision?.category ?? getCategory(resource),
  );
  const [policies, setPolicies] = useState(() =>
    revision
      ? {
          previewPolicy: revision.previewPolicy,
          downloadPolicy: revision.downloadPolicy,
        }
      : suggestDownloadPolicies(getCategory(resource)),
  );
  const disabled = uploading || pending;
  const complete = Boolean(revision?.pdfObjectKey && revision?.coverObjectKey);
  const canPublish =
    resource.adminStatus !== "文件失效" &&
    Boolean(
      resource.draftRevision?.pdfObjectKey &&
        resource.draftRevision.coverObjectKey,
    );
  const canDownline =
    resource.state === "published" && resource.draftRevision === null;
  const publishedReadOnly =
    resource.state === "published" && resource.draftRevision === null;

  useEffect(() => {
    if (state.kind === "success" && state.resource) onResource(state.resource);
  }, [state, onResource]);

  return (
    <section
      aria-labelledby="download-resource-editor-heading"
      className="download-resource-manager__editor"
    >
      <header className="download-resource-manager__editor-heading">
        <div>
          <p>Resource record</p>
          <h2 id="download-resource-editor-heading">{resource.adminLabel}</h2>
          <span>{resource.key}</span>
        </div>
        <div className="download-resource-manager__state" aria-label="资源状态">
          <strong>{statusLabels[resource.adminStatus]}</strong>
          <span>版本 {resource.rowVersion}</span>
          <span>
            发布 {formatTime(resource.publishedRevision?.publishedAt ?? null)}
          </span>
        </div>
      </header>

      <div className="download-resource-manager__artifact">
        {complete ? (
          // Authenticated draft covers cannot use the image optimizer because it has no staff session.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${resource.adminLabel} 封面`}
            src={`/api/v1/admin/downloads/${resource.id}/draft/cover`}
          />
        ) : (
          <div
            aria-label="暂无封面"
            className="download-resource-manager__cover-placeholder"
          >
            PDF
          </div>
        )}
        <div>
          <strong>资源首页</strong>
          <span>
            {complete
              ? `${revision?.pageCount} 页 · ${revision?.byteSize} bytes`
              : "尚未上传可用 PDF"}
          </span>
          {complete ? (
            <a
              href={`/api/v1/admin/downloads/${resource.id}/draft/pdf`}
              rel="noreferrer"
              target="_blank"
            >
              预览当前草稿
            </a>
          ) : null}
        </div>
      </div>

      <form action={formAction} className="download-resource-manager__form">
        <input name="id" type="hidden" value={resource.id} />
        <input
          name="expectedRowVersion"
          type="hidden"
          value={resource.rowVersion}
        />
        {publishedReadOnly ? (
          <>
            <input name="name" type="hidden" value={revision?.name ?? ""} />
            <input
              name="product"
              type="hidden"
              value={revision?.product ?? ""}
            />
            <input name="category" type="hidden" value={category} />
            <input
              name="resourceType"
              type="hidden"
              value={revision?.resourceType ?? ""}
            />
            <input
              name="sortOrder"
              type="hidden"
              value={revision?.sortOrder ?? 0}
            />
            <input
              name="previewPolicy"
              type="hidden"
              value={policies.previewPolicy}
            />
            <input
              name="downloadPolicy"
              type="hidden"
              value={policies.downloadPolicy}
            />
            <input
              name="description"
              type="hidden"
              value={revision?.description ?? ""}
            />
            <dl className="download-resource-manager__metadata">
              <dt>资源名称</dt>
              <dd>{revision?.name}</dd>
              <dt>所属产品</dt>
              <dd>{revision?.product}</dd>
              <dt>资源分类</dt>
              <dd>{categoryLabels[category]}</dd>
              <dt>资料类型</dt>
              <dd>{revision?.resourceType}</dd>
              <dt>资源简介</dt>
              <dd>{revision?.description}</dd>
            </dl>
          </>
        ) : (
          <fieldset disabled={disabled}>
            <label>
              资源名称
              <input
                defaultValue={revision?.name ?? ""}
                maxLength={160}
                name="name"
                required
              />
            </label>
            <label>
              所属产品
              <input
                defaultValue={revision?.product ?? ""}
                maxLength={120}
                name="product"
                required
              />
            </label>
            <label>
              资源分类
              <select
                aria-label="资源分类"
                name="category"
                onChange={(event) => {
                  const next = event.target.value as typeof category;
                  setCategory(next);
                  if (!explicitPolicy)
                    setPolicies(suggestDownloadPolicies(next));
                }}
                value={category}
              >
                {DOWNLOAD_RESOURCE_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {categoryLabels[item]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              资料类型
              <input
                defaultValue={revision?.resourceType ?? ""}
                maxLength={80}
                name="resourceType"
                required
              />
            </label>
            <label>
              排序
              <input
                defaultValue={revision?.sortOrder ?? 0}
                min={0}
                name="sortOrder"
                required
                type="number"
              />
            </label>
            <label>
              预览权限
              <select
                aria-label="预览权限"
                name="previewPolicy"
                onChange={(event) => {
                  setExplicitPolicy(true);
                  const previewPolicy = event.target.value as
                    | "public"
                    | "contact";
                  setPolicies((current) => ({
                    previewPolicy,
                    downloadPolicy:
                      previewPolicy === "contact"
                        ? "contact"
                        : current.downloadPolicy,
                  }));
                }}
                value={policies.previewPolicy}
              >
                <option value="public">可预览</option>
                <option value="contact">不可预览</option>
              </select>
            </label>
            <label>
              下载权限
              <select
                aria-label="下载权限"
                name="downloadPolicy"
                onChange={(event) => {
                  setExplicitPolicy(true);
                  setPolicies((current) => ({
                    ...current,
                    downloadPolicy: event.target.value as "public" | "contact",
                  }));
                }}
                value={policies.downloadPolicy}
              >
                <option value="contact">联系获取</option>
                <option
                  disabled={policies.previewPolicy === "contact"}
                  value="public"
                >
                  可下载
                </option>
              </select>
            </label>
            <label className="download-resource-manager__wide-field">
              资源简介
              <textarea
                defaultValue={revision?.description ?? ""}
                maxLength={500}
                name="description"
                required
                rows={3}
              />
            </label>
          </fieldset>
        )}
        <div className="download-resource-manager__editor-actions">
          <button
            className="download-resource-manager__button"
            disabled={disabled}
            type="submit"
          >
            {pending ? "正在保存…" : publishedReadOnly ? "编辑" : "保存草稿"}
          </button>
          <label className="download-resource-manager__upload">
            上传 PDF
            <input
              accept="application/pdf,.pdf"
              aria-label="上传 PDF"
              disabled={disabled}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onUpload(file);
                event.currentTarget.value = "";
              }}
              type="file"
            />
          </label>
          {uploading ? (
            <>
              <span
                aria-live="polite"
                className="download-resource-manager__uploading"
              >
                正在上传…
              </span>
              <button
                className="download-resource-manager__button download-resource-manager__button--secondary"
                onClick={onAbortUpload}
                type="button"
              >
                取消上传
              </button>
            </>
          ) : null}
        </div>
        <FormMessage state={state} />
      </form>

      <div
        aria-label="资源生命周期操作"
        className="download-resource-manager__lifecycle"
      >
        <LifecycleForm
          action={publishDownloadResourceAction as ServerAction}
          disabled={disabled || !canPublish}
          label="发布资源"
          resource={resource}
          onResource={onResource}
          tone="primary"
        />
        <LifecycleForm
          action={downlineDownloadResourceAction as ServerAction}
          confirm="下线后，公开下载中心将不再展示此资源。确定下线吗？"
          disabled={disabled || !canDownline}
          label="下线资源"
          resource={resource}
          onResource={onResource}
        />
        <LifecycleForm
          action={discardDownloadDraftAction as ServerAction}
          confirm="丢弃当前草稿会删除未发布的编辑内容。确定继续吗？"
          disabled={disabled || !resource.draftRevision}
          label="丢弃草稿"
          resource={resource}
          onResource={onResource}
        />
        <LifecycleForm
          action={removeDownloadDraftFileAction as ServerAction}
          confirm="移除草稿 PDF 后需重新上传。确定继续吗？"
          disabled={disabled || resource.state === "published" || !complete}
          label="移除草稿文件"
          resource={resource}
          onResource={onResource}
          tone="danger"
        />
        {!canDownline &&
        resource.state === "published" &&
        resource.draftRevision ? (
          <p>请先发布或丢弃当前草稿后再下线。</p>
        ) : null}
      </div>
    </section>
  );
}

export function DownloadResourceManager({
  resources: initialResources,
}: {
  resources: DownloadResourceAdminDto[];
}) {
  const [resources, setResources] = useState(initialResources);
  const [selectedId, setSelectedId] = useState(initialResources[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const selected =
    resources.find((resource) => resource.id === selectedId) ?? null;

  useEffect(() => () => controller.current?.abort(), []);

  const adopt = (next: DownloadResourceAdminDto) => {
    setResources((current) => replaceResource(current, next));
    setSelectedId(next.id);
  };
  const upload = async (resource: DownloadResourceAdminDto, file: File) => {
    if (controller.current) return;
    const signal = new AbortController();
    controller.current = signal;
    setUploadingId(resource.id);
    try {
      const body = new FormData();
      body.set("pdf", file, file.name);
      const response = await fetch(
        `/api/v1/admin/downloads/${resource.id}/upload`,
        {
          method: "POST",
          headers: { "If-Match": `"${resource.rowVersion}"` },
          body,
          signal: signal.signal,
        },
      );
      if (!response.ok) throw new Error("upload_failed");
      const payload: unknown = await response.json();
      const parsed =
        typeof payload === "object" && payload !== null
          ? downloadResourceAdminDtoSchema.safeParse(
              Reflect.get(payload, "resource"),
            )
          : null;
      if (parsed === null || !parsed.success) throw new Error("upload_failed");
      adopt(parsed.data);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        window.alert("PDF 上传未完成，请检查文件后重试。");
    } finally {
      if (controller.current === signal) controller.current = null;
      setUploadingId(null);
    }
  };
  const closeNew = () => {
    setNewOpen(false);
    queueMicrotask(() => newButton.current?.focus());
  };
  const filtered = resources.filter((resource) => {
    const text = `${resource.key} ${resource.adminLabel}`.toLocaleLowerCase(
      "zh-CN",
    );
    return (
      (!search || text.includes(search.toLocaleLowerCase("zh-CN"))) &&
      (!status || resource.adminStatus === status) &&
      (!category || getCategory(resource) === category)
    );
  });

  return (
    <main className="download-resource-manager">
      <header className="download-resource-manager__heading">
        <div>
          <p>Content operations</p>
          <h1>下载资源</h1>
          <span>管理公开下载中心的资源档案、资料权限与发布状态。</span>
        </div>
        <button
          className="download-resource-manager__button"
          onClick={() => setNewOpen(true)}
          ref={newButton}
          type="button"
        >
          新增资源
        </button>
      </header>
      <div className="download-resource-manager__filters" role="search">
        <label>
          搜索资源
          <input
            aria-label="搜索资源"
            onChange={(event) => setSearch(event.target.value)}
            type="search"
            value={search}
          />
        </label>
        <label>
          资源状态
          <select
            aria-label="资源状态"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="">全部状态</option>
            {Object.keys(statusLabels).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          资源分类
          <select
            aria-label="筛选资源分类"
            onChange={(event) => setCategory(event.target.value)}
            value={category}
          >
            <option value="">全部分类</option>
            {DOWNLOAD_RESOURCE_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {categoryLabels[item]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="download-resource-manager__workspace">
        <aside
          aria-label="下载资源列表"
          className="download-resource-manager__list"
        >
          {DOWNLOAD_RESOURCE_CATEGORIES.map((group) => {
            const items = filtered.filter(
              (resource) => getCategory(resource) === group,
            );
            return (
              <section key={group}>
                <h2>{categoryLabels[group]}</h2>
                {items.length ? (
                  <ul>
                    {items.map((resource) => (
                      <li
                        data-selected={resource.id === selectedId}
                        key={resource.id}
                      >
                        <button
                          aria-current={
                            resource.id === selectedId ? "page" : undefined
                          }
                          onClick={() => setSelectedId(resource.id)}
                          type="button"
                        >
                          <strong>{resource.adminLabel}</strong>
                          <span>{resource.key}</span>
                          <small>
                            {statusLabels[resource.adminStatus]} · v
                            {resource.rowVersion}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>暂无资源</p>
                )}
              </section>
            );
          })}
        </aside>
        <div>
          {selected ? (
            <Editor
              key={`${selected.id}:${selected.rowVersion}`}
              onAbortUpload={() => controller.current?.abort()}
              onResource={adopt}
              onUpload={(file) => void upload(selected, file)}
              resource={selected}
              uploading={uploadingId === selected.id}
            />
          ) : (
            <p className="download-resource-manager__empty">
              选择一条资源以开始编辑。
            </p>
          )}
        </div>
      </div>
      {newOpen ? (
        <CreateResourceDialog onClose={closeNew} onCreated={adopt} />
      ) : null}
    </main>
  );
}
