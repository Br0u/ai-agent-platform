# 华鲲官网公开前端覆盖式迁移 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将低保真原型包含的全部公开官网前端覆盖迁移到现有 Next.js 官网，同时保持聊天、认证、文档、控制台和运营后台不变，并删除原型外公开路由。

**Architecture:** 按页面族增量覆盖，原型负责内容和信息架构，现有 `SiteShell`、`AppShell`、页面族渲染器和设计变量负责技术与视觉实现。每一批先用完整对象合同或真实页面测试获得 RED，再做最小实现并完成桌面/移动浏览器验收；已符合原型的页面只补覆盖证据，不重复改写。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Vitest、Testing Library、Playwright、现有 CSS 设计变量。

**设计规格：** `docs/superpowers/specs/2026-08-11-full-public-site-prototype-overlay-design.md`

---

## 页面映射基线

| 原型 key | 正式路由 |
| --- | --- |
| `home` | `/` |
| `products` | `/product` |
| `key-products` | `/product/standalone` |
| `mdd-2` | `/product/code-agent` |
| `aippt` | `/product/aippt` |
| `aishrek` | `/product/aishrek` |
| `model-optimization` | `/product/model-optimization` |
| `model-task-center` | `/product/model-task-center` |
| `model` | `/product/model` |
| `model-assets` | `/product/model-assets` |
| `model-training` | `/product/model-training` |
| `model-evaluation` | `/product/model-evaluation` |
| `agent-knowledge-base` | `/product/agent-knowledge-base` |
| `knowledge` | `/product/knowledge` |
| `knowledge-metrics` | `/product/knowledge-metrics` |
| `model-data` | `/product/model-data` |
| `model-deploy` | `/product/model-deploy` |
| `coding` | `/product/coding` |
| `coding-project` | `/product/coding-project` |
| `coding-session` | `/product/coding-session` |
| `coding-mobile` | `/product/coding-mobile` |
| `coding-standard` | `/product/coding-standard` |
| `agents` | `/product/agents` |
| `agent-knowledge` | `/product/agent-knowledge` |
| `agent-data` | `/product/data-agent` |
| `agent-video` | `/product/agent-video` |
| `agent-orchestration` | `/product/agent-orchestration` |
| `applications` | `/product/applications` |
| `app-writing` | `/product/app-writing` |
| `app-bidding` | `/product/app-bidding` |
| `app-contract` | `/product/app-contract` |
| `skills` | `/product/skills` |
| `skills-programming` | `/product/skills-programming` |
| `skills-application` | `/product/skills-application` |
| `skills-office` | `/product/skills-office` |
| `governance` | `/product/governance` |
| `solutions` | `/solutions` |
| `solution-detail` | `/solutions/[slug]` 或 `/solutions` 同页状态 |
| `downloads` | `/downloads` |
| `partners` | `/partners` 及同页状态 |
| `pricing` | `/pricing` |
| `contact` | `/contact` |
| `trial` | `/trial` |

### 脚本生成视图映射（路由修改前锁定）

- 通用方案详情 `/solutions/<key>`：`private-yuanqi`、`cluster-planning`、`compute-monitoring`、`model-evaluation`、`model-deployment`、`knowledge-service`、`document-intelligence`、`data-insight`、`knowledge-assets`、`unstructured-data`、`process-automation`、`enterprise-assistant`、`multi-agent`、`video-intelligence`。
- 通用方案筛选 `/solutions?view=scenarios&category=<key>`：`infrastructure`、`knowledge`、`agents`。
- 行业方案详情 `/solutions/<key>`：`government-knowledge`、`government-data`、`government-document`、`government-process`、`finance-knowledge`、`finance-data`、`finance-document`、`finance-assistant`、`healthcare-knowledge`、`healthcare-data`、`healthcare-document`、`healthcare-process`、`enterprise-knowledge`、`enterprise-data`、`enterprise-document`、`enterprise-process`、`enterprise-multi-agent`。
- 行业筛选 `/solutions?view=industries&industry=<key>`：`government`、`finance`、`healthcare`、`enterprise`。
- 案例状态：`/solutions?view=cases&mode=all|industry|scenario`；占位详情 `case-pending-enterprise-knowledge` 承接到 `/solutions/case-pending-enterprise-knowledge`，必须带“未获公开授权”提示。
- 解决方案视图：`overview`、`list`、`detail`、`industry-list`、`industry-detail`、`case-list`、`case-detail`；返回路径、筛选和目录状态由 query + hash 承接。
- 合作伙伴 `/partners?view=<view>#<anchor>`：`overview`；`business` 下 `business-modes`、`business-tiers`、`business-benefits`；`policy` 下 `policy-types`、`policy-cert`、`policy-resources`；`training` 下 `training-system`、`training-courses`、`training-path`、`training-resources`；`become`。
- 下载资源 `/downloads#dl-<key>`：`yuanqi-intro`、`yuanqi-features`、`yuanqi-arch`、`mdd2-intro`、`mdd2-features`、`mdd2-env`、`mdd2-client`、`mdd2-deploy`、`mdd2-usage`、`yuanqi-deploy`、`wp-ai`、`wp-llm`、`wp-agent`。

所有列表、筛选和占位 view 均使用上述正式路由或同页状态，不额外创造无内容页面。

**迁移基线 SHA：** `995c437`。最终范围检查使用此 SHA，而不是只检查未提交差异。

## 文件职责

