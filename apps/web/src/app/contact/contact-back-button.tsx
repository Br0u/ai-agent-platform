"use client";

export function ContactBackButton() {
  return (
    <button
      type="button"
      aria-label="返回上一个浏览页面"
      onClick={() => window.history.back()}
    >
      ← 返回上一步
    </button>
  );
}
