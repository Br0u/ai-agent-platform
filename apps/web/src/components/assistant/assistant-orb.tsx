"use client";

import { useReducedMotion } from "framer-motion";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import {
  Component,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import "./assistant-orb.css";

export type AssistantOrbState =
  | "idle"
  | "completed"
  | "reading"
  | "analyzing"
  | "tool";

type AssistantOrbProps = {
  size: 20 | 64;
  state: AssistantOrbState;
};

const ORB_STATE_BY_ASSISTANT_STATE: Record<AssistantOrbState, OrbState> = {
  idle: "breathing",
  completed: "breathing",
  reading: "searching",
  analyzing: "solving",
  tool: "working",
};

const ORB_LABEL_BY_ASSISTANT_STATE: Record<AssistantOrbState, string> = {
  idle: "码多多已就绪",
  completed: "码多多已完成",
  reading: "码多多正在读取页面",
  analyzing: "码多多正在分析",
  tool: "码多多正在执行操作",
};

function StaticAssistantOrb({ label }: { label: string }) {
  return (
    <span
      aria-label={label}
      className="assistant-orb__fallback"
      data-assistant-orb-fallback="true"
      role="img"
    />
  );
}

type OrbErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type OrbErrorBoundaryState = {
  failed: boolean;
};

class OrbErrorBoundary extends Component<
  OrbErrorBoundaryProps,
  OrbErrorBoundaryState
> {
  state: OrbErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): OrbErrorBoundaryState {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function canUseCanvas2D() {
  try {
    return document.createElement("canvas").getContext("2d") !== null;
  } catch {
    return false;
  }
}

function subscribeToCanvasSupport() {
  return () => undefined;
}

export function AssistantOrb({ size, state }: AssistantOrbProps) {
  const prefersReducedMotion = useReducedMotion();
  const canvasAvailable = useSyncExternalStore(
    subscribeToCanvasSupport,
    canUseCanvas2D,
    () => false,
  );
  const ariaLabel = ORB_LABEL_BY_ASSISTANT_STATE[state];

  return (
    <span
      className="assistant-orb"
      data-assistant-orb-size={size}
      data-orb-state={ORB_STATE_BY_ASSISTANT_STATE[state]}
      style={{ "--assistant-orb-size": `${size}px` } as CSSProperties}
    >
      {!canvasAvailable ? (
        <StaticAssistantOrb label={ariaLabel} />
      ) : (
        <OrbErrorBoundary fallback={<StaticAssistantOrb label={ariaLabel} />}>
          <ThinkingOrb
            aria-label={ariaLabel}
            className="assistant-orb__canvas"
            paused={Boolean(prefersReducedMotion)}
            size={size}
            state={ORB_STATE_BY_ASSISTANT_STATE[state]}
            theme="dark"
          />
        </OrbErrorBoundary>
      )}
    </span>
  );
}