- `apps/web/src/config/navigation.ts`：公开 Header/Footer、控制台和后台导航；仅改公开导航部分。
- `packages/ui/src/navigation/*`、`packages/ui/src/app-shell.css`：支持原型直达栏目与双 CTA；保持 Agent 注入点。
- `apps/web/src/components/home-*`、`product-portal-*`：首页和产品总览。
- `apps/web/src/components/*-content.ts`：已建立的产品页面族内容合同，优先复用。
- `apps/web/src/app/solutions/*`、`apps/web/src/components/solution-*`：解决方案总览、目录、详情和交互。
- `apps/web/src/app/downloads/*`、`partners/*`、`pricing/*`、`contact/*`、`trial/*`：业务栏目独立页面。
- `apps/web/src/config/routes.ts` 与 `routes.test.ts`：最终公开/保留/删除路由集合。
- `apps/web/e2e/full-public-site-overlay.spec.ts`：全站桌面与移动最终验收。

当前工作树含上一轮被中断的“导航 + 解决方案”测试和导航草稿。执行时先逐项对照本计划，能复用的纳入 RED/GREEN；不符合全站规格的草稿用 `apply_patch` 修正，不使用 reset、clean 或整树回退。

## Chunk 1：路由合同、全局导航与首页

### Task 1：锁定 43 个页面与全部脚本状态映射

**Files:**
- Create: `apps/web/src/config/prototype-route-map.ts`
- Create: `apps/web/src/config/prototype-route-map.test.ts`
- Inspect: `apps/web/src/config/routes.ts`
- Inspect: `apps/web/src/app/**/page.tsx`

- [ ] **Step 1: 建立完整失败合同**

  测试导入尚不存在的 `prototype-route-map.ts`，精确断言：43 个 page key；14 个通用详情；3 个通用筛选；17 个行业详情；4 个行业筛选；1 个案例占位；7 个 solution view；15 个 partner key；13 个 download resource key。测试期望值使用本计划基线，不由实现动态生成。

- [ ] **Step 2: 运行 RED**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/config/prototype-route-map.test.ts`

  Expected: FAIL，唯一根因是无法解析尚不存在的 `./prototype-route-map`。

- [ ] **Step 3: 建立只读生产映射清单**

  创建 `prototype-route-map.ts`，用 readonly object/array 导出上述映射。该清单供后续路由、内容合同和最终 E2E 共用，不负责渲染或跳转。

- [ ] **Step 4: 运行 GREEN**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/config/prototype-route-map.test.ts`

  Expected: PASS；所有计数和精确 key/path 均匹配。

- [ ] **Step 5: 双向盘点实际路由并记录删除候选**

  Run: `rg --files apps/web/src/app | rg '/page\\.tsx$'`

  Run: `rg -n 'publicRoute\\(' apps/web/src/config/routes.ts`

  Expected: 输出形成两份清单；记录未注册旧产品页和原型外公开页，但此任务不声明它们已删除。删除失败合同只在 Chunk 6 创建。

- [ ] **Step 6: 提交**

  Commit: `test(portal): 锁定原型全站路由映射`

### Task 2：准备公开 Header、Footer 和移动导航能力

**Files:**
- Inspect/Modify only reachable items: `apps/web/src/config/navigation.ts`
- Modify: `apps/web/src/config/navigation.test.ts`
- Reuse/Modify: `apps/web/src/config/navigation-overlay.test.ts`
- Modify: `packages/ui/src/navigation/portal-header.tsx`
- Modify: `packages/ui/src/navigation/portal-header.test.tsx`
- Modify: `packages/ui/src/navigation/mega-menu.tsx`
- Modify: `packages/ui/src/navigation/mega-menu.test.tsx`
- Modify: `packages/ui/src/navigation/mobile-navigation.tsx`
- Modify: `packages/ui/src/navigation/mobile-navigation.test.tsx`
- Modify: `packages/ui/src/navigation/navigation.css`
- Modify: `packages/ui/src/app-shell.css`
- Test: `packages/ui/src/app-shell.test.tsx`
- Test: `apps/web/src/components/site-shell/site-shell.test.tsx`
- Test: `apps/web/src/app/{login,register,docs,support,help}/**/*.test.tsx`

- [ ] **Step 1: 整理现有 RED 合同**

  保留并补全 `navigation-overlay.test.ts`：此批先锁定所有已可达的生产父级与精确产品/方案/下载栏目；Footer 不含登录、文档、支持、帮助和删除候选。UI 组件测试用本地 fixture 锁定最终顺序首页、产品、解决方案、下载中心、合作伙伴、价格与服务及伙伴栏目渲染能力。`/partners` 在 Task 10 真实页面与 route 同批完成后才写入生产 `navigation.ts` 并升级 production exact 合同，禁止阶段性 404。

- [ ] **Step 2: 补全 UI 失败合同**

  锁定无 children 的首页/价格直达链接没有空面板，产品等栏目仍有可访问 MegaMenu；桌面与移动均显示联系我们、申请体验；Agent entry 仍位于同一 `site-actions` 且唯一。

  同时记录迁移前保留系统基线：SiteShell portal/assistant/auth/console/admin variant、登录/注册/文档页面壳、support/help 内容入口。禁止通过修改这些页面来让公开导航测试通过。

- [ ] **Step 3: 运行 RED**

  Run: `pnpm --filter @ai-agent-platform/ui exec vitest run src/navigation/portal-header.test.tsx src/navigation/mega-menu.test.tsx src/navigation/mobile-navigation.test.tsx src/app-shell.test.tsx`

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/config/navigation.test.ts src/config/navigation-overlay.test.ts`

  Expected: 旧登录/文档导航合同或 Footer/直达项合同失败；不得因测试路径或环境失败。

- [ ] **Step 4: 最小实现**

  用现有 `PortalNavigationItem.children` 空数组表示直达项；`MegaMenu` 仅为非空 children 渲染面板；移动抽屉支持双 CTA。删除 PortalHeader 的公开登录/文档入口，但不改 SiteShell 的 Agent 注入。对尚不可达的 `/partners` 只验证组件能渲染最终数据，不写入生产 navigation。

- [ ] **Step 5: 更新旧测试并运行 GREEN**

  删除只服务旧导航的信息合同，不用由实现动态生成期望值。运行 Task 2 两条命令，要求全部 PASS。

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/site-shell/site-shell.test.tsx src/app/login/page.test.tsx src/app/register/page.test.tsx src/app/docs/page.test.tsx`

  Expected: PASS；保留系统页面壳与 SiteShell variants 无变化。`git diff -- apps/web/src/components/site-shell apps/web/src/app/login apps/web/src/app/register apps/web/src/app/docs apps/web/src/app/support apps/web/src/app/help apps/web/src/app/assistant` 预期为空。

