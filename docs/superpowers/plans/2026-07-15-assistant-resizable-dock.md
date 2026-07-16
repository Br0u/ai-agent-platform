# AI 助手可伸缩右侧工作区 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留快速助手和 `/assistant` 全页工作区的前提下，新增可拖拽、可键盘调宽、宽度持久化的覆盖式右侧 AI 助手工作区，并让三种形态共享同一会话。

**Architecture:** `AssistantExperienceProvider` 作为唯一展示状态机和会话拥有者；`AssistantDock` 通过 Portal 提供模态覆盖层；`useAssistantDockSize` 单独负责尺寸与存储。Dock 与全页工作区复用消息列表和 composer，快速助手保持轻量。路由只决定全页工作区，非 `/assistant` 页面才允许 quick/dock。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Framer Motion、Testing Library/Vitest、Playwright、CSS、localStorage

**Spec:** `docs/superpowers/specs/2026-07-15-assistant-resizable-dock-design.md`

---

## File Structure

### Create

- `apps/web/src/components/assistant/assistant-conversation.tsx`：Dock 与全页工作区共享的消息列表、状态播报和多行 composer。
- `apps/web/src/components/assistant/assistant-conversation.css`：共享消息与 composer 的基础样式，通过 `data-variant` 支持 dock/workspace 尺寸差异。
- `apps/web/src/components/assistant/assistant-conversation.test.tsx`：共享会话内容的语义、发送、重试、键盘与注册行为。
- `apps/web/src/components/assistant/use-assistant-service-state.ts`：助手健康状态、刷新 deadline、请求去重和服务端初始状态接纳。
- `apps/web/src/components/assistant/use-assistant-service-state.test.tsx`：共享状态、刷新竞态、超时、卸载取消和非法响应。
- `apps/web/src/components/assistant/use-assistant-dock-size.ts`：宽度恢复、视口钳制、pointer/keyboard 调整和清理。
- `apps/web/src/components/assistant/use-assistant-dock-size.test.tsx`：尺寸边界、存储异常、断点切换与拖拽取消。
- `apps/web/src/components/assistant/assistant-dock.tsx`：Portal、遮罩、头部、焦点陷阱、inert 与滚动锁。
- `apps/web/src/components/assistant/assistant-dock.css`：B 型外层、A 型内部布局、桌面 resize 和移动全屏样式。
- `apps/web/src/components/assistant/assistant-dock.test.tsx`：打开/关闭、焦点、背景隔离、形态切换和移动语义。

### Modify

- `apps/web/src/components/assistant/use-assistant-session.ts`：路由变化不再取消发送中的请求；请求保留发起时 pathname。
- `apps/web/src/components/assistant/use-assistant-session.test.tsx`：补跨路由继续请求和卸载仍取消的测试。
- `apps/web/src/components/assistant/assistant-experience-provider.tsx`：增加 `closed | quick | dock` 展示状态与精确打开方法。
- `apps/web/src/components/assistant/assistant-experience-provider.test.tsx`：状态转换、路由规范化、触发器焦点和单 composer 测试。
- `apps/web/src/components/assistant/assistant-workspace.tsx`：改用共享消息列表/composer，不改变服务状态和会话栏。
- `apps/web/src/components/assistant/assistant-workspace.css`：删除已迁移的消息/composer重复样式，仅保留全页布局。
- `apps/web/src/components/assistant/assistant-workspace.test.tsx`：锁定共享组件接线与现有工作区行为。
- `apps/web/src/components/ui/floating-chat-widget-shadcnui.tsx`：只在 `surface=quick` 时渲染；增加展开为 Dock 操作。
- `apps/web/src/components/ui/floating-chat-widget-shadcnui.css`：保留快速浮窗样式，删除不再需要的全页链接布局。
- `apps/web/src/components/ui/floating-chat-widget-shadcnui.test.tsx`：验证 quick/dock 切换且会话不丢失。
- `apps/web/src/components/site-shell/site-shell.tsx`：顶部入口打开 Dock、挂载 `AssistantDock`、路由进入全页时关闭 surface。
- `apps/web/src/components/site-shell/site-shell.test.tsx`：验证顶部/浮动入口分工、单一挂载和路由行为。
- `packages/ui/src/app-shell.tsx`：为 portal/assistant 背景根增加 `data-assistant-background-root`。
- `packages/ui/src/app-shell.test.tsx`：锁定背景根标记，避免 Portal inert 误伤。
- `apps/web/e2e/assistant-experience.spec.ts`：迁移失效选择器并新增 Dock 调宽/持久化/形态切换 E2E。
- `apps/web/e2e/pricing-assistant.spec.ts`：移除 `.assistant-panel` 静态 CSS 旧断言，改为新稳定语义。
- `docs/testing/assistant-experience-acceptance.md`：补右侧工作区验收命令和预期结果。

