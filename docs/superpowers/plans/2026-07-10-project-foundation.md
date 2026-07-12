# Project Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可运行、可测试、可Docker部署的AI Agent Platform全栈基础，并为全部页面和外部占位模块提供稳定扩展点。

**Architecture:** 采用pnpm workspace管理Next.js应用与共享包。Next.js模块化单体负责门户、控制台、CMS和API；PostgreSQL独立持久化；License、Download、OpenLab通过Provider与功能开关隔离。

**Tech Stack:** Next.js App Router、TypeScript、Tailwind CSS、Vitest、Testing Library、PostgreSQL、Drizzle ORM、Docker Compose、Nginx。

> 当前项目指令未授权子代理，本计划在当前会话按 `executing-plans` 检查点执行。

---

## Chunk 1: Repository and Toolchain

### Task 1: Initialize Git and workspace metadata

**Files:**

- Create: `.gitattributes`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`
- Modify: `.gitignore`

- [x] **Step 1: Check local Git and remote repository state**

Run: `git --version`, `git ls-remote https://github.com/Br0u/ai-agent-platform.git`

Expected: Git可用；记录远端是否为空以及默认分支。

- [x] **Step 2: Initialize repository and branch**

Run: `git init -b main`, `git remote add origin https://github.com/Br0u/ai-agent-platform.git`

Expected: 本地分支为`main`，远端名为`origin`。

- [x] **Step 3: Create workspace metadata**

根脚本至少包含：`dev`、`build`、`test`、`typecheck`、`lint`、`format:check`。

- [x] **Step 4: Validate metadata**

Run: `pnpm --version`, `pnpm install --lockfile-only`

Expected: 生成`pnpm-lock.yaml`且无依赖解析错误。

- [ ] **Step 5: Commit repository documents and workspace metadata**

Run: `git add ...`, `git commit -m "chore: 初始化项目文档与工作区"`

## Chunk 2: Next.js Testable Scaffold

### Task 2: Create application scaffold and testing baseline

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/page.test.tsx`

- [x] **Step 1: Install pinned framework and test dependencies**

Run: `pnpm install`

Expected: 安装完成并生成锁文件；版本根据当前官方兼容性确认后固定。

- [x] **Step 2: Write failing home-page test**

```tsx
import { render, screen } from "@testing-library/react";
import HomePage from "./page";

it("presents the product and primary documentation action", () => {
  render(<HomePage />);
  expect(
    screen.getByRole("heading", { name: /AI Agent Platform/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "阅读文档" })).toHaveAttribute(
    "href",
    "/docs",
  );
});
```

- [x] **Step 3: Run test and verify RED**

Run: `pnpm --filter web test src/app/page.test.tsx`

Expected: FAIL，因为`page.tsx`尚未实现产品标题和文档操作。

- [x] **Step 4: Implement minimal page and layout**

实现可访问的标题、正文和文档链接，不提前加入额外营销区块。

- [x] **Step 5: Run test and verify GREEN**

Run: `pnpm --filter web test src/app/page.test.tsx`

Expected: PASS。

- [x] **Step 6: Commit**

Run: `git commit -m "feat(web): 建立可测试的Next.js应用"`

## Chunk 3: Design System and Placeholder Boundary

### Task 3: Implement shared visual tokens and application shell

**Files:**

- Create: `packages/ui/package.json`
- Create: `packages/ui/src/tokens.css`
- Create: `packages/ui/src/app-shell.tsx`
- Create: `packages/ui/src/app-shell.test.tsx`
- Create: `packages/ui/src/index.ts`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`

- [x] **Step 1: Write failing shell test**

验证公开导航包含产品、文档、版本、兼容矩阵、Marketplace和支持，Logo位置使用产品文字而不是假Logo。

- [x] **Step 2: Run test and verify RED**

Expected: FAIL，因为共享Shell不存在。

- [x] **Step 3: Implement tokens and shell**

令牌基线：Blue `#3157D5`、Indigo `#4F46E5`、Violet `#7C3AED`、Ink `#111827`、Canvas `#F5F7FC`。保持44px最小交互高度和可见焦点。

- [x] **Step 4: Run test and verify GREEN**

- [ ] **Step 5: Commit**

Run: `git commit -m "feat(ui): 建立蓝靛紫设计系统与全局框架"`

### Task 4: Implement centralized asset and feature placeholders

**Files:**

- Create: `packages/ui/src/asset-placeholder.tsx`
- Create: `packages/ui/src/asset-placeholder.test.tsx`
- Create: `packages/integrations/package.json`
- Create: `packages/integrations/src/feature-status.ts`
- Create: `packages/integrations/src/feature-status.test.ts`
- Create: `packages/integrations/src/index.ts`

- [x] **Step 1: Write failing asset placeholder test**

