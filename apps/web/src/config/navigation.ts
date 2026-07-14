import type {
  NavigationSection,
  NavigationStatus,
  PortalNavigationItem,
  SidebarNavigationConfig,
} from "@ai-agent-platform/ui";

export const portalNavigation: PortalNavigationItem[] = [
  {
    label: "产品",
    href: "/product",
    children: [
      {
        label: "产品矩阵",
        items: [
          { label: "超融合", href: "/product/hci" },
          { label: "元启AI开发平台", href: "/product/tgdataxai" },
          { label: "视觉检索一体机", href: "/product/video-agent" },
          {
            label: "数据智能体",
            href: "/product/data-agent",
            status: "placeholder",
          },
          { label: "智能导办一体机", href: "/product/knowledge-agent" },
          { label: "办公智能体", href: "/product/office-agent" },
          { label: "码多多", href: "/product/code-agent" },
        ],
      },
      {
        label: "核心模块",
        items: [
          { label: "AI Agent Studio", href: "/product/agent-studio" },
          { label: "Knowledge Base", href: "/product/knowledge-base" },
          { label: "Workflow", href: "/product/workflow" },
          { label: "Model Gateway", href: "/product/model-gateway" },
          { label: "Agent Runtime", href: "/product/agent-runtime" },
          { label: "Observability", href: "/product/observability" },
        ],
      },
      {
        label: "版本",
        items: [
          { label: "版本列表", href: "/releases" },
          { label: "Release Note", href: "/releases#release-notes" },
          { label: "Roadmap", href: "/roadmap" },
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
          {
            label: "快速开始",
            href: "/docs/quick-start",
            status: "scaffold",
          },
          {
            label: "部署指南",
            href: "/docs/deployment",
            status: "scaffold",
          },
          {
            label: "升级手册",
            href: "/docs/upgrade",
            status: "scaffold",
          },
          {
            label: "运维手册",
            href: "/docs/operations",
            status: "scaffold",
          },
        ],
      },
      {
        label: "开发与适配",
        items: [
          { label: "API 文档", href: "/docs/api", status: "scaffold" },
          { label: "功能手册", href: "/docs#features", status: "scaffold" },
          {
            label: "GPU / 硬件适配",
            href: "/docs/hardware",
            status: "scaffold",
          },
          {
            label: "常见问题 FAQ",
            href: "/docs/faq",
            status: "scaffold",
          },
        ],
      },
    ],
  },
  {
    label: "下载",
    href: "/downloads",
    status: "placeholder",
    children: [
      {
        label: "安装与镜像",
        items: [
          {
            label: "最新版本",
            href: "/downloads#latest",
            status: "placeholder",
          },
          {
            label: "Linux / Windows 安装包",
            href: "/downloads#desktop",
            status: "placeholder",
          },
          {
            label: "ARM / x86 安装包",
            href: "/downloads#architecture",
            status: "placeholder",
          },
          {
            label: "Docker / Helm",
            href: "/downloads#containers",
            status: "placeholder",
          },
        ],
      },
      {
        label: "离线与工具",
        items: [
          {
            label: "离线安装包",
            href: "/downloads#offline",
            status: "placeholder",
          },
          {
            label: "SDK 工具包",
            href: "/downloads#sdk",
            status: "placeholder",
          },
        ],
      },
    ],
  },
  {
    label: "OpenLab",
    href: "/openlab",
    status: "placeholder",
    children: [
      {
        label: "试用授权",
        items: [
          {
            label: "试用申请",
            href: "/openlab#trial",
            status: "placeholder",
          },
          {
            label: "实名认证",
            href: "/openlab#identity",
            status: "placeholder",
          },
          {
            label: "License 获取指引",
            href: "/openlab#license-guide",
            status: "placeholder",
          },
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
          {
            label: "硬件配置要求",
            href: "/compatibility#hardware",
            status: "scaffold",
          },
          {
            label: "GPU 适配列表",
            href: "/compatibility#gpu",
            status: "scaffold",
          },
          {
            label: "操作系统兼容",
            href: "/compatibility#os",
            status: "scaffold",
          },
          {
            label: "浏览器兼容",
            href: "/compatibility#browser",
            status: "scaffold",
          },
          {
            label: "依赖组件兼容",
            href: "/compatibility#dependencies",
            status: "scaffold",
          },
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
          {
            label: "Agent 应用",
            href: "/marketplace#agent",
            status: "scaffold",
          },
          {
            label: "Workflow 工作流",
            href: "/marketplace#workflow",
            status: "scaffold",
          },
          {
            label: "插件工具",
            href: "/marketplace#plugin",
            status: "scaffold",
          },
          {
            label: "Prompt 模板",
            href: "/marketplace#prompt",
            status: "scaffold",
          },
          {
            label: "知识库模板",
            href: "/marketplace#knowledge-base",
            status: "scaffold",
          },
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
          { label: "帮助中心", href: "/help" },
          {
            label: "工单提交",
            href: "/support#tickets",
            status: "placeholder",
          },
          { label: "Bug 反馈", href: "/support#bug" },
          {
            label: "社群支持",
            href: "/support#community",
            status: "placeholder",
          },
        ],
      },
      {
        label: "商务服务",
        items: [
          { label: "价格计算", href: "/pricing" },
          { label: "商务咨询", href: "/contact" },
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
          {
            label: "版本更新",
            href: "/blog#releases",
            status: "scaffold",
          },
          {
            label: "技术教程",
            href: "/blog#tutorial",
            status: "scaffold",
          },
          { label: "行业案例", href: "/cases", status: "scaffold" },
          {
            label: "产品动态",
            href: "/blog#product",
            status: "scaffold",
          },
        ],
      },
    ],
  },
];