## Chunk 1: 会话连续性与状态机

### Task 1: 先修复失效的助手 E2E 定位

**Files:**
- Modify: `apps/web/e2e/assistant-experience.spec.ts`

- [ ] **Step 1: 把旧实现选择器列成明确失败清单**

在测试中移除以下旧实现耦合：

```text
.assistant-panel
.assistant-message--assistant
[data-motion-state]
```

改为角色和可访问名称；暂时保留现有 quick 浮窗行为，例如：

```ts
const quickDialog = page.getByRole("dialog", { name: "M 助手" });
const answer = quickDialog.getByRole("log").getByText("回答内容");
```

- [ ] **Step 2: 运行静态搜索确认旧选择器当前存在**

Run: `rg -n "assistant-panel|assistant-message--assistant|data-motion-state" apps/web/e2e/assistant-experience.spec.ts`

Expected: 修改前命中旧选择器；修改后该文件 0 命中。`pricing-assistant.spec.ts` 的旧 CSS 断言留到 Task 9 与新 Dock E2E 一起迁移。

- [ ] **Step 3: 用稳定语义替换旧关闭动画断言**

不要测试 Framer Motion 私有状态。点击关闭后断言 dialog 最终卸载并焦点回到触发器：

```ts
await page.getByRole("button", { name: "关闭 M 助手" }).click();
await expect(quickDialog).toHaveCount(0);
await expect(page.getByRole("button", { name: "打开 M 助手" })).toBeFocused();
```

- [ ] **Step 4: 运行真实隔离 E2E 验证 GREEN**

Run: `sh docs/testing/run-assistant-experience-e2e.sh`

Expected: desktop/mobile 的 `assistant-experience.spec.ts` 全部 PASS，脚本退出后容器与卷被清理。

- [ ] **Step 5: 提交测试清理**

```bash
git add apps/web/e2e/assistant-experience.spec.ts
git commit -m "test(assistant): 迁移旧浮窗验收选择器"
```

### Task 2: 发送中跨形态和路由保持同一请求

**Files:**
- Modify: `apps/web/src/components/assistant/use-assistant-session.ts`
- Modify: `apps/web/src/components/assistant/use-assistant-session.test.tsx`

- [ ] **Step 1: 写路由变化不中止请求的失败测试**

使用 `renderHook` 的 `rerender` 改变 pathname，在请求未完成时切换到 `/assistant`：

```ts
it("keeps an active request alive across pathname changes", async () => {
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockReturnValue(new Promise((done) => (resolve = done)));
  const { result, rerender } = renderHook(
    ({ pathname }) => useAssistantSession(pathname),
    { initialProps: { pathname: "/pricing" } },
  );

  act(() => void result.current.submit("部署问题"));
  rerender({ pathname: "/assistant" });
  resolve(success("仍然完成"));

  await waitFor(() => expect(result.current.requestStatus).toBe("idle"));
  expect(result.current.messages.at(-1)?.content).toBe("仍然完成");
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toMatchObject({
    context: { pathname: "/pricing" },
  });
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/use-assistant-session.test.tsx`

Expected: FAIL；当前 pathname effect 中止请求并重置状态。

- [ ] **Step 3: 将 pathname 从取消请求 effect 中移除**

保留以下取消边界：组件卸载、endpoint/timeout 改变和超时。`send()` 继续接受调用瞬间的 pathname，不在响应时读取新 pathname。