验证占位组件具有明确标签、固定宽高比和可访问描述。

- [x] **Step 2: Verify RED**

- [x] **Step 3: Implement minimal asset placeholder**

- [x] **Step 4: Verify GREEN**

- [x] **Step 5: Write failing feature status test**

```ts
it("returns FEATURE_DISABLED for disabled modules", () => {
  expect(getFeatureStatus("license", false)).toEqual({
    module: "license",
    enabled: false,
    mode: "placeholder",
    errorCode: "FEATURE_DISABLED",
  });
});
```

- [x] **Step 6: Verify RED, implement, then verify GREEN**

- [ ] **Step 7: Commit**

Run: `git commit -m "feat: 建立统一资产与外部功能占位边界"`

## Chunk 4: Route Registry and Page Shells

### Task 5: Define route registry

**Files:**

- Create: `apps/web/src/config/routes.ts`
- Create: `apps/web/src/config/routes.test.ts`
- Create: `apps/web/src/components/feature-placeholder-page.tsx`
- Create: `apps/web/src/components/feature-placeholder-page.test.tsx`

- [x] **Step 1: Write failing route tests**

验证PRD要求的路由无重复、公开/控制台/管理分组明确、每条路由有标题和状态。

- [x] **Step 2: Verify RED**

- [x] **Step 3: Implement minimal registry**

- [x] **Step 4: Verify GREEN**

- [x] **Step 5: Write and implement placeholder-page behavior with TDD**

- [x] **Step 6: Commit**

Run: `git commit -m "feat(web): 建立页面路由注册表与功能占位页"`

## Chunk 5: PostgreSQL and Docker Baseline

### Task 6: Create database package and health behavior

**Files:**

- Create: `packages/database/package.json`
- Create: `packages/database/drizzle.config.ts`
- Create: `packages/database/src/schema/users.ts`
- Create: `packages/database/src/schema/roles.ts`
- Create: `packages/database/src/schema/content.ts`
- Create: `packages/database/src/schema/index.ts`
- Create: `packages/database/src/health.ts`
- Create: `packages/database/src/health.test.ts`
- Create: `packages/database/src/index.ts`
- Create: `apps/web/src/app/api/health/live/route.ts`
- Create: `apps/web/src/app/api/health/ready/route.ts`

- [x] **Step 1: Write failing liveness test**

验证liveness不依赖数据库，readiness通过注入的数据库探针返回成功或503。

- [x] **Step 2: Verify RED**

- [x] **Step 3: Implement minimal health functions and routes**

- [x] **Step 4: Verify GREEN**

- [x] **Step 5: Define minimal user, role and content schemas**

配置文件和生成Schema属于TDD例外；通过迁移生成和类型检查验证。

- [x] **Step 6: Commit**

Run: `git commit -m "feat(db): 建立PostgreSQL模型与健康检查"`

### Task 7: Add Docker Compose development and production baseline

**Files:**

- Create: `apps/web/Dockerfile`
- Create: `compose.yaml`
- Create: `infra/nginx/nginx.conf`
- Create: `infra/docker/backup.sh`
- Create: `.env.example`
- Modify: `docs/deployment/server-readiness.md`

- [x] **Step 1: Define compose services**

服务：`proxy`、`web`、`db`、`backup`；数据库不映射公网端口；数据卷与备份卷分离。

- [x] **Step 2: Validate Compose**

Run: `docker compose config`

Expected: 配置展开成功，无缺失变量和语法错误。

- [x] **Step 3: Build production image**

Run: `docker compose build web`

Expected: Next.js standalone镜像构建成功。

- [x] **Step 4: Start and smoke test**

Run: `docker compose up -d --wait db migrate web proxy backup`, then request `/api/health/live` and `/`。

Expected: HTTP 200。

- [x] **Step 5: Commit**

Run: `git commit -m "build: 添加Docker Compose生产部署基线"`

## Chunk 6: Verification and Handoff

### Task 8: Run complete quality gate

**Files:**

- Modify: `progress.md`
- Modify: `task_plan.md`

- [x] **Step 1: Run unit tests**

Run: `pnpm test`

Expected: PASS，0失败。

- [x] **Step 2: Run static checks**

Run: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`

Expected: 全部成功且无警告。

- [x] **Step 3: Run production build**

Run: `pnpm build`

Expected: Next.js构建成功。

- [x] **Step 4: Browser verification**

桌面1440px和移动390px检查首页、占位页、导航和焦点状态；控制台0错误。

- [x] **Step 5: Review sensitive files and Git diff**

确认无`.env`、密码、Token、真实客户信息和生成缓存。

- [x] **Step 6: Update planning files**

记录全部测试结果和剩余工作。

- [ ] **Step 7: Ask before first remote push if authorization is not explicit**

本地提交完成后确认是否推送`origin/main`。
