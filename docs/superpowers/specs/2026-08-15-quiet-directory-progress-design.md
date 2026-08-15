# Quiet Directory Progress Design

## Goal

Unify the product, solution, download, and partner directories around one quiet desktop behavior: all four start collapsed, preserve the existing mobile drawers, and communicate reading position without competing with page content.

## Visual behavior

- Desktop directories start at 44px wide.
- The collapsed state shows only the existing expand control plus a 1px progress track and an 8px blue-violet position dot.
- The rail uses the existing light glass surface, but removes prominent glow and elevation from the collapsed state.
- Hovering a collapsed directory temporarily previews it at 240px. The preview overlays page content instead of changing the grid column, so the main content does not shift. Moving the pointer outside restores the 44px state.
- `focus-within` provides the same temporary preview for keyboard users. The existing button still controls the persistent expanded state: clicking while collapsed pins the 240px directory open, and clicking again returns it to the previewable collapsed state. While the pointer or focus remains inside, that preview stays visible and closes only after both leave.
- Hover preview is limited to desktop fine-pointer environments. Scrolling never opens the directory.
- The progress rail fades out during a temporary preview and returns when the directory closes.
- The full directory retains the current search, hierarchy, keyboard focus, and route navigation.
- Mobile keeps the existing trigger and modal drawer; the progress rail is desktop-only. All four directories use 900px as the single CSS and JavaScript mobile boundary so their visual and modal behavior cannot diverge.

## Progress and active state

A shared directory-progress utility will provide two values:

1. Overall page progress, calculated from the document scroll range and exposed to the rail as a clamped value from 0 to 1. A page with no scroll range reports 0.
2. The active in-page anchor, selected only from links for the current route or partner view whose target IDs exist in the DOM. Targets follow DOM order. At the page top the first target is active; within the page, the last target whose top has passed the sticky header offset is active; within 1px of the page bottom the last target is forced active so a short final section is still represented. Missing targets are ignored.

Progress and active-anchor state are recalculated on scroll, resize, route/view changes, and rendered content changes. Work is grouped through `requestAnimationFrame` so scrolling does not trigger redundant synchronous updates.

Automatic scroll tracking updates only component state and `aria-current`; it does not change the URL or add browser-history entries. Clicking a directory link keeps the existing URL/hash behavior.

For solution pages, the directory represents routes rather than internal page sections. The current solution route therefore remains highlighted while the rail dot supplies within-page progress. Product pages use scroll tracking only where the current route exposes capability anchors. Download and partner pages track their existing resource or view anchors.

## Implementation boundaries

- Add one shared hook and one small decorative rail component; do not create a new directory framework.
- Keep the four existing directory trees and mobile-dialog implementations.
- Set all four desktop collapsed states to `true`.
- Add the rail to the four existing asides and apply the same low-contrast collapsed-state styling in their current stylesheets.
- When scroll tracking activates a nested item, expand its directory ancestors so `aria-current` remains visible when the full directory opens. Do not reopen unrelated branches.
- Do not change page content, directory labels, Navbar, Footer, or Agent behavior.
- Do not persist expanded state across navigation; each new page starts collapsed as requested.

## Accessibility and motion

- Existing expand buttons retain `aria-expanded` and descriptive labels.
- `aria-expanded` continues to describe the persistent button-controlled state; hover and focus previews do not mutate navigation state.
- The progress rail is decorative and hidden from assistive technology; active links continue to expose `aria-current`.
- Keyboard and mobile focus containment remain unchanged.
- The directory width transition and dot movement are disabled under `prefers-reduced-motion: reduce`.
- If JavaScript or anchor lookup is unavailable, the directory remains usable and the rail stays at the start position.

## Verification

- Unit tests: all four directories start collapsed; the shared progress calculation clamps correctly; scrolling selects the expected represented anchor without changing the URL.
- Component tests: expanded directories expose the tracked link through `aria-current`; route-only solution highlighting remains intact.
- Browser tests at 1440px, 901px, 900px, 800px, and 390px: equal 44px desktop rails above the boundary; hover/focus preview to 240px without content shift; pointer exit returning to 44px; click-to-pin expansion; complete modal behavior at and below 900px; no horizontal overflow; active tracking including the final short section; active-ancestor expansion; existing mobile drawers; keyboard focus; and one unchanged Agent launcher.
- Reduced-motion test: no positional transition is applied.
