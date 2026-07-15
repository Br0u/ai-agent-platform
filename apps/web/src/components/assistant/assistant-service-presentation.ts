import type { AssistantStatusResponse } from "@/features/assistant/assistant-contract";

type AssistantServicePresentationInput = {
  serviceState: AssistantStatusResponse;
  hasResolvedServiceState: boolean;
  refreshingServiceState: boolean;
};

export function getAssistantServicePresentation({
  serviceState,
  hasResolvedServiceState,
  refreshingServiceState,
}: AssistantServicePresentationInput) {
  if (refreshingServiceState) {
    return { label: "正在刷新服务状态", compactLabel: "状态刷新中" };
  }
  if (!hasResolvedServiceState) {
    return { label: "正在检查服务状态", compactLabel: "状态检查中" };
  }
  if (serviceState.capability === "degraded" || !serviceState.live) {
    return {
      label: "基础服务暂不可用",
      compactLabel: "基础服务暂不可用",
    };
  }
  if (serviceState.capability === "placeholder" && serviceState.ready) {
    return { label: "模型尚未配置", compactLabel: "模型尚未配置" };
  }
  if (serviceState.capability === "available" && serviceState.ready) {
    return { label: "服务已就绪", compactLabel: "服务已就绪" };
  }
  return { label: "服务未就绪", compactLabel: "服务未就绪" };
}
