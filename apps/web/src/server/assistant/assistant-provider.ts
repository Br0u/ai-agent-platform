export type AssistantAction = {
  label: string;
  href: string;
};

export type AssistantReply = {
  mode: "placeholder";
  message: string;
  suggestedActions: AssistantAction[];
};

export interface AssistantProvider {
  reply(message: string): Promise<AssistantReply>;
}

const PRESET_REPLIES: Record<string, Omit<AssistantReply, "mode">> = {
  "如何开始了解平台？": {
    message: "你可以先查看快速开始文档，了解平台的核心能力和使用流程。",
    suggestedActions: [{ label: "快速开始", href: "/docs#quick-start" }],
  },
  "如何获取部署支持？": {
    message: "你可以联系商务顾问，说明部署环境、规模和所需能力。",
    suggestedActions: [{ label: "商务咨询", href: "/contact" }],
  },
  "如何提交产品问题？": {
    message: "你可以前往客户支持页面提交产品问题和相关信息。",
    suggestedActions: [{ label: "客户支持", href: "/support" }],
  },
};

const GENERIC_REPLY: AssistantReply = {
  mode: "placeholder",
  message: "AI 服务尚未接入。你可以先查看帮助中心或联系商务顾问。",
  suggestedActions: [
    { label: "帮助中心", href: "/help" },
    { label: "商务咨询", href: "/contact" },
  ],
};

export class PlaceholderAssistantProvider implements AssistantProvider {
  async reply(message: string): Promise<AssistantReply> {
    const preset = PRESET_REPLIES[message];
    return preset === undefined
      ? GENERIC_REPLY
      : { mode: "placeholder", ...preset };
  }
}

export const placeholderAssistantProvider = new PlaceholderAssistantProvider();
