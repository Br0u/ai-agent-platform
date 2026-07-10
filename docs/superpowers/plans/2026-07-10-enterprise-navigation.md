# Enterprise Navigation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PRD-complete public Mega Menu, mobile navigation, Console sidebar, CMS sidebar, and footer from one typed navigation configuration while keeping external capabilities as honest placeholders.

**Architecture:** The web app owns navigation data and route semantics in `apps/web/src/config/navigation.ts`. The shared UI package owns presentational navigation components and an `AppShell` that renders portal, Console, or CMS chrome based on an explicit variant; a small web client wrapper derives that variant from `usePathname`. Existing route scaffolds remain the content boundary, and missing CMS destinations are added only as scaffold or placeholder pages.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, CSS, Vitest 4, Testing Library, pnpm workspace.

**Source spec:** `docs/superpowers/specs/2026-07-10-enterprise-navigation-design.md`

**Required skills during execution:** `@test-driven-development`, `@claude-design`, `@playwright`, `@verification-before-completion`, `@git-guide`.

---

## Scope and repository constraints

- Do not implement Product page content.
- Do not implement real License, download, OpenLab, ticket, billing, or analytics behavior.
- Preserve the existing homepage content, brand font, blue–indigo–purple tokens, and user-provided screenshot.
- Do not stage or rewrite the existing unrelated local items:
  - `apps/web/next-env.d.ts`
  - `.pnpm-store/`
  - `docs/product/source/~$ Agent Platform 企业级产品门户 PRD V2.0.docx`
- Use anchors under existing parent pages for second-level destinations that do not yet have dedicated content routes.
- Breakpoint contract: full desktop navigation above `1180px`; drawer/accordion navigation at `1180px` and below.

## Planned file structure

### Web-owned configuration and shell adapter

- Create `apps/web/src/config/navigation.ts` — typed portal, Console, CMS, and footer menu data.
- Create `apps/web/src/config/navigation.test.ts` — completeness, status, uniqueness, and route-boundary tests.
- Create `apps/web/src/components/route-scaffold/scaffold-anchor-index.tsx` and test — materialize configured hashes as honest section targets.
- Modify `apps/web/src/components/route-scaffold/registered-route-page.tsx` and test — append the configured scaffold anchor index.
- Create `apps/web/src/components/site-shell/site-shell.tsx` — derives shell variant from `usePathname` and supplies app-owned navigation data to the UI package.
- Create `apps/web/src/components/site-shell/site-shell.test.tsx` — verifies portal, Console, and CMS variant selection.
- Modify `apps/web/src/app/layout.tsx` — replace direct `AppShell` use with `SiteShell`.
- Modify `apps/web/src/config/routes.ts` — register the missing CMS destinations and allow admin placeholder status.
- Modify `apps/web/src/config/routes.test.ts` — update the exact PRD route contract.
- Keep `apps/web/src/config/route-files.test.ts` unchanged; its existing explicit-file assertion covers newly registered routes.
- Create five CMS page files under `apps/web/src/app/admin/` for docs, OpenLab, License, tickets, and analytics.
- Create `apps/web/src/app/admin/analytics/page.test.tsx` — verifies the honest empty analytics state.

### Shared UI package

- Create `packages/ui/src/navigation/navigation-types.ts` — shared serializable types only.
- Create `packages/ui/src/navigation/navigation-status.tsx` — reusable “尚未开放” label.
- Create `packages/ui/src/navigation/portal-header.tsx` — brand/header composition and account action.
- Create `packages/ui/src/navigation/portal-header.test.tsx` — header layout and content contract.
- Create `packages/ui/src/navigation/mega-menu.tsx` — desktop trigger bar and Mega Menu interaction.
- Create `packages/ui/src/navigation/mega-menu.test.tsx` — desktop interaction and ARIA tests.
- Create `packages/ui/src/navigation/mobile-navigation.tsx` — full-screen accordion drawer.
- Create `packages/ui/src/navigation/mobile-navigation.test.tsx` — drawer, accordion, login, and Escape tests.
- Create `packages/ui/src/navigation/sidebar-navigation.tsx` — Console/CMS grouped sidebar and mobile drawer.
- Create `packages/ui/src/navigation/sidebar-navigation.test.tsx` — grouping, active state, placeholders, and drawer tests.
- Create `packages/ui/src/navigation/site-footer.tsx` — four-column footer navigation.
- Create `packages/ui/src/navigation/site-footer.test.tsx` — footer completeness tests.
- Create `packages/ui/src/navigation/navigation.css` — shared portal, drawer, sidebar, state, and footer styling.
- Modify `packages/ui/src/app-shell.tsx` — compose the correct shell variant from passed configuration.
- Modify `packages/ui/src/app-shell.test.tsx` — replace the old six-link contract with three shell-variant contracts.
- Modify `packages/ui/src/app-shell.css` — retain global shell/brand rules and remove duplicated navigation rules.
- Modify `packages/ui/src/index.ts` — export shell types and components needed by the web adapter.

## Chunk 1: Typed navigation source and registered destinations

### Task 1: Define the complete typed navigation configuration

**Files:**
- Create: `packages/ui/src/navigation/navigation-types.ts`
- Create: `apps/web/src/config/navigation.ts`
- Create: `apps/web/src/config/navigation.test.ts`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the failing configuration test**

Create `apps/web/src/config/navigation.test.ts` with exact group/child expectations and recursive route validation:

```ts
import { describe, expect, it } from "vitest";
import {
  adminNavigation,
  consoleNavigation,
  footerNavigation,
  portalNavigation,
} from "./navigation";

const portalChildren = {
  产品: ["产品介绍", "产品矩阵", "AI Agent Studio", "Knowledge Base", "Workflow", "Model Gateway", "Agent Runtime", "Observability", "版本列表", "Release Note", "Roadmap"],
  文档: ["快速开始", "部署指南", "升级手册", "运维手册", "API 文档", "功能手册", "GPU / 硬件适配", "常见问题 FAQ"],
  下载: ["最新版本", "Linux / Windows 安装包", "ARM / x86 安装包", "Docker / Helm", "离线安装包", "SDK 工具包"],
  OpenLab: ["试用申请", "实名认证", "License 获取指引"],
  兼容性: ["硬件配置要求", "GPU 适配列表", "操作系统兼容", "浏览器兼容", "依赖组件兼容"],
  Marketplace: ["Agent 应用", "Workflow 工作流", "插件工具", "Prompt 模板", "知识库模板"],
  支持: ["帮助中心", "工单提交", "Bug 反馈", "社群支持", "商务咨询"],
  资讯: ["版本更新", "技术教程", "行业案例", "产品动态"],
} as const;

function childLabels(parent: (typeof portalNavigation)[number]) {
  return parent.children.flatMap((section) => section.items.map((item) => item.label));
}

function expectInternalTarget(item: { href?: string; action?: string }) {
  if (item.action) {
    expect(item.href).toBeUndefined();
    return;
  }
  expect(item.href.trim()).not.toBe("");
  expect(item.href.startsWith("/")).toBe(true);
  expect(item.href.startsWith("//")).toBe(false);
}

describe("navigation configuration", () => {
  it("lists every PRD public section in the approved order", () => {
    expect(portalNavigation.map((item) => item.label)).toEqual([
      "产品",
      "文档",
      "下载",
      "OpenLab",
      "兼容性",
      "Marketplace",
      "支持",
      "资讯",
    ]);
    for (const parent of portalNavigation) {
      expect(childLabels(parent)).toEqual(
        portalChildren[parent.label as keyof typeof portalChildren],
      );
    }
  });

  it("keeps external capabilities visible and marked as placeholders", () => {
    expect(portalNavigation.find((item) => item.href === "/downloads")?.status)
      .toBe("placeholder");
    expect(portalNavigation.find((item) => item.href === "/openlab")?.status)
      .toBe("placeholder");
    for (const label of ["工单提交", "社群支持"]) {
      const item = portalNavigation
        .flatMap((parent) => parent.children)
        .flatMap((section) => section.items)
        .find((entry) => entry.label === label);
      expect(item?.status).toBe("placeholder");
    }
    const portalPlaceholderChildren = [
      "最新版本", "Linux / Windows 安装包", "ARM / x86 安装包", "Docker / Helm", "离线安装包", "SDK 工具包",
      "试用申请", "实名认证", "License 获取指引",
    ];
    const portalItems = portalNavigation.flatMap((parent) => parent.children).flatMap((section) => section.items);
    for (const label of portalPlaceholderChildren) {
      expect(portalItems.find((item) => item.label === label)?.status).toBe("placeholder");
    }
    for (const label of ["我的 License", "我的下载", "OpenLab 进度", "我的工单", "API 密钥", "团队管理", "订单与账单"]) {
      expect(consoleNavigation.groups.flatMap((group) => group.items).find((item) => item.label === label)?.status).toBe("placeholder");
    }
    for (const label of ["OpenLab 申请审核", "License 管理", "工单管理"]) {
      expect(adminNavigation.groups.flatMap((group) => group.items).find((item) => item.label === label)?.status).toBe("placeholder");
    }
  });

  it("contains complete Console, CMS, and footer groups", () => {
    expect(consoleNavigation.groups.map((group) => group.label)).toEqual([
      "工作台",
      "企业服务",
      "开发与资源",
      "组织与财务",
    ]);
    expect(consoleNavigation.groups.flatMap((group) => group.items.map((item) => item.label))).toEqual([
      "控制台首页", "账号资料", "我的 License", "我的下载", "OpenLab 进度", "我的工单", "我的 Agent / 模板", "API 密钥", "团队管理", "订单与账单",
    ]);
    expect(consoleNavigation.utilities.map((item) => item.label)).toEqual([
      "返回公开门户", "帮助与支持", "当前账号", "退出登录",
    ]);
    expect(adminNavigation.groups.map((group) => group.label)).toEqual([
      "运营概览",
      "站点内容",
      "客户运营",
      "数据",
      "系统管理",
    ]);
    expect(adminNavigation.groups.flatMap((group) => group.items.map((item) => item.label))).toEqual([
      "运营后台首页", "首页配置", "导航管理", "产品内容", "版本与 Release Note", "文档管理", "Blog / 产品动态", "客户案例", "FAQ", "兼容矩阵", "Marketplace", "OpenLab 申请审核", "License 管理", "工单管理", "门户访问", "下载与申请统计", "转化数据", "用户管理", "角色权限", "操作审计", "站点设置",
    ]);
    expect(footerNavigation.map((group) => group.label)).toEqual([
      "产品与版本", "文档与部署", "Marketplace 与资讯", "支持与商务联系",
    ]);
  });

  it("uses unique internal hrefs across each complete menu", () => {
    const portalLinks = portalNavigation.flatMap((parent) => [
      parent,
      ...parent.children.flatMap((section) => section.items),
    ]);
    portalLinks.forEach(expectInternalTarget);
    const portalHrefs = portalLinks.map((item) => item.href);
    expect(new Set(portalHrefs).size).toBe(portalHrefs.length);

    for (const parent of portalNavigation) {
      expectInternalTarget(parent);
    }
    for (const config of [consoleNavigation, adminNavigation]) {
      const entries = [...config.groups.flatMap((group) => group.items), ...config.utilities];
      entries.forEach(expectInternalTarget);
      const hrefs = entries.filter((item) => "href" in item).map((item) => item.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
    const footerLinks = footerNavigation.flatMap((group) => group.items);
    footerLinks.forEach(expectInternalTarget);
    const footerHrefs = footerLinks.filter((item) => "href" in item).map((item) => item.href);
    expect(new Set(footerHrefs).size).toBe(footerHrefs.length);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @ai-agent-platform/web test src/config/navigation.test.ts
```