- [ ] **Step 6: 静态检查并提交**

  Run: `pnpm --filter @ai-agent-platform/ui typecheck && pnpm --filter @ai-agent-platform/ui lint && pnpm --filter @ai-agent-platform/ui format:check`

  Commit: `feat(portal): 覆盖公开导航与行动入口`

### Task 3：复核并补齐首页覆盖

**Files:**
- Modify if failing: `apps/web/src/components/home-content.ts`
- Modify if failing: `apps/web/src/components/home-content.test.ts`
- Modify if failing: `apps/web/src/components/home-sections.tsx`
- Modify if failing: `apps/web/src/components/home.css`
- Test: `apps/web/src/app/page.tsx`
- Test: `apps/web/e2e/home-reference-layout.spec.ts`
- Test: `apps/web/e2e/home-linked-routes.spec.ts`

- [ ] **Step 1: 对照原型建立首页完整对象合同**

  锁定 H1、章节顺序、能力总览、产品组合、方案入口、素材提示和 CTA 原文；明确排除顶部评审 note、评审 Logo 副标题、评审 Footer 和假聊天浮窗。

- [ ] **Step 2: 运行目标测试确认现状**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/home-content.test.ts src/components/home-reveal.test.tsx`

  这是对基线 SHA 前已经迁移并提交的首页做回归审计，不伪造新的生产行为。若新增完整合同直接 GREEN，记录“既有实现已覆盖”并不改生产文件；若因原型字段缺失而 RED，记录精确 received/expected，最小修复后重跑同一命令至 PASS。

- [ ] **Step 3: 运行浏览器验收**

  Run: `pnpm --filter @ai-agent-platform/web exec playwright test e2e/home-reference-layout.spec.ts e2e/home-linked-routes.spec.ts --project=desktop`

  验证 1440px、桌面中宽和 390px；唯一真实 Agent 入口存在。

- [ ] **Step 4: 提交本批差异**

  Commit only if changed: `fix(home): 对齐原型首页内容合同`

## Chunk 2：产品总览、独立产品与模型体系

### Task 4：产品总览与独立产品逐字复核

**Files:**
- Modify if failing: `apps/web/src/components/product-portal-content.ts`
- Modify if failing: `apps/web/src/components/product-portal-content.test.ts`
- Modify if failing: `apps/web/src/components/product-portal-overview.tsx`
- Modify if failing: `apps/web/src/components/standalone-product-center.tsx`
- Modify if failing: `apps/web/src/components/standalone-product-detail.tsx`
- Test: `apps/web/src/components/product-portal-overview.test.tsx`
- Test: `apps/web/src/components/standalone-product-center.test.tsx`
- Test: `apps/web/src/components/standalone-product-detail.test.tsx`
- Test: `apps/web/e2e/product-portal-family.spec.ts`
- Test routes: `apps/web/src/app/product/page.tsx`, `apps/web/src/app/product/standalone/page.tsx`, `apps/web/src/app/product/{code-agent,aippt,aishrek}/page.tsx`

- [ ] **Step 1: 扩充原型完整合同并记录现状**

  对 `products`、`key-products`、`mdd-2`、`aippt`、`aishrek` 逐字锁定 H1、sections、卡片字段、素材槽位、CTA 和路由映射。

- [ ] **Step 2: 运行合同**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/product-portal-content.test.ts src/components/product-portal-overview.test.tsx src/components/standalone-product-center.test.tsx src/components/standalone-product-detail.test.tsx`

  Expected: 5 个 key 的完整对象、5 个真实 Page 接线全部 PASS；若新增字段断言失败，该失败即本任务 RED，必须记录为原型字段/顺序缺失，不接受环境错误。基线前已有真实 TDD 提交，不为已经正确的页面制造假 RED。

- [ ] **Step 3: 仅在 RED 时做最小修复并重跑 GREEN**

  只修改实际失败的生产字段、渲染分支或薄页 slug。重跑 Step 2 原命令，Expected: PASS。

- [ ] **Step 4: 浏览器验收与提交**

  Run: `pnpm --filter @ai-agent-platform/web exec playwright test e2e/product-portal-family.spec.ts --project=desktop`

  Expected: 5 个 key 均 200，精确 H1/内容合同、唯一 Agent、1440px 与 390px 无横向溢出并生成截图。

  Commit only if changed: `fix(products): 完整对齐产品总览与独立产品`

### Task 5：模型、知识底座和数据能力复核

**Files:**
- Modify if failing: `apps/web/src/components/platform-center-content.ts`
- Modify if failing: `apps/web/src/components/model-subpage-content.ts`
- Modify if failing: `apps/web/src/components/capability-foundation-content.ts`
- Modify if failing: `apps/web/src/components/platform-page.tsx`
- Modify if failing: `apps/web/src/components/product-portal.css`
- Test: `apps/web/src/components/platform-center-content.test.ts`
- Test: `apps/web/src/components/platform-center-detail.test.tsx`
- Test: `apps/web/src/components/model-subpage-content.test.ts`
- Test: `apps/web/src/components/model-subpage-family.test.tsx`
- Test: `apps/web/src/components/capability-foundation-content.test.ts`
- Test: `apps/web/src/components/capability-foundation-family.test.tsx`
- Test routes: `apps/web/src/app/product/model/page.tsx`, `knowledge/page.tsx`, `model-{optimization,task-center,assets,training,evaluation,data,deploy}/page.tsx`, `agent-knowledge-base/page.tsx`, `knowledge-metrics/page.tsx`
- E2E: `apps/web/e2e/platform-center-family.spec.ts`, `model-subpage-family.spec.ts`, `capability-foundation-family.spec.ts`