```ts
useEffect(() => {
  requestToken.current += 1;
  cancelActiveRequest(NAVIGATION_ABORT);
  if (requestStatusRef.current === "sending") updateRequestStatus("idle");
}, [cancelActiveRequest, endpoint, timeoutMs, updateRequestStatus]);
```

- [ ] **Step 4: 补卸载仍取消和跨路由不重复请求断言**

使用 `vi.useFakeTimers()`：断言 rerender 后 `fetch` 仍只有一次；unmount 后 signal 为 aborted，`vi.getTimerCount()` 为 0。

- [ ] **Step 5: 运行 focused GREEN**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/use-assistant-session.test.tsx`

Expected: PASS。

- [ ] **Step 6: 提交会话生命周期修复**

```bash
git add apps/web/src/components/assistant/use-assistant-session.ts apps/web/src/components/assistant/use-assistant-session.test.tsx
git commit -m "fix(assistant): 保持跨路由请求连续性"
```

### Task 3: 建立单一助手展示状态机

**Files:**
- Modify: `apps/web/src/components/assistant/assistant-experience-provider.tsx`
- Modify: `apps/web/src/components/assistant/assistant-experience-provider.test.tsx`
- Modify: `apps/web/src/components/assistant/use-assistant-session.ts`
- Modify: `apps/web/src/components/assistant/use-assistant-session.test.tsx`
- Modify: `apps/web/src/components/ui/floating-chat-widget-shadcnui.tsx`
- Modify: `apps/web/src/components/ui/floating-chat-widget-shadcnui.test.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.test.tsx`

- [ ] **Step 1: 写 `closed | quick | dock` 转换失败测试**

测试 Harness 分别触发：

```ts
experience.openQuickFrom(trigger);
expect(experience.surface).toBe("quick");
experience.openDockFrom(trigger);
expect(experience.surface).toBe("dock");
experience.collapseToQuick();
expect(experience.surface).toBe("quick");
experience.close();
expect(experience.surface).toBe("closed");
```

同时 rerender `pathname="/assistant"`，断言 surface 规范化为 `closed`；断言 `AssistantSession` 不再暴露 `open/openAssistant/closeAssistant`。

- [ ] **Step 2: 运行 Provider 测试确认 RED**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/assistant-experience-provider.test.tsx`

Expected: FAIL；新 API 尚不存在。

- [ ] **Step 3: 将展示状态从 Session 完全移到 Provider**

从 `AssistantSession` 删除 `open`、`openAssistant`、`closeAssistant` 及对应 `useState`。会话 Hook 只负责 draft/messages/request，`surface` 成为唯一展示真源，不保留同步或兼容双状态。

- [ ] **Step 4: 实现最小 Provider 状态接口**

```ts
export type AssistantSurface = "closed" | "quick" | "dock";

export type AssistantExperience = {
  surface: AssistantSurface;
  session: AssistantSession;
  openQuickFrom(trigger: HTMLElement): void;
  openDockFrom(trigger: HTMLElement): void;
  collapseToQuick(): void;
  close(): void;
  registerComposer(element: HTMLElement | null): void;
  focusComposer(): void;
};
```

用一个 `openSurfaceFrom(surface, trigger)` 内部函数记录精确触发器。对外暴露的 surface 在 pathname 为 `/assistant` 时同步派生为 `closed`，避免路由切换首帧暴露旧界面；effect 再清理内部状态，但不清空 session。

- [ ] **Step 5: 在同一任务迁移现有消费者**

- `FloatingChatWidget` 用 `surface === "quick"` 决定渲染，launcher 调用 `openQuickFrom`。
- `SiteShell` 用 `surface !== "closed"` 提供 header 激活态；本任务暂时保留顶部入口直达 `/assistant`，直到 Task 8 接线时再改为 `openDockFrom`。
- quick、provider 与 site shell 测试不再读取 `session.open`。

这样本提交可独立编译，且不存在 quick 与 dock 的双状态源。

- [ ] **Step 6: 补焦点和单 composer 测试**

覆盖：close 返回最后触发器；quick→dock 不提前把焦点退回；stale composer 不被 focus；Provider 卸载清理引用。