export const consoleNavigation: SidebarNavigationConfig = {
  groups: [
    {
      label: "工作台",
      items: [
        { label: "控制台首页", href: "/console" },
        { label: "账号资料", href: "/console/profile" },
      ],
    },
    {
      label: "企业服务",
      items: [
        {
          label: "我的 License",
          href: "/console/licenses",
          status: "placeholder",
        },
        {
          label: "我的下载",
          href: "/console/downloads",
          status: "placeholder",
        },
        {
          label: "OpenLab 进度",
          href: "/console/openlab",
          status: "placeholder",
        },
        {
          label: "我的工单",
          href: "/console/tickets",
          status: "placeholder",
        },
      ],
    },
    {
      label: "开发与资源",
      items: [
        { label: "我的 Agent / 模板", href: "/console/resources" },
        {
          label: "API 密钥",
          href: "/console/api-keys",
          status: "placeholder",
        },
      ],
    },
    {
      label: "组织与财务",
      items: [
        {
          label: "团队管理",
          href: "/console/team",
          status: "placeholder",
        },
        {
          label: "订单与账单",
          href: "/console/billing",
          status: "placeholder",
        },
      ],
    },
  ],
  utilities: [
    { label: "返回公开门户", href: "/" },
    { label: "帮助与支持", href: "/support" },
    { label: "当前账号", href: "/console/profile#account-menu" },
    {
      label: "退出登录",
      action: "logout",
      disabled: false,
    },
  ],
};

