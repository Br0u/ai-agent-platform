import type { Metadata } from "next";
import { AssistantWorkspace } from "@/components/assistant/assistant-workspace";
import { readSafeAssistantRuntimeStatus } from "@/server/assistant/assistant-runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI 助理 · AI Agent Platform",
  description: "通过 M 企业助理查找平台产品、部署、兼容性与服务入口。",
};

export default async function AssistantPage() {
  const serviceState = await readSafeAssistantRuntimeStatus();
  return (
    <AssistantWorkspace
      serviceState={{
        version: "1",
        requestId: crypto.randomUUID(),
        ...serviceState,
      }}
    />
  );
}
