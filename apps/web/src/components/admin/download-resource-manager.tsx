"use client";
/* eslint-disable @next/next/no-img-element */

import { useActionState, useEffect, useRef, useState } from "react";

import { DownloadSoftwareArtifacts } from "./download-software-artifacts";
import { AssistantSkillModal } from "./assistant-skill-modal";
import {
  createTypedDownloadResourceAction,
  discardTypedDownloadDraftAction,
  downlineTypedDownloadResourceAction,
  publishTypedDownloadResourceAction,
  removeDownloadDraftArtifactAction,
  saveTypedDownloadDraftAction,
} from "@/server/downloads/server-actions";
import {
  DOWNLOAD_RESOURCE_CATEGORIES,
  typedDownloadResourceAdminDtoSchema,
  type TypedDownloadResourceAdminDto,
} from "@/server/downloads/contracts";

type ActionState =
  | { kind: "idle" }
  | { kind: "success"; resource: TypedDownloadResourceAdminDto }
  | { kind: "validation_error"; fieldErrors?: Record<string, string[]> }
  | { kind: "authentication_required"; code?: string }
  | { kind: "account_setup_required"; code?: string }
  | { kind: "access_error"; code?: string }
  | { kind: "conflict" | "domain_error" | "internal_error" };
type ServerAction = (
  previous: ActionState,
  formData: FormData,
) => Promise<ActionState>;
type Slot = "document" | "windows" | "macos";
const idle: ActionState = { kind: "idle" };
const categoryLabels = {
  materials: "彩页与产品资料",
  software: "软件与客户端",
  deployment: "部署手册与说明",
  whitepapers: "白皮书与技术资料",
} as const;

function message(state: ActionState) {
  if (state.kind === "validation_error") return "请检查标出的字段。";
  if (state.kind === "conflict") return "资源已被更新，请刷新后重试。";
  if (state.kind === "account_setup_required")
    return "请先完成账号初始化后再管理下载资源。";
  if (state.kind === "access_error")
    return state.code === "AUTH_ACCOUNT_DISABLED"
      ? "当前账号已被禁用。"
      : state.code === "AUTH_ACCOUNT_NOT_ACTIVE"
        ? "当前账号尚未启用。"
        : "当前账号没有下载资源管理权限。";
  if (state.kind === "authentication_required")
    return "登录状态已失效，请重新登录。";
  if (state.kind === "domain_error") return "当前资源状态不允许此操作。";
  if (state.kind === "internal_error") return "操作未完成，请稍后重试。";
  return "";
}

function FieldError({ state, name }: { state: ActionState; name: string }) {
  const error =
    state.kind === "validation_error"
      ? state.fieldErrors?.[name]?.[0]
      : undefined;
  return error ? <span id={`download-field-${name}`}>{error}</span> : null;
}
function revision(resource: TypedDownloadResourceAdminDto) {
  return resource.draftRevision ?? resource.publishedRevision;
}
function resourceCategory(resource: TypedDownloadResourceAdminDto) {
  return (
    revision(resource)?.category ??
    (resource.kind === "software" ? "software" : "materials")
  );
}
function defaultPolicies(
  category: (typeof DOWNLOAD_RESOURCE_CATEGORIES)[number],
) {
  return category === "materials"
    ? { previewPolicy: "public" as const, downloadPolicy: "contact" as const }
    : { previewPolicy: "contact" as const, downloadPolicy: "contact" as const };
}
function formatTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}
function uploadErrorMessage(response: Response, code: unknown) {
  if (response.status === 409 || code === "state_conflict")
    return "资源已更新，请刷新页面后重试。";
  if (response.status === 422 || code === "invalid_file")
    return "文件类型或内容不符合该平台要求。";
  if (response.status === 401) return "登录状态已失效，请重新登录后重试。";
  if (response.status === 403) return "当前账号没有上传下载资源的权限。";
  return "上传未完成，请稍后重试。";
}

