# Fullscreen Assistant Liquid Glass Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the portal's side-panel assistant with direct navigation to the full-screen `/assistant` workspace, then restyle that workspace with a soft liquid-glass UI while keeping the conversation rail and all assistant behavior intact.

**Architecture:** The portal shell will stop mounting only the legacy side dock. The `FloatingChatWidget` quick surface remains available on portal pages, and both its expand action and the portal header entry navigate to `/assistant`. The standalone workspace keeps the temporary conversation rail, adds a compact minimize action that navigates to `/`, and receives the visual treatment through its workspace and conversation CSS plus a minimal message-mark JSX change.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS, `lucide-react`, Vitest, Testing Library.

---

## Chunk 1: Portal entry and surface removal

### Task 1: Route the portal header entry to the full-screen assistant

**Files:**

- Modify: `apps/web/src/components/site-shell/site-shell.tsx`
- Test: `apps/web/src/components/site-shell/site-shell.test.tsx` if present; otherwise cover the rendered behavior through existing shell/assistant tests.
  - [ ] **Step 1: Keep the quick surface and remove only the legacy dock**

  Keep rendering `FloatingChatWidget` from `AssistantEnabledShell` for portal pages, but stop rendering `AssistantDock`. Keep the `AssistantExperienceProvider` so the quick surface and `/assistant` share the existing session/service controller.

- [ ] **Step 2: Change the portal header action**

  Use the existing `useRouter` instance to navigate to `/assistant` when the portal header entry is activated, and route the quick surface's built-in expand button to the same page. Keep the workspace-route behavior that focuses the composer.

- [ ] **Step 3: Run focused shell tests**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/site-shell src/app/assistant/page.test.tsx`

  Expected: existing route and assistant visibility tests pass; no portal side-surface assertions remain required.

## Chunk 2: Full-screen workspace behavior

### Task 2: Add the minimize-to-home control without removing the conversation rail

**Files:**

- Modify: `apps/web/src/components/assistant/assistant-workspace.tsx`
- Test: `apps/web/src/components/assistant/assistant-workspace.test.tsx`
- Test: `apps/web/src/app/assistant/page.test.tsx`

- [ ] **Step 1: Add a failing behavior assertion**

  Assert that the workspace exposes a link named `缩小 AI 助理并返回主页面` with `href="/"`, while the existing `CONVERSATIONS` rail remains present.

- [ ] **Step 2: Implement the header action**

  Remove the header's M image. Add a right-side action group containing the service status/refresh control and a `Minimize2` link to `/` with the accessible label above. Do not alter the session, submit, retry, refresh, or preset handlers.

- [ ] **Step 3: Run the workspace tests**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/assistant-workspace.test.tsx src/app/assistant/page.test.tsx`

  Expected: PASS, including the new minimize and retained-rail assertions.

## Chunk 3: Liquid-glass visual system

### Task 3: Restyle the full-screen shell and conversation surface

**Files:**

- Modify: `apps/web/src/components/assistant/assistant-workspace.css`
- Modify: `apps/web/src/components/assistant/assistant-conversation.css`
- Modify: `apps/web/src/components/assistant/assistant-conversation.tsx`

- [ ] **Step 1: Preserve structural selectors and interaction sizing**

  Keep existing class names, `data-variant` behavior, 44px hit targets, focus-visible outlines, reduced-motion handling, mobile viewport behavior, and sticky composer semantics.

- [ ] **Step 2: Apply the visual system**

  Use the existing brand tokens with low-opacity blue/indigo/violet radial light, a 64px workspace header, large soft radii, translucent surfaces, inset highlights, restrained shadows, and no hard black borders. Keep the conversation rail visible but visually lighter than the main surface.

- [ ] **Step 3: Soften controls and content hierarchy**

  Make the service status and minimize controls part of a rounded glass action group. Turn preset questions into rounded glass rows with gentle hover feedback. Make assistant/user messages rounded bubbles with a small gradient assistant mark instead of repeating the M image asset. Keep the composer as a large rounded glass surface with a soft blue/indigo send button.

- [ ] **Step 4: Verify the CSS contract and component tests**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/assistant-conversation.test.tsx src/components/assistant/assistant-workspace.test.tsx`

  Expected: PASS, with no accessibility or interaction regressions.

## Chunk 4: Full verification

### Task 4: Check quality gates and browser-visible behavior

**Files:**

- Modify: none unless verification exposes a regression.

- [ ] **Step 1: Run targeted lint/type checks**

  Run: `pnpm --filter @ai-agent-platform/web lint`

  Run: `pnpm --filter @ai-agent-platform/web typecheck`

- [ ] **Step 2: Run the complete assistant-focused test set**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant src/app/assistant/page.test.tsx src/components/ui/floating-chat-widget-shadcnui.test.tsx`

- [ ] **Step 3: Verify the live app**

  Open the portal, activate the navbar AI assistant entry, verify it navigates to `/assistant` without rendering a side panel, check the desktop and mobile workspace layouts, click the minimize action, and confirm it returns to `/`.