Expected: FAIL because `./navigation` does not exist.

- [ ] **Step 3: Add shared serializable navigation types**

Create `packages/ui/src/navigation/navigation-types.ts`:

```ts
export type NavigationStatus = "live" | "scaffold" | "placeholder";

type NavigationEntryBase = {
  label: string;
  description?: string;
  status?: NavigationStatus;
  permission?: string;
};

export type NavigationHrefItem = NavigationEntryBase & {
  href: string;
  action?: never;
  disabled?: never;
};

export type NavigationActionItem = NavigationEntryBase & {
  action: "logout";
  href?: never;
  disabled: true;
};

export type NavigationLink = NavigationHrefItem | NavigationActionItem;

export type NavigationSection = {
  label: string;
  items: NavigationLink[];
};

export type PortalNavigationItem = NavigationHrefItem & {
  children: NavigationSection[];
};

export type SidebarNavigationConfig = {
  groups: NavigationSection[];
  utilities: NavigationLink[];
};
```

Export these types from `packages/ui/src/index.ts` with `export type`.

- [ ] **Step 4: Implement the complete navigation data**

Create `apps/web/src/config/navigation.ts` using the exact labels approved in the design spec. Use these destination rules:

```ts
const placeholder = "placeholder" as const;

export const portalNavigation: PortalNavigationItem[] = [
  {
    label: "产品",
    href: "/product",
    children: [
      {
        label: "产品中心",
        items: [
          { label: "产品介绍", href: "/product#overview" },
          { label: "产品矩阵", href: "/product#modules" },
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
];
```

After the Product object, add the remaining seven objects with these exact children:

| Parent | Section | Child label → href | Status |
| --- | --- | --- | --- |
| 文档 | 落地文档 | 快速开始 → `/docs#quick-start`; 部署指南 → `/docs#deployment`; 升级手册 → `/docs#upgrade`; 运维手册 → `/docs#operations` | scaffold |
| 文档 | 开发与适配 | API 文档 → `/docs#api`; 功能手册 → `/docs#features`; GPU / 硬件适配 → `/docs#hardware`; 常见问题 FAQ → `/docs#faq` | scaffold |
| 下载 | 安装与镜像 | 最新版本 → `/downloads#latest`; Linux / Windows 安装包 → `/downloads#desktop`; ARM / x86 安装包 → `/downloads#architecture`; Docker / Helm → `/downloads#containers` | placeholder |
| 下载 | 离线与工具 | 离线安装包 → `/downloads#offline`; SDK 工具包 → `/downloads#sdk` | placeholder |
| OpenLab | 试用授权 | 试用申请 → `/openlab#trial`; 实名认证 → `/openlab#identity`; License 获取指引 → `/openlab#license-guide` | placeholder |
| 兼容性 | 环境适配 | 硬件配置要求 → `/compatibility#hardware`; GPU 适配列表 → `/compatibility#gpu`; 操作系统兼容 → `/compatibility#os`; 浏览器兼容 → `/compatibility#browser`; 依赖组件兼容 → `/compatibility#dependencies` | scaffold |
| Marketplace | 资源类型 | Agent 应用 → `/marketplace#agent`; Workflow 工作流 → `/marketplace#workflow`; 插件工具 → `/marketplace#plugin`; Prompt 模板 → `/marketplace#prompt`; 知识库模板 → `/marketplace#knowledge-base` | scaffold |
| 支持 | 服务入口 | 帮助中心 → `/help`; 工单提交 → `/support#tickets`; Bug 反馈 → `/support#bug`; 社群支持 → `/support#community`; 商务咨询 → `/contact` | ticket/community carry placeholder status |
| 资讯 | 内容分类 | 版本更新 → `/blog#releases`; 技术教程 → `/blog#tutorial`; 行业案例 → `/cases`; 产品动态 → `/blog#product` | scaffold |

Use the following exact sidebar destinations:

- Console groups: `/console`, `/console/profile`, `/console/licenses`, `/console/downloads`, `/console/openlab`, `/console/tickets`, `/console/resources`, `/console/api-keys`, `/console/team`, `/console/billing`; current-account utility: `/console/profile#account-menu`.
- CMS: `/admin`, `/admin/site#homepage`, `/admin/navigation`, `/admin/products`, `/admin/releases`, `/admin/docs`, `/admin/blog`, `/admin/cases`, `/admin/faq`, `/admin/compatibility`, `/admin/marketplace`, `/admin/openlab`, `/admin/licenses`, `/admin/tickets`, `/admin/analytics#portal`, `/admin/analytics#requests`, `/admin/analytics#conversion`, `/admin/users`, `/admin/roles`, `/admin/audit-logs`, `/admin/site#settings`.
- Footer groups reuse links already present in portal navigation; do not introduce alternative URLs for the same destination.

Define `consoleNavigation` and `adminNavigation` as `SidebarNavigationConfig` objects. Console utilities are exact configuration data, not component hard-coding:

```ts
utilities: [
  { label: "返回公开门户", href: "/" },
  { label: "帮助与支持", href: "/support" },
  { label: "当前账号", href: "/console/profile#account-menu" },
  {
    label: "退出登录",
    action: "logout",
    disabled: true,
    status: "placeholder",
    description: "账号会话尚未接入",
  },
]
```

CMS `utilities` is an empty array in this phase. Add `permission` metadata to sensitive CMS items (`admin:users`, `admin:roles`, `admin:audit`) but do not hide them unless a caller explicitly supplies a permission list; this keeps the scaffold complete before authentication exists.

Define footer groups with these exact unique destinations:

- 产品与版本: `/product`, `/releases`, `/roadmap`
- 文档与部署: `/docs`, `/docs#deployment`, `/compatibility`
- Marketplace 与资讯: `/marketplace`, `/blog`, `/cases`
- 支持与商务联系: `/support`, `/help`, `/contact`

