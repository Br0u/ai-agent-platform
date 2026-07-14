import { ModuleDetailPage } from "@/components/module-detail";
import { officeAgents } from "@/components/product-content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "办公智能体 - 企业级应用矩阵 | AI Agent Platform",
  description:
    "企业级办公智能体矩阵，涵盖公文写作、投标辅助、合同审核与智能会议等深度场景，提供开箱即用的 AI 提效能力。",
};

export default function OfficeAgentPage() {
  // 将 officeAgents 数组 (包含公文、投标、合同、会议四个助手) 映射为 PAI 风格所需的数据结构
  const officeAgentModuleData = {
    code: "OA1",
    name: "Office Agent",
    title: "办公智能体矩阵",
    description:
      "基于大模型的企业级办公智能体矩阵，覆盖公文写作、招投标、合同审核与智能会议四大高频业务场景，全面提升企业运转效率。",
    // 提取四大核心能力用于顶部 4 列矩阵
    capabilities: [
      "法定公文全流程写作与合规校审",
      "多模态技术标全流程智能撰写",
      "合同风险智能三级分类与审查",
      "会议全流程管理与纪要自动生成",
    ],
    // 留空，我们将把四个助手的详情放到 guide 里面，通过 ModuleDetailPage 的交替布局展示
    scenarios: [],
    // 将四个助手映射到交替的左右图文布局中
    guide: officeAgents.map((agent) => ({
      step: agent.name,
      description: `${agent.description} ${agent.detailDescription} (推荐模型: ${agent.model})`,
    })),
    // 模拟的动态新闻卡片
    relatedDocs: [
      {
        title: "公文写作助手模板库扩充",
        href: "/docs#office",
      },
      {
        title: "合同审核支持自定义审查清单",
        href: "/docs#office",
      },
    ],
    href: "/product/office-agent",
  };

  // 强制类型转换为 any 以避开严格的只读数组类型校验，因为我们构造的是兼容的数据形态
  return (
    <ModuleDetailPage
      moduleData={
        officeAgentModuleData as unknown as React.ComponentProps<
          typeof ModuleDetailPage
        >["moduleData"]
      }
    />
  );
}
