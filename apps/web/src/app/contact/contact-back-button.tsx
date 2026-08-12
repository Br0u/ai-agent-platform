"use client";

import { useRouter } from "next/navigation";

type NavigationHistory = {
  currentEntry?: { index: number };
  entries?: () => { index: number; url: string }[];
};

export function ContactBackButton() {
  const router = useRouter();

  function goBack() {
    const navigation = (window as Window & { navigation?: NavigationHistory })
      .navigation;
    const currentIndex = navigation?.currentEntry?.index;
    const previousEntry =
      typeof currentIndex === "number"
        ? navigation
            ?.entries?.()
            .find((entry) => entry.index === currentIndex - 1)
        : undefined;

    try {
      const source = new URL(previousEntry?.url ?? document.referrer);
      if (source.origin === window.location.origin) {
        window.history.back();
        return;
      }
    } catch {
      // An empty or invalid referrer is a direct visit.
    }

    router.replace("/");
  }

  return (
    <button type="button" aria-label="返回上一个浏览页面" onClick={goBack}>
      ← 返回上一步
    </button>
  );
}
