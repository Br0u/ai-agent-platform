import { describe, expect, it } from "vitest";
import {
  adminNavigation,
  consoleNavigation,
  footerNavigation,
  navigationAnchorsForPath,
  portalNavigation,
} from "./navigation";
import { matchRoute } from "./routes";

const expectedPortal = [
  { label: "首页", href: "/", children: [] },
  {
    label: "产品",
    href: "/product",
    children: [
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
    ],
  },
  {
    label: "解决方案",
    href: "/solutions",
    children: [
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
    ],
  },
  {
    label: "下载中心",
    href: "/downloads",
    children: [
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
    ],
  },
  {
    label: "合作伙伴",
    href: "/partners",
    children: [
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
    ],
  },
  { label: "价格与服务", href: "/pricing", children: [] },
] as const;

const expectedConsoleGroups = [
  {
    label: "工作台",
    items: [
      ["控制台首页", "/console"],
      ["账号资料", "/console/profile"],
    ],
  },
  {
    label: "企业服务",
    items: [
      ["我的 License", "/console/licenses"],
      ["我的下载", "/console/downloads"],
      ["OpenLab 进度", "/console/openlab"],
      ["我的工单", "/console/tickets"],
    ],
  },
  {
    label: "开发与资源",
    items: [
      ["我的 Agent / 模板", "/console/resources"],
      ["API 密钥", "/console/api-keys"],
    ],
  },
  {
    label: "组织与财务",
    items: [
      ["团队管理", "/console/team"],
      ["订单与账单", "/console/billing"],
    ],
  },
] as const;

const expectedCmsGroups = [
  {
    label: "运营概览",
    items: [["运营后台首页", "/admin"]],
  },
  {
    label: "AI Operations",
    items: [["AI 助理", "/admin/assistant"]],
  },
  {
    label: "站点内容",
    items: [
      ["首页配置", "/admin/site#homepage"],
      ["导航管理", "/admin/navigation"],
      ["产品内容", "/admin/products"],
      ["版本与 Release Note", "/admin/releases"],
      ["文档管理", "/admin/docs"],
      ["Blog / 产品动态", "/admin/blog"],
      ["客户案例", "/admin/cases"],
      ["FAQ", "/admin/faq"],
      ["兼容矩阵", "/admin/compatibility"],
      ["Marketplace", "/admin/marketplace"],
    ],
  },
  {
    label: "客户运营",
    items: [
      ["客户注册审核", "/admin/registrations"],
      ["OpenLab 申请审核", "/admin/openlab"],
      ["License 管理", "/admin/licenses"],
      ["工单管理", "/admin/tickets"],
    ],
  },
  {
    label: "数据",
    items: [
      ["门户访问", "/admin/analytics#portal"],
      ["下载与申请统计", "/admin/analytics#requests"],
      ["转化数据", "/admin/analytics#conversion"],
    ],
  },
  {
    label: "系统管理",
    items: [
      ["用户管理", "/admin/users"],
      ["角色权限", "/admin/roles"],
      ["操作审计", "/admin/audit-logs"],
      ["站点设置", "/admin/site#settings"],
    ],
  },
] as const;

const expectedFooter = [
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
] as const;

type LinkLike = {
  label: string;
  href?: string;
  action?: "logout";
  status?: "live" | "scaffold" | "placeholder";
};

const linkPairs = (items: readonly LinkLike[]) =>
  items.map(({ label, href }) => [label, href]);

const flattenPortal = () => [
  ...portalNavigation,
  ...portalNavigation.flatMap((parent) =>
    parent.children.flatMap((section) => section.items),
  ),
];

const flattenSidebar = (navigation: typeof consoleNavigation) => [
  ...navigation.groups.flatMap((group) => group.items),
  ...navigation.utilities,
];

const flattenFooter = () => footerNavigation.flatMap((group) => group.items);

const expectInternalTargets = (items: readonly LinkLike[]) => {
  for (const item of items) {
    if (item.action) {
      expect(item.href).toBeUndefined();
      continue;
    }

    expect(item.href).toMatch(/^\/(?!\/)/);
  }
};