function ActionForm({
  action,
  disabled,
  label,
  resource,
  slot,
  tone = "secondary",
  onResource,
}: {
  action: ServerAction;
  disabled: boolean;
  label: string;
  resource: TypedDownloadResourceAdminDto;
  slot?: Slot;
  tone?: "primary" | "secondary" | "danger";
  onResource(resource: TypedDownloadResourceAdminDto): void;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (state.kind === "success") {
      onResource(state.resource);
      queueMicrotask(() => trigger.current?.focus());
    }
  }, [state, onResource]);
  return (
    <>
      <button
        className={`download-resource-manager__button download-resource-manager__button--${tone}`}
        disabled={disabled || pending}
        onClick={() => setOpen(true)}
        ref={trigger}
        type="button"
      >
        {pending ? "正在处理…" : label}
      </button>
      <p
        aria-live="polite"
        className="download-resource-manager__message"
        role="status"
      >
        {message(state)}
      </p>
      {open && state.kind !== "success" ? (
        <AssistantSkillModal
          initialFocusRef={trigger}
          labelledBy="download-confirm-heading"
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        >
          <section className="download-resource-manager__dialog">
            <h2 id="download-confirm-heading">确认{label}</h2>
            <p>此操作将立即更新资源状态。</p>
            <form
              action={formAction}
              className="download-resource-manager__dialog-actions"
            >
              <input name="id" type="hidden" value={resource.id} />
              <input
                name="expectedRowVersion"
                type="hidden"
                value={resource.rowVersion}
              />
              {slot ? <input name="slot" type="hidden" value={slot} /> : null}
              <button
                className="download-resource-manager__button download-resource-manager__button--secondary"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                }}
                type="button"
              >
                取消
              </button>
              <button
                className={`download-resource-manager__button download-resource-manager__button--${tone}`}
                disabled={pending}
                type="submit"
              >
                {pending ? "正在处理…" : "确认"}
              </button>
            </form>
          </section>
        </AssistantSkillModal>
      ) : null}
    </>
  );
}

function CreateResourceDialog({
  onClose,
  onCreated,
}: {
  onClose(): void;
  onCreated(resource: TypedDownloadResourceAdminDto): void;
}) {
  const initialFocusRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(
    createTypedDownloadResourceAction as ServerAction,
    idle,
  );
  useEffect(() => {
    if (state.kind === "success") {
      onCreated(state.resource);
      onClose();
    }
  }, [state, onCreated, onClose]);
  return (
    <AssistantSkillModal
      closeDisabled={pending}
      initialFocusRef={initialFocusRef}
      labelledBy="new-download-resource-heading"
      onClose={onClose}
    >
      <section className="download-resource-manager__dialog">
        <h2 id="new-download-resource-heading">新增下载资源</h2>
        <form
          action={formAction}
          className="download-resource-manager__dialog-form"
        >
          <label>
            资源键
            <input
              aria-describedby={
                state.kind === "validation_error" && state.fieldErrors?.key
                  ? "download-field-key"
                  : undefined
              }
              aria-invalid={Boolean(
                state.kind === "validation_error" && state.fieldErrors?.key,
              )}
              maxLength={120}
              name="key"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              ref={initialFocusRef}
              required
            />
            <FieldError name="key" state={state} />
          </label>
          <label>
            后台名称
            <input
              aria-describedby={
                state.kind === "validation_error" &&
                state.fieldErrors?.adminLabel
                  ? "download-field-adminLabel"
                  : undefined
              }
              aria-invalid={Boolean(
                state.kind === "validation_error" &&
                  state.fieldErrors?.adminLabel,
              )}
              maxLength={160}
              name="adminLabel"
              required
            />
            <FieldError name="adminLabel" state={state} />
          </label>
          <label>
            资源类型
            <select aria-label="资源类型" defaultValue="document" name="kind">
              <option value="document">文档</option>
              <option value="software">软件</option>
            </select>
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
          <p
            aria-live="polite"
            className="download-resource-manager__message"
            role="status"
          >
            {message(state)}
          </p>
        </form>
      </section>
    </AssistantSkillModal>
  );
}

