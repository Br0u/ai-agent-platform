"use client";

import { isAssistantSuccessResponse } from "@/features/assistant/assistant-contract";
import type { AdminAssistantSessionsResponse } from "@/app/api/v1/admin/assistant/sessions/handler";
import type { AdminAssistantStatusResponse } from "@/app/api/v1/admin/assistant/status/handler";
import { useState, type FormEvent } from "react";

type AssistantAdminPageProps = {
  sessions: AdminAssistantSessionsResponse;
  status: AdminAssistantStatusResponse;
};

const configurationLabels: Record<
  keyof AdminAssistantStatusResponse["configuration"],
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
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [requestState, setRequestState] = useState<
    "idle" | "sending" | "failed"
  >("idle");

  const submitTest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = question.trim();
    if (
      !message ||
      Array.from(message).length > 500 ||
      requestState === "sending"
    ) {
      return;
    }

    setRequestState("sending");
    setReply(null);
    try {
      const response = await fetch("/api/v1/admin/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          context: { pathname: "/admin/assistant" },
        }),
      });
      const body: unknown = response.ok ? await response.json() : null;
      if (!response.ok || !isAssistantSuccessResponse(body)) {
        throw new Error("Assistant test failed");
      }
      setReply(body.message.content);
      setRequestState("idle");
    } catch {
      setRequestState("failed");
    }
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
        <strong data-mode={status.mode}>PLACEHOLDER</strong>
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
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="输入用于验证占位合同的问题"
              rows={4}
              value={question}
            />
            <div>
              <small>仅验证当前受保护的响应合同，不调用真实模型。</small>
              <button disabled={requestState === "sending"} type="submit">
                {requestState === "sending" ? "发送中" : "发送测试"}
              </button>
            </div>
          </form>
          <div
            aria-live="polite"
            className="assistant-admin__reply"
            role="status"
          >
            {reply ??
              (requestState === "failed"
                ? "测试暂时失败，请稍后重试。"
                : "等待管理员发起测试。")}
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

      <style>{`
        .assistant-admin { color: var(--color-ink); }
        .assistant-admin__heading { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; padding-bottom:24px; border-bottom:1px solid var(--color-workspace-line); }
        .assistant-admin__heading p, .assistant-admin__console p, .assistant-admin__configuration > p, .assistant-admin__sessions p { margin:0 0 8px; color:var(--color-primary); font:700 11px/1.2 var(--font-mono); letter-spacing:.1em; }
        .assistant-admin__heading h1 { margin:0; font:750 clamp(30px,4vw,48px)/1 var(--font-display); letter-spacing:-.035em; }
        .assistant-admin__heading span { display:block; max-width:720px; margin-top:12px; color:var(--color-muted); font-size:14px; }
        .assistant-admin__heading > strong { padding:8px 10px; border:1px solid color-mix(in srgb,var(--color-ai-accent) 34%,var(--color-workspace-line)); color:var(--color-ai-accent); background:color-mix(in srgb,var(--color-ai-accent) 6%,white); font:700 10px/1 var(--font-mono); letter-spacing:.08em; }
        .assistant-admin__status-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); margin:24px 0 0; padding:0; border:1px solid var(--color-workspace-line); background:var(--color-surface); list-style:none; }
        .assistant-admin__status-grid li { position:relative; min-height:118px; padding:20px; border-right:1px solid var(--color-workspace-line); }
        .assistant-admin__status-grid li:last-child { border-right:0; }
        .assistant-admin__status-grid li::before { position:absolute; top:-1px; right:-1px; left:-1px; height:3px; background:var(--color-ai-accent); content:""; }
        .assistant-admin__status-grid li[data-state="placeholder"]::before { background:var(--color-signal); }
        .assistant-admin__status-grid span, .assistant-admin__status-grid small { display:block; color:var(--color-muted); font:650 11px/1.4 var(--font-mono); }
        .assistant-admin__status-grid strong { display:block; margin:14px 0 10px; font:730 17px/1.2 var(--font-display); }
        .assistant-admin__status-grid small { font-size:9px; letter-spacing:.08em; }
        .assistant-admin__workspace { display:grid; grid-template-columns:minmax(0,1.7fr) minmax(260px,.8fr); gap:16px; margin-top:16px; }
        .assistant-admin__console, .assistant-admin__configuration, .assistant-admin__sessions, .assistant-admin__future-actions { border:1px solid var(--color-workspace-line); background:var(--color-surface); }
        .assistant-admin__console { grid-row:span 2; padding:24px; }
        .assistant-admin__console > header { display:flex; align-items:start; justify-content:space-between; gap:16px; }
        .assistant-admin__console h2, .assistant-admin__configuration h2, .assistant-admin__sessions h2 { margin:0; font:730 20px/1.2 var(--font-display); }
        .assistant-admin__console header > span, .assistant-admin__configuration > span { color:var(--color-muted); font:650 10px/1.2 var(--font-mono); }
        .assistant-admin__console form { display:grid; gap:10px; margin-top:24px; }
        .assistant-admin__console label { font-size:12px; font-weight:700; }
        .assistant-admin__console textarea { width:100%; resize:vertical; border:1px solid var(--color-workspace-line); border-radius:4px; padding:14px; color:var(--color-ink); background:var(--color-canvas); font:14px/1.6 var(--font-body); }
        .assistant-admin__console textarea:focus-visible { outline:3px solid color-mix(in srgb,var(--color-signal) 34%,transparent); outline-offset:2px; }
        .assistant-admin__console form > div { display:flex; align-items:center; justify-content:space-between; gap:16px; }
        .assistant-admin__console form small { color:var(--color-muted); }
        .assistant-admin__console button { min-height:44px; padding:0 18px; border:0; border-radius:3px; color:white; background:var(--color-primary); font-weight:700; transition:transform 160ms cubic-bezier(.23,1,.32,1); }
        .assistant-admin__console button:active:not(:disabled) { transform:scale(.97); }
        .assistant-admin__console button:disabled { opacity:.6; }
        .assistant-admin__reply { min-height:72px; margin-top:16px; padding:16px; border-left:3px solid var(--color-ai-accent); color:var(--color-muted); background:color-mix(in srgb,var(--color-ai-accent) 5%,var(--color-canvas)); font-size:13px; line-height:1.6; }
        .assistant-admin__configuration { padding:24px; }
        .assistant-admin__configuration dl { margin:20px 0 18px; }
        .assistant-admin__configuration dl div { display:flex; justify-content:space-between; gap:16px; padding:12px 0; border-top:1px solid var(--color-workspace-line); }
        .assistant-admin__configuration dt { color:var(--color-muted); font-size:12px; }
        .assistant-admin__configuration dd { margin:0; text-align:right; font-size:12px; font-weight:700; }
        .assistant-admin__sessions { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:24px; }
        .assistant-admin__sessions span { display:block; max-width:520px; margin-top:8px; color:var(--color-muted); font-size:12px; line-height:1.5; }
        .assistant-admin__sessions > strong { color:var(--color-ai-accent); font:760 42px/1 var(--font-display); }
        .assistant-admin__future-actions { display:flex; gap:8px; padding:12px; }
        .assistant-admin__future-actions button { min-height:44px; flex:1; border:1px solid var(--color-workspace-line); border-radius:3px; color:var(--color-muted); background:var(--color-canvas); font-weight:700; }
        @media (max-width:960px) { .assistant-admin__status-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .assistant-admin__status-grid li:nth-child(2) { border-right:0; } .assistant-admin__status-grid li:nth-child(-n+2) { border-bottom:1px solid var(--color-workspace-line); } .assistant-admin__workspace { grid-template-columns:1fr; } .assistant-admin__console { grid-row:auto; } }
        @media (max-width:560px) { .assistant-admin__heading { align-items:flex-start; flex-direction:column; } .assistant-admin__status-grid { grid-template-columns:1fr; } .assistant-admin__status-grid li { border-right:0; border-bottom:1px solid var(--color-workspace-line); } .assistant-admin__status-grid li:last-child { border-bottom:0; } .assistant-admin__console > header, .assistant-admin__console form > div { align-items:flex-start; flex-direction:column; } .assistant-admin__console button { width:100%; } }
      `}</style>
    </section>
  );
}