- [ ] **Step 1: 锁定 11 个页面合同**

  覆盖 model、model-optimization、model-task-center、model-assets、model-training、model-evaluation、model-data、model-deploy、knowledge、agent-knowledge-base、knowledge-metrics。

- [ ] **Step 2: 运行内容与真实 Page 接线合同**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/platform-center-content.test.ts src/components/platform-center-detail.test.tsx src/components/model-subpage-content.test.ts src/components/model-subpage-family.test.tsx src/components/capability-foundation-content.test.ts src/components/capability-foundation-family.test.tsx`

  Expected: 11 个 key 的内容、metadata、唯一精确 H1 和薄页 slug 接线均被执行。若新增原型字段断言失败，记录为 RED；如果全部直接 PASS，说明基线前已迁移完整，不修改生产文件。

- [ ] **Step 3: 仅修真实差异并复验**

  页面密度保持原型要求；不得把模型/知识页降级为首页式 Hero + 少量卡片。重跑 Step 2 原命令，Expected: PASS。

- [ ] **Step 4: 三族浏览器验收**

  Run: `pnpm --filter @ai-agent-platform/web exec playwright test e2e/platform-center-family.spec.ts e2e/model-subpage-family.spec.ts e2e/capability-foundation-family.spec.ts --project=desktop`

  Expected: 11 个 key 均 200；精确 H1/内容、目录与交互、唯一 Agent；各 spec 显式覆盖 1440px/390px、无横向溢出和截图。

- [ ] **Step 5: 提交**

  Commit only if changed: `fix(models): 完整对齐模型与能力底座`

## Chunk 3：编程、智能体、行业应用、技能与治理

### Task 6：四个产品页面族与治理页完整复核（19 页）

**Files:**
- Modify if failing: `apps/web/src/components/coding-subpage-content.ts`
- Modify if failing: `apps/web/src/components/agent-subpage-content.ts`
- Modify if failing: `apps/web/src/components/application-subpage-content.ts`
- Modify if failing: `apps/web/src/components/skill-subpage-content.ts`
- Modify if failing: `apps/web/src/components/platform-center-content.ts`
- Tests: matching content and family tests
- E2E: matching four family specs
- Test: `apps/web/src/components/platform-center-detail.test.tsx`
- E2E: `apps/web/e2e/platform-center-family.spec.ts`
- Test routes: `apps/web/src/app/product/coding/page.tsx` + 4 coding 子页；`agents/page.tsx` + 4 agent 子页；`applications/page.tsx` + 3 application 子页；`skills/page.tsx` + 3 skill 子页；`governance/page.tsx`

- [ ] **Step 1: 扩充 19 页完整内容合同**

  编程 5 页：coding + 4 子页；智能体 5 页：agents + 4 子页；行业应用 4 页：applications + 3 子页；技能 4 页：skills + 3 子页；治理 1 页：governance。

- [ ] **Step 2: 运行内容合同并记录 RED 或基线 PASS**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/coding-subpage-content.test.ts src/components/agent-subpage-content.test.ts src/components/application-subpage-content.test.ts src/components/skill-subpage-content.test.ts src/components/platform-center-content.test.ts`

  Expected: 19 页原型对象被锁定。新增字段若缺失则出现 received/expected RED；若直接 PASS，引用基线前各族 TDD 提交，不制造假失败。

- [ ] **Step 3: 页面接线回归**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/coding-subpage-family.test.tsx src/components/agent-subpage-family.test.tsx src/components/application-subpage-family.test.tsx src/components/skill-subpage-family.test.tsx src/components/platform-center-detail.test.tsx`

  Expected: 19 个真实 Page 的固定 slug、metadata、唯一精确 H1、demo 边界和 governance 锚点均 PASS。

- [ ] **Step 4: 最小修复与同命令 GREEN**

  仅修 Step 2/3 的真实差异；保持每族不同的信息密度和微型 UI；Agent 浮窗不进入页面内容模型。重跑两条原命令，Expected: PASS。

- [ ] **Step 5: 浏览器验收**

  Run: `pnpm --filter @ai-agent-platform/web exec playwright test e2e/coding-subpage-family.spec.ts e2e/agent-subpage-family.spec.ts e2e/application-subpage-family.spec.ts e2e/skill-subpage-family.spec.ts e2e/platform-center-family.spec.ts --project=desktop`

  Expected: 19 页均 200、精确 H1/内容、唯一 Agent；1440px/390px 无横向溢出并生成代表截图；governance 真实页面包含四个权限锚点。

- [ ] **Step 6: 提交**

  Commit only if changed: `fix(product-families): 完整对齐四类产品页面`

## Chunk 4：解决方案总览与详情

### Task 7：覆盖解决方案总览、目录和方法交互

**Files:**
- Reuse/Modify: `apps/web/src/app/solutions/page.test.tsx`
- Modify: `apps/web/src/app/solutions/page.tsx`
- Replace: `apps/web/src/app/solutions/solutions.css`
- Create: `apps/web/src/components/solution-overview-content.ts`
- Create: `apps/web/src/components/solution-overview-content.test.ts`
- Create: `apps/web/src/components/solution-overview.tsx`
- Create: `apps/web/src/components/solution-overview.test.tsx`
- Create: `apps/web/e2e/solution-overview-overlay.spec.ts`

- [ ] **Step 1: 完成 RED 合同**

  逐字锁定 Hero、五个问题、关系图、六个通用场景、六步方法及详情、四个行业、五段产品支撑、治理横线、案例占位和 CTA；锁定目录 key/anchor。

- [ ] **Step 2: 运行 RED**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/app/solutions/page.test.tsx src/components/solution-overview-content.test.ts src/components/solution-overview.test.tsx`

  Expected: 旧六卡片页面缺完整内容和交互。

