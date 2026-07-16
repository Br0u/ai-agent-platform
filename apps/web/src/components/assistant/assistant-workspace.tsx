"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  ASSISTANT_PRESET_QUESTIONS,
  type AssistantStatusResponse,
} from "@/features/assistant/assistant-contract";
import { AssistantConversation } from "./assistant-conversation";
import { useAssistantExperience } from "./assistant-experience-provider";
import { getAssistantServicePresentation } from "./assistant-service-presentation";
import "./assistant-workspace.css";

const DESKTOP_RAIL_QUERY = "(min-width: 721px)";
const NEW_SESSION_HELP_ID = "assistant-new-session-help";

type AssistantWorkspaceProps = {
  initialServiceState: AssistantStatusResponse;
};

export function AssistantWorkspace({
  initialServiceState,
}: AssistantWorkspaceProps) {
  const {
    adoptServiceState,
    session,
    registerComposer,
    serviceState: currentServiceState,
    refreshingServiceState: refreshingStatus,
    hasResolvedServiceState,
    refreshServiceState,
  } = useAssistantExperience();
  const [isDesktop, setIsDesktop] = useState(false);
  const [railOverride, setRailOverride] = useState<boolean | null>(null);
  const railExpanded = railOverride ?? isDesktop;
  const sending = session.requestStatus === "sending";
  const displayedServiceState = hasResolvedServiceState
    ? currentServiceState
    : initialServiceState;

  const servicePresentation = getAssistantServicePresentation({
    serviceState: displayedServiceState,
    hasResolvedServiceState: true,
    refreshingServiceState: refreshingStatus,
  });

  useLayoutEffect(() => {
    adoptServiceState(initialServiceState);
  }, [adoptServiceState, initialServiceState]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(DESKTOP_RAIL_QUERY);
    const synchronizeBreakpoint = (event?: MediaQueryListEvent) => {
      setIsDesktop(event?.matches ?? mediaQuery.matches);
    };

    synchronizeBreakpoint();
    mediaQuery.addEventListener("change", synchronizeBreakpoint);
    return () =>
      mediaQuery.removeEventListener("change", synchronizeBreakpoint);
  }, []);

  return (
    <main aria-label="AI 助理工作区" className="assistant-workspace">
      <aside
        aria-label="临时会话"
        className="assistant-workspace__rail"
        data-collapsed={!railExpanded}
      >
        <div className="assistant-workspace__rail-head">
          <span>CONVERSATIONS</span>
          <button
            aria-expanded={railExpanded}
            aria-label={railExpanded ? "收起会话栏" : "展开会话栏"}
            aria-controls="assistant-session-rail-content"
            onClick={() => setRailOverride(!railExpanded)}
            type="button"
          >
            {railExpanded ? "收起" : "展开"}
          </button>
        </div>
        <div
          data-testid="assistant-session-rail-content"
          hidden={!railExpanded}
          id="assistant-session-rail-content"
        >
          <button
            aria-describedby={NEW_SESSION_HELP_ID}
            aria-label="新建会话"
            className="assistant-workspace__new-session"
            disabled
            type="button"
          >
            ＋ 新建会话
          </button>
          <p id={NEW_SESSION_HELP_ID}>模型接入后开放</p>
          <p>当前为匿名临时会话，不保存历史记录。</p>
          <div className="assistant-workspace__session-list">
            <button
              aria-label="私有化部署咨询（历史会话不可用）"
              disabled
              type="button"
            >
              <strong>私有化部署咨询</strong>
              <span>历史会话不可用</span>
            </button>
            <button
              aria-label="兼容性与 GPU 配置（历史会话不可用）"
              disabled
              type="button"
            >
              <strong>兼容性与 GPU 配置</strong>
              <span>历史会话不可用</span>
            </button>
          </div>
        </div>
      </aside>

      <section className="assistant-workspace__surface">
        <header className="assistant-workspace__header">
          <div className="assistant-workspace__identity">
            <Image
              alt=""
              height={40}
              src="/assets/assistant/m-assistant.webp"
              width={40}
            />
            <span>
              <strong>M 企业助理</strong>
              <small>公开咨询 · 匿名临时会话</small>
            </span>
          </div>
          <div
            aria-atomic="true"
            aria-busy={refreshingStatus}
            aria-live="polite"
            className="assistant-workspace__service-state"
            data-capability={displayedServiceState.capability}
            data-testid="assistant-service-state"
            role="status"
          >
            <span aria-hidden="true" />
            <strong>{servicePresentation.label}</strong>
            <button
              aria-label={refreshingStatus ? "刷新服务状态中" : "刷新服务状态"}
              disabled={refreshingStatus}
              onClick={() => void refreshServiceState()}
              type="button"
            >
              {refreshingStatus ? "刷新中" : "刷新"}
            </button>
          </div>
        </header>

        <div className="assistant-workspace__conversation">
          <section className="assistant-workspace__welcome">
            <p className="assistant-workspace__kicker">
              ENTERPRISE ASSISTANT / 01
            </p>
            <h1>从一个问题开始，找到适合企业的 AI 路径。</h1>
            <p className="assistant-workspace__disclosure">
              <span>{displayedServiceState.message}</span> 后续将通过 Agno
              AgentOS 接入 Agent、Skill、知识与会话能力。
            </p>
            <div aria-label="常见问题" className="assistant-workspace__presets">
              {ASSISTANT_PRESET_QUESTIONS.map((question) => (
                <button
                  disabled={sending}
                  key={question}
                  onClick={() => void session.submit(question)}
                  type="button"
                >
                  {question}
                </button>
              ))}
            </div>
          </section>

          <AssistantConversation
            ariaLabel="AI 助理对话"
            registerComposer={registerComposer}
            session={session}
            variant="workspace"
          />
        </div>
        <nav aria-label="其他服务" className="assistant-workspace__fallbacks">
          <Link href="/help">帮助中心</Link>
          <Link href="/contact">商务咨询</Link>
        </nav>
      </section>
    </main>
  );
}
