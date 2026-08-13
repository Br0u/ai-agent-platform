"use client";

import { useReducedMotion } from "framer-motion";
import type { OrbState } from "thinking-orbs";
import {
  MODE_FRAMES,
  resolvePreset,
  type OrbFrame,
} from "thinking-orbs/engine";
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  | "tool"
  | "listening";

type AssistantOrbProps = {
  size: 20 | 64;
  speed?: number;
  state: AssistantOrbState;
};

const ORB_STATE_BY_ASSISTANT_STATE: Record<AssistantOrbState, OrbState> = {
  idle: "breathing",
  completed: "breathing",
  reading: "searching",
  analyzing: "solving",
  tool: "working",
  listening: "listening",
};

const ORB_LABEL_BY_ASSISTANT_STATE: Record<AssistantOrbState, string> = {
  idle: "码多多已就绪",
  completed: "码多多已完成",
  reading: "码多多正在读取页面",
  analyzing: "码多多正在分析",
  tool: "码多多正在执行操作",
  listening: "码多多正在倾听",
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

const BRAND_COLORS = [
  [37, 99, 235],
  [79, 70, 229],
  [124, 58, 237],
] as const;

function brandInk(x: number, size: number, white: number, alpha = 1) {
  const position = Math.max(0, Math.min(1, x / size)) * 2;
  const index = Math.min(1, Math.floor(position));
  const progress = position - index;
  const from = BRAND_COLORS[index]!;
  const to = BRAND_COLORS[index + 1]!;
  const channel = (offset: number) =>
    Math.round(from[offset]! + (to[offset]! - from[offset]!) * progress);
  const opacity = Math.max(0, Math.min(1, alpha * (0.5 + (1 - white) * 0.5)));
  return `rgba(${channel(0)}, ${channel(1)}, ${channel(2)}, ${opacity})`;
}

function paintBrandFrame(
  context: CanvasRenderingContext2D,
  frame: OrbFrame,
  size: number,
) {
  for (const line of frame.lines) {
    context.beginPath();
    context.moveTo(line.x1, line.y1);
    context.lineTo(line.x2, line.y2);
    context.strokeStyle = brandInk(
      (line.x1 + line.x2) / 2,
      size,
      line.white,
      line.a,
    );
    context.lineWidth = line.w;
    context.stroke();
  }
  for (const dot of frame.dots) {
    context.beginPath();
    context.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
    context.fillStyle = brandInk(dot.x, size, dot.white, dot.a);
    context.fill();
  }
}

function BrandThinkingOrb({
  ariaLabel,
  paused,
  size,
  speed,
  state,
}: {
  ariaLabel: string;
  paused: boolean;
  size: 20 | 64;
  speed: number;
  state: OrbState;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const preset = useMemo(() => resolvePreset(state, size), [size, state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const pixelRatio = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(size * pixelRatio);
    canvas.height = Math.round(size * pixelRatio);
    const context = canvas.getContext("2d");
    if (context === null) return;
    const render = (time: number) => {
      try {
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, size, size);
        paintBrandFrame(
          context,
          MODE_FRAMES[preset.mode](size, time, preset.opts),
          size,
        );
        return true;
      } catch {
        setFailed(true);
        return false;
      }
    };
    const animationSpeed = preset.speed * speed;
    if (!render((performance.now() / 1_000) * animationSpeed)) return;
    if (paused) return;

    let frame = 0;
    let running = false;
    let visible = true;
    const tick = () => {
      if (!render((performance.now() / 1_000) * animationSpeed)) {
        running = false;
        return;
      }
      if (running) frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? false;
            if (visible) start();
            else stop();
          });
    observer?.observe(canvas);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") stop();
      else if (visible) start();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (observer === null) start();
    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [paused, preset, size, speed]);

  return failed ? (
    <StaticAssistantOrb label={ariaLabel} />
  ) : (
    <canvas
      aria-label={ariaLabel}
      className="assistant-orb__canvas"
      data-color-rendering="per-dot"
      data-orb-state={state}
      data-paused={String(paused)}
      data-speed={speed}
      ref={canvasRef}
      role="img"
    />
  );
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

export function AssistantOrb({ size, speed = 1, state }: AssistantOrbProps) {
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
          <BrandThinkingOrb
            ariaLabel={ariaLabel}
            paused={Boolean(prefersReducedMotion)}
            size={size}
            speed={speed}
            state={ORB_STATE_BY_ASSISTANT_STATE[state]}
          />
        </OrbErrorBoundary>
      )}
    </span>
  );
}
