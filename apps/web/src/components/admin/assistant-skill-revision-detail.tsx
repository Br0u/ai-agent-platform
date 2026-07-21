"use client";

import {
  parseAdminSkillFileResponse,
  parseAdminSkillRevisionDetailResponse,
  type AdminSkillFileResponse,
  type AdminSkillRevision,
  type AdminSkillRevisionDetailResponse,
} from "@/features/assistant/admin-skill-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { AssistantSkillReviewDialog } from "./assistant-skill-review-dialog";

type Props = {
  actorUserId: string;
  onRevisionChanged(revision: AdminSkillRevision): void;
  revisionId: string;
  skillId: string;
};

function exactEnvelope(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return null;
    if (Reflect.getPrototypeOf(value) !== Object.prototype) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
    )
      return null;
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
    )
      return null;
    return record;
  } catch {
    return null;
  }
}

function parseDetailEnvelope(
  value: unknown,
): AdminSkillRevisionDetailResponse | null {
  const record = exactEnvelope(value, [
    "version",
    "revision",
    "files",
    "dependencies",
    "findings",
    "previousPublishedRevisionId",
    "diff",
    "reviewAttestations",
    "requestId",
  ]);
  if (record === null) return null;
  return parseAdminSkillRevisionDetailResponse({
    version: record.version,
    revision: record.revision,
    files: record.files,
    dependencies: record.dependencies,
    findings: record.findings,
    previousPublishedRevisionId: record.previousPublishedRevisionId,
    diff: record.diff,
    reviewAttestations: record.reviewAttestations,
  });
}

function parseFileEnvelope(value: unknown): AdminSkillFileResponse | null {
  const record = exactEnvelope(value, [
    "version",
    "path",
    "content",
    "requestId",
  ]);
  if (record === null) return null;
  return parseAdminSkillFileResponse({
    version: record.version,
    path: record.path,
    content: record.content,
  });
}

function fileUrl(skillId: string, revisionId: string, path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `/api/v1/admin/assistant/skills/${encodeURIComponent(skillId)}/revisions/${encodeURIComponent(revisionId)}/files/${encodedPath}`;
}

function isAbortError(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    value.name === "AbortError"
  );
}

