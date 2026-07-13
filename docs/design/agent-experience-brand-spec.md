# AI Agent Platform · Agent Experience Brand Spec

> Captured: 2026-07-13
> Source: existing UI tokens, user-provided product screenshot, local brand assets, approved design brief
> Completeness: partial / implementation-grounded

## Core assets

### Logo and wordmarks

- Portal wordmark: text-based `AI Agent Platform` using the self-hosted Kaushan Script font.
- Product subtitle: `Build Enterprise AI Faster` in the platform mono font.
- Huakun Yuanqi reference wordmark: `docs/design/assets/huakun-yuanqi/wordmark.png`.
- Production constraint: the Huakun Yuanqi raster crop is reference material only; replace it with an authorized SVG or transparent PNG before release.

### Product UI screenshots

- Platform overview: `docs/design/assets/huakun-yuanqi/platform-overview.png`.
- Current image is suitable for internal prototypes and product context, but not used as a decorative background.
- Production constraint: visible account names and timestamps require approval or redaction.

### Assistant asset

- M assistant source: `docs/design/assets/m-assistant/source.png`.
- Product copy: `apps/web/public/assets/assistant/m-assistant.webp`.
- Use as the assistant identity and launcher material; do not redraw it as a fake product render.

## Color system

- Primary blue: `#3A67B1`
- Signal cyan: `#56C0F8`
- Structural blue: `#4C91EB`
- Selective violet: `#9277DC`
- Ink: `#101838`
- Muted ink: `#566078`
- Canvas: `#F7F8FB`
- Surface: `#FFFFFF`
- Line: `#DCE3EF`
- Dark canvas: `#101838`

Rules:

- Blue carries primary actions and navigation state.
- Violet is reserved for AI/agent state and the Mobius assistant signal.
- Cyan is a narrow signal color, not a full-page background.
- Red is reserved for destructive or high-risk status.
- Broad purple-blue gradient backgrounds are not part of the product system.

## Typography

- Brand script: Kaushan Script, only for the top-level `AI Agent Platform` wordmark.
- Display: DIN Alternate / Arial Narrow / PingFang SC fallback.
- Body: PingFang SC / Microsoft YaHei.
- Mono: SFMono-Regular / Consolas / Liberation Mono.

## Layout and motion

- Spacing rhythm: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`.
- Enterprise UI uses hairline structure, measured density, and limited shadow depth.
- Press feedback: `scale(0.97)` over 160ms.
- Drawers and panels: 180–240ms strong ease-out.
- Mobius loop: 6s linear transform-only rotation; static under reduced motion.
- Keyboard-initiated actions must not wait for decorative animation.

## Vibe keywords

- industrial precision
- enterprise self-hosting
- controlled intelligence
- product-first
- quiet computation

## Completeness notes

- Missing: official logo SVG, reversed logo, formal Chinese typeface license, and Figma component library.
- Existing screenshots and raster wordmark remain explicit internal-design references.
- No invented metrics, customer quotes, model names, or live Skill results are permitted in UI artifacts.
