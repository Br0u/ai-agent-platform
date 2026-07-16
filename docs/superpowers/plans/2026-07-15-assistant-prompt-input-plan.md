# AI Assistant Prompt Input Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared elastic assistant composer with local image attachments and future model/voice entry points to both the quick widget and full-screen workspace without changing the current text-only API behavior.

**Architecture:** Create a focused `AssistantPromptInput` component instead of copying the reference implementation wholesale. The component owns draft presentation, image object-URL lifecycle, future capability menus, and composer motion; its parents continue to own session messages and text submission. Attachments remain local and visibly pending until the backend has a multimodal contract.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS, `lucide-react`, Vitest, Testing Library.

---

## Chunk 1: Shared composer contract and failing tests

### Task 1: Define the shared prompt input behavior

**Files:**

- Create: `apps/web/src/components/assistant/assistant-prompt-input.tsx`
- Create: `apps/web/src/components/assistant/assistant-prompt-input.test.tsx`
- Create: `apps/web/src/components/assistant/assistant-prompt-input.css`

- [x] **Step 1: Write failing tests for text, expansion, attachment and future entries**

  Cover controlled text changes, submit disabled at 500+ characters, auto-grow attributes/classes, image file selection with six-item limit, remove/preview controls, model menu availability messaging, and voice placeholder messaging.

- [x] **Step 2: Run the focused test file and confirm RED**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/assistant-prompt-input.test.tsx`

  Expected: FAIL because the shared component and contract do not exist.

## Chunk 2: Implement the shared prompt input

### Task 2: Build the focused shared component

**Files:**

- Modify: `apps/web/src/components/assistant/assistant-prompt-input.tsx`
- Modify: `apps/web/src/components/assistant/assistant-prompt-input.css`

- [x] **Step 1: Add the controlled input and registration contract**

  Accept `value`, `onChange`, `onSubmit`, `registerComposer`, `disabled`, `variant`, `placeholder`, and accessible labels. Use a textarea for both surfaces and preserve Enter-to-submit / Shift+Enter-to-newline behavior.

- [x] **Step 2: Add local image attachment lifecycle**

  Accept `image/*`, cap selection at six, reject unsupported or oversized files with an inline status, create object URLs for accepted files, revoke URLs on removal and unmount, and keep the attachment tray visible behind the expanded composer.

- [x] **Step 3: Add the preview overlay and future capability affordances**

  Provide keyboard-accessible thumbnail preview and close controls, a default-model menu with unavailable future options, and a voice button that announces the capability is not yet connected without requesting permissions.

- [x] **Step 4: Add the soft liquid-glass visual system**

  Implement compact/expanded width and height transitions, low-opacity blue-indigo-violet surfaces, inset highlights, non-aggressive glow, focus-visible outlines, mobile full-width behavior, and reduced-motion/transparency fallbacks.

- [x] **Step 5: Run the focused tests and confirm GREEN**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/assistant-prompt-input.test.tsx`

  Expected: PASS.

## Chunk 3: Integrate both assistant surfaces

### Task 3: Replace duplicated composer markup

**Files:**

- Modify: `apps/web/src/components/assistant/assistant-conversation.tsx`
- Modify: `apps/web/src/components/assistant/assistant-conversation.css`
- Modify: `apps/web/src/components/ui/floating-chat-widget-shadcnui.tsx`
- Modify: `apps/web/src/components/ui/floating-chat-widget-shadcnui.css`
- Test: `apps/web/src/components/assistant/assistant-conversation.test.tsx`
- Test: `apps/web/src/components/ui/floating-chat-widget-shadcnui.test.tsx`

- [x] **Step 1: Add integration assertions before wiring**

  Assert that both surfaces render the shared prompt controls, retain existing send behavior, and show the pending-multimodal message when an attachment is selected.

- [x] **Step 2: Wire the full-screen conversation**

  Replace the current workspace form with `AssistantPromptInput`, keeping `registerComposer`, session validation, retry announcements and message rendering unchanged.

- [x] **Step 3: Wire the quick widget**

  Replace the quick widget footer input with the same component, retain quick presets, help/contact links, route expansion to `/assistant`, and all existing focus/lifecycle behavior.

- [x] **Step 4: Remove obsolete duplicated composer CSS**

  Keep message and surface layout selectors in the existing files, but move input-specific sizing and interaction styles to the shared component stylesheet.

- [x] **Step 5: Run focused integration tests**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant/assistant-conversation.test.tsx src/components/ui/floating-chat-widget-shadcnui.test.tsx src/components/assistant/assistant-workspace.test.tsx src/components/site-shell/site-shell.test.tsx`

  Expected: PASS.

## Chunk 4: Verification and handoff

### Task 4: Run the complete assistant quality gates

**Files:**

- Modify: none unless verification finds a regression.

- [x] **Step 1: Run the complete assistant test set**

  Run: `pnpm --filter @ai-agent-platform/web exec vitest run src/components/assistant src/app/assistant/page.test.tsx src/components/ui/floating-chat-widget-shadcnui.test.tsx src/components/site-shell/site-shell.test.tsx`

  Expected: all assistant-focused test files pass.

- [x] **Step 2: Run lint, typecheck and format checks**

  Run: `pnpm --filter @ai-agent-platform/web lint`

  Run: `pnpm --filter @ai-agent-platform/web typecheck`

  Run: `pnpm --filter @ai-agent-platform/web exec prettier --check src/components/assistant/assistant-prompt-input.tsx src/components/assistant/assistant-prompt-input.test.tsx src/components/assistant/assistant-prompt-input.css src/components/assistant/assistant-conversation.tsx src/components/assistant/assistant-conversation.css src/components/ui/floating-chat-widget-shadcnui.tsx src/components/ui/floating-chat-widget-shadcnui.css`

  Expected: exit 0 for all commands.

- [x] **Step 3: Run a local route smoke check**

  Request `/` and `/assistant` from the local dev server and verify the portal exposes the quick launcher while the workspace exposes `CONVERSATIONS` and the minimize action.

  Verified with local HTTP requests: both routes returned `200`; `/assistant` exposed `CONVERSATIONS`, `缩小 AI 助理`, `选择模型`, and `添加图片附件`; `/` exposed `打开 M 助手`.
