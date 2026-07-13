"use client";

import { useRef } from "react";
import { AssistantLauncher } from "./assistant-launcher";
import { AssistantPanel } from "./assistant-panel";
import { useAssistantExperience } from "./assistant-experience-provider";
import "./assistant-widget.css";

export function AssistantWidget({
  showLauncher = true,
}: {
  showLauncher?: boolean;
}) {
  const experience = useAssistantExperience();
  const launcherRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="assistant-widget">
      {experience.session.open ? (
        <AssistantPanel
          onClose={experience.close}
          session={experience.session}
        />
      ) : null}
      {showLauncher ? (
        <AssistantLauncher
          onOpen={() => {
            if (launcherRef.current !== null) {
              experience.openFrom(launcherRef.current);
            }
          }}
          ref={launcherRef}
        />
      ) : null}
    </div>
  );
}
