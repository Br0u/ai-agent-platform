import { useId, type ReactNode } from "react";
import "./auth-shell.css";

export type AuthShellProps = {
  children: ReactNode;
  storyTitle: string;
  storyDescription: string;
  realmLabel: string;
  title: string;
  intro: string;
};

export function AuthShell({
  children,
  storyTitle,
  storyDescription,
  realmLabel,
  title,
  intro,
}: AuthShellProps) {
  const id = useId();
  const storyTitleId = `${id}-auth-story-title`;
  const operationTitleId = `${id}-auth-operation-title`;

  return (
    <div className="auth-shell">
      <section aria-labelledby={storyTitleId} className="auth-shell__story">
        <div className="auth-shell__brand">
          <strong>AI Agent Platform</strong>
          <span>Build Enterprise AI Faster</span>
        </div>
        <div className="auth-shell__story-copy">
          <span className="auth-shell__kicker">Enterprise Access</span>
          <h2 id={storyTitleId}>{storyTitle}</h2>
          <p>{storyDescription}</p>
        </div>
        <span className="auth-shell__story-meta">
          PRIVATE · CONTROLLED · SECURE
        </span>
      </section>

      <main
        aria-labelledby={operationTitleId}
        className="auth-shell__operation"
      >
        <div className="auth-shell__operation-content">
          <span className="auth-shell__kicker">{realmLabel}</span>
          <h1 id={operationTitleId}>{title}</h1>
          <p className="auth-shell__intro">{intro}</p>
          <div className="auth-shell__content">{children}</div>
        </div>
      </main>
    </div>
  );
}