- [ ] **Step 7: 运行 focused GREEN 与类型检查**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/assistant-experience-provider.test.tsx src/components/assistant/use-assistant-session.test.tsx src/components/ui/floating-chat-widget-shadcnui.test.tsx src/components/site-shell/site-shell.test.tsx`

Run: `pnpm --filter @ai-agent-platform/web typecheck`

Expected: PASS。

- [ ] **Step 8: 提交状态机和现有消费者迁移**

```bash
git add apps/web/src/components/assistant/assistant-experience-provider.tsx apps/web/src/components/assistant/assistant-experience-provider.test.tsx apps/web/src/components/assistant/use-assistant-session.ts apps/web/src/components/assistant/use-assistant-session.test.tsx apps/web/src/components/ui/floating-chat-widget-shadcnui.tsx apps/web/src/components/ui/floating-chat-widget-shadcnui.test.tsx apps/web/src/components/site-shell/site-shell.tsx apps/web/src/components/site-shell/site-shell.test.tsx
git commit -m "feat(assistant): 增加三形态展示状态机"
```

## Chunk 2: 可复用对话与可伸缩 Dock

### Task 4: 提取共享服务状态控制器

**Files:**
- Create: `apps/web/src/components/assistant/use-assistant-service-state.ts`
- Create: `apps/web/src/components/assistant/use-assistant-service-state.test.tsx`
- Modify: `apps/web/src/components/assistant/assistant-experience-provider.tsx`
- Modify: `apps/web/src/components/assistant/assistant-experience-provider.test.tsx`
- Modify: `apps/web/src/components/assistant/assistant-workspace.tsx`
- Modify: `apps/web/src/components/assistant/assistant-workspace.test.tsx`

- [ ] **Step 1: 写服务状态共享失败测试**

覆盖：服务端初始状态接纳、同 tick 重复刷新只发一次、5 秒 deadline、非法响应降级、卸载中止、晚响应不能覆盖新状态。单独维护 `hasResolvedServiceState`，初始 degraded 不得被误当成已完成首次加载；旧服务端初始值不得覆盖进行中或刚完成的更新请求。

```ts
const {
  serviceState,
  refreshingServiceState,
  adoptServiceState,
  refreshServiceState,
} = useAssistantServiceState();
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/use-assistant-service-state.test.tsx`

Expected: FAIL；共享 Hook 尚不存在。

- [ ] **Step 3: 从 `AssistantWorkspace` 提取现有刷新控制器**

移动现有 5 秒超时、AbortController、generation guard 和 schema 校验到 Hook。Hook 初始使用安全的 degraded 状态，`adoptServiceState(serverState)` 接纳 `/assistant` 服务端提供的已校验状态。

- [ ] **Step 4: 让 Provider 成为唯一服务状态拥有者**

`AssistantExperience` 增加：

```ts
serviceState: AssistantStatusResponse;
refreshingServiceState: boolean;
adoptServiceState(state: AssistantStatusResponse): void;
refreshServiceState(): Promise<void>;
```

quick/dock 打开时若尚未取得状态，只触发一次 lazy refresh；同一 Provider 下三种形态读取同一对象。

- [ ] **Step 5: 迁移全页工作区**

`AssistantWorkspace` mount 时把 `serviceState` prop 交给 `adoptServiceState`，之后只读取 Provider 的共享状态和 refresh 方法；删除组件内重复 controller/ref/state。

- [ ] **Step 6: 运行 focused GREEN**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/use-assistant-service-state.test.tsx src/components/assistant/assistant-experience-provider.test.tsx src/components/assistant/assistant-workspace.test.tsx`

Expected: PASS；切换消费者后状态对象和刷新锁保持同一份。

- [ ] **Step 7: 提交共享服务状态**

```bash
git add apps/web/src/components/assistant/use-assistant-service-state.* apps/web/src/components/assistant/assistant-experience-provider.* apps/web/src/components/assistant/assistant-workspace.*
git commit -m "refactor(assistant): 共享助手服务状态"
```

### Task 5: 提取 Dock/全页共享的消息与 Composer

