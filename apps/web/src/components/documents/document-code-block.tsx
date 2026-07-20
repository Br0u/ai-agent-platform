"use client";

import { useState } from "react";

type CopyStatus = "idle" | "copied" | "failed";

export function DocumentCodeBlock({ code }: { code: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="document-code-block">
      <button type="button" onClick={copyCode} aria-label="复制代码">
        复制
      </button>
      <pre>
        <code>{code}</code>
      </pre>
      <span className="document-code-block__status" role="status">
        {status === "copied"
          ? "代码已复制。"
          : status === "failed"
            ? "复制失败，请手动选择代码。"
            : ""}
      </span>
    </div>
  );
}
