"use client";

import type { AssistantStreamActivityEvent } from "@/features/assistant/assistant-contract";
import "./assistant-activity.css";

type AssistantActivityProps = {
  activities: readonly AssistantStreamActivityEvent[];
  inProgress: boolean;
};

export function AssistantActivity({
  activities,
  inProgress,
}: AssistantActivityProps) {
  const current = activities.at(-1);
  if (current === undefined) return null;

  if (inProgress) {
    return (
      <div
        aria-atomic="true"
        aria-live="polite"
        className="assistant-activity assistant-activity--working"
        role="status"
      >
        <strong>正在处理</strong>
        <ol aria-label="执行步骤">
          {activities.map((activity, index) => (
            <li
              data-current={
                index === activities.length - 1 ? "true" : undefined
              }
              key={`${activity.phase}:${activity.label}:${index}`}
            >
              {activity.label}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <details className="assistant-activity assistant-activity--completed">
      <summary>
        <span>已完成 {activities.length} 个步骤</span>
      </summary>
      <ol aria-label="执行步骤">
        {activities.map((activity, index) => (
          <li key={`${activity.phase}:${activity.label}:${index}`}>
            {activity.label}
          </li>
        ))}
      </ol>
    </details>
  );
}
