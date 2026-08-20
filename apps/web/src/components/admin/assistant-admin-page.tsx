"use client";

import type { AdminAssistantStatusSnapshot } from "@/features/assistant/admin-assistant-contract";
import { isAdminAssistantChatResponse } from "@/features/assistant/admin-assistant-contract";
import { useAssistantSession } from "@/components/assistant/use-assistant-session";
import { AssistantModelConfigPanel } from "@/components/admin/assistant-model-config-panel";
import { AssistantInputPolicyPanel } from "@/components/admin/assistant-input-policy-panel";
import {
  AssistantSkillRegistryPanel,
  type AdminSkillRegistrySnapshot,
} from "@/components/admin/assistant-skill-registry-panel";
import type { AdminModelConfigSnapshot } from "@/features/assistant/admin-model-config-contract";
import type { AdminInputPolicySnapshot } from "@/features/assistant/admin-input-policy-contract";
import type { AdminSkillPermissionFlags } from "@/features/assistant/admin-skill-contract";
import { useState, type FormEvent } from "react";
import "./assistant-admin-page.css";

type AssistantAdminPageProps = {
  inputPolicy: AdminInputPolicySnapshot;
  modelConfigs: AdminModelConfigSnapshot;
  skillCanRead: boolean;
  skillPermissions: AdminSkillPermissionFlags;
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
  pageMemory: "对话记忆",
};

export function AssistantAdminPage({
  inputPolicy,
  modelConfigs,
  skillCanRead,
  skillPermissions,
  skillSnapshot,
  status,
}: AssistantAdminPageProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "model" | "skills" | "policy" | "test"
  >("overview");
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

      <nav aria-label="Agent 管理分区" className="assistant-admin__tabs">
        {(
          [
            ["overview", "运行概览"],
            ["model", "模型配置"],
            ["skills", "Skills"],
            ["policy", "内容规则"],
            ["test", "测试"],
          ] as const
        ).map(([id, label]) => (
          <button
            aria-selected={activeTab === id}
            key={id}
            onClick={() => setActiveTab(id)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "overview" ? (
        <>
          <ul
            aria-label="AI 助理服务状态"
            className="assistant-admin__status-grid"
          >
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
        </>
      ) : null}

      {activeTab === "model" ? (
        <AssistantModelConfigPanel initialSnapshot={modelConfigs} />
      ) : null}

      {activeTab === "skills" ? (
        <AssistantSkillRegistryPanel
          canRead={skillCanRead}
          initialPermissions={skillPermissions}
          initialSnapshot={skillSnapshot}
        />
      ) : null}

      <div hidden={activeTab !== "policy"}>
        <AssistantInputPolicyPanel initialSnapshot={inputPolicy} />
      </div>

      {activeTab === "test" ? (
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
              <span>仅保留在当前页面内存；刷新或离开后清空</span>
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
                  {assistant.requestStatus === "sending"
                    ? "发送中"
                    : "发送测试"}
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
                    {
                      configurationLabels[
                        key as keyof typeof configurationLabels
                      ]
                    }
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <span>只读 · 当前运行合同</span>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
