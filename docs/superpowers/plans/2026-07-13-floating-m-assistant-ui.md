# Floating M Assistant UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public portal's existing M assistant visual treatment with the approved floating glass chat widget while keeping the defined Chinese chat content and behavior and omitting model selection.

**Architecture:** Keep assistant route visibility, request validation, and placeholder replies in focused modules. Mount one stateful client widget from `SiteShell` so client-side navigation preserves the in-memory conversation. The widget owns presentation and interaction state, while the API route owns validation and response contracts.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Framer Motion, Lucide React, Vitest, Testing Library.

---

## Chunk 1: Behavior and service contract

### Task 1: Route visibility

**Files:**

- Create: `apps/web/src/components/assistant/assistant-visibility.ts`
- Test: `apps/web/src/components/assistant/assistant-visibility.test.ts`

- [ ] Write tests proving that registered public content routes show the assistant while identity, staff, console, admin, and unknown routes do not.
- [ ] Run `pnpm --filter @ai-agent-platform/web test -- src/components/assistant/assistant-visibility.test.ts` and confirm failure because the module does not exist.
- [ ] Implement `shouldShowAssistant(pathname)` using `matchRoute` and explicit identity-route exclusions.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Placeholder chat API

**Files:**

- Create: `apps/web/src/server/assistant/assistant-provider.ts`
- Create: `apps/web/src/app/api/v1/assistant/chat/route.ts`
- Test: `apps/web/src/app/api/v1/assistant/chat/route.test.ts`

- [ ] Write tests for the three exact preset replies, the generic placeholder reply, trimmed input, 400 responses for empty or over-500-character messages, and non-echoing error responses.
- [ ] Run `pnpm --filter @ai-agent-platform/web test -- src/app/api/v1/assistant/chat/route.test.ts` and confirm failure because the route does not exist.
- [ ] Implement the typed placeholder provider and POST route with Unicode code-point validation.
- [ ] Re-run the focused API test and confirm it passes.

## Chunk 2: Widget UI and portal integration

### Task 3: Floating chat widget

**Files:**

- Create: `apps/web/src/components/ui/floating-chat-widget-shadcnui.tsx`
- Create: `apps/web/src/components/ui/floating-chat-widget-shadcnui.css`
- Test: `apps/web/src/components/ui/floating-chat-widget-shadcnui.test.tsx`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] Add focused interaction tests for opening and closing, no model selector, the three existing preset prompts, successful free-text submission, 500-character enforcement, failure preservation and retry, Escape close, and launcher focus restoration.
- [ ] Run `pnpm --filter @ai-agent-platform/web test -- src/components/ui/floating-chat-widget-shadcnui.test.tsx` and confirm failure because the widget does not exist.
- [ ] Install `framer-motion` and `lucide-react` in `@ai-agent-platform/web`.
- [ ] Implement the approved glass panel, fixed launcher, responsive bottom sheet, messages, preset prompts, input, sending state, retry state, fallback links, dialog semantics, and reduced-motion styling without any agent/model selector.
- [ ] Re-run the focused widget test and confirm it passes.

### Task 4: Site shell mounting

**Files:**

- Modify: `apps/web/src/components/site-shell/site-shell.tsx`
- Modify: `apps/web/src/components/site-shell/site-shell.test.tsx`

- [ ] Add tests proving the assistant mounts only on eligible public routes.
- [ ] Run the focused SiteShell test and confirm the new assertions fail.
- [ ] Mount `FloatingChatWidget` after `AppShell`, guarded by `shouldShowAssistant(pathname)`.
- [ ] Re-run the focused SiteShell test and confirm it passes.

## Chunk 3: Verification and review

### Task 5: Full verification

- [ ] Run `pnpm --filter @ai-agent-platform/web test`.
- [ ] Run `pnpm --filter @ai-agent-platform/web typecheck`.
- [ ] Run `pnpm --filter @ai-agent-platform/web lint`.
- [ ] Run `pnpm --filter @ai-agent-platform/web build`.
- [ ] Inspect `git diff` against this plan and the approved design, checking specifically that no model selector or unrelated refactor was introduced.
- [ ] Review accessibility, responsive overflow, focus behavior, API error handling, and preservation of unrelated user changes before reporting completion.
