"use client";
/* eslint-disable @next/next/no-img-element */

import { useActionState, useEffect, useRef, useState } from "react";

import { DownloadSoftwareArtifacts } from "./download-software-artifacts";
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
  | {
      kind:
        | "authentication_required"
        | "account_setup_required"
        | "access_error"
        | "conflict"
        | "domain_error"
        | "internal_error";
    };
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
  if (state.kind === "access_error") return "当前账号没有下载资源管理权限。";
  if (state.kind === "authentication_required")
    return "登录状态已失效，请重新登录。";
  if (state.kind === "domain_error") return "当前资源状态不允许此操作。";
  if (state.kind === "internal_error") return "操作未完成，请稍后重试。";
  return "";
}
function revision(resource: TypedDownloadResourceAdminDto) {
  return resource.draftRevision ?? resource.publishedRevision;
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
  useEffect(() => {
    if (state.kind === "success") onResource(state.resource);
  }, [state, onResource]);
  return (
    <form action={formAction}>
      <input name="id" type="hidden" value={resource.id} />
      <input
        name="expectedRowVersion"
        type="hidden"
        value={resource.rowVersion}
      />
      {slot ? <input name="slot" type="hidden" value={slot} /> : null}
      <button
        className={`download-resource-manager__button download-resource-manager__button--${tone}`}
        disabled={disabled || pending}
        type="submit"
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
    </form>
  );
}

function CreateResourceDialog({
  onClose,
  onCreated,
}: {
  onClose(): void;
  onCreated(resource: TypedDownloadResourceAdminDto): void;
}) {
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
    <section
      aria-label="新增下载资源"
      className="download-resource-manager__dialog"
      role="dialog"
    >
      <h2>新增下载资源</h2>
      <form
        action={formAction}
        className="download-resource-manager__dialog-form"
      >
        <label>
          资源键
          <input
            maxLength={120}
            name="key"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
          />
        </label>
        <label>
          后台名称
          <input maxLength={160} name="adminLabel" required />
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
  );
}

function Editor({
  resource,
  uploading,
  uploadError,
  onAbortUpload,
  onResource,
  onUpload,
}: {
  resource: TypedDownloadResourceAdminDto;
  uploading: boolean;
  uploadError: string | null;
  onAbortUpload(): void;
  onResource(resource: TypedDownloadResourceAdminDto): void;
  onUpload(slot: Slot, file: File): void;
}) {
  const current = revision(resource);
  const [state, formAction, pending] = useActionState(
    saveTypedDownloadDraftAction as ServerAction,
    idle,
  );
  const [artifactError, setArtifactError] = useState("");
  useEffect(() => {
    if (state.kind === "success") onResource(state.resource);
  }, [state, onResource]);
  const disabled = uploading || pending;
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
  const documentCurrent = current?.kind === "document" ? current : null;
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
          disabled={disabled || !resource.draftRevision}
          onRemove={(slot) => {
            const formData = new FormData();
            formData.set("id", resource.id);
            formData.set("expectedRowVersion", String(resource.rowVersion));
            formData.set("slot", slot);
            void removeDownloadDraftArtifactAction(
              { kind: "idle" },
              formData,
            ).then((result) => {
              if (result.kind === "success") onResource(result.resource);
              else setArtifactError(message(result));
            });
          }}
          onUpload={onUpload}
        />
      ) : (
        <p>保存草稿后可上传 Windows 或 macOS 安装包。</p>
      )}
      <form action={formAction} className="download-resource-manager__form">
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
              maxLength={160}
              name="name"
              required
            />
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
              defaultValue={
                current?.category ??
                (resource.kind === "software" ? "software" : "materials")
              }
              name="category"
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
                  defaultValue={documentCurrent?.previewPolicy ?? "public"}
                  name="previewPolicy"
                >
                  <option value="public">可预览</option>
                  <option value="contact">不可预览</option>
                </select>
              </label>
              <label>
                下载权限
                <select
                  aria-label="下载权限"
                  defaultValue={documentCurrent?.downloadPolicy ?? "contact"}
                  name="downloadPolicy"
                >
                  <option value="contact">联系获取</option>
                  <option value="public">可下载</option>
                </select>
              </label>
            </>
          ) : (
            <label>
              版本号
              <input
                aria-label="版本号"
                defaultValue={softwareCurrent?.releaseVersion ?? ""}
                maxLength={40}
                name="releaseVersion"
                required
              />
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
          {resource.kind === "document" ? (
            <label className="download-resource-manager__upload">
              上传 PDF
              <input
                accept="application/pdf,.pdf"
                aria-label="上传 PDF"
                disabled={disabled || !resource.draftRevision}
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
      {softwareArtifacts ? (
        <div className="download-resource-manager__lifecycle">
          {(["windows", "macos"] as const).map((slot) =>
            softwareArtifacts[slot] ? (
              <ActionForm
                action={removeDownloadDraftArtifactAction as ServerAction}
                disabled={disabled}
                key={slot}
                label={`移除 ${slot === "windows" ? "Windows" : "macOS"} 安装包`}
                onResource={onResource}
                resource={resource}
                slot={slot}
                tone="danger"
              />
            ) : null,
          )}
        </div>
      ) : null}
      <div
        aria-label="资源生命周期操作"
        className="download-resource-manager__lifecycle"
      >
        <ActionForm
          action={publishTypedDownloadResourceAction as ServerAction}
          disabled={disabled || !canPublish}
          label="发布资源"
          onResource={onResource}
          resource={resource}
          tone="primary"
        />
        <ActionForm
          action={downlineTypedDownloadResourceAction as ServerAction}
          disabled={disabled || !canDownline}
          label="下线资源"
          onResource={onResource}
          resource={resource}
        />
        <ActionForm
          action={discardTypedDownloadDraftAction as ServerAction}
          disabled={disabled || !resource.draftRevision}
          label="丢弃草稿"
          onResource={onResource}
          resource={resource}
        />
        {resource.kind === "document" && document ? (
          <ActionForm
            action={removeDownloadDraftArtifactAction as ServerAction}
            disabled={disabled || !resource.draftRevision}
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
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<{
    message: string;
    resourceId: string;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const selected =
    resources.find((resource) => resource.id === selectedId) ?? null;
  const adopt = (next: TypedDownloadResourceAdminDto) =>
    setResources((current) =>
      current.map((item) => (item.id === next.id ? next : item)),
    );
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
          disabled={uploadingId !== null}
          onClick={() => setNewOpen(true)}
          type="button"
        >
          新增资源
        </button>
      </header>
      <div className="download-resource-manager__workspace">
        <aside
          aria-label="下载资源列表"
          className="download-resource-manager__list"
        >
          {DOWNLOAD_RESOURCE_CATEGORIES.map((category) => (
            <section key={category}>
              <h2>{categoryLabels[category]}</h2>
              <ul>
                {resources
                  .filter(
                    (resource) => revision(resource)?.category === category,
                  )
                  .map((resource) => (
                    <li
                      data-selected={resource.id === selectedId}
                      key={resource.id}
                    >
                      <button
                        aria-current={
                          resource.id === selectedId ? "page" : undefined
                        }
                        disabled={uploadingId !== null}
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
          onClose={() => setNewOpen(false)}
          onCreated={(resource) => {
            setResources((current) => [...current, resource]);
            setSelectedId(resource.id);
          }}
        />
      ) : null}
    </main>
  );
}
