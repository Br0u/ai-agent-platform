import type { Metadata } from "next";
import { AssistantWorkspace } from "@/components/assistant/assistant-workspace";
import { createPlaceholderAssistantStatus } from "@/server/assistant/assistant-status";

export const metadata: Metadata = {
  title: "AI 助理 · AI Agent Platform",
  description: "通过 M 企业助理查找平台产品、部署、兼容性与服务入口。",
};

export default function AssistantPage() {
  return (
    <AssistantWorkspace
      serviceState={createPlaceholderAssistantStatus("assistant-workspace")}
    />
  );
}
