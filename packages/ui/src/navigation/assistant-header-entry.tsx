import { useId } from "react";
import "../app-shell.css";

export type AssistantHeaderEntryProps = {
  onActivate: () => void;
};

export function AssistantHeaderEntry({
  onActivate,
}: AssistantHeaderEntryProps) {
  const gradientId = `${useId()}-assistant-mobius-gradient`;

  return (
    <button
      aria-label="打开 AI 助理"
      className="assistant-header-entry"
      onClick={onActivate}
      type="button"
    >
      <svg
        aria-hidden="true"
        className="assistant-header-entry__mark"
        focusable="false"
        viewBox="0 0 48 48"
      >
        <defs>
          <linearGradient id={gradientId} x1="4" x2="44" y1="8" y2="40">
            <stop offset="0" stopColor="var(--color-signal)" />
            <stop offset="0.5" stopColor="var(--color-structural)" />
            <stop offset="1" stopColor="var(--color-accent)" />
          </linearGradient>
        </defs>
        <path
          d="M9 25c0-7.5 5.2-13 12-13 8.9 0 10.1 13 17 13 3.2 0 5-2.4 5-5.4"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeLinecap="round"
          strokeWidth="6"
        />
        <path
          d="M39 23c0 7.5-5.2 13-12 13-8.9 0-10.1-13-17-13-3.2 0-5 2.4-5 5.4"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeLinecap="round"
          strokeWidth="6"
        />
      </svg>
      <span className="assistant-header-entry__label">AI 助理</span>
    </button>
  );
}