**Files:**
- Create: `apps/web/src/components/assistant/assistant-conversation.tsx`
- Create: `apps/web/src/components/assistant/assistant-conversation.css`
- Create: `apps/web/src/components/assistant/assistant-conversation.test.tsx`
- Modify: `apps/web/src/components/assistant/assistant-workspace.tsx`
- Modify: `apps/web/src/components/assistant/assistant-workspace.css`
- Modify: `apps/web/src/components/assistant/assistant-workspace.test.tsx`

- [ ] **Step 1: 写共享组件失败测试**

覆盖：消息 role/log 语义、建议操作、发送中、失败重试、500 字校验、Enter 发送、Shift+Enter 换行、composer 注册/卸载。

```tsx
<AssistantConversation
  ariaLabel="AI 助理对话"
  registerComposer={registerComposer}
  session={session}
  variant="dock"
/>
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/assistant-conversation.test.tsx`

Expected: FAIL；组件文件不存在。

- [ ] **Step 3: 实现共享消息列表和 textarea composer**

组件只接受 `AssistantSession` 和展示 variant，不自行 fetch、不复制 session 状态。使用稳定语义：

```tsx
<div aria-label={ariaLabel} data-testid="assistant-message-history" role="log">
  {/* session.messages */}
</div>
<form onSubmit={submit}>
  <textarea onKeyDown={handleComposerKeyDown} ref={registerComposer} />
</form>
```

- [ ] **Step 4: 将 `AssistantWorkspace` 接到共享组件**

保留会话 rail、状态刷新、欢迎区和 fallback links；仅删除重复的 messages/composer JSX 和对应 CSS。

- [ ] **Step 5: 运行共享组件与工作区测试**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/assistant-conversation.test.tsx src/components/assistant/assistant-workspace.test.tsx`

Expected: PASS，现有工作区能力不回归。

- [ ] **Step 6: 提交共享对话组件**

```bash
git add apps/web/src/components/assistant/assistant-conversation.* apps/web/src/components/assistant/assistant-workspace.*
git commit -m "refactor(assistant): 复用工作区对话组件"
```

### Task 6: 实现尺寸 Hook 与持久化边界

**Files:**
- Create: `apps/web/src/components/assistant/use-assistant-dock-size.ts`
- Create: `apps/web/src/components/assistant/use-assistant-dock-size.test.tsx`

- [ ] **Step 1: 写尺寸和异常边界失败测试**

定义并测试：

```ts
export const ASSISTANT_DOCK_DEFAULT_WIDTH = 480;
export const ASSISTANT_DOCK_MIN_WIDTH = 380;
export const ASSISTANT_DOCK_MAX_WIDTH = 760;
export const ASSISTANT_DOCK_MOBILE_QUERY = "(max-width: 720px)";
export const ASSISTANT_DOCK_WIDTH_STORAGE_KEY =
  "ai-agent-platform:assistant-dock-width:v1";
```

覆盖 localStorage 合法/非法/throw，`721px` 临界视口、超大偏好值、viewport clamp 不覆写偏好值，Arrow/Shift+Arrow，pointercancel/lost capture/unmount。

- [ ] **Step 2: 运行 Hook 测试确认 RED**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/use-assistant-dock-size.test.tsx`

Expected: FAIL；Hook 尚不存在。

- [ ] **Step 3: 实现纯钳制函数和 hydration-safe 初始化**

```ts
function clampDesktopWidth(preferred: number, viewportWidth: number) {
  if (viewportWidth <= 720) throw new Error("desktop width is required");
  return Math.min(
    ASSISTANT_DOCK_MAX_WIDTH,
    Math.max(ASSISTANT_DOCK_MIN_WIDTH, preferred),
    viewportWidth - 48,
  );
}
```

初始 render 使用 480；mount 后在 `try/catch` 中恢复偏好值。该函数只在 `>720px` 桌面调用；移动端不计算 desktop width，CSS/Hook 直接使用全屏。只在用户主动调整结束时写存储。

- [ ] **Step 4: 实现 pointer 与 keyboard handlers**

返回 `width`、`isMobile`、`isResizing` 和可直接展开到 separator 的 handler/ARIA props。所有结束路径调用同一个 `finishResize({ persist })` 清理 document/body 样式、listeners 和 pointer capture；仅正常 `pointerup` 和键盘主动调整使用 `persist: true`，`pointercancel`、lost capture、窗口失焦、跨断点和卸载一律 `persist: false`。

