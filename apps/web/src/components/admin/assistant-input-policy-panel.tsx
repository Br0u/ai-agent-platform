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

export function AssistantInputPolicyPanel({
  initialSnapshot,
}: {
  initialSnapshot: AdminInputPolicySnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [source, setSource] = useState(initialSnapshot.terms?.join("\n") ?? "");
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const normalized = useMemo(() => {
    try {
      return normalizeAssistantInputTerms(source);
    } catch (error) {
      if (error instanceof AssistantInputPolicyValidationError) return null;
      throw error;
    }
  }, [source]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!snapshot.canConfigure || normalized === null || saving) return;
    setSaving(true);
    setAnnouncement("");
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
      } else if (response.ok && isAdminInputPolicySnapshot(body)) {
        setSnapshot(body);
        setSource(body.terms?.join("\n") ?? "");
        setAnnouncement("内容规则已保存。");
      } else {
        setAnnouncement("内容规则保存失败，请稍后重试。");
      }
    } catch {
      setAnnouncement("内容规则保存失败，请稍后重试。");
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
          <span>用户输入命中任一屏蔽词时，将在调用模型前停止提交。</span>
        </div>
        <strong>当前版本 {snapshot.revision}</strong>
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
            <span>已配置 {snapshot.termCount} 个屏蔽词</span>
          )}
        </div>
        <div className="assistant-input-policy__actions">
          <small>
            {snapshot.canConfigure
              ? "保存后立即应用于新的用户输入。"
              : "当前账号仅可查看规则数量，不能查看或修改具体词条。"}
          </small>
          <button
            disabled={!snapshot.canConfigure || normalized === null || saving}
            type="submit"
          >
            {saving ? "保存中" : "保存内容规则"}
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