describe("portalNavigation", () => {
  it("preserves the exact parent, section, child label and href order", () => {
    expect(
      portalNavigation.map(({ label, href }) => ({ label, href })),
    ).toEqual(expectedPortal.map(({ label, href }) => ({ label, href })));

    expect(
      portalNavigation.map((parent) =>
        parent.children.map((section) => ({
          label: section.label,
          items: linkPairs(section.items),
        })),
      ),
    ).toEqual(
      expectedPortal.map((parent) =>
        parent.children.map((section) => ({
          label: section.label,
          items: section.items,
        })),
      ),
    );
  });

  it("opens the existing data agent product entry", () => {
    const dataAgent = portalNavigation
      .flatMap((parent) => parent.children)
      .flatMap((section) => section.items)
      .find(
        (item) =>
          item.label === "数据智能体" && item.href === "/product/data-agent",
      );

    expect(dataAgent).toBeDefined();
    expect(dataAgent?.status).toBeUndefined();
  });

  it("publishes only live migrated public entries", () => {
    for (const item of flattenPortal()) {
      expect(item.status).toBeUndefined();
    }
  });
});

describe("consoleNavigation", () => {
  it("preserves the exact groups, items and utilities", () => {
    expect(
      consoleNavigation.groups.map((group) => ({
        label: group.label,
        items: linkPairs(group.items),
      })),
    ).toEqual(expectedConsoleGroups);

    expect(consoleNavigation.utilities.map((item) => item.label)).toEqual([
      "返回公开门户",
      "帮助与支持",
      "当前账号",
      "退出登录",
    ]);
    expect(linkPairs(consoleNavigation.utilities.slice(0, 3))).toEqual([
      ["返回公开门户", "/"],
      ["帮助与支持", "/support"],
      ["当前账号", "/console/profile#account-menu"],
    ]);
  });

  it("marks unavailable capabilities and enables the wired logout action", () => {
    const placeholderLabels = [
      "我的 License",
      "我的下载",
      "OpenLab 进度",
      "我的工单",
      "API 密钥",
      "团队管理",
      "订单与账单",
    ];

    for (const label of placeholderLabels) {
      const item = flattenSidebar(consoleNavigation).find(
        (link) => link.label === label,
      );
      expect(item?.status).toBe("placeholder");
    }

    expect(consoleNavigation.utilities.at(-1)).toEqual({
      label: "退出登录",
      action: "logout",
      disabled: false,
    });
  });
});

describe("adminNavigation", () => {
  it("preserves the exact groups and items", () => {
    expect(
      adminNavigation.groups.map((group) => ({
        label: group.label,
        items: linkPairs(group.items),
      })),
    ).toEqual(expectedCmsGroups);
    expect(adminNavigation.utilities).toEqual([
      { label: "返回公开门户", href: "/" },
      { label: "退出登录", action: "logout", disabled: false },
    ]);
  });

  it("marks external operations as placeholders and protects admin items", () => {
    for (const label of ["OpenLab 申请审核", "License 管理", "工单管理"]) {
      const item = flattenSidebar(adminNavigation).find(
        (link) => link.label === label,
      );
      expect(item?.status).toBe("placeholder");
    }

    const permissions = Object.fromEntries(
      adminNavigation.groups
        .flatMap((group) => group.items)
        .filter((item) => item.permission)
        .map((item) => [item.label, item.permission]),
    );
    expect(permissions).toEqual({
      运营后台首页: "admin:analytics",
      "AI 助理": "admin:assistant",
      首页配置: "admin:site",
      导航管理: "admin:navigation",
      产品内容: "admin:products",
      "版本与 Release Note": "admin:releases",
      文档管理: "admin:docs",
      "Blog / 产品动态": "admin:blog",
      客户案例: "admin:cases",
      FAQ: "admin:faq",
      兼容矩阵: "admin:compatibility",
      Marketplace: "admin:marketplace",
      客户注册审核: "admin:registrations",
      "OpenLab 申请审核": "admin:registrations",
      "License 管理": "admin:registrations",
      工单管理: "admin:registrations",
      门户访问: "admin:analytics",
      下载与申请统计: "admin:analytics",
      转化数据: "admin:analytics",
      用户管理: "admin:users",
      角色权限: "admin:roles",
      操作审计: "admin:audit",
      站点设置: "admin:site",
    });

    expect(consoleNavigation.utilities.at(-1)).toEqual({
      label: "退出登录",
      action: "logout",
      disabled: false,
    });
  });
});