export const adminNavigation: SidebarNavigationConfig = {
  groups: [
    {
      label: "运营概览",
      items: [
        {
          label: "运营后台首页",
          href: "/admin",
          permission: "admin:analytics",
        },
      ],
    },
    {
      label: "AI Operations",
      items: [
        {
          label: "AI 助理",
          href: "/admin/assistant",
          permission: "admin:assistant",
        },
      ],
    },
    {
      label: "站点内容",
      items: [
        {
          label: "首页配置",
          href: "/admin/site#homepage",
          permission: "admin:site",
        },
        {
          label: "导航管理",
          href: "/admin/navigation",
          permission: "admin:navigation",
        },
        {
          label: "产品内容",
          href: "/admin/products",
          permission: "admin:products",
        },
        {
          label: "版本与 Release Note",
          href: "/admin/releases",
          permission: "admin:releases",
        },
        { label: "文档管理", href: "/admin/docs", permission: "admin:docs" },
        {
          label: "Blog / 产品动态",
          href: "/admin/blog",
          permission: "admin:blog",
        },
        { label: "客户案例", href: "/admin/cases", permission: "admin:cases" },
        { label: "FAQ", href: "/admin/faq", permission: "admin:faq" },
        {
          label: "兼容矩阵",
          href: "/admin/compatibility",
          permission: "admin:compatibility",
        },
        {
          label: "Marketplace",
          href: "/admin/marketplace",
          permission: "admin:marketplace",
        },
      ],
    },
    {
      label: "客户运营",
      items: [
        {
          label: "客户注册审核",
          href: "/admin/registrations",
          permission: "admin:registrations",
        },
        {
          label: "OpenLab 申请审核",
          href: "/admin/openlab",
          status: "placeholder",
          permission: "admin:registrations",
        },
        {
          label: "License 管理",
          href: "/admin/licenses",
          status: "placeholder",
          permission: "admin:registrations",
        },
        {
          label: "工单管理",
          href: "/admin/tickets",
          status: "placeholder",
          permission: "admin:registrations",
        },
      ],
    },
    {
      label: "数据",
      items: [
        {
          label: "门户访问",
          href: "/admin/analytics#portal",
          permission: "admin:analytics",
        },
        {
          label: "下载与申请统计",
          href: "/admin/analytics#requests",
          permission: "admin:analytics",
        },
        {
          label: "转化数据",
          href: "/admin/analytics#conversion",
          permission: "admin:analytics",
        },
      ],
    },
    {
      label: "系统管理",
      items: [
        {
          label: "用户管理",
          href: "/admin/users",
          permission: "admin:users",
        },
        {
          label: "角色权限",
          href: "/admin/roles",
          permission: "admin:roles",
        },
        {
          label: "操作审计",
          href: "/admin/audit-logs",
          permission: "admin:audit",
        },
        {
          label: "站点设置",
          href: "/admin/site#settings",
          permission: "admin:site",
        },
      ],
    },
  ],
  utilities: [
    { label: "返回公开门户", href: "/" },
    { label: "退出登录", action: "logout", disabled: false },
  ],
};

export const footerNavigation: NavigationSection[] = [
  {
    label: "产品与版本",
    items: [
      { label: "产品", href: "/product" },
      { label: "版本列表", href: "/releases" },
      { label: "Roadmap", href: "/roadmap" },
    ],
  },
  {
    label: "文档与部署",
    items: [
      { label: "文档", href: "/docs" },
      { label: "部署指南", href: "/docs/deployment", status: "scaffold" },
      { label: "兼容性", href: "/compatibility" },
    ],
  },
  {
    label: "Marketplace 与资讯",
    items: [
      { label: "Marketplace", href: "/marketplace" },
      { label: "资讯", href: "/blog" },
      { label: "客户案例", href: "/cases" },
    ],
  },
  {
    label: "支持与商务联系",
    items: [
      { label: "支持", href: "/support" },
      { label: "帮助中心", href: "/help" },
      { label: "价格计算", href: "/pricing" },
      { label: "商务咨询", href: "/contact" },
    ],
  },
];

export type NavigationAnchor = {
  id: string;
  label: string;
  status: NavigationStatus | undefined;
};

export function navigationAnchorsForPath(pathname: string): NavigationAnchor[] {
  const navigationItems = [
    ...portalNavigation.flatMap((parent) => [
      parent,
      ...parent.children.flatMap((section) => section.items),
    ]),
    ...consoleNavigation.groups.flatMap((group) => group.items),
    ...consoleNavigation.utilities,
    ...adminNavigation.groups.flatMap((group) => group.items),
    ...adminNavigation.utilities,
    ...footerNavigation.flatMap((section) => section.items),
  ];
  const anchorsById = new Map<string, NavigationAnchor>();

  for (const item of navigationItems) {
    if (!item.href) continue;

    const url = new URL(item.href, "https://local.invalid");
    if (url.pathname !== pathname || !url.hash) continue;

    const id = decodeURIComponent(url.hash.slice(1));
    if (!id) continue;

    const anchor = { id, label: item.label, status: item.status };
    const existing = anchorsById.get(id);

    if (existing) {
      if (
        existing.label !== anchor.label ||
        existing.status !== anchor.status
      ) {
        throw new Error(`Conflicting navigation anchor for ${pathname}#${id}`);
      }

      continue;
    }

    anchorsById.set(id, anchor);
  }

  return [...anchorsById.values()];
}
