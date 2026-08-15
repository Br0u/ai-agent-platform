# Trial Dialog Quiet Glass and Product Canvas Design

## Scope

Optimize the existing `/trial` application dialog without changing its copy, field order, single-column form layout, validation, focus management, countdown, success state, or Agent integration. Also remove the visible background seam beside the collapsed desktop product directory on `/product/**`.

No component restructuring, new assets, fonts, dependencies, routes, or content changes are required.

## Subject and job

- Subject: enterprise AI trial application.
- Audience: enterprise buyers and project owners who need a reliable, low-friction contact form.
- Single job: make the existing application form feel trustworthy and easy to complete while preserving all current behavior.

## Visual direction

Direction A: quiet enterprise glass.

### Tokens

- Canvas: `#f4f7ff`
- Ink: `#101a42`
- Muted copy: `#5f6b8c`
- Primary blue: `#286cff`
- Violet accent: `#7358ea`
- Glass highlight: `#ffffff`

Reuse the existing project variables and hex/RGB notation. Do not introduce another color system.

### Typography

Keep the existing project display and body families, type sizes, weights, field labels, and wrapping. Visual hierarchy comes from surface contrast and focus treatment, not a typography rewrite.

### Layout

Keep the current DOM and form geometry:

```text
+--------------------------------------+
| title + description             close|
|                                      |
| label                                |
| [input                              ] |
|                                      |
| label                                |
| [input                              ] |
|                                      |
| label                                |
| [contact input       ][verification] |
|                                      |
| label                                |
| [code input                         ] |
| status                               |
| [primary] [cancel]                   |
+--------------------------------------+
```

### Signature

A restrained blue-violet light seam at the dialog's top edge, echoed by a faint internal aurora. This is the only decorative signature; all fields and actions remain quiet.

## Interaction and accessibility

- Preserve the native `dialog`, existing labels, `aria-modal`, live status, inert background, focus trap, Escape/backdrop close, and focus restoration.
- Retain 44px close and action targets.
- Add only interruptible CSS hover/focus transitions and a short dialog entrance.
- Under `prefers-reduced-motion: reduce`, preserve the existing near-zero transition behavior and do not run the entrance transform.
- Keep the primary action as the only filled control; verification and cancel controls remain neutral.

## Product background bug

### Confirmed cause

At desktop widths, the collapsed product directory is 44px wide and the grid reserves a matching 44px track. Browser inspection at 1720px showed:

- `.product-directory-layout`: solid `#f4f7ff`, starts at `x=0`.
- `.product-directory-content` and `.product-portal`: start at `x=44`.
- `.product-portal-hero`: owns the visible aurora background and also starts at `x=44`.

The reserved grid track therefore exposes a different full-height canvas beside the product background.

### Fix

In collapsed desktop state, make the directory track zero-width while the 44px directory surface overflows above the page as a true floating rail. The product content and its background then begin at `x=0`. The expanded state, hover/focus preview, mobile drawer, and directory behavior remain unchanged.

## Acceptance

- `/trial` form content, order, validation, keyboard behavior, and success state remain unchanged.
- The dialog uses the quiet glass surface, neutral secondary controls, explicit focus treatment, and reduced-motion-safe entrance.
- On collapsed desktop `/product/code-agent`, product content begins at the viewport edge and the directory floats above it; no separate background strip remains.
- Hovering or focusing the collapsed directory still expands it without moving product content.
- Mobile product drawer behavior remains unchanged.
