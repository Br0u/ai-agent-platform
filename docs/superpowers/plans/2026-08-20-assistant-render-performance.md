# Assistant Render Performance Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce main-thread work while assistant replies stream so sending and response animation stay responsive.

**Architecture:** Preserve the existing SSE protocol and message model. Coalesce render-facing stream updates to one commit per animation frame, pause completed Canvas orbs, and add further memoization or visual motion only if measurement still shows a bottleneck.

**Tech Stack:** React 19, Next.js 16, Vitest, Playwright, native `requestAnimationFrame`.

---

## Chunk 1: Stream update scheduling

### Task 1: Coalesce render-facing stream updates

**Files:**

- Modify: `apps/web/src/components/assistant/use-assistant-session.ts`
- Test: `apps/web/src/components/assistant/use-assistant-session.test.tsx`

- [x] Add a failing test that enqueues several answer deltas before one animation frame and asserts the visible assistant message updates only after that frame.
- [x] Run the focused test and confirm it fails because updates are currently synchronous.
- [x] Add one requestAnimationFrame scheduler around `updateStreamedAssistant`.
- [x] Flush pending content on `done`; cancel pending work on cancellation/unmount.
- [x] Run the session tests and confirm all pass.

## Chunk 2: Orb lifecycle

### Task 2: Pause completed message orbs

**Files:**

- Modify: `apps/web/src/components/assistant/assistant-orb.tsx`
- Test: `apps/web/src/components/assistant/assistant-orb.test.tsx`

- [x] Add a failing test proving a completed Orb paints once without scheduling another frame.
- [x] Run the focused test and confirm it fails because completed orbs currently animate continuously.
- [x] Treat `completed` as paused while preserving active and idle animation.
- [x] Run the Orb tests and confirm all pass.

## Chunk 3: Evidence-based follow-up

### Task 3: Avoid unnecessary render or motion changes

**Files:**

- Inspect: `apps/web/src/components/assistant/assistant-conversation.tsx`
- Inspect: `apps/web/src/components/assistant/assistant-workspace.tsx`
- Inspect: `apps/web/src/components/assistant/assistant-workspace.css`
- Test if changed: `apps/web/src/components/assistant/assistant-conversation.test.tsx`

- [x] Run the deterministic streaming path after Tasks 1–2.
- [x] Keep the existing message components because no remaining material rerender was demonstrated.
- [x] Keep the existing entrance motion because no remaining first-message animation regression was demonstrated.
- [x] Do not add dependencies, virtualization, height animation, or artificial stream delay.

## Chunk 4: Verification

### Task 4: Verify behavior and build health

**Files:**

- Test: `apps/web/src/components/assistant/use-assistant-session.test.tsx`
- Test: `apps/web/src/components/assistant/assistant-conversation.test.tsx`
- Test: `apps/web/src/components/assistant/assistant-orb.test.tsx`
- Test: `apps/web/e2e/assistant-experience.spec.ts`

- [x] Run focused assistant tests.
- [x] Run Web typecheck and lint.
- [x] Run the Web production build.
- [x] Run desktop assistant Playwright coverage when the built runtime is available.
- [x] Review `git diff --check` and the final scoped diff.

## Chunk 5: Next-turn ergonomics

### Task 5: Commit the next turn before the response starts

**Files:**

- Modify: `apps/web/src/components/assistant/use-assistant-session.ts`
- Modify: `apps/web/src/components/assistant/assistant-conversation.tsx`
- Modify: `apps/web/src/components/ui/floating-chat-widget-shadcnui.tsx`
- Test: corresponding component and session tests

- [x] Clear the submitted draft and insert the user/assistant pair before the first response frame.
- [x] Restore the submitted draft when a retryable request fails or an endpoint change cancels it.
- [x] Follow the active turn in both the conversation workspace and the floating assistant.
- [x] Preserve manual scroll-away behavior until the reader returns near the bottom.
- [x] Verify a two-turn loading state in a real browser with zero distance from the bottom.
