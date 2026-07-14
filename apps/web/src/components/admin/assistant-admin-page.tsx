"use client";

import type {
  AdminAssistantSessionsSnapshot,
  AdminAssistantStatusSnapshot,
} from "@/features/assistant/admin-assistant-contract";
import { isAdminAssistantChatResponse } from "@/features/assistant/admin-assistant-contract";
import { useAssistantSession } from "@/components/assistant/use-assistant-session";
import type { FormEvent } from "react";
import "./assistant-admin-page.css";

type AssistantAdminPageProps = {
  sessions: AdminAssistantSessionsSnapshot;
  status: AdminAssistantStatusSnapshot;
};

const configurationLabels: Record<
  keyof AdminAssistantStatusSnapshot["configuration"],
  string
> = {
  defaultAgent: "默认 Agent",
  model: "模型",
  skills: "Skill",
  sessionStorage: "会话存储",
};

export function AssistantAdminPage({
  sessions,
  status,
}: AssistantAdminPageProps) {
  const assistant = useAssistantSession("/admin/assistant", {
    endpoint: "/api/v1/admin/assistant/chat",
    failureAnnouncement: "测试暂时失败，请稍后重试。",
    unavailableAnnouncement: "测试暂时失败，请稍后重试。",
    successResponseGuard: isAdminAssistantChatResponse,
  });

  const submitTest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void assistant.submit();
  };

  return (
    <section
      aria-labelledby="assistant-admin-title"
      className="assistant-admin"
    >
      <header className="assistant-admin__heading">
        <div>
          <p>AI OPERATIONS / CONTROL PLANE</p>
          <h1 id="assistant-admin-title">AI 助理运营</h1>
          <span>{status.message}</span>
        </div>
        <strong data-mode={status.mode}>{status.mode.toUpperCase()}</strong>
      </header>

      <ul aria-label="AI 助理服务状态" className="assistant-admin__status-grid">
        {status.services.map((service) => (
          <li
            data-state={service.state}
            data-testid="assistant-status-cell"
            key={service.id}
          >
            <span>{service.label}</span>
            <strong>{service.detail}</strong>
            <small>{service.id.toUpperCase()}</small>
          </li>
        ))}
      </ul>

      <section
        aria-labelledby="assistant-runtime-title"
        className="assistant-admin__runtime"
      >
        <div>
          <p>RUNTIME / SAFE METADATA</p>
          <h2 id="assistant-runtime-title">运行时状态</h2>
        </div>
        <dl aria-label="AgentOS 运行时状态">
          <div>
            <dt>Provider</dt>
            <dd>{status.runtime.providerMode}</dd>
          </div>
          <div>
            <dt>Capability</dt>
            <dd>{status.runtime.capability}</dd>
          </div>
          <div>
            <dt>Circuit</dt>
            <dd>{status.runtime.circuit.state}</dd>
          </div>
          <div>
            <dt>Failures</dt>
            <dd>{status.runtime.circuit.consecutiveFailures}</dd>
          </div>
          <div>
            <dt>Persistence</dt>
            <dd>{status.runtime.persistence}</dd>
          </div>
        </dl>
      </section>

      <div className="assistant-admin__workspace">
        <section
          aria-labelledby="assistant-test-title"
          className="assistant-admin__console"
        >
          <header>
            <div>
              <p>PROTECTED TEST CONSOLE</p>
              <h2 id="assistant-test-title">受保护的占位测试控制台</h2>
            </div>
            <span>不会写入会话</span>
          </header>
          <form onSubmit={submitTest}>
            <label htmlFor="assistant-admin-question">测试问题</label>
            <textarea
              id="assistant-admin-question"
              maxLength={500}
              onChange={(event) => assistant.setDraft(event.target.value)}
              placeholder="输入用于验证占位合同的问题"
              rows={4}
              value={assistant.draft}
            />
            <div>
              <small>仅验证当前受保护的响应合同，不调用真实模型。</small>
              <button
                disabled={assistant.requestStatus === "sending"}
                type="submit"
              >
                {assistant.requestStatus === "sending" ? "发送中" : "发送测试"}
              </button>
            </div>
          </form>
          <div
            aria-live="polite"
            className="assistant-admin__reply"
            role="status"
          >
            {assistant.latestAnnouncement || "等待管理员发起测试。"}
          </div>
        </section>

        <aside
          aria-labelledby="assistant-config-title"
          className="assistant-admin__configuration"
        >
          <p>RUNTIME CONTRACT</p>
          <h2 id="assistant-config-title">只读配置</h2>
          <dl>
            {Object.entries(status.configuration).map(([key, value]) => (
              <div key={key}>
                <dt>
                  {configurationLabels[key as keyof typeof configurationLabels]}
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <span>只读 · 待接入</span>
        </aside>

        <section
          aria-labelledby="assistant-sessions-title"
          className="assistant-admin__sessions"
        >
          <div>
            <p>SESSION STORAGE</p>
            <h2 id="assistant-sessions-title">最近会话</h2>
            <span>{sessions.message}</span>
            <small>
              {sessions.capability} / {sessions.persistence}
            </small>
          </div>
          <strong>{sessions.items.length.toString().padStart(2, "0")}</strong>
        </section>

        <nav
          aria-label="待接入管理能力"
          className="assistant-admin__future-actions"
        >
          <button disabled type="button">
            会话审计
          </button>
          <button disabled type="button">
            Skill 管理
          </button>
        </nav>
      </div>
    </section>
  );
}