The initial Step 1 RED test must already include exact label-based placeholder assertions for download/OpenLab parents and children, public “工单提交” and “社群支持”, Console License/download/OpenLab/ticket/API/team/billing, and CMS OpenLab/License/tickets. Do not add these assertions after the first RED run.

- [ ] **Step 5: Run the configuration test and verify GREEN**

Run the same focused test. Expected: PASS.

- [ ] **Step 6: Run typecheck for both affected packages**

```bash
pnpm --filter @ai-agent-platform/ui typecheck
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: both PASS.

- [ ] **Step 7: Commit the typed configuration**

```bash
git add apps/web/src/config/navigation.ts apps/web/src/config/navigation.test.ts packages/ui/src/navigation/navigation-types.ts packages/ui/src/index.ts
git commit -m "feat(navigation): 建立全站菜单配置"
```

### Task 2: Register missing CMS destinations as honest scaffolds

**Files:**
- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`
- Create: `apps/web/src/app/admin/docs/page.tsx`
- Create: `apps/web/src/app/admin/openlab/page.tsx`
- Create: `apps/web/src/app/admin/licenses/page.tsx`
- Create: `apps/web/src/app/admin/tickets/page.tsx`
- Create: `apps/web/src/app/admin/analytics/page.tsx`
- Create: `apps/web/src/app/admin/analytics/page.test.tsx`

- [ ] **Step 1: Extend the failing route contract test**

Insert `/admin/docs` after `/admin/releases`. Insert the other four destinations after `/admin/marketplace`:

```ts
"/admin/docs",
// existing blog, cases, FAQ, compatibility, and marketplace routes remain here
"/admin/openlab",
"/admin/licenses",
"/admin/tickets",
"/admin/analytics",
```

Add assertions that OpenLab, License, and tickets are `placeholder`, while docs and analytics are `scaffold`. In `navigation.test.ts`, now add a registry-consistency test that extracts each configured href pathname with `new URL(href, "https://local.invalid").pathname` and expects `matchRoute(pathname)` to be defined; action-only items are skipped. This test must include portal, Console, CMS, utilities, and footer links.

- [ ] **Step 2: Run route tests and verify RED**

```bash
pnpm --filter @ai-agent-platform/web test src/config/routes.test.ts src/config/navigation.test.ts
```

Expected: FAIL because the five routes are not registered yet. Do not run the file-existence test at this step; the registry has not changed, so it would still pass.

- [ ] **Step 3: Allow admin routes to carry explicit delivery status**

Change `adminRoute` to accept an optional status:

```ts
const adminRoute = (
  path: string,
  title: string,
  status: PortalRoute["status"] = "scaffold",
): PortalRoute => ({ path, title, group: "admin", status });
```

Register the five routes using the status contract from Step 1.

- [ ] **Step 4: Verify the route contract is GREEN and route files are RED**

```bash
pnpm --filter @ai-agent-platform/web test src/config/routes.test.ts src/config/navigation.test.ts
pnpm --filter @ai-agent-platform/web test src/config/route-files.test.ts
```

Expected: route contract PASS; route-file test FAIL with exactly the five new missing page files.

- [ ] **Step 5: Create four thin registered route pages and one honest analytics page**

Use the existing page pattern exactly. Example:

```tsx
import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

export const metadata = metadataForRegisteredRoute("/admin/docs");

export default function AdminDocsPage() {
  return <RegisteredRoutePage pathname="/admin/docs" />;
}
```

Repeat the registered scaffold pattern for OpenLab, License, and tickets. For analytics, render the registered heading plus an explicit empty state:

```tsx
<section aria-labelledby="analytics-empty-title">
  <h2 id="analytics-empty-title">暂无统计数据</h2>
  <p>数据采集接口尚未接入，本页面不会展示示例指标。</p>
</section>
```

Write `page.test.tsx` first for analytics and verify it fails before implementing the custom page. Assert “暂无统计数据” is visible and fabricated metric values are absent.

- [ ] **Step 6: Run route/page tests and Web typecheck**

```bash
pnpm --filter @ai-agent-platform/web test src/config/routes.test.ts src/config/navigation.test.ts src/config/route-files.test.ts src/app/admin/analytics/page.test.tsx
pnpm --filter @ai-agent-platform/web typecheck
```

Expected: all focused tests and typecheck PASS.

- [ ] **Step 7: Commit the CMS destinations**

```bash
git add apps/web/src/config/routes.ts apps/web/src/config/routes.test.ts apps/web/src/config/navigation.test.ts apps/web/src/app/admin/docs apps/web/src/app/admin/openlab apps/web/src/app/admin/licenses apps/web/src/app/admin/tickets apps/web/src/app/admin/analytics
git commit -m "feat(admin): 补齐运营菜单目标页面"
```

### Task 3: Materialize every configured hash as a real scaffold anchor

**Files:**
- Modify: `apps/web/src/config/navigation.ts`
- Modify: `apps/web/src/config/navigation.test.ts`
- Create: `apps/web/src/components/route-scaffold/scaffold-anchor-index.tsx`
- Create: `apps/web/src/components/route-scaffold/scaffold-anchor-index.test.tsx`
- Modify: `apps/web/src/components/route-scaffold/registered-route-page.tsx`
- Modify: `apps/web/src/components/route-scaffold/registered-route-page.test.tsx`

- [ ] **Step 1: Write failing anchor-contract tests**

Add `navigationAnchorsForPath(pathname)` expectations for every path that has configured hashes: `/product`, `/releases`, `/docs`, `/downloads`, `/openlab`, `/compatibility`, `/marketplace`, `/support`, `/blog`, `/console/profile`, `/admin/site`, and `/admin/analytics`. Each returned item must have a unique non-empty `id` matching the configured hash and the original label/status. Also flatten every configured hash link and assert its pathname/id pair appears in the extractor result, so future hashes cannot be added without a real target test.

