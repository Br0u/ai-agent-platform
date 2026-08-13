"use client";

import { Minimize2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useLayoutEffect } from "react";
import {
  ASSISTANT_PRESET_QUESTIONS,
  type AssistantStatusResponse,
} from "@/features/assistant/assistant-contract";
import { AssistantConversation } from "./assistant-conversation";
import { useAssistantExperience } from "./assistant-experience-provider";
import { AssistantOrb } from "./assistant-orb";
import { getAssistantServicePresentation } from "./assistant-service-presentation";
import "./assistant-workspace.css";

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

  return (
    <main aria-label="码多多工作区" className="assistant-workspace">
      <section className="assistant-workspace__surface">
        <div className="assistant-workspace__utility">
          <div className="assistant-workspace__identity">
            <AssistantOrb size={20} state="idle" />
            <span>
              <strong>码多多</strong>
              <small>公开网页助手 · 当前页面临时对话</small>
            </span>
          </div>
          <div className="assistant-workspace__actions">
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
        </div>

        <div
          className="assistant-workspace__conversation"
          data-has-messages={session.messages.length > 0 ? "true" : "false"}
        >
          {session.messages.length === 0 ? (
            <section className="assistant-workspace__welcome">
              <div className="assistant-workspace__welcome-orb">
                <AssistantOrb size={64} speed={0.5} state="listening" />
              </div>
              <h1>你好，今天想解决什么问题？</h1>
            </section>
          ) : null}

          <AssistantConversation
            ariaLabel="码多多对话"
            registerComposer={registerComposer}
            session={session}
            variant="workspace"
          />
          {session.messages.length === 0 ? (
            <div
              aria-label="常用问题"
              className="assistant-workspace__prompt-chips"
              role="group"
            >
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
          ) : null}
        </div>
        <nav aria-label="其他服务" className="assistant-workspace__fallbacks">
          <Link href="/help">帮助中心</Link>
          <Link href="/contact">商务咨询</Link>
        </nav>
      </section>
    </main>
  );
}
