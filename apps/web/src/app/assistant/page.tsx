import type { Metadata } from "next";
import { AssistantWorkspace } from "@/components/assistant/assistant-workspace";
import { readSafeAssistantRuntimeStatus } from "@/server/assistant/assistant-runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "码多多 · AI Agent Platform",
  description: "通过码多多获得公开、匿名的网页端通用 AI 助手服务。",
};

export default async function AssistantPage() {
  const serviceState = await readSafeAssistantRuntimeStatus();
  return (
    <AssistantWorkspace
      initialServiceState={{
        version: "1",
        requestId: crypto.randomUUID(),
        ...serviceState,
      }}
    />
  );
}
