import Link from "next/link";
import { useEffect, useRef, type FormEvent } from "react";
import type { AssistantSession } from "./use-assistant-session";

const PRESET_QUESTIONS = [
  "如何开始了解平台？",
  "如何获取部署支持？",
  "如何提交产品问题？",
] as const;

type AssistantPanelProps = {
  session: AssistantSession;
  onClose: () => void;
};

export function AssistantPanel({ session, onClose }: AssistantPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sending = session.requestStatus === "sending";

  useEffect(() => inputRef.current?.focus(), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void session.submit();
  };

  return (
    <section
      aria-label="M 助手"
      className="assistant-panel"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      role="dialog"
    >
      <header className="assistant-panel__header">
        <div>
          <h2>M 助手</h2>
          <p>AI 服务尚未接入</p>
        </div>
        <button aria-label="关闭 M 助手" onClick={onClose} type="button">
          ×
        </button>
      </header>

      <div className="assistant-panel__body">
        <p className="assistant-panel__welcome">
          你好，我可以帮你找到平台文档、部署支持和产品问题入口。
        </p>
        <div aria-label="常见问题" className="assistant-panel__presets">
          {PRESET_QUESTIONS.map((question) => (
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

        <div
          className="assistant-panel__history"
          data-testid="assistant-history"
        >
          {session.messages.map((message) => (
            <p
              className={`assistant-message assistant-message--${message.role}`}
              key={message.id}
            >
              {message.content}
            </p>
          ))}
        </div>

        {session.requestStatus === "failed" ? (
          <div className="assistant-panel__error">
            <p>发送失败，请重试或使用下方服务入口。</p>
            <button
              disabled={sending}
              onClick={() => void session.retry()}
              type="button"
            >
              重试
            </button>
          </div>
        ) : null}
      </div>

      <div
        aria-atomic="true"
        aria-live="polite"
        className="assistant-panel__announcement"
        role="status"
      >
        {session.latestAnnouncement}
      </div>

      <form className="assistant-panel__form" onSubmit={submit}>
        <label htmlFor="assistant-question">向 M 助手提问</label>
        <div>
          <input
            disabled={sending}
            id="assistant-question"
            onChange={(event) => session.setDraft(event.target.value)}
            placeholder="输入你的问题"
            ref={inputRef}
            value={session.draft}
          />
          <button disabled={sending} type="submit">
            {sending ? "发送中" : "发送"}
          </button>
        </div>
      </form>

      <nav aria-label="其他服务" className="assistant-panel__fallbacks">
        <Link href="/help">帮助中心</Link>
        <Link href="/contact">商务咨询</Link>
      </nav>
    </section>
  );
}
