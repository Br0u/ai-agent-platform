"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  ASSISTANT_PRESET_QUESTIONS,
  isAssistantStatusResponse,
  type AssistantStatusResponse,
} from "@/features/assistant/assistant-contract";
import { useAssistantExperience } from "./assistant-experience-provider";
import "./assistant-workspace.css";

const COMPOSER_HELP_ID = "assistant-workspace-composer-help";
const FAILURE_MESSAGE = "发送失败，请重试或使用帮助中心或商务咨询。";
const DESKTOP_RAIL_QUERY = "(min-width: 721px)";
const NEW_SESSION_HELP_ID = "assistant-new-session-help";
const STATUS_REFRESH_TIMEOUT_MS = 5_000;
const DEGRADED_STATUS: AssistantStatusResponse = {
  version: "1",
  requestId: "client-status-fallback",
  live: false,
  ready: false,
  capability: "degraded",
  message: "助手基础服务暂不可用。",
};

type AssistantWorkspaceProps = {
  serviceState: AssistantStatusResponse;
};

type StatusRefreshOperation = {
  cancel: () => void;
  timer: ReturnType<typeof setTimeout>;
};

export function AssistantWorkspace({ serviceState }: AssistantWorkspaceProps) {
  const { session, registerComposer } = useAssistantExperience();
  const [currentServiceState, setCurrentServiceState] = useState(serviceState);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [railOverride, setRailOverride] = useState<boolean | null>(null);
  const mountedRef = useRef(false);
  const refreshGenerationRef = useRef(0);
  const statusRefreshRef = useRef<StatusRefreshOperation | null>(null);
  const railExpanded = railOverride ?? isDesktop;
  const sending = session.requestStatus === "sending";
  const hasError = session.validationError !== null;

  const serviceLabel =
    currentServiceState.capability === "degraded" || !currentServiceState.live
      ? "基础设施暂不可用"
      : currentServiceState.capability === "placeholder" &&
          currentServiceState.ready
        ? "模型尚未配置"
        : currentServiceState.capability === "available" &&
            currentServiceState.ready
          ? "服务已就绪"
          : "服务未就绪";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      refreshGenerationRef.current += 1;
      statusRefreshRef.current?.cancel();
    };
  }, []);

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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void session.submit();
  };

  const refreshServiceState = async () => {
    if (statusRefreshRef.current) return;
    const id = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = id;
    const controller = new AbortController();
    let rejectInterruption: (reason?: unknown) => void = () => undefined;
    let interrupted = false;
    const interruption = new Promise<never>((_resolve, reject) => {
      rejectInterruption = reject;
    });
    const cancel = () => {
      if (interrupted) return;
      interrupted = true;
      controller.abort();
      rejectInterruption(new Error("Assistant status refresh interrupted"));
    };
    const operation: StatusRefreshOperation = {
      cancel,
      timer: setTimeout(cancel, STATUS_REFRESH_TIMEOUT_MS),
    };
    statusRefreshRef.current = operation;
    setRefreshingStatus(true);
    try {
      const body = await Promise.race([
        (async (): Promise<AssistantStatusResponse> => {
          const response = await fetch("/api/v1/assistant/status", {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          });
          const candidate: unknown = await response.json();
          if (!response.ok || !isAssistantStatusResponse(candidate)) {
            throw new Error("Invalid assistant status response");
          }
          return candidate;
        })(),
        interruption,
      ]);
      if (mountedRef.current && refreshGenerationRef.current === id) {
        setCurrentServiceState(body);
      }
    } catch {
      if (mountedRef.current && refreshGenerationRef.current === id) {
        setCurrentServiceState(DEGRADED_STATUS);
      }
    } finally {
      clearTimeout(operation.timer);
      if (statusRefreshRef.current === operation) {
        statusRefreshRef.current = null;
        if (mountedRef.current && refreshGenerationRef.current === id) {
          setRefreshingStatus(false);
        }
      }
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    void session.submit();
  };

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
            data-capability={currentServiceState.capability}
            data-testid="assistant-service-state"
            role="status"
          >
            <span aria-hidden="true" />
            <strong>{serviceLabel}</strong>
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
              <span>{currentServiceState.message}</span> 后续将通过 Agno AgentOS
              接入 Agent、Skill、知识与会话能力。
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

          <div
            className="assistant-workspace__messages"
            data-testid="assistant-message-history"
          >
            {session.messages.map((message) => (
              <article
                className={`assistant-workspace__message assistant-workspace__message--${message.role}`}
                key={message.id}
              >
                {message.role === "assistant" ? (
                  <Image
                    alt=""
                    height={36}
                    src="/assets/assistant/m-assistant.webp"
                    width={36}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="assistant-workspace__user-mark"
                  >
                    YOU
                  </span>
                )}
                <div>
                  <p>{message.content}</p>
                  {message.role === "assistant" &&
                  message.suggestedActions.length > 0 ? (
                    <nav aria-label="建议操作">
                      {message.suggestedActions.map((action) => (
                        <Link
                          href={action.href}
                          key={`${action.label}:${action.href}`}
                        >
                          {action.label}
                        </Link>
                      ))}
                    </nav>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div
          aria-atomic="true"
          aria-live="polite"
          className="assistant-workspace__announcement"
          role="status"
        >
          {session.latestAnnouncement}
        </div>

        <footer className="assistant-workspace__composer-wrap">
          <form className="assistant-workspace__composer" onSubmit={submit}>
            <label htmlFor="assistant-workspace-question">输入问题</label>
            <textarea
              aria-describedby={COMPOSER_HELP_ID}
              aria-invalid={hasError ? "true" : undefined}
              disabled={sending}
              id="assistant-workspace-question"
              onChange={(event) => session.setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="输入你的问题，Shift + Enter 换行"
              ref={registerComposer}
              rows={2}
              value={session.draft}
            />
            <button disabled={sending || hasError} type="submit">
              {sending ? "发送中" : "发送"}
            </button>
            <p
              aria-live="polite"
              id={COMPOSER_HELP_ID}
              role={
                hasError || session.requestStatus === "failed"
                  ? "alert"
                  : undefined
              }
            >
              {session.validationError?.message ??
                (session.requestStatus === "failed"
                  ? session.latestAnnouncement || FAILURE_MESSAGE
                  : "最多输入 500 个字符。当前对话不会保存为历史记录。")}
            </p>
            {session.requestStatus === "failed" ? (
              <button
                className="assistant-workspace__retry"
                onClick={() => void session.retry()}
                type="button"
              >
                重试
              </button>
            ) : null}
          </form>
          <nav aria-label="其他服务" className="assistant-workspace__fallbacks">
            <Link href="/help">帮助中心</Link>
            <Link href="/contact">商务咨询</Link>
          </nav>
        </footer>
      </section>
    </main>
  );
}
