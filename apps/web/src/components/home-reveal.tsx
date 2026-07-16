"use client";

import { useEffect } from "react";

const REVEAL_SELECTOR = '[data-home-reveal="true"]';
const VISIBLE_CLASS = "is-home-visible";
const READY_CLASS = "home-reveal-ready";

export function HomeRevealObserver() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("main.home");

    if (!root) {
      return;
    }

    const targets = Array.from(
      root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR),
    );
    const reveal = (target: Element) => target.classList.add(VISIBLE_CLASS);

    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof window.IntersectionObserver !== "function"
    ) {
      targets.forEach(reveal);
      return;
    }

    root.classList.add(READY_CLASS);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          reveal(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -96px 0px", threshold: 0.05 },
    );
    const viewportBottom = window.innerHeight - 96;

    targets.forEach((target) => {
      const rect = target.getBoundingClientRect();

      if (rect.top <= viewportBottom && rect.bottom >= 0) {
        reveal(target);
        return;
      }

      observer.observe(target);
    });

    return () => {
      observer.disconnect();
      root.classList.remove(READY_CLASS);
    };
  }, []);

  return null;
}