- [ ] **Step 5: 运行测试与类型检查**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/use-assistant-dock-size.test.tsx`

Run: `pnpm --filter @ai-agent-platform/web typecheck`

Expected: PASS。

- [ ] **Step 6: 提交尺寸 Hook**

```bash
git add apps/web/src/components/assistant/use-assistant-dock-size.ts apps/web/src/components/assistant/use-assistant-dock-size.test.tsx
git commit -m "feat(assistant): 支持工作区尺寸调整与记忆"
```

### Task 7: 实现 Portal Dock、隔离和动效

**Files:**
- Create: `apps/web/src/components/assistant/assistant-dock.tsx`
- Create: `apps/web/src/components/assistant/assistant-dock.css`
- Create: `apps/web/src/components/assistant/assistant-dock.test.tsx`
- Modify: `packages/ui/src/app-shell.tsx`
- Modify: `packages/ui/src/app-shell.css`
- Modify: `packages/ui/src/app-shell.test.tsx`

- [ ] **Step 1: 写背景根和 Dock 失败测试**

UI 包测试锁定：

```tsx
expect(container.querySelector("[data-assistant-background-root]")).toBeTruthy();
```

Web 测试覆盖 dialog、Portal、Esc、遮罩、焦点陷阱、inert/aria-hidden、body overflow 恢复、内部 pointerup 不误关和移动端无 separator。

- [ ] **Step 2: 运行测试确认 RED**

Run: `pnpm --filter @ai-agent-platform/ui exec vitest run src/app-shell.test.tsx`

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/assistant-dock.test.tsx`

Expected: FAIL；标记和 Dock 尚不存在。

- [ ] **Step 3: 给 portal/assistant AppShell 增加稳定背景根**

只标记 PortalHeader、site-content 与 footer 的共同容器；不要标记 `body`。如果需要保持现有布局，用无视觉变化的 wrapper，并更新 AppShell CSS。

- [ ] **Step 4: 实现 Dock Portal 与统一副作用 effect**

```tsx
return createPortal(
  <div className="assistant-dock-layer">
    <button aria-label="关闭 AI 助理工作区" className="assistant-dock__backdrop" />
    <motion.section aria-modal="true" role="dialog">...</motion.section>
  </div>,
  document.body,
);
```

同一个 effect 负责设置/恢复 background `inert`、`aria-hidden`、body overflow、Esc、初始焦点和 Tab trap。cleanup 必须幂等；关闭时只调用 Provider 的 `close/collapseToQuick`，触发器焦点恢复仍由 Provider 单独负责，Dock 不重复 focus。

- [ ] **Step 5: 接入尺寸 Hook 和 A 型内部内容**

头部提供：禁用的新会话（或不展示）、收起为快速助手、打开完整工作区、关闭。主体展示服务状态、欢迎区、两个 preset、共享 `AssistantConversation`。移动端隐藏 separator。

- [ ] **Step 6: 实现动效和 reduced-motion**

打开约 220ms `x: 18 → 0` + opacity；关闭略短。`AnimatePresence` 必须位于 `surface === "dock"` 的条件卸载边界之外，保证 exit 动画执行完成后才卸载。resize 时移除 width transition。CSS 提供暖白实底、低饱和蓝靛紫状态和 44px 点击目标。

- [ ] **Step 7: 运行 focused 测试**

