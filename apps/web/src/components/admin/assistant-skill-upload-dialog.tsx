"use client";

import {
  parseAdminSkillRevisionResponse,
  type AdminSkillRevision,
} from "@/features/assistant/admin-skill-contract";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { AssistantSkillModal } from "./assistant-skill-modal";

const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

type Props = {
  onClose(): void;
  onUploaded(revision: AdminSkillRevision): void;
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
    return parsed?.revision.state === "pending_review" ? parsed.revision : null;
  } catch {
    return null;
  }
}

export function AssistantSkillUploadDialog({ onClose, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [targetSkillId, setTargetSkillId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const submittingRef = useRef(false);
  const operation = useRef(0);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
      operation.current += 1;
    },
    [],
  );

  const requestClose = () => {
    if (!submittingRef.current) onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    setError("");
    setAnnouncement("");
    const target = targetSkillId.trim();
    if (
      file === null ||
      !file.name.toLocaleLowerCase("en-US").endsWith(".zip") ||
      file.size < 1 ||
      file.size > MAX_ARCHIVE_BYTES
    ) {
      setError("请选择不超过 5 MiB 的有效 ZIP 文件。");
      return;
    }
    if (target.length > 0 && !UUID.test(target)) {
      setError("目标 Skill ID 必须是规范 UUID。");
      return;
    }
    const body = new FormData();
    body.append("archive", file, file.name);
    if (target.length > 0) body.append("targetSkillId", target);
    const currentOperation = operation.current + 1;
    operation.current = currentOperation;
    submittingRef.current = true;
    setSubmitting(true);
    let revision: AdminSkillRevision;
    try {
      const response = await fetch("/api/v1/admin/assistant/skills/uploads", {
        method: "POST",
        body,
      });
      if (!response.ok) throw new Error("upload failed");
      const parsed = parseUploadResponse(await response.json());
      if (!mounted.current || currentOperation !== operation.current) return;
      if (parsed === null) throw new Error("invalid upload response");
      revision = parsed;
    } catch {
      if (!mounted.current || currentOperation !== operation.current) return;
      submittingRef.current = false;
      setSubmitting(false);
      setError("上传失败；未改变当前 Skill 列表，请稍后重试。");
      return;
    }
    submittingRef.current = false;
    setSubmitting(false);
    setAnnouncement("上传成功，状态：pending_review（待独立审核）。");
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
        <label htmlFor="assistant-skill-target">目标 Skill ID（可选）</label>
        <input
          autoComplete="off"
          id="assistant-skill-target"
          onChange={(event) => setTargetSkillId(event.target.value)}
          placeholder="更新已有 Skill 时填写 UUID"
          value={targetSkillId}
        />
        <small>
          ZIP 上传后只进入 pending_review，不会自动启用或接入 Agent。
        </small>
        {error ? <p role="alert">{error}</p> : null}
        <p aria-live="polite" role="status">
          {announcement}
        </p>
        <button disabled={submitting} type="submit">
          {submitting ? "上传中" : "提交审核"}
        </button>
      </form>
    </AssistantSkillModal>
  );
}
