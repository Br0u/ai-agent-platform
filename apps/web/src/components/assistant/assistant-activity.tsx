"use client";

import type { AssistantStreamActivityEvent } from "@/features/assistant/assistant-contract";
import { AssistantOrb } from "./assistant-orb";

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
        <AssistantOrb size={20} state={current.phase} />
        <span>{current.label}</span>
      </div>
    );
  }

  return (
    <details className="assistant-activity assistant-activity--completed">
      <summary>
        <AssistantOrb size={20} state="completed" />
        <span>已完成 {activities.length} 个步骤</span>
      </summary>
      <ol>
        {activities.map((activity, index) => (
          <li key={`${activity.phase}:${activity.label}:${index}`}>
            {activity.label}
          </li>
        ))}
      </ol>
    </details>
  );
}
