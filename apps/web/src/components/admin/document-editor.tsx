"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";

import {
  archiveDocumentAction,
  createDocumentAction,
  deleteDocumentAction,
  publishDocumentAction,
  restoreDocumentAction,
  saveDocumentAction,
} from "@/server/documents/server-actions";
import type { DocumentActionState } from "@/server/documents/actions";
import type { SelectedDocumentDto } from "@/server/documents/contracts";

type DocumentFormAction = (
  previous: DocumentActionState,
  formData: FormData,
) => Promise<DocumentActionState>;

const idle: DocumentActionState = { kind: "idle" };
const statusLabels = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
} as const;

function stateMessage(state: DocumentActionState): string {
  switch (state.kind) {
    case "idle":
      return "";
    case "success":
      return "操作已完成。";
    case "validation_error":
      return "请检查标出的字段。";
    case "reauth_required":
      return "操作需要重新验证身份。";
    case "authentication_required":
      return "登录状态已失效，请重新登录。";
    case "account_setup_required":
      return "请先完成账号安全设置。";
    case "access_error":
      return "当前账号不能执行此操作。";
    case "domain_error":
      if (state.code === "DOCUMENT_REVISION_CONFLICT")
        return "文档已被更新，请刷新后重试。";
      if (state.code === "DOCUMENT_SOURCE_UNSAFE")
        return "正文包含不支持或不安全的语法。";
      return "操作未完成，请刷新后重试。";
  }
}

function ActionAnnouncement({ state }: { state: DocumentActionState }) {
  const recovery =
    state.kind === "reauth_required"
      ? { href: state.redirectTo, label: "继续验证" }
      : state.kind === "authentication_required"
        ? { href: state.redirectTo, label: "重新登录" }
        : state.kind === "account_setup_required"
          ? { href: state.redirectTo, label: "完成安全设置" }
          : null;
  return (
    <p
      aria-live="polite"
      className="document-editor__announcement"
      role="status"
    >
      {stateMessage(state)}
      {recovery ? (
        <>
          {" "}
          <Link href={recovery.href}>{recovery.label}</Link>
        </>
      ) : null}
    </p>
  );
}

function SubmitButton({
  idleLabel,
  pendingLabel,
  tone = "primary",
}: {
  idleLabel: string;
  pendingLabel: string;
  tone?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={`document-editor__button document-editor__button--${tone}`}
      aria-disabled={pending}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <span className="document-editor__field-error" id={id}>
      {message}
    </span>
  ) : null;
}

function MutationFields({ document }: { document: SelectedDocumentDto }) {
  return (
    <>
      <input name="id" type="hidden" value={document.id} />
      <input name="expectedRevision" type="hidden" value={document.revision} />
      <input
        name="expectedRowVersion"
        type="hidden"
        value={document.rowVersion}
      />
    </>
  );
}

function LifecycleForm({
  action,
  document,
  idleLabel,
  pendingLabel,
  tone,
}: {
  action: DocumentFormAction;
  document: SelectedDocumentDto;
  idleLabel: string;
  pendingLabel: string;
  tone?: "primary" | "secondary" | "danger";
}) {
  const [currentState, formAction] = useActionState(action, idle);
  return (
    <form action={formAction} className="document-editor__lifecycle-form">
      <MutationFields document={document} />
      <SubmitButton
        idleLabel={idleLabel}
        pendingLabel={pendingLabel}
        tone={tone}
      />
      <ActionAnnouncement state={currentState} />
    </form>
  );
}