- [ ] **Step 3: 最小实现**

  内容常量与交互渲染分离；目录搜索、折叠、移动抽屉和方法步骤使用一个页面组件，不创建通用配置引擎。

- [ ] **Step 4: 单测 GREEN 与 E2E**

  Run the Step 2 command; expected PASS.

  Run: `pnpm --filter @ai-agent-platform/web exec playwright test e2e/solution-overview-overlay.spec.ts --project=desktop`

  Expected: spec 内显式切换 1440px、900px、390px；桌面目录搜索/折叠、390px 抽屉打开与 Escape 关闭/焦点恢复、方法 tab 键盘切换、reduced-motion、唯一 Agent 和截图全部 PASS。

- [ ] **Step 5: 提交**

  Commit: `feat(solutions): 覆盖解决方案总览与目录`

### Task 8：扩展原型脚本生成的方案详情

**Files:**
- Modify: `apps/web/src/components/solution-detail-content.ts`（共享类型与聚合查询）
- Create: `apps/web/src/components/solution-common-content.ts`
- Create: `apps/web/src/components/solution-industry-content.ts`
- Create: `apps/web/src/components/solution-case-content.ts`
- Modify: `apps/web/src/components/solution-detail-content.test.ts`
- Modify: `apps/web/src/app/solutions/[slug]/page.tsx`
- Modify/Create: detail renderer tests
- Modify: `apps/web/src/config/routes.test.ts`
- Modify: `apps/web/e2e/solution-overview-overlay.spec.ts`

- [ ] **Step 1: 从原型提取完整 catalog/key 合同**

  使用计划基线中的 14 个通用、17 个行业、1 个案例 key；精确锁定 query/hash 返回状态。对未确认案例保留明确占位，不制造客户和成果。

- [ ] **Step 2: 运行 RED**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/solution-detail-content.test.ts`

  Expected: 当前仅 6 个详情 slug，少于原型脚本 catalog。

- [ ] **Step 3: 扩展最小内容模型和静态参数**

  复用现有 `[slug]` 页面；同一种详情只用一个渲染分支。按 common/industry/case 拆内容文件，避免单文件膨胀；聚合器只负责类型、slugs 和查询。列表筛选留在 `/solutions` 同页状态。

- [ ] **Step 4: 运行 GREEN 与真实页面回归**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/solution-detail-content.test.ts src/components/solution-overview-content.test.ts src/components/solution-overview.test.tsx src/app/solutions/page.test.tsx`

  Expected: 14 common + 17 industry + 1 pending case 的 exact content、静态参数、真实 Page 唯一 H1、未知 slug 404 全 PASS。

  Run: `pnpm --filter @ai-agent-platform/web exec playwright test e2e/solution-overview-overlay.spec.ts --project=desktop`

  Expected: 列表筛选、详情进入/返回、目录状态、绝对 pathname/query/hash、390px 抽屉与截图全部 PASS。

- [ ] **Step 5: 提交**

  Commit: `feat(solutions): 迁移方案与案例详情视图`

## Chunk 5：下载、合作伙伴、价格、联系与体验

### Task 9：迁移下载中心

**Files:**
- Replace: `apps/web/src/app/downloads/page.tsx`
- Create: `apps/web/src/components/download-center-content.ts`
- Create: `apps/web/src/components/download-center-content.test.ts`
- Create: `apps/web/src/components/download-center.tsx`
- Create: `apps/web/src/components/download-center.test.tsx`
- Create: `apps/web/src/app/downloads/downloads.css`
- Create: `apps/web/e2e/business-entry-pages.spec.ts`
- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`

- [ ] **Step 1: 建立下载数据 RED 合同**

  精确锁定 13 个资源 key、四个 section anchor、产品标签、标题、file/desc、`mdd2-client` 版本/系统/大小，以及所有“原型阶段不实际下载”提示。

- [ ] **Step 2: 建立下载交互 RED 合同**

  测试目录搜索/清空、桌面折叠、移动抽屉、预览/文件 toast、软件下载确认弹层、checkbox 才能启用确认、Escape/关闭后焦点恢复。

- [ ] **Step 3: 运行 RED**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/download-center-content.test.ts src/components/download-center.test.tsx`

  Expected: FAIL；内容/组件模块尚不存在，或旧 RegisteredRoutePage scaffold 缺原型内容。不得以缺测试环境为 RED。

- [ ] **Step 4: 最小实现并注册 live route**

  内容常量与 client 交互分离；下载/预览只显示原型明确占位，不请求真实文件。CSS 使用现站变量，高密度资源卡片桌面 3 列、390px 单列。