Run: `pnpm --filter @ai-agent-platform/ui exec vitest run src/app-shell.test.tsx`

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/assistant-dock.test.tsx src/components/assistant/use-assistant-dock-size.test.tsx src/components/assistant/assistant-conversation.test.tsx`

Expected: PASS。

- [ ] **Step 8: 提交 Dock**

```bash
git add packages/ui/src/app-shell.tsx packages/ui/src/app-shell.css packages/ui/src/app-shell.test.tsx apps/web/src/components/assistant/assistant-dock.*
git commit -m "feat(assistant): 新增可伸缩右侧工作区"
```

## Chunk 3: 入口接线、E2E 与最终验收

### Task 8: 接入顶部入口、快速助手和站点壳

**Files:**
- Modify: `packages/ui/src/navigation/assistant-header-entry.tsx`
- Modify: `packages/ui/src/navigation/assistant-header-entry.test.tsx`
- Modify: `apps/web/src/components/ui/floating-chat-widget-shadcnui.tsx`
- Modify: `apps/web/src/components/ui/floating-chat-widget-shadcnui.css`
- Modify: `apps/web/src/components/ui/floating-chat-widget-shadcnui.test.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.test.tsx`

- [ ] **Step 1: 写顶部触发器传递失败测试**

将 UI 入口合同改为把真实按钮传给消费者：

```ts
onActivate: (trigger: HTMLButtonElement) => void;
```

点击时调用 `onActivate(event.currentTarget)`，测试断言收到的就是可聚焦按钮元素。

- [ ] **Step 2: 写入口分工失败测试**

断言：顶部“AI 助理”调用 `openDockFrom`；M launcher 调用 `openQuickFrom`；quick 内“展开工作区”切到 dock；`/assistant` 顶部入口只 focus composer；任何时刻只存在一个 dialog。

- [ ] **Step 3: 运行测试确认 RED**

Run: `pnpm --filter @ai-agent-platform/ui exec vitest run src/navigation/assistant-header-entry.test.tsx`

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/ui/floating-chat-widget-shadcnui.test.tsx src/components/site-shell/site-shell.test.tsx`

Expected: FAIL；当前顶部直接 push `/assistant`，quick 使用旧 `session.open`。

- [ ] **Step 4: 改造快速助手**

quick 是否挂载只看 `experience.surface === "quick"`。launcher 点击调用 `openQuickFrom`；面板增加“展开 AI 助理工作区”按钮，并用当前面板内按钮元素调用 `openDockFrom(trigger)`，不再用 Link 直接跳 `/assistant`。

- [ ] **Step 5: 改造站点壳**

门户顶部入口用 `event.currentTarget` 打开 dock 并记录精确按钮触发器；挂载 `<AssistantDock />`。`variant="assistant"` 时不挂载 quick/dock，只 focus 全页 composer。

- [ ] **Step 6: 运行 focused GREEN 与 UI 回归**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/ui/floating-chat-widget-shadcnui.test.tsx src/components/site-shell/site-shell.test.tsx src/components/assistant/assistant-experience-provider.test.tsx`

Run: `pnpm --filter @ai-agent-platform/ui test`

Expected: PASS。

- [ ] **Step 7: 提交入口接线**

```bash
git add packages/ui/src/navigation/assistant-header-entry.tsx packages/ui/src/navigation/assistant-header-entry.test.tsx apps/web/src/components/ui/floating-chat-widget-shadcnui.* apps/web/src/components/site-shell/site-shell.*
git commit -m "feat(assistant): 接通快速与侧边工作区入口"
```

### Task 9: 增加真实 E2E 覆盖

**Files:**
- Modify: `apps/web/e2e/assistant-experience.spec.ts`
- Modify: `apps/web/e2e/pricing-assistant.spec.ts`
- Modify: `docs/testing/run-assistant-experience-e2e.sh`
- Modify: `docs/testing/assistant-experience-acceptance.md`
- Modify: `packages/database/src/deployment-contracts.test.ts`

- [ ] **Step 1: 写 Dock 桌面 E2E**

覆盖：顶部打开、dialog 可见、separator 可见；拖到小于/大于边界后宽度分别为 380/760；刷新后恢复最后主动宽度；遮罩/Esc 关闭并返回焦点。

- [ ] **Step 2: 写形态和会话连续性 E2E**

拦截聊天 API 为可控延迟响应：quick 发起后展开 dock，再进入 `/assistant`，断言只有一次 POST、响应最终出现在全页消息 log，草稿/消息不丢。

- [ ] **Step 3: 写移动 E2E**

在 390×844 验证全屏 dialog、无 separator、输入区在视口内、消息区可滚动、无横向溢出。通过视口高度缩小模拟软键盘后的动态布局。

- [ ] **Step 4: 扩展隔离 E2E runner 的失败契约**

先在 `deployment-contracts.test.ts` 断言 runner 同时包含：

```text
e2e/assistant-experience.spec.ts
e2e/pricing-assistant.spec.ts
```

运行该测试确认 RED，再把 `run-assistant-experience-e2e.sh` 的 Playwright 命令扩展为同时执行两个文件；不得改变 secret、seed、清理 trap 和隔离项目名。

Run: `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts`

Expected: 修改 runner 前 FAIL，修改后 PASS。

- [ ] **Step 5: 运行 Playwright 列表和静态检查**

Run: `pnpm --filter @ai-agent-platform/web exec playwright test --list e2e/assistant-experience.spec.ts e2e/pricing-assistant.spec.ts`

Run: `rg -n "assistant-panel|assistant-message--assistant|data-motion-state" apps/web/e2e`

Expected: 测试全部可发现；旧选择器 0 命中。

- [ ] **Step 6: 运行真实隔离 E2E**

Run: `sh docs/testing/run-assistant-experience-e2e.sh`

Expected: desktop/mobile 的两个 spec 全部通过；脚本退出后相关容器和卷清理。

- [ ] **Step 7: 更新验收文档并提交**

```bash
git add apps/web/e2e/assistant-experience.spec.ts apps/web/e2e/pricing-assistant.spec.ts docs/testing/run-assistant-experience-e2e.sh docs/testing/assistant-experience-acceptance.md packages/database/src/deployment-contracts.test.ts
git commit -m "test(assistant): 覆盖可伸缩工作区验收"
```

### Task 10: 全量验证与提交范围审计

**Files:**
- Verify only; only modify files when a failing check identifies a scoped defect.

- [ ] **Step 1: 运行助手 focused 测试**

Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant src/components/ui/floating-chat-widget-shadcnui.test.tsx src/components/site-shell/site-shell.test.tsx`