export function AssistantSkillRevisionDetail({
  actorUserId,
  onRevisionChanged,
  revisionId,
  skillId,
}: Props) {
  const [detail, setDetail] = useState<AdminSkillRevisionDetailResponse | null>(
    null,
  );
  const [file, setFile] = useState<AdminSkillFileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewTrigger = useRef<HTMLButtonElement>(null);
  const restoreReviewFocus = useRef(false);
  const detailAbort = useRef<AbortController | null>(null);
  const detailGeneration = useRef(0);
  const fileAbort = useRef<AbortController | null>(null);
  const fileGeneration = useRef(0);

  const loadDetail = useCallback(
    async (reset = false) => {
      const generation = detailGeneration.current + 1;
      detailGeneration.current = generation;
      detailAbort.current?.abort();
      const controller = new AbortController();
      detailAbort.current = controller;
      if (reset) {
        setDetail(null);
        setFile(null);
        setReviewOpen(false);
      }
      setLoading(true);
      setError("");
      setAnnouncement("");
      try {
        const response = await fetch(
          `/api/v1/admin/assistant/skills/${encodeURIComponent(skillId)}/revisions/${encodeURIComponent(revisionId)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (
          controller.signal.aborted ||
          generation !== detailGeneration.current
        )
          return;
        if (!response.ok) throw new Error("detail failed");
        const parsed = parseDetailEnvelope(await response.json());
        if (
          controller.signal.aborted ||
          generation !== detailGeneration.current
        )
          return;
        if (
          parsed === null ||
          parsed.revision.skillId !== skillId ||
          parsed.revision.id !== revisionId
        ) {
          throw new Error("invalid detail response");
        }
        fileGeneration.current += 1;
        fileAbort.current?.abort();
        fileAbort.current = null;
        setFile(null);
        setDetail(parsed);
        setAnnouncement("审核详情已加载。");
      } catch (caught) {
        if (
          isAbortError(caught) ||
          controller.signal.aborted ||
          generation !== detailGeneration.current
        )
          return;
        const message = "详情加载失败；已保留旧数据，请稍后重试。";
        setError(message);
        setAnnouncement(message);
      } finally {
        if (generation === detailGeneration.current) {
          detailAbort.current = null;
          setLoading(false);
        }
      }
    },
    [revisionId, skillId],
  );

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) void loadDetail(true);
    });
    return () => {
      disposed = true;
      detailGeneration.current += 1;
      detailAbort.current?.abort();
      fileGeneration.current += 1;
      fileAbort.current?.abort();
    };
  }, [loadDetail]);

  useEffect(() => {
    if (!reviewOpen && restoreReviewFocus.current) {
      restoreReviewFocus.current = false;
      reviewTrigger.current?.focus();
    }
  }, [reviewOpen]);

  const loadFile = async (path: string) => {
    const generation = fileGeneration.current + 1;
    fileGeneration.current = generation;
    fileAbort.current?.abort();
    const controller = new AbortController();
    fileAbort.current = controller;
    setError("");
    try {
      const response = await fetch(fileUrl(skillId, revisionId, path), {
        cache: "no-store",
        signal: controller.signal,
      });
      if (controller.signal.aborted || generation !== fileGeneration.current)
        return;
      if (!response.ok) throw new Error("file failed");
      const parsed = parseFileEnvelope(await response.json());
      if (controller.signal.aborted || generation !== fileGeneration.current)
        return;
      if (parsed === null || parsed.path !== path)
        throw new Error("invalid file response");
      setFile(parsed);
      setAnnouncement(`已打开纯文本文件：${path}`);
    } catch (caught) {
      if (
        isAbortError(caught) ||
        controller.signal.aborted ||
        generation !== fileGeneration.current
      )
        return;
      setError("文件加载失败；已保留当前详情和文件内容。");
    } finally {
      if (generation === fileGeneration.current) fileAbort.current = null;
    }
  };

  const closeReview = () => {
    restoreReviewFocus.current = true;
    setReviewOpen(false);
    setAnnouncement("审核操作已关闭，revision 状态未变更。");
  };

  const openReview = () => {
    if (
      detail?.revision.state !== "pending_review" ||
      detail.revision.createdBy === actorUserId
    )
      return;
    setError("");
    setAnnouncement("");
    setReviewOpen(true);
  };

  const reviewed = (revision: AdminSkillRevision) => {
    detailGeneration.current += 1;
    detailAbort.current?.abort();
    detailAbort.current = null;
    setLoading(false);
    restoreReviewFocus.current = true;
    setReviewOpen(false);
    setError("");
    setAnnouncement(`审核完成，状态：${revision.state}。`);
    setDetail((current) =>
      current === null
        ? null
        : { ...current, revision: { ...current.revision, ...revision } },
    );
    onRevisionChanged(revision);
  };

  return (
    <section
      aria-labelledby="assistant-skill-detail-title"
      className="assistant-skill-detail"
    >
      <header>
        <div>
          <p>READ-ONLY REVIEW EVIDENCE</p>
          <h3 id="assistant-skill-detail-title">Revision 审核详情</h3>
        </div>
        <button
          disabled={loading}
          onClick={() => void loadDetail(false)}
          type="button"
        >
          重新加载审核详情
        </button>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      <p aria-live="polite" role="status">
        {announcement}
      </p>
      {detail === null ? (
        <p>{loading ? "正在加载审核详情…" : "审核详情不可用。"}</p>
      ) : (
        <>
          <dl className="assistant-skill-detail__summary">
            <div>
              <dt>名称</dt>
              <dd>{detail.revision.name}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{detail.revision.state}</dd>
            </div>
            <div>
              <dt>Artifact digest</dt>
              <dd>{detail.revision.artifactSha256}</dd>
            </div>
            <div>
              <dt>创建人</dt>
              <dd>{detail.revision.createdBy}</dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>{detail.revision.license ?? "未声明"}</dd>
            </div>
            <div>
              <dt>Compatibility</dt>
              <dd>{detail.revision.compatibility ?? "未声明"}</dd>
            </div>
          </dl>
          <section aria-labelledby="assistant-skill-manifest-title">
            <h4 id="assistant-skill-manifest-title">Manifest 摘要</h4>
            <p>{detail.revision.description || "未提供描述"}</p>
            <p>允许工具：{detail.revision.allowedTools.join("、") || "无"}</p>
          </section>
          <section aria-labelledby="assistant-skill-dependencies-title">
            <h4 id="assistant-skill-dependencies-title">Dependency summary</h4>
            <p>
              Python modules：
              {detail.dependencies.pythonModules.join("、") || "无"}
            </p>
            <p>
              不可用 modules：
              {detail.dependencies.unavailablePythonModules.join("、") || "无"}
            </p>
          </section>
          <section aria-labelledby="assistant-skill-files-title">
            <h4 id="assistant-skill-files-title">文件树与脚本</h4>
            <ul>
              {detail.files.map((entry) => (
                <li key={entry.path}>
                  <span>
                    {entry.kind === "script" ? "脚本" : entry.kind} ·{" "}
                    {entry.path} · digest <code>{entry.sha256}</code>
                  </span>
                  <button
                    aria-label={`查看文件 ${entry.path}`}
                    onClick={() => void loadFile(entry.path)}
                    type="button"
                  >
                    纯文本查看
                  </button>
                </li>
              ))}
            </ul>
            {file ? (
              <pre data-testid="assistant-skill-file-viewer" tabIndex={0}>
                {file.content}
              </pre>
            ) : null}
          </section>
          <section aria-labelledby="assistant-skill-findings-title">
            <h4 id="assistant-skill-findings-title">安全 Findings</h4>
            {detail.findings.length === 0 ? (
              <p>未发现扫描项。</p>
            ) : (
              <ul>
                {detail.findings.map((finding) => (
                  <li key={`${finding.path}:${finding.line}:${finding.code}`}>
                    <strong>{finding.blocking ? "阻断" : "提示"}</strong> ·{" "}
                    {finding.path}:{finding.line} · {finding.code} ·{" "}
                    {finding.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="assistant-skill-diff-title">
            <h4 id="assistant-skill-diff-title">相对前一已发布版本的 Diff</h4>
            <p>{detail.previousPublishedRevisionId ?? "没有前一已发布版本"}</p>
            {detail.diff === null ? (
              <p>无可用差异。</p>
            ) : (
              <>
                <p>差异截断：{detail.diff.truncated ? "是" : "否"}</p>
                <ul>
                  {detail.diff.files.map((entry) => (
                    <li key={entry.path}>
                      <strong>{entry.status}</strong> · {entry.path}
                      {entry.binary ? " · binary" : ""}
                      <pre>{entry.diff}</pre>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          {detail.revision.state === "pending_review" &&
          detail.revision.createdBy === actorUserId ? (
            <p>该 revision 需独立审核人；创建者只能查看审核证据。</p>
          ) : (
            <button
              aria-disabled={detail.revision.state !== "pending_review"}
              onClick={openReview}
              ref={reviewTrigger}
              type="button"
            >
              打开审核操作
            </button>
          )}
          {detail.revision.state !== "pending_review" ? (
            <p>该 revision 已完成审核，当前状态：{detail.revision.state}。</p>
          ) : null}
          {reviewOpen ? (
            <AssistantSkillReviewDialog
              actorUserId={actorUserId}
              findings={detail.findings}
              onClose={closeReview}
              onReviewed={reviewed}
              revision={detail.revision}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