- [ ] **Step 5: 运行 GREEN**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/download-center-content.test.ts src/components/download-center.test.tsx src/config/routes.test.ts`

  Expected: PASS；真实 `/downloads` Page、metadata、目录、弹层与占位行为完整。

- [ ] **Step 6: 浏览器验收**

  Run: `pnpm --filter @ai-agent-platform/web exec playwright test e2e/business-entry-pages.spec.ts --project=desktop --grep downloads`

  Expected: spec 显式覆盖 1440px/390px、目录抽屉、Escape/焦点恢复、无横溢、唯一 Agent 和两张截图。

- [ ] **Step 7: 提交**

  Commit: `feat(downloads): 迁移下载中心`

### Task 10：迁移合作伙伴完整视图

**Files:**
- Create: `apps/web/src/app/partners/page.tsx`
- Create: `apps/web/src/app/partners/partners.css`
- Create: `apps/web/src/components/partner-center-content.ts`（共享类型、目录、聚合查询）
- Create: `apps/web/src/components/partner-overview-content.ts`
- Create: `apps/web/src/components/partner-business-content.ts`
- Create: `apps/web/src/components/partner-policy-content.ts`
- Create: `apps/web/src/components/partner-training-content.ts`
- Create: `apps/web/src/components/partner-become-content.ts`
- Create: `apps/web/src/components/partner-center-content.test.ts`
- Create: `apps/web/src/components/partner-center.tsx`
- Create: `apps/web/src/components/partner-center.test.tsx`
- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`
- Modify: `apps/web/src/config/navigation.ts`
- Modify: `apps/web/src/config/navigation.test.ts`
- Modify: `apps/web/src/config/navigation-overlay.test.ts`
- Modify: `apps/web/e2e/business-entry-pages.spec.ts`

- [ ] **Step 1: 建立五视图与 15 key RED 合同**

  精确锁定 overview；business + modes/tiers/benefits；policy + types/cert/resources；training + system/courses/path/resources；become。锁定目录顺序、搜索字段、面包屑、联系 topic 和返回历史。

- [ ] **Step 2: 锁定宣传边界**

  所有“200+ 伙伴、500+ 企业客户、10万+ AI 应用上线”等数字必须与“示意内容/正式上线后替换”提示在同一视图；无提示即测试失败。联系卡片保持电话、邮箱、二维码“待确认”。

- [ ] **Step 3: 运行 RED**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/partner-center-content.test.ts src/components/partner-center.test.tsx src/config/routes.test.ts`

  Expected: FAIL；`/partners` 页面/内容模块和 route 尚不存在。

- [ ] **Step 4: 最小实现**

  使用一个 client shell 承接 query view/hash、目录搜索/折叠/移动抽屉、返回和联系 dialog；五组内容文件只存数据，不各自创建渲染器。真实 `/partners` Page 与 route 可达后，在同一步把合作伙伴写入生产 Header/Footer 最终顺序，避免任何提交点出现死链接。

- [ ] **Step 5: 运行 GREEN**

  Run the Step 3 command.

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/config/navigation.test.ts src/config/navigation-overlay.test.ts`

  Expected: PASS；15 key、五视图、真实 page/metadata、联系弹层和宣传边界完整；最终 Header/Footer 精确顺序通过，所有公开项均可达。

- [ ] **Step 6: 浏览器验收**

  Run: `pnpm --filter @ai-agent-platform/web exec playwright test e2e/business-entry-pages.spec.ts --project=desktop --grep partners`

  Expected: 1440px/390px 下五视图、目录搜索/折叠、query/hash、Escape/焦点恢复、无横溢、唯一 Agent 与截图全部 PASS。

- [ ] **Step 7: 提交**

  Commit: `feat(partners): 迁移合作伙伴中心`

### Task 11：覆盖价格、联系和申请体验

**Files:**
- Replace: `apps/web/src/app/pricing/page.tsx`
- Modify: `apps/web/src/app/pricing/page.test.tsx`
- Replace: `apps/web/src/app/contact/page.tsx`
- Modify: `apps/web/src/app/contact/page.test.tsx`
- Create: `apps/web/src/app/contact/contact.css`
- Audit/Delete if unreferenced: `apps/web/src/app/contact/pricing-contact-summary.tsx`, matching test
- Modify if failing: `apps/web/src/app/trial/page.tsx`
- Modify if failing: `apps/web/src/components/trial-content.ts`
- Modify if failing: `apps/web/src/components/trial-content.test.ts`
- Modify if failing: `apps/web/src/components/trial-experience.tsx`
- Modify if failing: `apps/web/src/components/trial-experience.test.tsx`
- Audit/Delete if unreferenced: `apps/web/src/components/portal/pricing/*`
- Audit/Delete if unreferenced: `apps/web/src/features/pricing/*`
- Audit/Delete if unreferenced: `apps/web/src/app/api/v1/pricing/estimate/*`
- Modify: `apps/web/e2e/business-entry-pages.spec.ts`

- [ ] **Step 1: 写价格和联系页面 RED 合同**

  Pricing 精确只显示 H1“价格与服务内容待后续确认”，不得保留额外价格、模块或估算 UI。Contact 精确锁定 eyebrow/H1/lead、四个 value tags、地址、三个待确认/服务时间字段、返回按钮，以及产品/解决方案/伙伴三个 CTA。

- [ ] **Step 2: 运行价格/联系 RED**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/app/pricing/page.test.tsx src/app/contact/page.test.tsx`

  Expected: FAIL；当前 pricing calculator 和 contact scaffold 与原型不符。

- [ ] **Step 3: 最小覆盖价格和联系**

  价格使用正式空状态，不保留低保真评审 chrome。Contact 保留 `topic` query 作为咨询上下文，但不再渲染已删除的 pricing summary。运行：
  `rg -n 'PricingCalculator|PricingContactSummary|pricing-query|pricing/estimate' apps/web/src --glob '!**/*.test.*'`
  Expected after replacement: 保留系统无调用；若输出仅来自待删除旧 pricing 文件，则用 apply_patch 精确删除该完整死链。

- [ ] **Step 4: 运行价格/联系 GREEN**

  Run the Step 2 command.

  Expected: PASS；原型原文、metadata、query topic 和三个 CTA 完整。

- [ ] **Step 5: 复核申请体验完整合同**

  现有 `trial-content.ts` 已包含原型 hero、4 tags、3 steps、CTA、4 fields、验证码、success。补真实 page 接线、立即填写/联系我们、dialog validation 和焦点合同。

- [ ] **Step 6: 运行 trial 合同并按需 RED→GREEN**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/trial-content.test.ts src/components/trial-experience.test.tsx`

  Expected: 原型完整合同 PASS；若新增页面接线或焦点断言失败，记录精确 RED，最小修复后重跑同一命令至 PASS。不修改服务端，因为当前体验表单仅本地原型状态，没有提交 API。

