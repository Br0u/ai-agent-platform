# Floating Assistant Status Light Colors Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the floating assistant service-status light green, yellow, or red semantic colors based on its existing capability state.

**Architecture:** Keep status ownership in the existing assistant experience and use the current `data-capability` attribute as the CSS boundary. Add no React state or runtime branching; only the status-light CSS and its regression test change.

**Tech Stack:** React 19, CSS, Vitest, Testing Library

---

## Chunk 1: Semantic status-light styling

### Task 1: Map capability states to status-light colors

**Files:**
- Modify: `apps/web/src/components/ui/floating-chat-widget-shadcnui.test.tsx:135-147`
- Modify: `apps/web/src/components/ui/floating-chat-widget-shadcnui.css:118-124`
- Reference: `docs/superpowers/specs/2026-07-20-floating-assistant-status-light-colors-design.md`

- [x] **Step 1: Write the failing CSS contract test**

Add a test that reads `floating-chat-widget-shadcnui.css` and verifies the default placeholder block uses `#b38225`, the `available` selector uses `#27826b`, and the `degraded` selector uses `#b94b5a`. Require each block to include its matching low-opacity RGB halo.

```tsx
it("maps service capabilities to semantic status-light colors", () => {
  const stylesheet = readFileSync(
    "src/components/ui/floating-chat-widget-shadcnui.css",
    "utf8",
  );

  expect(stylesheet).toMatch(
    /\.floating-assistant__identity p > span \{[\s\S]*?background: #b38225;[\s\S]*?rgb\(179 130 37 \/ 15%\);[\s\S]*?\}/u,
  );
  expect(stylesheet).toMatch(
    /p\[data-capability="available"\] > span \{[\s\S]*?background: #27826b;[\s\S]*?rgb\(39 130 107 \/ 15%\);[\s\S]*?\}/u,
  );
  expect(stylesheet).toMatch(
    /p\[data-capability="degraded"\] > span \{[\s\S]*?background: #b94b5a;[\s\S]*?rgb\(185 75 90 \/ 15%\);[\s\S]*?\}/u,
  );
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/ui/floating-chat-widget-shadcnui.test.tsx -t "maps service capabilities to semantic status-light colors"
```

Expected: FAIL because the status light is still fixed gray and capability selectors do not exist.

- [x] **Step 3: Add the minimal CSS mapping**

Change the existing light to the yellow placeholder default and add two attribute overrides:

```css
.floating-assistant__identity p > span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #b38225;
  box-shadow: 0 0 0 3px rgb(179 130 37 / 15%);
}

.floating-assistant__identity p[data-capability="available"] > span {
  background: #27826b;
  box-shadow: 0 0 0 3px rgb(39 130 107 / 15%);
}

.floating-assistant__identity p[data-capability="degraded"] > span {
  background: #b94b5a;
  box-shadow: 0 0 0 3px rgb(185 75 90 / 15%);
}
```

- [x] **Step 4: Run focused validation**

Run:

```bash
pnpm --filter @ai-agent-platform/web exec vitest run src/components/ui/floating-chat-widget-shadcnui.test.tsx
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
```

Expected: all commands exit 0.

- [x] **Step 5: Verify in the browser**

Open `http://localhost:3000`, open the floating assistant, and confirm the ready-state light is green without changing header alignment or text.

- [x] **Step 6: Commit only the status-light implementation**

```bash
git add apps/web/src/components/ui/floating-chat-widget-shadcnui.css apps/web/src/components/ui/floating-chat-widget-shadcnui.test.tsx docs/superpowers/plans/2026-07-20-floating-assistant-status-light-colors.md
git commit -m "fix(assistant): color service status light"
```