export function DocumentEditor({
  canDelete,
  document,
}: {
  canDelete: boolean;
  document: SelectedDocumentDto | null;
}) {
  const instanceId = useId();
  const [createState, createFormAction] = useActionState(
    createDocumentAction,
    idle,
  );
  const [saveState, saveFormAction] = useActionState(saveDocumentAction, idle);
  const saveErrors =
    saveState.kind === "validation_error" ? saveState.fieldErrors : {};
  const createErrors =
    createState.kind === "validation_error" ? createState.fieldErrors : {};
  const errors = document ? saveErrors : createErrors;
  const error = (field: string) => errors[field]?.[0];
  const errorId = (field: string) => `${instanceId}-${field}-error`;
  const sourceHelpId = `${instanceId}-source-help`;
  const state = document ? saveState : createState;
  const body = document?.body;

  return (
    <section
      aria-labelledby={`${instanceId}-heading`}
      className="document-editor"
    >
      <header className="document-editor__heading">
        <div>
          <p>Editor</p>
          <h2 id={`${instanceId}-heading`}>
            {document ? document.title : "新建文档"}
          </h2>
        </div>
        {document ? (
          <div aria-label="修订与发布状态" className="document-editor__state">
            <span>当前修订 r{document.revision}</span>
            <span>
              {document.publishedRevision
                ? `已发布 r${document.publishedRevision}`
                : "尚未发布"}
            </span>
            <strong>
              {document.deleted ? "已删除" : statusLabels[document.status]}
            </strong>
          </div>
        ) : null}
      </header>

      <form
        action={document ? saveFormAction : createFormAction}
        className="document-editor__form"
      >
        {document ? <MutationFields document={document} /> : null}
        <fieldset
          className="document-editor__fields"
          disabled={document?.deleted}
        >
          <label>
            标题
            <input
              aria-label="标题"
              aria-describedby={error("title") ? errorId("title") : undefined}
              aria-invalid={error("title") ? true : undefined}
              defaultValue={document?.title ?? ""}
              maxLength={240}
              name="title"
              required
              type="text"
            />
            <FieldError id={errorId("title")} message={error("title")} />
          </label>
          <label>
            路径标识
            <input
              aria-label="路径标识"
              aria-describedby={error("slug") ? errorId("slug") : undefined}
              aria-invalid={error("slug") ? true : undefined}
              defaultValue={document?.slug ?? ""}
              maxLength={180}
              name="slug"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
              type="text"
            />
            <FieldError id={errorId("slug")} message={error("slug")} />
          </label>
          <label className="document-editor__wide-field">
            摘要
            <textarea
              aria-label="摘要"
              aria-describedby={
                error("summary") ? errorId("summary") : undefined
              }
              aria-invalid={error("summary") ? true : undefined}
              defaultValue={document?.summary ?? ""}
              maxLength={500}
              name="summary"
              required
              rows={3}
            />
            <FieldError id={errorId("summary")} message={error("summary")} />
          </label>
          <label>
            导航名称
            <input
              aria-label="导航名称"
              aria-describedby={
                error("navigationLabel")
                  ? errorId("navigationLabel")
                  : undefined
              }
              aria-invalid={error("navigationLabel") ? true : undefined}
              defaultValue={body?.navigation.label ?? ""}
              maxLength={80}
              name="navigationLabel"
              required
              type="text"
            />
            <FieldError
              id={errorId("navigationLabel")}
              message={error("navigationLabel")}
            />
          </label>
          <label>
            导航代码
            <input
              aria-label="导航代码"
              aria-describedby={
                error("navigationCode") ? errorId("navigationCode") : undefined
              }
              aria-invalid={error("navigationCode") ? true : undefined}
              defaultValue={body?.navigation.code ?? ""}
              maxLength={80}
              name="navigationCode"
              pattern={"[A-Z0-9][A-Z0-9_\\-]*"}
              required
              type="text"
            />
            <FieldError
              id={errorId("navigationCode")}
              message={error("navigationCode")}
            />
          </label>
          <label>
            导航顺序
            <input
              aria-label="导航顺序"
              aria-describedby={
                error("navigationPosition")
                  ? errorId("navigationPosition")
                  : undefined
              }
              aria-invalid={error("navigationPosition") ? true : undefined}
              defaultValue={body?.navigation.position ?? 0}
              min={0}
              name="navigationPosition"
              required
              type="number"
            />
            <FieldError
              id={errorId("navigationPosition")}
              message={error("navigationPosition")}
            />
          </label>
          <label className="document-editor__wide-field">
            文档正文（安全 Markdown）
            <textarea
              aria-label="文档正文（安全 Markdown）"
              aria-describedby={`${sourceHelpId}${
                error("source") ? ` ${errorId("source")}` : ""
              }`}
              aria-invalid={error("source") ? true : undefined}
              defaultValue={body?.source ?? ""}
              name="source"
              required
              rows={20}
              spellCheck={false}
            />
            <small id={sourceHelpId}>
              支持标题、列表、表格、代码块和安全指令；不支持 MDX、脚本或任意
              HTML。
            </small>
            <FieldError id={errorId("source")} message={error("source")} />
          </label>
        </fieldset>
        <div className="document-editor__primary-actions">
          {!document?.deleted ? (
            <SubmitButton
              idleLabel={document ? "保存草稿" : "创建文档"}
              pendingLabel={document ? "正在保存…" : "正在创建…"}
            />
          ) : null}
          {document && !document.deleted ? (
            <Link
              className="document-editor__preview"
              href={`/admin/docs/preview/${document.revisionId}`}
            >
              预览当前修订
            </Link>
          ) : null}
        </div>
        <ActionAnnouncement state={state} />
      </form>

      {document ? (
        <div
          aria-label="文档生命周期操作"
          className="document-editor__lifecycle"
        >
          {!document.deleted &&
          (document.status !== "published" ||
            document.publishedRevision !== document.revision) ? (
            <LifecycleForm
              action={publishDocumentAction}
              document={document}
              idleLabel="发布当前修订"
              pendingLabel="正在发布…"
            />
          ) : null}
          {!document.deleted && document.status === "published" ? (
            <LifecycleForm
              action={archiveDocumentAction}
              document={document}
              idleLabel="归档文档"
              pendingLabel="正在归档…"
              tone="secondary"
            />
          ) : null}
          {canDelete && !document.deleted ? (
            <LifecycleForm
              action={deleteDocumentAction}
              document={document}
              idleLabel="删除文档"
              pendingLabel="正在删除…"
              tone="danger"
            />
          ) : null}
          {canDelete && document.deleted ? (
            <LifecycleForm
              action={restoreDocumentAction}
              document={document}
              idleLabel="恢复文档"
              pendingLabel="正在恢复…"
              tone="secondary"
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