- [ ] **Step 7: 浏览器验收**

  Run: `pnpm --filter @ai-agent-platform/web exec playwright test e2e/business-entry-pages.spec.ts --project=desktop --grep 'pricing|contact|trial'`

  Expected: 三页 1440px/390px，精确 H1/正文、contact query、trial 校验/成功/关闭焦点、唯一 Agent、无横溢和截图 PASS。

- [ ] **Step 8: 提交**

  Commit: `feat(business): 覆盖价格联系与体验入口`

## Chunk 6：删除旧公开站点并完成全站验收

### Task 12：删除原型外公开路由和死代码

**Files:**
- Delete: `apps/web/src/app/releases/**`
- Delete: `apps/web/src/app/roadmap/**`
- Delete: `apps/web/src/app/openlab/**`
- Delete: `apps/web/src/app/compatibility/**`
- Delete: `apps/web/src/app/marketplace/**`
- Delete: `apps/web/src/app/blog/**`
- Delete: `apps/web/src/app/cases/**`
- Delete: `apps/web/src/app/product/hci/**`
- Delete: `apps/web/src/app/product/knowledge-agent/**`
- Delete: `apps/web/src/app/product/office-agent/**`
- Delete: `apps/web/src/app/product/tgdataxai/**`
- Delete: `apps/web/src/app/product/video-agent/**`
- Delete: `apps/web/src/app/product/[slug]/**`
- Delete if no retained caller: `apps/web/src/app/[...slug]/**`
- Modify: `apps/web/src/config/routes.ts`
- Modify: `apps/web/src/config/routes.test.ts`
- Create: `apps/web/src/config/public-route-files.test.ts`
- Modify: `apps/web/src/config/navigation.ts`
- Modify: `apps/web/src/components/product-content.ts`
- Modify: `apps/web/src/components/solution-detail-content.ts`
- Modify: `apps/web/src/components/agent-subpage-content.ts`
- Modify: `apps/web/src/components/application-subpage-content.ts`
- Modify: `apps/web/src/content/operations.mdx`
- Modify: exact tests paired with the production files above
- Preserve: `/support`, `/help`, `/docs/**`, `/assistant`, auth/staff/console/admin routes

