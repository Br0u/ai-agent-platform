"use client";

import { useRef } from "react";
import { AssistantLauncher } from "./assistant-launcher";
import { AssistantPanel } from "./assistant-panel";
import type { AssistantSession } from "./use-assistant-session";
import "./assistant-widget.css";

export function AssistantWidget({ session }: { session: AssistantSession }) {
  const launcherRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    session.closeAssistant();
    launcherRef.current?.focus();
  };

  return (
    <div className="assistant-widget">
      {session.open ? (
        <AssistantPanel onClose={close} session={session} />
      ) : null}
      <AssistantLauncher onOpen={session.openAssistant} ref={launcherRef} />
    </div>
  );
}
