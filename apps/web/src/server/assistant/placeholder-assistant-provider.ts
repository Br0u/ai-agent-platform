import type {
  AssistantPresetQuestion,
  AssistantRequest,
  AssistantSuccessResponse,
} from "@/features/assistant/assistant-contract";
import { isAssistantPresetQuestion } from "@/features/assistant/assistant-contract";
import type { AssistantProvider } from "./assistant-provider";

const REPLIES: Record<
  AssistantPresetQuestion,
  Omit<AssistantSuccessResponse, "mode">
> = {
  "如何开始了解平台？": {
    message: "你可以从快速开始文档了解平台结构和使用入口。",
    suggestedActions: [{ label: "查看快速开始", href: "/docs#quick-start" }],
  },
  "如何获取部署支持？": {
    message: "当前可通过商务咨询提交部署需求，由相关人员进一步确认。",
    suggestedActions: [{ label: "联系商务", href: "/contact" }],
  },
  "如何提交产品问题？": {
    message: "你可以前往客户支持页面查看问题提交入口。",
    suggestedActions: [{ label: "前往客户支持", href: "/support" }],
  },
};

const GENERIC_REPLY: Omit<AssistantSuccessResponse, "mode"> = {
  message: "AI 服务尚未接入。你可以先查看帮助中心或联系商务顾问。",
  suggestedActions: [
    { label: "帮助中心", href: "/help" },
    { label: "商务咨询", href: "/contact" },
  ],
};

export class PlaceholderAssistantProvider implements AssistantProvider {
  async reply(request: AssistantRequest): Promise<AssistantSuccessResponse> {
    const reply = isAssistantPresetQuestion(request.message)
      ? REPLIES[request.message]
      : GENERIC_REPLY;
    return {
      mode: "placeholder",
      ...reply,
    };
  }
}

export const placeholderAssistantProvider = new PlaceholderAssistantProvider();