Write component tests that render a docs scaffold and assert real `#quick-start`, `#deployment`, and `#faq` elements exist. Render downloads and assert its anchor index preserves “尚未开放” status without adding download actions.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @ai-agent-platform/web test src/config/navigation.test.ts src/components/route-scaffold/scaffold-anchor-index.test.tsx src/components/route-scaffold/registered-route-page.test.tsx
```

Expected: FAIL because the anchor extractor/component does not exist.

- [ ] **Step 3: Implement one-source anchor extraction**

In `navigation.ts`, traverse portal, Console, CMS, and footer links. For links whose parsed pathname equals the requested pathname and whose hash is non-empty, return a deduplicated `{ id, label, status }` list in menu order. Do not maintain a second handwritten anchor map.

- [ ] **Step 4: Render honest scaffold sections**

`ScaffoldAnchorIndex` renders semantic sections with each configured `id`, label, and optional status. Text must say that the section structure exists and content/functionality is not yet available; it must not invent metrics, files, forms, or actions. `RegisteredRoutePage` calls `navigationAnchorsForPath(pathname)` and renders the index after `FeaturePlaceholderPage` when anchors exist.

- [ ] **Step 5: Run GREEN and Web typecheck**

```bash
pnpm --filter @ai-agent-platform/web test src/config/navigation.test.ts src/components/route-scaffold/scaffold-anchor-index.test.tsx src/components/route-scaffold/registered-route-page.test.tsx
pnpm --filter @ai-agent-platform/web typecheck
```

- [ ] **Step 6: Commit real anchor targets**

```bash
git add apps/web/src/config/navigation.ts apps/web/src/config/navigation.test.ts apps/web/src/components/route-scaffold/scaffold-anchor-index.tsx apps/web/src/components/route-scaffold/scaffold-anchor-index.test.tsx apps/web/src/components/route-scaffold/registered-route-page.tsx apps/web/src/components/route-scaffold/registered-route-page.test.tsx
git commit -m "feat(navigation): 建立菜单锚点占位结构"
```

## Chunk 2: Public Mega Menu, mobile drawer, and footer

### Task 4: Build the accessible desktop Mega Menu

**Files:**
- Create: `packages/ui/src/navigation/navigation-status.tsx`
- Create: `packages/ui/src/navigation/mega-menu.tsx`
- Create: `packages/ui/src/navigation/mega-menu.test.tsx`
- Create: `packages/ui/src/navigation/navigation.css`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write failing Mega Menu tests**

Define a small typed `PortalNavigationItem[]` fixture inside `mega-menu.test.tsx`; the UI package must not import Web configuration. Use `vi.useFakeTimers()` for the 180ms close contract. Cover click open, pointer-enter open, pointer-leave delayed close, pointer re-entry cancellation, one-panel-only behavior, outside pointer close, Escape, ArrowLeft/ArrowRight, ArrowDown focus, placeholder status, current parent, and current child link.

Use a boundary-safe active fixture:

```tsx
render(<MegaMenu items={fixture} activeHref="/product/agent-studio" />);
expect(screen.getByRole("button", { name: "产品" })).toHaveAttribute("aria-current", "page");
fireEvent.click(screen.getByRole("button", { name: "产品" }));
expect(screen.getByRole("link", { name: "AI Agent Studio" })).toHaveAttribute("aria-current", "page");
```

Add a negative assertion that `/productivity` does not activate `/product`.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
pnpm --filter @ai-agent-platform/ui test src/navigation/mega-menu.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement navigation matching and Mega Menu behavior**

Use a shared normalizer that compares pathname segments, query, and hash without prefix false positives:

```ts
function pathMatches(basePath: string, candidatePath: string) {
  return candidatePath === basePath || candidatePath.startsWith(`${basePath}/`);
}
```

`MegaMenu` receives `activeHref`, strips query/hash only for the parent path-boundary check, and uses the full normalized href for child activation. It renders buttons with `aria-expanded`/`aria-controls`, keeps one `openIndex`, opens by hover/click, closes after 180ms or immediately on outside pointer/Escape, and implements the tested keyboard behavior. Use `useId`, refs, timer cleanup, and no third-party menu dependency.

- [ ] **Step 4: Add the desktop visual system**

In `navigation.css`, show the desktop navigation only at `min-width: 1181px`, use a panel width of `min(1180px, calc(100vw - 48px))`, 3–4 text columns, thin separators, restrained shadow/border, maximum 8px radius, indigo current underline, pale-blue active child, purple focus outline, and 44px minimum targets. At 1181–1280px reduce gaps and type size without hiding entries or overflowing.

- [ ] **Step 5: Run GREEN and typecheck**

```bash
pnpm --filter @ai-agent-platform/ui test src/navigation/mega-menu.test.tsx
pnpm --filter @ai-agent-platform/ui typecheck
```

Expected: tests and typecheck PASS.

- [ ] **Step 6: Commit the desktop menu**

```bash
git add packages/ui/src/navigation/navigation-status.tsx packages/ui/src/navigation/mega-menu.tsx packages/ui/src/navigation/mega-menu.test.tsx packages/ui/src/navigation/navigation.css packages/ui/src/index.ts
git commit -m "feat(ui): 实现企业级Mega Menu"
```

### Task 5: Build the full mobile navigation drawer

**Files:**
- Create: `packages/ui/src/navigation/mobile-navigation.tsx`
- Create: `packages/ui/src/navigation/mobile-navigation.test.tsx`
- Modify: `packages/ui/src/navigation/navigation.css`

- [ ] **Step 1: Write failing mobile tests**

Verify the menu button opens a labeled `role="dialog" aria-modal="true"` drawer; all eight groups exist; accordion buttons expose `aria-expanded`/`aria-controls`; initial focus moves to close; Tab/Shift+Tab stays inside; group expansion reveals children; every configured child and login/control action remains present; a link activation, overlay click, or Escape closes; focus returns to the opener; body scroll locks and is restored on close and unmount.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @ai-agent-platform/ui test src/navigation/mobile-navigation.test.tsx
```

