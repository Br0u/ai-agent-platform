"use client";

import { useMemo, useState, type FormEvent } from "react";

import {
  isAdminInputPolicySnapshot,
  type AdminInputPolicySnapshot,
} from "@/features/assistant/admin-input-policy-contract";
import {
  AssistantInputPolicyValidationError,
  normalizeAssistantInputTerms,
} from "@/features/assistant/assistant-input-policy";

const ENDPOINT = "/api/v1/admin/assistant/input-policy";

function isConfigurableSnapshot(
  value: unknown,
): value is AdminInputPolicySnapshot & {
  canConfigure: true;
  terms: string[];
} {
  return (
    isAdminInputPolicySnapshot(value) &&
    value.canConfigure &&
    value.terms !== undefined
  );
}

function sameTerms(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((term, index) => term === right[index])
  );
}

export function AssistantInputPolicyPanel({
  initialSnapshot,
}: {
  initialSnapshot: AdminInputPolicySnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [source, setSource] = useState(initialSnapshot.terms?.join("\n") ?? "");
  const [saving, setSaving] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const normalized = useMemo(() => {
    try {
      return normalizeAssistantInputTerms(source);
    } catch (error) {
      if (error instanceof AssistantInputPolicyValidationError) return null;
      throw error;
    }
  }, [source]);

  const reconcileUnknownOutcome = async (
    confirmedRevision: number,
    submittedTerms: readonly string[],
  ) => {
    try {
      const response = await fetch(ENDPOINT, {
        method: "GET",
        cache: "no-store",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !isConfigurableSnapshot(body)) {
        throw new Error("Policy reconciliation failed");
      }
      if (sameTerms(body.terms, submittedTerms)) {
        setSnapshot(body);
        setSource(body.terms.join("\n"));
        setRefreshRequired(false);
        setAnnouncement("内容规则已保存。");
      } else if (body.revision === confirmedRevision) {
        setRefreshRequired(false);
        setAnnouncement("服务器未保存本次修改，当前编辑已保留，可以重试。");
      } else {
        setRefreshRequired(true);
        setAnnouncement(
          "检测到其他管理员已更新规则，当前编辑已保留；请刷新页面并手动合并后再保存。",
        );
      }
    } catch {
      setRefreshRequired(true);
      setAnnouncement("无法确认保存结果，请刷新页面后再继续。");
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !snapshot.canConfigure ||
      normalized === null ||
      saving ||
      refreshRequired
    ) {
      return;
    }
    setSaving(true);
    setAnnouncement("");
    const confirmedRevision = snapshot.revision;
    const submittedTerms = normalized.terms;
    try {
      const response = await fetch(ENDPOINT, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source,
          expectedRevision: snapshot.revision,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 409) {
        setAnnouncement("服务器存在更新版本，请保留当前编辑并刷新页面后重试。");
      } else if (response.ok && isConfigurableSnapshot(body)) {
        setSnapshot(body);
        setSource(body.terms?.join("\n") ?? "");
        setRefreshRequired(false);
        setAnnouncement("内容规则已保存。");
      } else if (response.ok) {
        await reconcileUnknownOutcome(confirmedRevision, submittedTerms);
      } else {
        setAnnouncement("内容规则保存失败，请稍后重试。");
      }
    } catch {
      await reconcileUnknownOutcome(confirmedRevision, submittedTerms);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="assistant-input-policy-title"
      className="assistant-input-policy"
    >
      <header className="assistant-input-policy__heading">
        <div>
          <p>CONTENT POLICY / USER INPUT</p>
          <h2 id="assistant-input-policy-title">输入内容规则</h2>
          <span>
            规则使用 NFKC
            归一化、不区分大小写的连续子串匹配；命中时在调用模型前停止提交，不记录用户输入原文；保存规则时也不保留编辑源文本。
          </span>
        </div>
        <div className="assistant-input-policy__metadata">
          <strong>当前版本 {snapshot.revision}</strong>
          <span>已配置 {snapshot.termCount} 个屏蔽词</span>
          <span>更新时间 {snapshot.updatedAt ?? "尚未保存"}</span>
        </div>
      </header>

      <form onSubmit={save}>
        <label htmlFor="assistant-input-policy-source">
          屏蔽词（一行一个）
        </label>
        <textarea
          disabled={!snapshot.canConfigure || saving}
          id="assistant-input-policy-source"
          onChange={(event) => setSource(event.target.value)}
          placeholder={snapshot.canConfigure ? "每行输入一个屏蔽词" : undefined}
          rows={12}
          value={source}
        />
        <div className="assistant-input-policy__summary" aria-label="规则统计">
          {snapshot.canConfigure && normalized ? (
            <>
              <span>有效 {normalized.terms.length}</span>
              <span>重复 {normalized.duplicateCount}</span>
              <span>空行 {normalized.blankCount}</span>
            </>
          ) : snapshot.canConfigure ? (
            <span>输入超出规则限制</span>
          ) : (
            <span>只读模式</span>
          )}
        </div>
        <div className="assistant-input-policy__actions">
          <small>
            {snapshot.canConfigure
              ? "保存后立即应用于新的用户输入。"
              : "当前账号仅可查看规则数量，不能查看或修改具体词条。"}
          </small>
          <button
            disabled={
              !snapshot.canConfigure ||
              normalized === null ||
              saving ||
              refreshRequired
            }
            type="submit"
          >
            {saving ? "保存中" : "保存并立即生效"}
          </button>
        </div>
      </form>
      <p
        aria-live="polite"
        className="assistant-input-policy__announcement"
        role="status"
      >
        {announcement}
      </p>
    </section>
  );
}