describe("footerNavigation", () => {
  it("preserves the exact migrated public destination groups", () => {
    expect(
      footerNavigation.map((group) => ({
        label: group.label,
        items: linkPairs(group.items),
      })),
    ).toEqual(expectedFooter);
  });
});

describe("navigation targets", () => {
  it("uses rooted internal hrefs and keeps actions href-free", () => {
    const completeMenus = [
      flattenPortal(),
      flattenSidebar(consoleNavigation),
      flattenSidebar(adminNavigation),
      flattenFooter(),
    ];

    for (const menu of completeMenus) {
      expectInternalTargets(menu);
    }
  });

  it("registers every linked navigation pathname", () => {
    const completeMenus = [
      flattenPortal(),
      flattenSidebar(consoleNavigation),
      flattenSidebar(adminNavigation),
      flattenFooter(),
    ];

    for (const item of completeMenus.flat()) {
      if (!item.href) continue;

      const pathname = new URL(item.href, "https://local.invalid").pathname;
      expect(matchRoute(pathname), `${item.label}: ${pathname}`).toBeDefined();
    }
  });

  it("derives every configured hash target from the navigation sources", () => {
    const expectedAnchors = {
      "/product/governance": [
        { id: "gov-users", label: "用户管理", status: undefined },
        { id: "gov-roles", label: "角色管理", status: undefined },
        { id: "gov-menu", label: "菜单管理", status: undefined },
        { id: "gov-permission", label: "行级权限", status: undefined },
      ],
      "/solutions": [
        {
          id: "solution-common-scenes",
          label: "基础设施与模型工程",
          status: undefined,
        },
        {
          id: "solution-industries-overview",
          label: "政务",
          status: undefined,
        },
        {
          id: "solution-cases-overview",
          label: "按行业查看",
          status: undefined,
        },
      ],
      "/downloads": [
        {
          id: "dl-materials",
          label:
            "快速了解元启平台与码多多 2.0 的产品定位、核心能力与产品价值。",
          status: undefined,
        },
        {
          id: "dl-software",
          label: "获取码多多 2.0 客户端安装包与版本信息，进入安装体验。",
          status: undefined,
        },
        {
          id: "dl-deployment",
          label: "安装部署与使用说明，降低产品体验门槛。",
          status: undefined,
        },
        {
          id: "dl-whitepapers",
          label: "企业 AI、大模型与智能体相关专业资料，增强产品可信度。",
          status: undefined,
        },
      ],
      "/console/profile": [
        { id: "account-menu", label: "当前账号", status: undefined },
      ],
      "/admin/site": [
        { id: "homepage", label: "首页配置", status: undefined },
        { id: "settings", label: "站点设置", status: undefined },
      ],
      "/admin/analytics": [
        { id: "portal", label: "门户访问", status: undefined },
        { id: "requests", label: "下载与申请统计", status: undefined },
        { id: "conversion", label: "转化数据", status: undefined },
      ],
    } as const;

    for (const [pathname, expected] of Object.entries(expectedAnchors)) {
      const anchors = navigationAnchorsForPath(pathname);

      expect(anchors, pathname).toEqual(expected);
      expect(
        new Set(anchors.map((anchor) => anchor.id)).size,
        `${pathname} should have unique IDs`,
      ).toBe(anchors.length);
      for (const anchor of anchors) {
        expect(anchor.id).not.toBe("");
      }
    }
  });

  it("gives every configured hash link a matching pathname and id target", () => {
    const completeMenus = [
      flattenPortal(),
      flattenSidebar(consoleNavigation),
      flattenSidebar(adminNavigation),
      flattenFooter(),
    ];

    for (const item of completeMenus.flat()) {
      if (!item.href) continue;

      const url = new URL(item.href, "https://local.invalid");
      if (!url.hash) continue;

      const id = decodeURIComponent(url.hash.slice(1));
      expect(
        navigationAnchorsForPath(url.pathname).some(
          (anchor) => anchor.id === id,
        ),
        `${item.label}: ${url.pathname}#${id}`,
      ).toBe(true);
    }
  });
});