- [ ] **Step 1: 先锁保留系统的当前基线**

  在删除公开路由前先运行并保存以下结果，迁移结束必须以相同命令、相同行为再次通过：

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/site-shell/site-shell.test.tsx src/components/site-shell/shell-route.test.ts src/server/assistant/placeholder-assistant-provider.test.ts src/server/assistant/assistant-runtime.test.ts src/app/console/onboarding/page.test.tsx src/app/console/profile/page.test.tsx src/app/admin/admin-page-values.test.ts`

  Run: `pnpm --filter @ai-agent-platform/web exec playwright test e2e/auth-access.spec.ts e2e/auth-smoke.spec.ts e2e/assistant-experience.spec.ts e2e/assistant-runtime.spec.ts e2e/cms-documents.spec.ts --project=desktop`

  Expected: PASS；登录/注册/员工入口保持原页面壳，console/admin 保持原登录重定向或权限拒绝，docs CMS 与 assistant 关键交互保持原结果。不得把受保护路由改成公开 200。

- [ ] **Step 2: 写删除边界 RED 合同**

  `routes.test.ts` 精确锁最终公开 registry，同时保留 `/support`、`/help`、`/docs/**`、auth/staff/console/admin。独立的 `public-route-files.test.ts` 使用 Node `fs.existsSync` 校验待删除公开 `page.tsx` 不存在，并校验保留路由文件仍存在；不要把文件系统逻辑塞进 registry 单测。

- [ ] **Step 3: 运行 RED**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/config/routes.test.ts src/config/public-route-files.test.ts src/config/prototype-route-map.test.ts`

  Expected: FAIL；删除候选仍注册且对应公开 `page.tsx` 仍存在。保留路由断言应已通过。

- [ ] **Step 4: 删除前做精确调用关系审计**

  Run:

  ```bash
  rg -n '"/(releases|roadmap|openlab|compatibility|marketplace|blog|cases)([/#?" ]|$)|"/product/(hci|knowledge-agent|office-agent|tgdataxai|video-agent)([/#?" ]|$)' apps/web/src -g '!app/admin/**' -g '!app/console/**'
  ```

  Expected before deletion: 非零，至少覆盖公开 Footer、`product-content.ts`、`solution-detail-content.ts`、agent/application 内容、solutions 页面和 docs 内容中的真实旧链接。逐项按原型映射到 `/solutions?...`、新的产品 key、同页锚点，或删除不再存在的 CTA；console/admin 的同名路径不在本次删除范围。

  另运行：

  ```bash
  rg -n '"/(support|help|docs)([/#?" ]|$)' apps/web/src/config/navigation.ts apps/web/src/server/assistant apps/web/src/app/console apps/web/src/app/admin
  ```

  Expected: assistant/console/admin 依赖可保留；`navigation.ts` 的公开 Header/Footer 分组不得保留这些入口。

- [ ] **Step 5: 使用 apply_patch 删除精确文件并更新注册表**

  不使用 `rm`、`git clean`、reset 或通配删除。只删除清单中的公开页面与确认无保留调用的死代码；不删除同名 console/admin 实现，也不改 assistant provider 数据。

- [ ] **Step 6: 运行删除 GREEN 与零残留审计**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/config/routes.test.ts src/config/public-route-files.test.ts src/config/prototype-route-map.test.ts src/config/navigation.test.ts src/components/product-content.test.ts src/components/solution-detail-content.test.ts src/components/agent-subpage-content.test.ts src/components/application-subpage-content.test.ts`

  Expected: PASS；最终 public registry、文件系统、迁移后的内链全部一致。

  重新运行 Step 4 第一条 `rg`，但排除保留管理范围：

  ```bash
  rg -n '"/(releases|roadmap|openlab|compatibility|marketplace|blog|cases)([/#?" ]|$)|"/product/(hci|knowledge-agent|office-agent|tgdataxai|video-agent)([/#?" ]|$)' apps/web/src -g '!app/admin/**' -g '!app/console/**' -g '!**/*.test.*'
  ```

  Expected: exit 1 / 无输出。测试文件中的旧路径只允许存在于“应返回 404”的负向合同。

- [ ] **Step 7: 重跑保留系统基线**

  原样重跑 Step 1 两条命令。

  Expected: PASS；auth/register/staff 页面壳、console/admin 的原 redirect/permission 行为、docs CMS、support/help 依赖和 assistant 关键交互均未变化。检查以下范围相对基线无非必要生产差异：

  ```bash
  git diff --name-status 995c437 -- apps/web/src/components/assistant apps/web/src/server/assistant apps/web/src/app/assistant apps/web/src/app/login apps/web/src/app/register apps/web/src/app/staff apps/web/src/app/console apps/web/src/app/admin apps/web/src/app/docs
  ```

  Expected: 仅计划明确允许的公开导航引用变化；上述保留系统生产实现无输出。若测试为适配新公开 Header 必须改，生产功能仍不得改。

- [ ] **Step 8: 提交**

  Commit: `refactor(portal): 删除原型外公开路由`

### Task 13：全站浏览器验收与发布门槛

**Files:**
- Create: `apps/web/e2e/full-public-site-overlay.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-11-full-public-site-prototype-overlay.md`（仅勾选已验证项）

- [x] **Step 1: 建立全站 E2E 清单**

  覆盖导航、43 个页面 key、全部脚本生成 view/key、删除路由 404、唯一 Agent、评审 chrome 不存在。显式 `setViewportSize` 验收 1440px、900px、390px；代表页在 1440px/390px 截图。保留系统不统一断言 200：support/help/docs 锁原页面壳，auth/console/admin 锁 Task 12 记录的 redirect/permission 行为。

  这是聚合审计，不额外修改生产实现，也不伪造 RED；各页面族和删除边界已在前序任务获得真实 RED→GREEN。先让 Playwright 正常收集该 spec，若发现漏接线则回到对应任务的窄合同修复。

  Run: `pnpm --filter @ai-agent-platform/web exec playwright test e2e/full-public-site-overlay.spec.ts --project=desktop --list`

  Expected: 收集成功，测试数与清单一致。

- [x] **Step 2: 运行 production build**

  Run: `pnpm --filter @ai-agent-platform/web build`

  Expected: exit 0，所有静态页生成完成。恢复仅由 build 触发的 `apps/web/next-env.d.ts` dev/prod types 自动变动。

- [x] **Step 3: 运行全站 Playwright GREEN**

  Run: `pnpm --filter @ai-agent-platform/web exec playwright test e2e/full-public-site-overlay.spec.ts --project=desktop`

  Expected: PASS；1440/900/390 三档无横溢，Header/移动抽屉/同源链接/全部 key 与 view/404/唯一 Agent/评审 chrome 排除均通过，代表页 1440/390 截图生成。

- [x] **Step 4: 重跑保留系统浏览器回归**

  Run: `pnpm --filter @ai-agent-platform/web exec playwright test e2e/auth-access.spec.ts e2e/auth-smoke.spec.ts e2e/assistant-experience.spec.ts e2e/assistant-runtime.spec.ts e2e/cms-documents.spec.ts --project=desktop`

  Expected: PASS；结果与 Task 12 Step 1 基线一致。

- [x] **Step 5: 运行全量发布门槛**

  Run: `pnpm --filter @ai-agent-platform/web test`

  Run: `pnpm --filter @ai-agent-platform/web typecheck`

  Run: `pnpm --filter @ai-agent-platform/web lint`

  Run: `pnpm --filter @ai-agent-platform/web format:check`

  Run: `pnpm --filter @ai-agent-platform/ui test && pnpm --filter @ai-agent-platform/ui typecheck && pnpm --filter @ai-agent-platform/ui lint && pnpm --filter @ai-agent-platform/ui format:check`

  Expected: 所有命令 exit 0；若 Web test 仅因沙箱本地监听 EPERM 失败，按原命令在授权环境重跑并记录两次结果，不把沙箱失败写成通过。

- [x] **Step 6: 提交前检查整条迁移范围与计划**

  Run: `git diff --check 995c437`

  Run: `git diff --name-status 995c437`

  Run: `git status --short`

  Expected: 包含已提交与当前未提交内容的整条迁移 diff 无空白错误；文件清单只包含计划范围；`git status` 只列即将提交的 E2E 和计划勾选。显式确认 assistant/chat、auth/register/staff/console/admin/docs/support/help 的生产实现无非必要差异，计划勾选均有新鲜证据。

- [x] **Step 7: 最终提交**

  Commit: `test(portal): 验收公开官网覆盖式迁移`

- [x] **Step 8: 提交后复核**

  Run: `git diff --check 995c437...HEAD`

  Run: `git diff --name-status 995c437...HEAD`

  Run: `git status --short`

  Expected: 分支范围无空白错误且仅含计划范围文件；工作树为空。
