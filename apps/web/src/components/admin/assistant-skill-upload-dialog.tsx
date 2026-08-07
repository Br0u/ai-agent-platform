"use client";

import {
  parseAdminSkillRevisionResponse,
  type AdminSkillRevision,
} from "@/features/assistant/admin-skill-contract";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { AssistantSkillModal } from "./assistant-skill-modal";

const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024;
const GENERIC_UPLOAD_ERROR = "上传失败；未改变当前 Skill 列表，请稍后重试。";
const INVALID_ARCHIVE_ERROR =
  "Skill ZIP 格式不符合要求，请检查压缩包目录结构后重试。";
const REGISTRY_UNAVAILABLE_ERROR =
  "Skill Registry 当前不可用，请联系管理员启动服务后重试。";
const UPLOAD_REJECTED_ERROR =
  "上传请求被拒绝；请确认访问地址已配置并重新登录后重试。";
const EXISTING_SKILL_ERROR =
  "同名 Skill 已存在，但无法确认替换目标，请刷新后重试。";

type Props = {
  onClose(): void;
  onUploaded(revision: AdminSkillRevision): void;
  onReplacementResultUnknown(skillId: string): Promise<void>;
  onReauthRequired(): void;
};

function parseUploadResponse(value: unknown): AdminSkillRevision | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    if (Reflect.getPrototypeOf(value) !== Object.prototype) return null;
    const keys = ["version", "revision", "requestId"] as const;
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some(
        (key) => typeof key !== "string" || !keys.includes(key as never),
      )
    ) {
      return null;
    }
    const record: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) return null;
      record[key] = descriptor.value;
    }
    if (
      typeof record.requestId !== "string" ||
      record.requestId.length < 1 ||
      record.requestId.length > 128
    ) {
      return null;
    }
    const parsed = parseAdminSkillRevisionResponse({
      version: record.version,
      revision: record.revision,
    });
    return parsed?.revision.state === "published" ? parsed.revision : null;
  } catch {
    return null;
  }
}

async function uploadError(response: Response): Promise<{
  message: string;
  conflictingSkillId: string | null;
  replacementToken: string | null;
  conflictingSkillEnabled: boolean | null;
  outcome: "reauth_required" | "result_unknown" | null;
}> {
  const fallback = {
    message: GENERIC_UPLOAD_ERROR,
    conflictingSkillId: null,
    replacementToken: null,
    conflictingSkillEnabled: null,
    outcome: null,
  };
  if (
    response.status !== 400 &&
    response.status !== 401 &&
    response.status !== 403 &&
    response.status !== 409 &&
    response.status !== 503
  ) {
    return fallback;
  }
  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return fallback;
    }
    const error = Reflect.get(body, "error");
    if (typeof error !== "object" || error === null || Array.isArray(error)) {
      return fallback;
    }
    const code = Reflect.get(error, "code");
    const conflictingSkillId = Reflect.get(body, "conflictingSkillId");
    const replacementToken = Reflect.get(body, "replacementToken");
    const conflictingSkillEnabled = Reflect.get(
      body,
      "conflictingSkillEnabled",
    );
    if (code === "validation_error")
      return {
        message: INVALID_ARCHIVE_ERROR,
        conflictingSkillId: null,
        replacementToken: null,
        conflictingSkillEnabled: null,
        outcome: null,
      };
    if (code === "permission_denied")
      return {
        message: UPLOAD_REJECTED_ERROR,
        conflictingSkillId: null,
        replacementToken: null,
        conflictingSkillEnabled: null,
        outcome: null,
      };
    if (code === "state_conflict")
      return {
        message: EXISTING_SKILL_ERROR,
        conflictingSkillId:
          typeof conflictingSkillId === "string" ? conflictingSkillId : null,
        replacementToken:
          typeof replacementToken === "string" &&
          /^[0-9a-f]{64}$/u.test(replacementToken)
            ? replacementToken
            : null,
        conflictingSkillEnabled:
          typeof conflictingSkillEnabled === "boolean"
            ? conflictingSkillEnabled
            : null,
        outcome: null,
      };
    if (
      code === "reauth_required" &&
      Reflect.get(body, "redirectTo") === "/staff/re-auth"
    )
      return { ...fallback, outcome: "reauth_required" };
    if (code === "result_unknown")
      return { ...fallback, outcome: "result_unknown" };
    if (code === "registry_unavailable")
      return {
        message: REGISTRY_UNAVAILABLE_ERROR,
        conflictingSkillId: null,
        replacementToken: null,
        conflictingSkillEnabled: null,
        outcome: null,
      };
    return fallback;
  } catch {
    return fallback;
  }
}

