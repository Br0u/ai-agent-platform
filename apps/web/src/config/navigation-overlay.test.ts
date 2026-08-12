import { describe, expect, it } from "vitest";
import { footerNavigation, portalNavigation } from "./navigation";

const pairs = (items: readonly { label: string; href?: string }[]) =>
  items.map(({ label, href }) => [label, href]);

describe("prototype navigation overlay", () => {
  it("replaces the public parent navigation with the prototype order", () => {
    expect(pairs(portalNavigation)).toEqual([
      ["首页", "/"],
      ["产品", "/product"],
      ["解决方案", "/solutions"],
      ["下载中心", "/downloads"],
      ["合作伙伴", "/partners"],
      ["价格与服务", "/pricing"],
    ]);
  });

  it("uses the prototype product, solution, download and partner groups", () => {
    const groups = (label: string) =>
      portalNavigation
        .find((item) => item.label === label)
        ?.children.map((section) => ({
          label: section.label,
          items: pairs(section.items),
        }));

    expect(groups("产品")).toEqual([
      {
        label: "智能体中心",
        items: [
          ["知识智能体", "/product/agent-knowledge"],
          ["数据智能体", "/product/data-agent"],
          ["视频智能体", "/product/agent-video"],
          ["流程编排智能体", "/product/agent-orchestration"],
        ],
      },
      {
        label: "模型中心",
        items: [
          ["模型花园", "/product/model-assets"],
          ["模型训练", "/product/model-training"],
          ["模型评估", "/product/model-evaluation"],
          ["模型部署", "/product/model-deploy"],
          ["任务中心", "/product/model-task-center"],
        ],
      },
      {
        label: "行业应用中心",
        items: [
          ["通用文本写作", "/product/app-writing"],
          ["投标智能助手", "/product/app-bidding"],
          ["合同智能审查", "/product/app-contract"],
        ],
      },
      {
        label: "编程中心",
        items: [
          ["项目管理", "/product/coding-project"],
          ["会话管理", "/product/coding-session"],
          ["移动接入", "/product/coding-mobile"],
          ["编程规范", "/product/coding-standard"],
        ],
      },
      {
        label: "技能中心",
        items: [
          ["编程类技能", "/product/skills-programming"],
          ["应用类技能", "/product/skills-application"],
          ["办公类技能", "/product/skills-office"],
        ],
      },
      {
        label: "安全中心",
        items: [
          ["用户管理", "/product/governance#gov-users"],
          ["角色管理", "/product/governance#gov-roles"],
          ["菜单管理", "/product/governance#gov-menu"],
          ["行级权限", "/product/governance#gov-permission"],
        ],
      },
      {
        label: "独立产品中心",
        items: [
          ["码多多 2.0", "/product/code-agent"],
          ["AIPPT", "/product/aippt"],
          ["AISHREK", "/product/aishrek"],
        ],
      },
    ]);

    expect(groups("解决方案")).toEqual([
      {
        label: "通用场景方案",
        items: [
          ["基础设施与模型工程", "/solutions#solution-common-scenes"],
          ["知识与数据智能", "/solutions#solution-common-scenes"],
          ["智能体与业务应用", "/solutions#solution-common-scenes"],
        ],
      },
      {
        label: "行业解决方案",
        items: [
          ["政务", "/solutions#solution-industries-overview"],
          ["金融", "/solutions#solution-industries-overview"],
          ["医疗", "/solutions#solution-industries-overview"],
          ["企业智能化", "/solutions#solution-industries-overview"],
        ],
      },
      {
        label: "实践案例",
        items: [
          ["按行业查看", "/solutions#solution-cases-overview"],
          ["按业务场景查看", "/solutions#solution-cases-overview"],
        ],
      },
    ]);
    expect(groups("下载中心")).toEqual([
      {
        label: "产品资料",
        items: [
          [
            "快速了解元启平台与码多多 2.0 的产品定位、核心能力与产品价值。",
            "/downloads#dl-materials",
          ],
        ],
      },
      {
        label: "软件资源下载",
        items: [
          [
            "获取码多多 2.0 客户端安装包与版本信息，进入安装体验。",
            "/downloads#dl-software",
          ],
        ],
      },
      {
        label: "产品部署文档",
        items: [
          [
            "安装部署与使用说明，降低产品体验门槛。",
            "/downloads#dl-deployment",
          ],
        ],
      },
      {
        label: "白皮书与技术资料",
        items: [
          [
            "企业 AI、大模型与智能体相关专业资料，增强产品可信度。",
            "/downloads#dl-whitepapers",
          ],
        ],
      },
    ]);
    expect(groups("合作伙伴")).toEqual([
      {
        label: "商业模式",
        items: [
          ["合作模式", "/partners?view=business#pb-modes"],
          ["分润政策", "/partners?view=business#pb-tiers"],
          ["伙伴权益", "/partners?view=business#pb-benefits"],
        ],
      },
      {
        label: "伙伴政策",
        items: [
          ["伙伴类型与准入条件", "/partners?view=policy#pp-types"],
          ["认证体系", "/partners?view=policy#pp-cert"],
          ["支持资源", "/partners?view=policy#pp-resources"],
        ],
      },
      {
        label: "伙伴培训",
        items: [
          ["培训体系", "/partners?view=training#pt-system"],
          ["课程体系", "/partners?view=training#pt-courses"],
          ["认证路径", "/partners?view=training#pt-path"],
          ["学习资源", "/partners?view=training#pt-resources"],
        ],
      },
      {
        label: "合作对接",
        items: [
          ["成为合作伙伴", "/partners?view=become#pbc-hero"],
          ["联系生态负责人", "/partners?view=overview#partner-contact"],
        ],
      },
    ]);
  });

  it("publishes only reachable migrated public footer destinations", () => {
    expect(
      footerNavigation.map((group) => ({
        label: group.label,
        items: pairs(group.items),
      })),
    ).toEqual([
      {
        label: "产品中心",
        items: [
          ["产品", "/product"],
          ["智能体中心", "/product/agents"],
          ["模型中心", "/product/model"],
          ["行业应用中心", "/product/applications"],
          ["编程中心", "/product/coding"],
          ["技能中心", "/product/skills"],
          ["安全中心", "/product/governance"],
          ["独立产品中心", "/product/standalone"],
        ],
      },
      {
        label: "业务服务",
        items: [
          ["解决方案", "/solutions"],
          ["下载中心", "/downloads"],
          ["合作伙伴", "/partners"],
          ["价格与服务", "/pricing"],
        ],
      },
      {
        label: "联系与体验",
        items: [
          ["联系我们", "/contact"],
          ["申请体验", "/trial"],
        ],
      },
    ]);
  });
});