- [ ] **Step 3: Implement the controlled drawer**

Use a button with `aria-expanded`, a fixed overlay with `role="dialog" aria-modal="true" aria-label="全站导航"`, per-group accordion buttons, and a close button. Implement a small focus trap over the drawer’s focusable elements. On open, focus close and lock body scrolling; on close/unmount, restore scrolling and focus the opener. Close on overlay pointer, Escape, and link activation.

- [ ] **Step 4: Style the mobile drawer**

- Render only at `max-width: 1180px`.
- Fill the viewport below the topbar.
- Keep menu, close, accordion, child-link, and fixed-bottom action targets at least 44×44px; accordion rows use 48px.
- Keep the login/control action fixed at the drawer bottom.
- Allow the menu body to scroll without hiding the bottom action.

- [ ] **Step 5: Run GREEN**

```bash
pnpm --filter @ai-agent-platform/ui test src/navigation/mobile-navigation.test.tsx
```

- [ ] **Step 6: Run UI typecheck**

```bash
pnpm --filter @ai-agent-platform/ui typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/navigation/mobile-navigation.tsx packages/ui/src/navigation/mobile-navigation.test.tsx packages/ui/src/navigation/navigation.css
git commit -m "feat(ui): 实现完整移动导航"
```

### Task 6: Build the four-column site footer

**Files:**
- Create: `packages/ui/src/navigation/site-footer.tsx`
- Create: `packages/ui/src/navigation/site-footer.test.tsx`
- Modify: `packages/ui/src/navigation/navigation.css`

- [ ] **Step 1: Write failing footer tests**

Assert the four approved group labels, brand name, subtitle, company/privacy/filing placeholders, and every link supplied in `footerNavigation`.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @ai-agent-platform/ui test src/navigation/site-footer.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the footer**

Render semantic `<footer>` and `<nav aria-label="页脚导航">`. Keep placeholders clearly labeled and do not invent company registration data.

- [ ] **Step 4: Add responsive footer CSS**

Use four columns above 1180px, two columns from 721–1180px, and one compact stacked column at 720px and below. Keep every footer link at least 44px high on touch layouts.

- [ ] **Step 5: Run GREEN and typecheck**

```bash
pnpm --filter @ai-agent-platform/ui test src/navigation/site-footer.test.tsx
pnpm --filter @ai-agent-platform/ui typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/navigation/site-footer.tsx packages/ui/src/navigation/site-footer.test.tsx packages/ui/src/navigation/navigation.css
git commit -m "feat(ui): 补齐门户页脚导航"
```

## Chunk 3: Shell routing, Console sidebar, and CMS sidebar

### Task 7: Make AppShell variant-driven without coupling UI to Next.js

**Files:**
- Create: `packages/ui/src/navigation/portal-header.tsx`
- Create: `packages/ui/src/navigation/portal-header.test.tsx`
- Modify: `packages/ui/src/app-shell.tsx`
- Modify: `packages/ui/src/app-shell.test.tsx`
- Modify: `packages/ui/src/app-shell.css`
- Modify: `packages/ui/src/index.ts`
- Create: `apps/web/src/components/site-shell/site-shell.tsx`
- Create: `apps/web/src/components/site-shell/site-shell.test.tsx`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Write failing PortalHeader and AppShell variant tests**

`portal-header.test.tsx` asserts the brand name/subtitle, desktop Mega Menu, mobile menu trigger, and login/enter-platform action. Replace the old AppShell test with `variant="portal"`, `variant="console"`, and `variant="admin"` contracts: portal shows `PortalHeader` and footer; Console/Admin show their shell marker but never public Mega Menu/footer. Sidebars are deliberately wired in Task 8, so do not assert group contents yet.

- [ ] **Step 2: Write a failing SiteShell path-selection test**

Mock `usePathname` for `/`, `/console/profile`, and `/admin/products`, and assert the correct shell marker. Add `/administrator` and `/console-old` negative cases; both must remain portal routes.

- [ ] **Step 3: Run both tests and verify RED**

```bash
pnpm --filter @ai-agent-platform/ui test src/navigation/portal-header.test.tsx src/app-shell.test.tsx
pnpm --filter @ai-agent-platform/web test src/components/site-shell/site-shell.test.tsx
```

- [ ] **Step 4: Implement explicit shell props**

Use this public contract:

```ts
type AppShellProps = {
  children: ReactNode;
  variant: "portal" | "console" | "admin";
  activeHref: string;
  portalNavigation: PortalNavigationItem[];
  consoleNavigation: SidebarNavigationConfig;
  adminNavigation: SidebarNavigationConfig;
  footerNavigation: NavigationSection[];
  grantedPermissions?: readonly string[];
};
```

Keep `AppShell` independent from `next/navigation`.

Implement `PortalHeader` here, after both `MegaMenu` and `MobileNavigation` exist. It owns the current wordmark, 76px header grid, desktop/mobile navigation, and login/control action; it receives data and `activeHref` and never imports Web configuration.

- [ ] **Step 5: Implement the web adapter**

Create a client `SiteShell` that maps pathname prefixes:

```ts
const isRouteRoot = (root: string) =>
  pathname === root || pathname.startsWith(`${root}/`);

const variant = isRouteRoot("/admin")
  ? "admin"
  : isRouteRoot("/console")
    ? "console"
    : "portal";
```

Track `activeHref` from `window.location.pathname + search + hash` in a client effect and refresh it on `popstate`/`hashchange`; use pathname as the hydration-safe initial value. Pass all four configurations and active href to `AppShell`. Replace the root layout’s direct `AppShell` import with `SiteShell`.

- [ ] **Step 6: Run GREEN, typecheck, and commit**