Expected: PASS。

- [ ] **Step 2: 运行全仓单元测试**

Run: `pnpm test`

Expected: 0 failures；已有环境条件跳过项保持可解释。

- [ ] **Step 3: 运行 AgentOS 独立门禁**

Run: `pnpm agent:test`

Run: `pnpm agent:lint`

Run: `pnpm agent:typecheck`

Expected: 全部 exit 0；如 sandbox 无法写默认 uv cache，使用 `UV_CACHE_DIR=/tmp/ai-agent-platform-uv-cache` 重跑，不跳过。

- [ ] **Step 4: 运行静态质量门禁**

Run: `pnpm typecheck`

Run: `pnpm lint`

Run: `pnpm format:check`

Run: `git diff --check e7c1271d1ab80edd18df3973bdcfb9a9a864a096..HEAD`

Expected: 全部 exit 0。

- [ ] **Step 5: 运行生产构建并保护生成文件**

构建前记录 `apps/web/next-env.d.ts` 内容和 Git 状态；构建后若 Next 只改写生成路径，恢复构建前的用户/工作树内容，不将其加入提交。

Run: `pnpm build`

Expected: Next.js production build 成功；`/assistant` 和门户路由生成正常。

- [ ] **Step 6: 检查提交洁净度和双基线范围**

本隔离工作区固定从 `e7c1271d1ab80edd18df3973bdcfb9a9a864a096`（创建时的 `origin/main`）开始；若执行前远端 main 已变化，先显式决定是否合并，不静默移动基线。

Run: `git status --short`

Run: `git log --oneline --decorate e7c1271d1ab80edd18df3973bdcfb9a9a864a096..HEAD`

Run: `git diff --name-status e7c1271d1ab80edd18df3973bdcfb9a9a864a096..HEAD`

Run: `git diff --name-status origin/main...HEAD`

Expected: 专用 worktree 无 `.superpowers/`、Mobius 或其它用户文件；两个 diff 都只包含助手规格、计划和本功能实现，每个提交职责单一。

Run: `docker compose -p aap-assistant-e2e ps -q`

Expected: 无输出；同时用 `docker volume ls --filter label=com.docker.compose.project=aap-assistant-e2e -q` 确认无残留卷。

- [ ] **Step 7: 按 `verification-before-completion` 和 `finishing-a-development-branch` 收尾**

不自动推送或合并。向用户报告测试、构建、E2E、工作树和分支状态，并给出本地合并/推送 PR/保留分支选项。