function Editor({
  resource,
  uploading,
  uploadError,
  onAbortUpload,
  controlsLocked,
  onDirtyChange,
  onResource,
  onUpload,
}: {
  resource: TypedDownloadResourceAdminDto;
  uploading: boolean;
  uploadError: string | null;
  onAbortUpload(): void;
  controlsLocked: boolean;
  onDirtyChange(dirty: boolean): void;
  onResource(resource: TypedDownloadResourceAdminDto): void;
  onUpload(slot: Slot, file: File): void;
}) {
  const current = revision(resource);
  const [state, formAction, pending] = useActionState(
    saveTypedDownloadDraftAction as ServerAction,
    idle,
  );
  const [artifactError, setArtifactError] = useState("");
  const [removingSlot, setRemovingSlot] = useState<"windows" | "macos" | null>(
    null,
  );
  const [dirty, setDirty] = useState(false);
  const [editCategory, setEditCategory] = useState(
    current?.category ?? resourceCategory(resource),
  );
  const [policies, setPolicies] = useState(() =>
    current?.kind === "document"
      ? {
          previewPolicy: current.previewPolicy,
          downloadPolicy: current.downloadPolicy,
        }
      : defaultPolicies(resourceCategory(resource)),
  );
  const [explicitPolicy, setExplicitPolicy] = useState(Boolean(current));
  useEffect(() => {
    if (state.kind === "success") {
      onResource(state.resource);
    }
  }, [state, onDirtyChange, onResource]);
  const disabled = uploading || pending;
  const actionsDisabled = disabled || dirty;
  const document =
    resource.kind === "document" && resource.draftRevision
      ? resource.draftRevision.artifacts[0]
      : null;
  const softwareArtifacts =
    resource.kind === "software" && resource.draftRevision
      ? {
          windows:
            resource.draftRevision.artifacts.find(
              (item) => item.slot === "windows",
            ) ?? null,
          macos:
            resource.draftRevision.artifacts.find(
              (item) => item.slot === "macos",
            ) ?? null,
        }
      : null;
  const canPublish =
    resource.kind === "document"
      ? Boolean(resource.draftRevision?.artifacts[0])
      : Boolean(resource.draftRevision?.artifacts.length);
  const canDownline =
    resource.state === "published" && resource.draftRevision === null;
  const softwareCurrent = current?.kind === "software" ? current : null;
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
        <div
          aria-label="资源发布状态"
          className="download-resource-manager__state"
        >
          <strong>{resource.adminStatus}</strong>
          <span>版本 {resource.rowVersion}</span>
          <span>
            已发布于{" "}
            {formatTime(resource.publishedRevision?.publishedAt ?? null)}
          </span>
        </div>
      </header>
      {resource.kind === "document" ? (
        <div className="download-resource-manager__artifact">
          {document?.coverObjectKey ? (
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
              {document
                ? `${document.pageCount} 页 · ${document.byteSize} bytes`
                : "尚未上传可用 PDF"}
            </span>
            {document ? (
              <a
                href={`/admin/downloads/preview/${resource.id}`}
                rel="noreferrer"
                target="_blank"
              >
                预览当前草稿
              </a>
            ) : null}
          </div>
        </div>
      ) : softwareArtifacts ? (
        <DownloadSoftwareArtifacts
          artifacts={softwareArtifacts}
          disabled={
            controlsLocked || removingSlot !== null || !resource.draftRevision
          }
          onRemove={(slot) => {
            setRemovingSlot(slot);
            const formData = new FormData();
            formData.set("id", resource.id);
            formData.set("expectedRowVersion", String(resource.rowVersion));
            formData.set("slot", slot);
            void removeDownloadDraftArtifactAction({ kind: "idle" }, formData)
              .then((result) => {
                if (result.kind === "success") onResource(result.resource);
                else setArtifactError(message(result));
              })
              .finally(() => setRemovingSlot(null));
          }}
          onUpload={onUpload}
        />
      ) : (
        <p>保存草稿后可上传 Windows 或 macOS 安装包。</p>
      )}
      <form
        action={formAction}
        className="download-resource-manager__form"
        onChange={(event) => {
          if (
            event.target instanceof HTMLInputElement &&
            event.target.type === "file"
          )
            return;
          setDirty(true);
          onDirtyChange(true);
        }}
        onReset={() => {
          setDirty(false);
          onDirtyChange(false);
          setEditCategory(current?.category ?? resourceCategory(resource));
          setPolicies(
            current?.kind === "document"
              ? {
                  previewPolicy: current.previewPolicy,
                  downloadPolicy: current.downloadPolicy,
                }
              : defaultPolicies(resourceCategory(resource)),
          );
          setExplicitPolicy(Boolean(current));
        }}
      >
        <input name="id" type="hidden" value={resource.id} />
        <input
          name="expectedRowVersion"
          type="hidden"
          value={resource.rowVersion}
        />
        <input name="kind" type="hidden" value={resource.kind} />
        <fieldset disabled={disabled}>
          <label>
            资源名称
            <input
              defaultValue={current?.name ?? ""}
              aria-describedby={
                state.kind === "validation_error" && state.fieldErrors?.name
                  ? "download-field-name"
                  : undefined
              }
              aria-invalid={Boolean(
                state.kind === "validation_error" && state.fieldErrors?.name,
              )}
              maxLength={160}
              name="name"
              required
            />
            <FieldError name="name" state={state} />
          </label>
          <label>
            所属产品
            <input
              defaultValue={current?.product ?? ""}
              maxLength={120}
              name="product"
              required
            />
          </label>
          <label>
            资源分类
            <select
              aria-label="资源分类"
              value={editCategory}
              name="category"
              onChange={(event) => {
                const next = event.target.value as typeof editCategory;
                setEditCategory(next);
                if (!explicitPolicy) setPolicies(defaultPolicies(next));
              }}
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
              defaultValue={current?.resourceType ?? ""}
              maxLength={80}
              name="resourceType"
              required
            />
          </label>
          <label>
            排序
            <input
              defaultValue={current?.sortOrder ?? 0}
              min={0}
              name="sortOrder"
              required
              type="number"
            />
          </label>
          {resource.kind === "document" ? (
            <>
              <label>
                预览权限
                <select
                  aria-label="预览权限"
                  value={policies.previewPolicy}
                  name="previewPolicy"
                  onChange={(event) => {
                    const previewPolicy = event.target.value as
                      | "public"
                      | "contact";
                    setExplicitPolicy(true);
                    setPolicies((value) => ({
                      previewPolicy,
                      downloadPolicy:
                        previewPolicy === "contact"
                          ? "contact"
                          : value.downloadPolicy,
                    }));
                  }}
                >
                  <option value="public">可预览</option>
                  <option value="contact">不可预览</option>
                </select>
              </label>
              <label>
                下载权限
                <select
                  aria-label="下载权限"
                  value={policies.downloadPolicy}
                  name="downloadPolicy"
                  onChange={(event) => {
                    setExplicitPolicy(true);
                    setPolicies((value) => ({
                      ...value,
                      downloadPolicy: event.target.value as
                        | "public"
                        | "contact",
                    }));
                  }}
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
            </>
          ) : (
            <label>
              版本号
              <input
                aria-label="版本号"
                defaultValue={softwareCurrent?.releaseVersion ?? ""}
                aria-describedby={
                  state.kind === "validation_error" &&
                  state.fieldErrors?.releaseVersion
                    ? "download-field-releaseVersion"
                    : undefined
                }
                aria-invalid={Boolean(
                  state.kind === "validation_error" &&
                    state.fieldErrors?.releaseVersion,
                )}
                maxLength={40}
                name="releaseVersion"
                required
              />
              <FieldError name="releaseVersion" state={state} />
            </label>
          )}
          <label className="download-resource-manager__wide-field">
            资源简介
            <textarea
              defaultValue={current?.description ?? ""}
              maxLength={500}
              name="description"
              required
              rows={3}
            />
          </label>
        </fieldset>
        <div className="download-resource-manager__editor-actions">
          <button
            className="download-resource-manager__button"
            disabled={disabled}
            type="submit"
          >
            {pending
              ? "正在保存…"
              : current && resource.draftRevision === null
                ? "编辑"
                : "保存草稿"}
          </button>
          {dirty ? (
            <button
              className="download-resource-manager__button download-resource-manager__button--secondary"
              disabled={disabled}
              type="reset"
            >
              放弃修改
            </button>
          ) : null}
          {resource.kind === "document" ? (
            <label className="download-resource-manager__upload">
              上传 PDF
              <input
                accept="application/pdf,.pdf"
                aria-label="上传 PDF"
                disabled={actionsDisabled || !resource.draftRevision}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onUpload("document", file);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
          ) : null}
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
        {uploadError ? (
          <p
            aria-live="polite"
            className="download-resource-manager__upload-error"
            role="status"
          >
            {uploadError}
          </p>
        ) : null}
        {artifactError ? (
          <p
            aria-live="polite"
            className="download-resource-manager__upload-error"
            role="status"
          >
            {artifactError}
          </p>
        ) : null}
        <p
          aria-live="polite"
          className="download-resource-manager__message"
          role="status"
        >
          {message(state)}
        </p>
      </form>
      <div
        aria-label="资源生命周期操作"
        className="download-resource-manager__lifecycle"
      >
        <ActionForm
          action={publishTypedDownloadResourceAction as ServerAction}
          disabled={actionsDisabled || !canPublish}
          label="发布资源"
          onResource={onResource}
          resource={resource}
          tone="primary"
        />
        <ActionForm
          action={downlineTypedDownloadResourceAction as ServerAction}
          disabled={actionsDisabled || !canDownline}
          label="下线资源"
          onResource={onResource}
          resource={resource}
        />
        <ActionForm
          action={discardTypedDownloadDraftAction as ServerAction}
          disabled={actionsDisabled || !resource.draftRevision}
          label="丢弃草稿"
          onResource={onResource}
          resource={resource}
        />
        {resource.kind === "document" && document ? (
          <ActionForm
            action={removeDownloadDraftArtifactAction as ServerAction}
            disabled={actionsDisabled || !resource.draftRevision}
            label="移除草稿文件"
            onResource={onResource}
            resource={resource}
            slot="document"
            tone="danger"
          />
        ) : null}
      </div>
    </section>
  );
}

export function DownloadResourceManager({
  resources: initialResources,
}: {
  resources: TypedDownloadResourceAdminDto[];
}) {
  const [resources, setResources] = useState(initialResources);
  const [selectedId, setSelectedId] = useState(initialResources[0]?.id ?? null);
  const [newOpen, setNewOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [product, setProduct] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [editingDirty, setEditingDirty] = useState(false);
  const [uploadError, setUploadError] = useState<{
    message: string;
    resourceId: string;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const newTrigger = useRef<HTMLButtonElement>(null);
  const controlsLocked = uploadingId !== null || editingDirty;
  const closeNew = () => {
    setNewOpen(false);
    queueMicrotask(() => newTrigger.current?.focus());
  };
  const selected =
    resources.find((resource) => resource.id === selectedId) ?? null;
  const products = Array.from(
    new Set(
      resources.flatMap((resource) => {
        const current = revision(resource);
        return current ? [current.product] : [];
      }),
    ),
  ).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const filtered = resources.filter((resource) => {
    const current = revision(resource);
    const text = [
      resource.key,
      resource.adminLabel,
      current?.name,
      current?.product,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("zh-CN");
    return (
      (!search || text.includes(search.toLocaleLowerCase("zh-CN"))) &&
      (!status || resource.adminStatus === status) &&
      (!selectedCategory || resourceCategory(resource) === selectedCategory) &&
      (!product || current?.product === product)
    );
  });
  const adopt = (next: TypedDownloadResourceAdminDto) => {
    setResources((current) =>
      current.map((item) => (item.id === next.id ? next : item)),
    );
    setEditingDirty(false);
  };
  const upload = async (
    resource: TypedDownloadResourceAdminDto,
    slot: Slot,
    file: File,
  ) => {
    if (!file.name || controller.current) return;
    const current = new AbortController();
    controller.current = current;
    setUploadingId(resource.id);
    setUploadError(null);
    try {
      const body = new FormData();
      body.set("artifact", file, file.name);
      const response = await fetch(
        `/api/v1/admin/downloads/${resource.id}/upload/${slot}`,
        {
          method: "POST",
          headers: { "If-Match": `"${resource.rowVersion}"` },
          body,
          signal: current.signal,
        },
      );
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const error =
          typeof payload === "object" && payload
            ? Reflect.get(payload, "error")
            : null;
        setUploadError({
          resourceId: resource.id,
          message: uploadErrorMessage(
            response,
            typeof error === "object" && error
              ? Reflect.get(error, "code")
              : null,
          ),
        });
        return;
      }
      const payload: unknown = await response.json();
      const parsed = typedDownloadResourceAdminDtoSchema.safeParse(
        typeof payload === "object" && payload
          ? Reflect.get(payload, "resource")
          : null,
      );
      if (parsed.success) adopt(parsed.data);
      else
        setUploadError({
          resourceId: resource.id,
          message: "上传未完成，请稍后重试。",
        });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setUploadError({
          resourceId: resource.id,
          message: "上传未完成，请稍后重试。",
        });
    } finally {
      if (controller.current === current) controller.current = null;
      setUploadingId(null);
    }
  };
  return (
    <main
      aria-busy={uploadingId !== null ? true : undefined}
      className="download-resource-manager"
    >
      <header className="download-resource-manager__heading">
        <div>
          <p>Content operations</p>
          <h1>下载资源</h1>
          <span>管理公开下载中心的资源档案、资料权限与发布状态。</span>
        </div>
        <button
          className="download-resource-manager__button"
          disabled={controlsLocked}
          onClick={() => setNewOpen(true)}
          ref={newTrigger}
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
            disabled={controlsLocked}
            onChange={(event) => setSearch(event.target.value)}
            type="search"
            value={search}
          />
        </label>
        <label>
          资源状态
          <select
            aria-label="资源状态"
            disabled={controlsLocked}
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="">全部状态</option>
            {[
              "文件失效",
              "有待发布更改",
              "已发布",
              "已下线",
              "待发布",
              "待上传",
              "空记录",
            ].map((item) => (
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
            disabled={controlsLocked}
            onChange={(event) => setSelectedCategory(event.target.value)}
            value={selectedCategory}
          >
            <option value="">全部分类</option>
            {DOWNLOAD_RESOURCE_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {categoryLabels[item]}
              </option>
            ))}
          </select>
        </label>
        <label>
          筛选产品
          <select
            aria-label="筛选产品"
            disabled={controlsLocked}
            onChange={(event) => setProduct(event.target.value)}
            value={product}
          >
            <option value="">全部产品</option>
            {products.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <span className="download-resource-manager__count">
          可见资源 {filtered.length} 条
        </span>
      </div>
      <div className="download-resource-manager__workspace">
        <aside
          aria-label="下载资源列表"
          className="download-resource-manager__list"
        >
          {DOWNLOAD_RESOURCE_CATEGORIES.map((category) => (
            <section key={category}>
              <h2>{categoryLabels[category]}</h2>
              <ul>
                {filtered
                  .filter((resource) => resourceCategory(resource) === category)
                  .map((resource) => (
                    <li
                      data-selected={resource.id === selectedId}
                      key={resource.id}
                    >
                      <button
                        aria-current={
                          resource.id === selectedId ? "page" : undefined
                        }
                        disabled={controlsLocked}
                        onClick={() => setSelectedId(resource.id)}
                        type="button"
                      >
                        <strong>{resource.adminLabel}</strong>
                        <span>{resource.key}</span>
                        <small>
                          {resource.adminStatus} · v{resource.rowVersion}
                        </small>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </aside>
        <div>
          {selected ? (
            <Editor
              key={`${selected.id}:${selected.rowVersion}`}
              onAbortUpload={() => controller.current?.abort()}
              controlsLocked={controlsLocked}
              onDirtyChange={setEditingDirty}
              onResource={adopt}
              onUpload={(slot, file) => void upload(selected, slot, file)}
              resource={selected}
              uploadError={
                uploadError?.resourceId === selected.id
                  ? uploadError.message
                  : null
              }
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
        <CreateResourceDialog
          onClose={closeNew}
          onCreated={(resource) => {
            setResources((current) => [...current, resource]);
            setSelectedId(resource.id);
          }}
        />
      ) : null}
    </main>
  );
}