```bash
pnpm --filter @ai-agent-platform/ui test src/navigation/portal-header.test.tsx src/app-shell.test.tsx
pnpm --filter @ai-agent-platform/web test src/components/site-shell/site-shell.test.tsx
pnpm --filter @ai-agent-platform/ui typecheck
pnpm --filter @ai-agent-platform/web typecheck
git add packages/ui/src/navigation/portal-header.tsx packages/ui/src/navigation/portal-header.test.tsx packages/ui/src/app-shell.tsx packages/ui/src/app-shell.test.tsx packages/ui/src/app-shell.css packages/ui/src/index.ts apps/web/src/components/site-shell/site-shell.tsx apps/web/src/components/site-shell/site-shell.test.tsx apps/web/src/app/layout.tsx
git commit -m "refactor(shell): 区分门户控制台和运营后台"
```

### Task 8: Build the shared grouped sidebar navigation

**Files:**
- Create: `packages/ui/src/navigation/sidebar-navigation.tsx`
- Create: `packages/ui/src/navigation/sidebar-navigation.test.tsx`
- Modify: `packages/ui/src/navigation/navigation.css`

- [ ] **Step 1: Write failing sidebar tests**

Verify group headings, segment-safe current route `aria-current`, placeholder status, and permission filtering. Verify desktop collapse hides visual labels but preserves link accessible names. Verify the mobile drawer opens/closes by button, overlay, Escape, and link activation; traps focus; returns focus; and restores body scroll. Verify Console utilities render configured portal/support/account links and a disabled placeholder logout control, while a CMS fixture with empty utilities renders none of them.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @ai-agent-platform/ui test src/navigation/sidebar-navigation.test.tsx
```

- [ ] **Step 3: Implement one sidebar for both Console and CMS**

Required props:

```ts
type SidebarNavigationProps = {
  ariaLabel: string;
  brandLabel: string;
  activeHref: string;
  groups: NavigationSection[];
  utilities: NavigationLink[];
  grantedPermissions?: readonly string[];
};
```

Use exact link labels/actions from configuration. If `grantedPermissions` is undefined, show the complete scaffold; if provided, hide only items whose `permission` is absent. Render status text, not fake icons. Disabled action entries render disabled buttons with descriptions and never simulate logout. Desktop collapse changes width and visually hides labels while retaining accessible names.

- [ ] **Step 4: Style desktop and mobile variants**

- Desktop: 264px expanded, 72px collapsed, sticky full-height sidebar.
- Mobile/tablet: hidden by default and opened as a left drawer.
- Current route: pale blue background and indigo text.
- Group labels: subdued but readable; links at least 44px high.
- CMS identity must say “CMS 运营后台”; Console identity must say “客户控制台”.
- Mobile drawer uses the same focus-trap, Escape, overlay, scroll-lock, and focus-return contract as public mobile navigation.

- [ ] **Step 5: Run GREEN and typecheck**

```bash
pnpm --filter @ai-agent-platform/ui test src/navigation/sidebar-navigation.test.tsx
pnpm --filter @ai-agent-platform/ui typecheck
```

- [ ] **Step 6: Commit the standalone sidebar**

```bash
git add packages/ui/src/navigation/sidebar-navigation.tsx packages/ui/src/navigation/sidebar-navigation.test.tsx packages/ui/src/navigation/navigation.css
git commit -m "feat(ui): 实现控制台分组侧栏"
```

### Task 9: Wire Console and CMS sidebars into AppShell

**Files:**
- Modify: `packages/ui/src/app-shell.tsx`
- Modify: `packages/ui/src/app-shell.test.tsx`

- [ ] **Step 1: Add failing shell assertions**

Before wiring, assert that Console renders “客户控制台”, all four groups, configured utilities, and disabled logout; CMS renders “CMS 运营后台” and all five groups but no Console utilities. Assert neither renders `aria-label="主导航"`. Add permission-filter integration coverage by passing a limited permission list to one AppShell fixture.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @ai-agent-platform/ui test src/app-shell.test.tsx
```

- [ ] **Step 3: Compose SidebarNavigation for Console and CMS variants**

Pass the correct config groups/utilities, identity labels, and optional `grantedPermissions` through to `SidebarNavigation`. Keep the public header/footer exclusive to the portal variant. Do not modify the nested Console/Admin layouts; they remain content boundaries only.

- [ ] **Step 4: Run GREEN and both typechecks**

```bash
pnpm --filter @ai-agent-platform/ui test src/app-shell.test.tsx
pnpm --filter @ai-agent-platform/web test src/components/site-shell/site-shell.test.tsx
pnpm --filter @ai-agent-platform/ui typecheck
pnpm --filter @ai-agent-platform/web typecheck
```

- [ ] **Step 5: Commit shell integration**

```bash
git add packages/ui/src/app-shell.tsx packages/ui/src/app-shell.test.tsx
git commit -m "refactor(web): 接入控制台与CMS菜单"
```

## Chunk 4: Integration, browser QA, and delivery evidence

### Task 10: Run focused integration checks and fix only navigation regressions

**Files:**
- Modify only files already in this plan when a test exposes a navigation defect.

- [ ] **Step 1: Record the implementation baseline and current dirty files**

```bash
git rev-parse HEAD
git status --short
```

Record the SHA in the execution notes. Confirm the three known unrelated local items remain outside every staged diff.

- [ ] **Step 2: Run all UI tests**

```bash
pnpm --filter @ai-agent-platform/ui test
```

Expected: all UI tests PASS.

- [ ] **Step 3: Run all Web tests**

```bash
pnpm --filter @ai-agent-platform/web test
```

Expected: route, page, shell, and homepage tests PASS.