export function AssistantSkillUploadDialog({
  onClose,
  onUploaded,
  onReplacementResultUnknown,
  onReauthRequired,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const submittingRef = useRef(false);
  const operation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current += 1;
    };
  }, []);

  const requestClose = () => {
    if (!submittingRef.current) onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    setError("");
    setAnnouncement("");
    if (
      file === null ||
      !file.name.toLocaleLowerCase("en-US").endsWith(".zip") ||
      file.size < 1 ||
      file.size > MAX_ARCHIVE_BYTES
    ) {
      setError("请选择不超过 5 MiB 的有效 ZIP 文件。");
      return;
    }
    const currentOperation = operation.current + 1;
    operation.current = currentOperation;
    submittingRef.current = true;
    setSubmitting(true);
    let revision: AdminSkillRevision;
    let failureMessage = GENERIC_UPLOAD_ERROR;
    let replacementSkillId: string | null = null;
    try {
      const send = (replacement?: {
        targetSkillId: string;
        replacementToken: string;
      }) => {
        const body = new FormData();
        body.append("archive", file, file.name);
        if (replacement !== undefined) {
          body.append("targetSkillId", replacement.targetSkillId);
          body.append("expectedArtifactSha256", replacement.replacementToken);
        }
        return fetch("/api/v1/admin/assistant/skills/uploads", {
          method: "POST",
          body,
        });
      };
      let response = await send();
      if (!response.ok) {
        const failure = await uploadError(response);
        failureMessage = failure.message;
        if (
          failure.conflictingSkillId === null ||
          failure.replacementToken === null ||
          failure.conflictingSkillEnabled === null ||
          !window.confirm("发现同名 Skill，是否替换？")
        )
          throw new Error("upload failed");
        response = await send({
          targetSkillId: failure.conflictingSkillId,
          replacementToken: failure.replacementToken,
        });
        if (!response.ok) {
          const replacementFailure = await uploadError(response);
          if (replacementFailure.outcome === "reauth_required") {
            onReauthRequired();
            return;
          }
          if (replacementFailure.outcome === "result_unknown") {
            await onReplacementResultUnknown(failure.conflictingSkillId);
            return;
          }
          failureMessage = replacementFailure.message;
          throw new Error("replacement failed");
        }
        replacementSkillId = failure.conflictingSkillId;
      }
      const parsed = parseUploadResponse(await response.json());
      if (!mounted.current || currentOperation !== operation.current) return;
      if (parsed === null) throw new Error("invalid upload response");
      revision = parsed;
    } catch {
      if (!mounted.current || currentOperation !== operation.current) return;
      submittingRef.current = false;
      setSubmitting(false);
      setError(failureMessage);
      return;
    }
    submittingRef.current = false;
    setSubmitting(false);
    setAnnouncement(
      replacementSkillId === null
        ? "上传成功，可选择是否启用。"
        : "Skill 已替换。",
    );
    onUploaded(revision);
  };

  return (
    <AssistantSkillModal
      closeDisabled={submitting}
      initialFocusRef={inputRef}
      labelledBy="assistant-skill-upload-title"
      onClose={requestClose}
    >
      <form onSubmit={submit}>
        <header>
          <div>
            <p>IMMUTABLE ARCHIVE</p>
            <h3 id="assistant-skill-upload-title">上传 Skill ZIP</h3>
          </div>
          <button disabled={submitting} onClick={requestClose} type="button">
            关闭
          </button>
        </header>
        <label htmlFor="assistant-skill-archive">Skill ZIP 文件</label>
        <input
          accept=".zip,application/zip"
          id="assistant-skill-archive"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          ref={inputRef}
          type="file"
        />
        <small>
          ZIP 上传通过校验后进入 Skill 库，不会自动启用。同名 Skill
          会先询问是否替换。
        </small>
        {error ? <p role="alert">{error}</p> : null}
        <p aria-live="polite" role="status">
          {announcement}
        </p>
        <button disabled={submitting} type="submit">
          {submitting ? "上传中" : "上传"}
        </button>
      </form>
    </AssistantSkillModal>
  );
}
