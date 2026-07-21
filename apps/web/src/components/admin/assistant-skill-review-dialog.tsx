"use client";

import {
  parseAdminSkillRevisionResponse,
  type AdminSkillRevision,
  type AdminSkillRevisionDetailResponse,
} from "@/features/assistant/admin-skill-contract";
import { useRef, useState } from "react";
import { AssistantSkillModal } from "./assistant-skill-modal";
import { registryApprovalBlockingFindings } from "./assistant-skill-review-policy";

type Props = {
  actorUserId: string;
  findings: AdminSkillRevisionDetailResponse["findings"];
  onClose(): void;
  onReviewed(revision: AdminSkillRevision): void;
  revision: AdminSkillRevision;
};

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;

const attestations = [
  ["contentReviewed", "已逐项审阅内容和文件"],
  ["usageRightsConfirmed", "已确认使用权和许可证"],
  ["executionRiskAccepted", "已评估并接受执行风险"],
  ["independentReviewerConfirmed", "确认审核人与创建者相互独立"],
] as const;

type AttestationKey = (typeof attestations)[number][0];

function parseReviewResponse(value: unknown): AdminSkillRevision | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return null;
    if (Reflect.getPrototypeOf(value) !== Object.prototype) return null;
    const keys = ["version", "revision", "requestId"] as const;
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some(
        (key) => typeof key !== "string" || !keys.includes(key as never),
      )
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
    return (
      parseAdminSkillRevisionResponse({
        version: record.version,
        revision: record.revision,
      })?.revision ?? null
    );
  } catch {
    return null;
  }
}

function validReason(reason: string): boolean {
  for (let index = 0; index < reason.length; index += 1) {
    const unit = reason.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = reason.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return (
    reason.length > 0 &&
    reason === reason.trim() &&
    Array.from(reason).length <= 500 &&
    new TextEncoder().encode(reason).byteLength <= 2_048 &&
    !CONTROL_CHARACTER.test(reason)
  );
}

export function AssistantSkillReviewDialog({
  actorUserId,
  findings,
  onClose,
  onReviewed,
  revision,
}: Props) {
  const firstAttestation = useRef<HTMLInputElement>(null);
  const [checked, setChecked] = useState<Record<AttestationKey, boolean>>({
    contentReviewed: false,
    usageRightsConfirmed: false,
    executionRiskAccepted: false,
    independentReviewerConfirmed: false,
  });
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const isCreator = revision.createdBy === actorUserId;
  const blockingFindings = registryApprovalBlockingFindings(findings);
  const allChecked = Object.values(checked).every(Boolean);

  const decide = async (decision: "approve" | "reject") => {
    setError("");
    setAnnouncement("");
    if (isCreator) {
      setError("该 revision 需独立审核人；创建者不能作出任何审核决策。");
      return;
    }
    if (!allChecked) {
      setError("必须逐项确认四项审核声明。");
      return;
    }
    if (decision === "approve" && blockingFindings.length > 0) {
      setError("存在阻断 finding，当前 revision 不能批准发布。");
      return;
    }
    if (decision === "reject" && !validReason(reason)) {
      setError(
        "拒绝原因不能为空、不能含首尾空格或控制字符，且不得超过 500 字符。",
      );
      return;
    }
    setSubmitting(true);
    let result: AdminSkillRevision;
    try {
      const response = await fetch(
        `/api/v1/admin/assistant/skills/${encodeURIComponent(revision.skillId)}/revisions/${encodeURIComponent(revision.id)}/review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision,
            reason: decision === "approve" ? null : reason,
            expectedState: "pending_review",
            attestations: {
              contentReviewed: true,
              usageRightsConfirmed: true,
              executionRiskAccepted: true,
              independentReviewerConfirmed: true,
            },
          }),
        },
      );
      if (!response.ok) throw new Error("review failed");
      const parsed = parseReviewResponse(await response.json());
      const expectedState = decision === "approve" ? "published" : "rejected";
      if (
        parsed === null ||
        parsed.id !== revision.id ||
        parsed.skillId !== revision.skillId ||
        parsed.state !== expectedState
      ) {
        throw new Error("invalid review response");
      }
      result = parsed;
    } catch {
      setError("审核失败；旧状态已保留，请重新认证或稍后重试。");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setAnnouncement(`审核完成，状态：${result.state}。`);
    onReviewed(result);
  };

  return (
    <AssistantSkillModal
      closeDisabled={submitting}
      initialFocusRef={firstAttestation}
      labelledBy="assistant-skill-review-title"
      onClose={onClose}
    >
      <section>
        <header>
          <div>
            <p>INDEPENDENT REVIEW</p>
            <h3 id="assistant-skill-review-title">
              审核 revision #{revision.number}
            </h3>
          </div>
          <button disabled={submitting} onClick={onClose} type="button">
            关闭
          </button>
        </header>
        {isCreator ? (
          <p>该 revision 需独立审核人；创建者不能批准或拒绝。</p>
        ) : (
          <>
            <fieldset disabled={submitting}>
              <legend>审核声明（四项均需确认）</legend>
              {attestations.map(([key, label], index) => (
                <label key={key}>
                  <input
                    checked={checked[key]}
                    onChange={(event) =>
                      setChecked((current) => ({
                        ...current,
                        [key]: event.target.checked,
                      }))
                    }
                    ref={index === 0 ? firstAttestation : undefined}
                    type="checkbox"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <label htmlFor="assistant-skill-rejection-reason">拒绝原因</label>
            <textarea
              aria-describedby="assistant-skill-rejection-help"
              id="assistant-skill-rejection-reason"
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              value={reason}
            />
            <small id="assistant-skill-rejection-help">
              拒绝时必填，最多 500 个 Unicode 字符且不能包含首尾空格。
            </small>
            {blockingFindings.length > 0 ? (
              <section aria-labelledby="assistant-skill-blocking-findings-title">
                <h4 id="assistant-skill-blocking-findings-title">
                  存在阻断 finding，不能批准发布
                </h4>
                <ul>
                  {blockingFindings.map((finding) => (
                    <li key={`${finding.path}:${finding.line}:${finding.code}`}>
                      {finding.path}:{finding.line} · {finding.code} ·{" "}
                      {finding.message}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
        {error ? <p role="alert">{error}</p> : null}
        <p aria-live="polite" role="status">
          {announcement}
        </p>
        {!isCreator ? (
          <div className="assistant-skill-dialog__actions">
            {blockingFindings.length === 0 ? (
              <button
                disabled={submitting || !allChecked}
                onClick={() => void decide("approve")}
                type="button"
              >
                批准发布
              </button>
            ) : null}
            <button
              disabled={submitting || !allChecked}
              onClick={() => void decide("reject")}
              type="button"
            >
              拒绝 revision
            </button>
          </div>
        ) : null}
      </section>
    </AssistantSkillModal>
  );
}