- [ ] **Step 4: Run static checks**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
```

Expected: all commands exit 0. If formatting alone fails, run the repository formatter only on files changed by this plan, then rerun the check.

- [ ] **Step 5: Commit any integration-only correction safely**

Only if an integration correction was required:

Return to the task that owns the defect and stage only its exact component/test pair plus the shared stylesheet when changed. After any correction, rerun Task 10 Steps 2–4 in full, not only the focused test. Before committing, run `git diff --cached --name-status` and `git diff --cached --check`. Do not stage directories wholesale. Use `fix(navigation): 修正全站菜单集成问题` only after the owning focused test, all UI/Web tests, typecheck, lint, and format check are GREEN.

### Task 11: Verify real browser behavior at required viewports

**Files:**
- Modify navigation files only if browser verification reveals a defect.
- Modify: `progress.md`
- Modify: `task_plan.md`

- [ ] **Step 1: Start and verify the local app lifecycle**

Start this command in a separate long-lived terminal session and record its session identifier:

```bash
pnpm --filter @ai-agent-platform/web exec next dev --hostname 127.0.0.1 --port 3100
```

In another command, verify readiness:

```bash
curl --retry 20 --retry-delay 1 --retry-connrefused --fail http://127.0.0.1:3100/api/health/live
```

Expected: the health endpoint succeeds and the browser base URL is exactly `http://127.0.0.1:3100`.

- [ ] **Step 2: Verify the portal at 1440×1000**

Using `@playwright`, verify:

- All eight top-level menu triggers are visible.
- Product, Docs, Support, and one placeholder menu open and close.
- Verify both hover-open and click-open.
- Verify 180ms delayed close, pointer re-entry cancellation, outside-click close, and one-open-panel behavior.
- Verify Tab, Enter, ArrowLeft/Right/Down, Escape, focus return, and visible purple focus treatment.
- Verify `/product/agent-studio` activates both Product and its child; `/productivity` does not activate Product.
- Only one Mega Menu is open at a time.
- Download/OpenLab show “尚未开放” and lead to placeholder pages.
- Login/enter-platform remains visible.
- No horizontal overflow.
- Footer shows four columns, every configured link is reachable, and touch targets meet the contract.
- Clear browser logs before the run; console errors, interaction warnings, and resource 404s are all zero.

- [ ] **Step 3: Verify the exact 1181/1180 breakpoint boundary**

- At 1181×800, the full desktop menu is visible, compact, and has no horizontal overflow.
- At 1180×800, the desktop menu is hidden and the full-screen drawer trigger is visible.
- Clear/check console and failed network resources separately at both widths.

- [ ] **Step 4: Verify 1024×768**

- Desktop Mega Menu is hidden.
- Mobile/full navigation trigger is visible.
- All eight accordion groups and login action are reachable.
- Escape closes and returns focus.
- Tab/Shift+Tab remain inside the drawer; overlay and child-link activation close it.
- Body scroll locks while open and returns after close.
- Footer uses exactly two columns.
- No horizontal overflow.
- Console errors, interaction warnings, and resource 404s are zero.

- [ ] **Step 5: Verify 390×844**

- Brand name and menu trigger fit without clipping.
- Every item has at least a 44px hit target.
- Drawer body scroll and fixed bottom action both work.
- No hidden login regression.
- Footer uses one column without clipping.
- Console errors, interaction warnings, and resource 404s are zero.

- [ ] **Step 6: Verify Console and CMS at exact viewports**

At 1440×1000 and 390×844:

- `/console/profile` shows the Console sidebar and correct active item.
- `/console/licenses` shows the placeholder state without fake license data.
- `/admin/products` shows the CMS sidebar and correct active item.
- `/admin/openlab` shows an admin placeholder page.
- `/admin/analytics` shows “暂无统计数据” and no example metrics.
- Public Mega Menu/footer do not appear in Console or CMS.
- At 1440px, sidebars are fixed and can collapse without losing accessible names.
- At 390px, sidebars become left drawers with overlay/Escape/link close, focus trap/return, and scroll restore.
- Clear/check console errors, interaction warnings, and resource 404s on each route/viewport pair.

- [ ] **Step 7: Close the dev server and verify the port is free**

Send Ctrl-C to the recorded long-lived terminal session, then run:

```bash
! lsof -nP -iTCP:3100 -sTCP:LISTEN
```

Expected: no listener. Do not start the production build while the dev server is still running.

- [ ] **Step 8: Close any browser-fix loop**

If browser QA changed code, return to Task 10 and rerun all UI/Web tests, typecheck, lint, and format check; commit the correction using the owning-file rule; restart the dev server and repeat every affected browser scenario. After the repeated browser run, execute Step 7 again and confirm port 3100 is free. Continue only when the full loop is green and no dev server remains.

- [ ] **Step 9: Run the production build**

```bash
pnpm build
```

Expected: Next.js production build succeeds and all explicit pages generate without route errors.

- [ ] **Step 10: Record factual completion evidence**

First run `git status --short progress.md task_plan.md`. If either file already has unrelated changes, stop and report instead of staging the whole file. Otherwise update both with exact test counts, all five portal widths, Console/CMS viewport results, console/network results, build result, and remaining external placeholders. Do not claim real external capability.

- [ ] **Step 11: Commit verification evidence**

```bash
git add progress.md task_plan.md
git diff --cached --name-status
git diff --cached --check
git commit -m "docs(navigation): 记录全站菜单验收结果"
```

- [ ] **Step 12: Final scope audit**

Run:

```bash
git status --short
git diff --check origin/main..HEAD
git diff --name-status origin/main..HEAD
git log --oneline --stat origin/main..HEAD
```

Confirm that unrelated local files remain uncommitted and absent from every commit, and that every changed file between origin/main and HEAD belongs to the approved navigation specs, plans, implementation, or evidence.

## Completion criteria

- Public navigation exposes all PRD groups and all approved child entries.
- Desktop, tablet, and phone layouts are usable without overflow.
- Mobile navigation includes the login/control action.
- Console and CMS use complete independent sidebars.
- CMS destinations required by the approved menu exist as scaffold/placeholder pages.
- External capabilities remain honest placeholders.
- Tests, typecheck, lint, format check, browser console checks, and production build all pass.
