"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import "./directory-progress.css";

type PageMetrics = {
  innerHeight: number;
  scrollHeight: number;
  scrollY: number;
};

type AnchorOptions = {
  atBottom: boolean;
  atTop?: boolean;
  headerOffset: number;
};

type DirectoryProgressState = {
  activeHash: string;
  progress: number;
};

export function calculatePageProgress({
  innerHeight,
  scrollHeight,
  scrollY,
}: PageMetrics) {
  const scrollRange = scrollHeight - innerHeight;

  if (scrollRange <= 0) return 0;

  return Math.min(1, Math.max(0, scrollY / scrollRange));
}

function getAnchors(anchorIds: readonly string[]) {
  const anchors = new Map<string, HTMLElement>();

  for (const id of anchorIds) {
    const anchor = document.getElementById(id);
    if (anchor) anchors.set(id, anchor);
  }

  return [...anchors.entries()].sort(([, first], [, second]) => {
    const position = first.compareDocumentPosition(second);
    return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
}

export function selectActiveAnchor(
  anchorIds: readonly string[],
  { atBottom, atTop = false, headerOffset }: AnchorOptions,
) {
  const anchors = getAnchors(anchorIds);

  if (anchors.length === 0) return "";
  if (atTop) return anchors[0][0];
  if (atBottom) return anchors.at(-1)?.[0] ?? "";

  let activeId = anchors[0][0];

  for (const [id, anchor] of anchors) {
    if (anchor.getBoundingClientRect().top <= headerOffset) activeId = id;
  }

  return activeId;
}

function getScrollHeight() {
  return Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
  );
}

function getHeaderOffset() {
  return document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
}

export function useDirectoryProgress(
  anchorIds: readonly string[],
): DirectoryProgressState {
  const key = useMemo(
    () => [...new Set(anchorIds.filter(Boolean))].join("\u0000"),
    [anchorIds],
  );
  const ids = useMemo(() => (key ? key.split("\u0000") : []), [key]);
  const [state, setState] = useState<DirectoryProgressState>({
    activeHash: "",
    progress: 0,
  });

  useEffect(() => {
    let frame: number | undefined;
    const update = () => {
      const scrollHeight = getScrollHeight();
      const scrollY = window.scrollY;
      const scrollRange = scrollHeight - window.innerHeight;
      const activeId = selectActiveAnchor(ids, {
        atBottom: scrollRange > 0 && Math.abs(scrollRange - scrollY) <= 1,
        atTop: scrollY <= 0,
        headerOffset: getHeaderOffset(),
      });
      const next = {
        activeHash: activeId ? `#${activeId}` : "",
        progress: calculatePageProgress({
          innerHeight: window.innerHeight,
          scrollHeight,
          scrollY,
        }),
      };

      setState((current) =>
        current.activeHash === next.activeHash &&
        current.progress === next.progress
          ? current
          : next,
      );
    };
    const scheduleUpdate = () => {
      if (frame !== undefined) return;
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        update();
      });
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(scheduleUpdate);
    resizeObserver?.observe(document.documentElement);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      resizeObserver?.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [ids]);

  return state;
}

export function DirectoryProgressRail({
  collapsed,
  progress,
}: {
  collapsed: boolean;
  progress: number;
}) {
  if (!collapsed) return null;

  const dotTop = `${Math.round(Math.min(1, Math.max(0, progress)) * 10000) / 100}%`;

  return (
    <span
      aria-hidden="true"
      className="directory-progress-rail"
      data-testid="directory-progress-rail"
    >
      <span className="directory-progress-rail__track">
        <span
          className="directory-progress-rail__dot"
          data-testid="directory-progress-dot"
          style={{ top: dotTop } as CSSProperties}
        />
      </span>
    </span>
  );
}
