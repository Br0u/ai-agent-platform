"use client";

import type {
  AdminAssistantSessionsSnapshot,
  AdminAssistantStatusSnapshot,
} from "@/features/assistant/admin-assistant-contract";
import { isAdminAssistantChatResponse } from "@/features/assistant/admin-assistant-contract";
import { useAssistantSession } from "@/components/assistant/use-assistant-session";
import { AssistantModelConfigPanel } from "@/components/admin/assistant-model-config-panel";
import { AssistantSkillConfigurationPanel } from "@/components/admin/assistant-skill-configuration-panel";
import { AssistantCapabilityRoadmap } from "@/components/admin/assistant-capability-roadmap";
import {
  AssistantSkillRegistryPanel,
  type AdminSkillRegistrySnapshot,
} from "@/components/admin/assistant-skill-registry-panel";
import type { AdminModelConfigSnapshot } from "@/features/assistant/admin-model-config-contract";
import type { AdminSkillPermissionFlags } from "@/features/assistant/admin-skill-contract";
import type { AdminSkillRuntimeSnapshot } from "@/features/assistant/admin-skill-runtime-contract";
import type { FormEvent } from "react";
import "./assistant-admin-page.css";

type AssistantAdminPageProps = {
  modelConfigs: AdminModelConfigSnapshot;
  sessions: AdminAssistantSessionsSnapshot;
  skillActorUserId: string;
  skillCanRead: boolean;
  skillPermissions: AdminSkillPermissionFlags;
  skillRuntime: AdminSkillRuntimeSnapshot;
  skillSnapshot: AdminSkillRegistrySnapshot;
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
  modelConfigs,
  sessions,
  skillActorUserId,
  skillCanRead,
  skillPermissions,
  skillRuntime,
  skillSnapshot,
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
            <dt>Selected Provider</dt>
            <dd>{status.runtime.selectedProvider}</dd>
          </div>
          <div>
            <dt>Configured Mode</dt>
            <dd>{status.runtime.providerMode}</dd>
          </div>
          <div>
            <dt>Capability</dt>
            <dd>{status.runtime.capability}</dd>
          </div>
          <div>
            <dt>Readiness Circuit</dt>
            <dd>{status.runtime.circuits.readiness.state}</dd>
          </div>
          <div>
            <dt>Readiness Failures</dt>
            <dd>{status.runtime.circuits.readiness.consecutiveFailures}</dd>
          </div>
          <div>
            <dt>Execution Circuit</dt>
            <dd>{status.runtime.circuits.execution.state}</dd>
          </div>
          <div>
            <dt>Execution Failures</dt>
            <dd>{status.runtime.circuits.execution.consecutiveFailures}</dd>
          </div>
          <div>
            <dt>Health TTL</dt>
            <dd>{status.runtime.readiness.cacheTtlMs} ms</dd>
          </div>
          <div>
            <dt>Probe Timeout</dt>
            <dd>{status.runtime.readiness.probeTimeoutMs} ms</dd>
          </div>
          <div>
            <dt>Failure Threshold</dt>
            <dd>{status.runtime.readiness.failureThreshold}</dd>
          </div>
          <div>
            <dt>Persistence</dt>
            <dd>{status.runtime.persistence}</dd>
          </div>
        </dl>
      </section>

      <AssistantModelConfigPanel initialSnapshot={modelConfigs} />

      <AssistantSkillConfigurationPanel initialSnapshot={skillRuntime} />

      <AssistantSkillRegistryPanel
        actorUserId={skillActorUserId}
        canRead={skillCanRead}
        initialPermissions={skillPermissions}
        initialSnapshot={skillSnapshot}
      />

      <AssistantCapabilityRoadmap />

      <div className="assistant-admin__workspace">
        <section
          aria-labelledby="assistant-test-title"
          className="assistant-admin__console"
        >
          <header>
            <div>
              <p>PROTECTED TEST CONSOLE</p>
              <h2 id="assistant-test-title">受保护的助手测试控制台</h2>
            </div>
            <span>临时会话，结束后清理</span>
          </header>
          <form onSubmit={submitTest}>
            <label htmlFor="assistant-admin-question">测试问题</label>
            <textarea
              id="assistant-admin-question"
              maxLength={500}
              onChange={(event) => assistant.setDraft(event.target.value)}
              placeholder="输入助手测试问题"
              rows={4}
              value={assistant.draft}
            />
            <div>
              <small>
                AgentOS 模式会调用已配置模型；占位模式返回安全占位回答。
              </small>
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
            <h2 id="assistant-sessions-title">会话持久化</h2>
            <span>{sessions.message}</span>
            <small>
              {sessions.persistence} / {sessions.listing}
            </small>
          </div>
          <strong>列表不可用</strong>
        </section>

        <nav
          aria-label="待接入管理能力"
          className="assistant-admin__future-actions"
        >
          <button disabled type="button">
            会话审计
          </button>
        </nav>
      </div>
    </section>
  );
}
