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
  {
    label: "产品",
    href: "/product",
    children: [
      {
        label: "产品中心",
        items: [
          ["产品介绍", "/product#overview"],
          ["产品矩阵", "/product#modules"],
        ],
      },
      {
        label: "核心模块",
        items: [
          ["AI Agent Studio", "/product/agent-studio"],
          ["Knowledge Base", "/product/knowledge-base"],
          ["Workflow", "/product/workflow"],
          ["Model Gateway", "/product/model-gateway"],
          ["Agent Runtime", "/product/agent-runtime"],
          ["Observability", "/product/observability"],
        ],
      },
      {
        label: "版本",
        items: [
          ["版本列表", "/releases"],
          ["Release Note", "/releases#release-notes"],
          ["Roadmap", "/roadmap"],
        ],
      },
    ],
  },
  {
    label: "文档",
    href: "/docs",
    children: [
      {
        label: "落地文档",
        items: [
          ["快速开始", "/docs#quick-start"],
          ["部署指南", "/docs#deployment"],
          ["升级手册", "/docs#upgrade"],
          ["运维手册", "/docs#operations"],
        ],
      },
      {
        label: "开发与适配",
        items: [
          ["API 文档", "/docs#api"],
          ["功能手册", "/docs#features"],
          ["GPU / 硬件适配", "/docs#hardware"],
          ["常见问题 FAQ", "/docs#faq"],
        ],
      },
    ],
  },
  {
    label: "下载",
    href: "/downloads",
    children: [
      {
        label: "安装与镜像",
        items: [
          ["最新版本", "/downloads#latest"],
          ["Linux / Windows 安装包", "/downloads#desktop"],
          ["ARM / x86 安装包", "/downloads#architecture"],
          ["Docker / Helm", "/downloads#containers"],
        ],
      },
      {
        label: "离线与工具",
        items: [
          ["离线安装包", "/downloads#offline"],
          ["SDK 工具包", "/downloads#sdk"],
        ],
      },
    ],
  },
  {
    label: "OpenLab",
    href: "/openlab",
    children: [
      {
        label: "试用授权",
        items: [
          ["试用申请", "/openlab#trial"],
          ["实名认证", "/openlab#identity"],
          ["License 获取指引", "/openlab#license-guide"],
        ],
      },
    ],
  },
  {
    label: "兼容性",
    href: "/compatibility",
    children: [
      {
        label: "环境适配",
        items: [
          ["硬件配置要求", "/compatibility#hardware"],
          ["GPU 适配列表", "/compatibility#gpu"],
          ["操作系统兼容", "/compatibility#os"],
          ["浏览器兼容", "/compatibility#browser"],
          ["依赖组件兼容", "/compatibility#dependencies"],
        ],
      },
    ],
  },
  {
    label: "Marketplace",
    href: "/marketplace",
    children: [
      {
        label: "资源类型",
        items: [
          ["Agent 应用", "/marketplace#agent"],
          ["Workflow 工作流", "/marketplace#workflow"],
          ["插件工具", "/marketplace#plugin"],
          ["Prompt 模板", "/marketplace#prompt"],
          ["知识库模板", "/marketplace#knowledge-base"],
        ],
      },
    ],
  },
  {
    label: "支持",
    href: "/support",
    children: [
      {
        label: "服务入口",
        items: [
          ["帮助中心", "/help"],
          ["工单提交", "/support#tickets"],
          ["Bug 反馈", "/support#bug"],
          ["社群支持", "/support#community"],
          ["商务咨询", "/contact"],
        ],
      },
    ],
  },
  {
    label: "资讯",
    href: "/blog",
    children: [
      {
        label: "内容分类",
        items: [
          ["版本更新", "/blog#releases"],
          ["技术教程", "/blog#tutorial"],
          ["行业案例", "/cases"],
          ["产品动态", "/blog#product"],
        ],
      },
    ],
  },
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
    label: "产品与版本",
    items: [
      ["产品", "/product"],
      ["版本列表", "/releases"],
      ["Roadmap", "/roadmap"],
    ],
  },
  {
    label: "文档与部署",
    items: [
      ["文档", "/docs"],
      ["部署指南", "/docs#deployment"],
      ["兼容性", "/compatibility"],
    ],
  },
  {
    label: "Marketplace 与资讯",
    items: [
      ["Marketplace", "/marketplace"],
      ["资讯", "/blog"],
      ["客户案例", "/cases"],
    ],
  },
  {
    label: "支持与商务联系",
    items: [
      ["支持", "/support"],
      ["帮助中心", "/help"],
      ["商务咨询", "/contact"],
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

const expectUniqueTargets = (items: readonly LinkLike[]) => {
  const hrefs = items.filter((item) => !item.action).map((item) => item.href);

  expect(new Set(hrefs).size).toBe(hrefs.length);
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

  it("marks external download and OpenLab capabilities as placeholders", () => {
    for (const label of ["下载", "OpenLab"]) {
      const parent = portalNavigation.find((item) => item.label === label);

      expect(parent?.status).toBe("placeholder");
      for (const child of parent?.children.flatMap((group) => group.items) ??
        []) {
        expect(child.status).toBe("placeholder");
      }
    }

    for (const label of ["工单提交", "社群支持"]) {
      const item = flattenPortal().find((link) => link.label === label);
      expect(item?.status).toBe("placeholder");
    }
  });

  it("marks document, compatibility, Marketplace and news children as scaffold", () => {
    for (const label of ["文档", "兼容性", "Marketplace", "资讯"]) {
      const parent = portalNavigation.find((item) => item.label === label);

      expect(parent).toBeDefined();
      for (const child of parent?.children.flatMap((group) => group.items) ??
        []) {
        expect(child.status).toBe("scaffold");
      }
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
  it("preserves the exact five groups and all 22 items", () => {
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
  it("preserves the exact four unique destination groups", () => {
    expect(
      footerNavigation.map((group) => ({
        label: group.label,
        items: linkPairs(group.items),
      })),
    ).toEqual(expectedFooter);
  });
});

describe("navigation targets", () => {
  it("uses unique rooted internal hrefs and keeps actions href-free", () => {
    const completeMenus = [
      flattenPortal(),
      flattenSidebar(consoleNavigation),
      flattenSidebar(adminNavigation),
      flattenFooter(),
    ];

    for (const menu of completeMenus) {
      expectInternalTargets(menu);
      expectUniqueTargets(menu);
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
      "/product": [
        { id: "overview", label: "产品介绍", status: undefined },
        { id: "modules", label: "产品矩阵", status: undefined },
      ],
      "/releases": [
        { id: "release-notes", label: "Release Note", status: undefined },
      ],
      "/docs": [
        { id: "quick-start", label: "快速开始", status: "scaffold" },
        { id: "deployment", label: "部署指南", status: "scaffold" },
        { id: "upgrade", label: "升级手册", status: "scaffold" },
        { id: "operations", label: "运维手册", status: "scaffold" },
        { id: "api", label: "API 文档", status: "scaffold" },
        { id: "features", label: "功能手册", status: "scaffold" },
        { id: "hardware", label: "GPU / 硬件适配", status: "scaffold" },
        { id: "faq", label: "常见问题 FAQ", status: "scaffold" },
      ],
      "/downloads": [
        { id: "latest", label: "最新版本", status: "placeholder" },
        {
          id: "desktop",
          label: "Linux / Windows 安装包",
          status: "placeholder",
        },
        {
          id: "architecture",
          label: "ARM / x86 安装包",
          status: "placeholder",
        },
        {
          id: "containers",
          label: "Docker / Helm",
          status: "placeholder",
        },
        { id: "offline", label: "离线安装包", status: "placeholder" },
        { id: "sdk", label: "SDK 工具包", status: "placeholder" },
      ],
      "/openlab": [
        { id: "trial", label: "试用申请", status: "placeholder" },
        { id: "identity", label: "实名认证", status: "placeholder" },
        {
          id: "license-guide",
          label: "License 获取指引",
          status: "placeholder",
        },
      ],
      "/compatibility": [
        { id: "hardware", label: "硬件配置要求", status: "scaffold" },
        { id: "gpu", label: "GPU 适配列表", status: "scaffold" },
        { id: "os", label: "操作系统兼容", status: "scaffold" },
        { id: "browser", label: "浏览器兼容", status: "scaffold" },
        {
          id: "dependencies",
          label: "依赖组件兼容",
          status: "scaffold",
        },
      ],
      "/marketplace": [
        { id: "agent", label: "Agent 应用", status: "scaffold" },
        { id: "workflow", label: "Workflow 工作流", status: "scaffold" },
        { id: "plugin", label: "插件工具", status: "scaffold" },
        { id: "prompt", label: "Prompt 模板", status: "scaffold" },
        {
          id: "knowledge-base",
          label: "知识库模板",
          status: "scaffold",
        },
      ],
      "/support": [
        { id: "tickets", label: "工单提交", status: "placeholder" },
        { id: "bug", label: "Bug 反馈", status: undefined },
        { id: "community", label: "社群支持", status: "placeholder" },
      ],
      "/blog": [
        { id: "releases", label: "版本更新", status: "scaffold" },
        { id: "tutorial", label: "技术教程", status: "scaffold" },
        { id: "product", label: "产品动态", status: "scaffold" },
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

  it("keeps duplicate hash sources consistent across navigation surfaces", () => {
    const completeMenus = [
      flattenPortal(),
      flattenSidebar(consoleNavigation),
      flattenSidebar(adminNavigation),
      flattenFooter(),
    ];
    const sourcesByTarget = new Map<
      string,
      Array<{ label: string; status: LinkLike["status"] }>
    >();

    for (const item of completeMenus.flat()) {
      if (!item.href) continue;

      const url = new URL(item.href, "https://local.invalid");
      if (!url.hash) continue;

      const target = `${url.pathname}#${decodeURIComponent(url.hash.slice(1))}`;
      const sources = sourcesByTarget.get(target) ?? [];
      sources.push({ label: item.label, status: item.status });
      sourcesByTarget.set(target, sources);
    }

    for (const [target, sources] of sourcesByTarget) {
      if (sources.length < 2) continue;

      expect(sources, target).toEqual(sources.map(() => sources[0]));
    }
  });
});
