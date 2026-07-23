"use client";

import { Minimize2, RefreshCw } from "lucide-react";
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
  const sessionBoundary =
    displayedServiceState.capability === "placeholder"
      ? "安全占位模式，不创建服务端会话。"
      : "已接入码多多，支持匿名多轮对话；同一浏览器会保留最近上下文。";

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
    <main aria-label="码多多工作区" className="assistant-workspace">
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
          <p id={NEW_SESSION_HELP_ID}>暂不支持创建多个会话</p>
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
            <span>
              <strong>码多多</strong>
              <small>公开网页助手 · 匿名会话</small>
            </span>
          </div>
          <div className="assistant-workspace__header-actions">
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
                aria-label={
                  refreshingStatus ? "刷新服务状态中" : "刷新服务状态"
                }
                disabled={refreshingStatus}
                onClick={() => void refreshServiceState()}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={14} />
                <span>{refreshingStatus ? "刷新中" : "刷新"}</span>
              </button>
            </div>
            <Link
              aria-label="缩小码多多并返回主页面"
              className="assistant-workspace__minimize"
              href="/"
            >
              <Minimize2 aria-hidden="true" size={17} />
            </Link>
          </div>
        </header>

        <div className="assistant-workspace__conversation">
          <section className="assistant-workspace__welcome">
            <p className="assistant-workspace__kicker">MADUODUO / 01</p>
            <h1>从一个问题开始，找到适合企业的 AI 路径。</h1>
            <p className="assistant-workspace__disclosure">
              <span>{displayedServiceState.message}</span>
              <span>{sessionBoundary}</span>
              <span>
                已启用的审核 Skill 会按配置加载；知识库和网页正文读取尚未接入。
              </span>
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
            ariaLabel="码多多对话"
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
