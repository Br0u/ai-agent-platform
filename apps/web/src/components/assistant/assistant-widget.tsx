"use client";

import { useEffect, useRef, useState } from "react";
import { AssistantLauncher } from "./assistant-launcher";
import { AssistantPanel } from "./assistant-panel";
import { useAssistantExperience } from "./assistant-experience-provider";
import "./assistant-widget.css";

export type AssistantMotionState =
  | "unmounted"
  | "entering"
  | "open"
  | "closing";

const ASSISTANT_EXIT_DURATION_MS = 160;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function AssistantWidget({
  showLauncher = true,
}: {
  showLauncher?: boolean;
}) {
  const experience = useAssistantExperience();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionVersionRef = useRef(0);
  const [motionState, setMotionState] =
    useState<AssistantMotionState>("unmounted");
  const [previouslyOpen, setPreviouslyOpen] = useState(experience.session.open);
  const reduceMotion = prefersReducedMotion();

  if (previouslyOpen !== experience.session.open) {
    setPreviouslyOpen(experience.session.open);
    setMotionState(
      experience.session.open
        ? "entering"
        : reduceMotion
          ? "unmounted"
          : "closing",
    );
  }

  useEffect(() => {
    const transitionVersion = transitionVersionRef.current + 1;
    transitionVersionRef.current = transitionVersion;
    const clearScheduledWork = () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (exitTimerRef.current !== null) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };

    clearScheduledWork();
    if (experience.session.open) {
      if (motionState === "entering") {
        if (reduceMotion) {
          queueMicrotask(() => {
            if (transitionVersionRef.current === transitionVersion) {
              setMotionState("open");
            }
          });
        } else {
          animationFrameRef.current = requestAnimationFrame(() => {
            animationFrameRef.current = null;
            if (transitionVersionRef.current === transitionVersion) {
              setMotionState("open");
            }
          });
        }
      }
    } else if (!reduceMotion && motionState === "closing") {
      exitTimerRef.current = setTimeout(() => {
        exitTimerRef.current = null;
        setMotionState("unmounted");
      }, ASSISTANT_EXIT_DURATION_MS);
    }

    return () => {
      if (transitionVersionRef.current === transitionVersion) {
        transitionVersionRef.current += 1;
      }
      clearScheduledWork();
    };
  }, [experience.session.open, motionState, reduceMotion]);

  const showPanel = motionState !== "unmounted";

  return (
    <div className="assistant-widget">
      {showPanel ? (
        <AssistantPanel
          motionState={motionState}
          onClose={experience.close}
          session={experience.session}
        />
      ) : null}
      {showLauncher ? (
        <AssistantLauncher
          isOpen={experience.session.open}
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
