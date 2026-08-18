# Task 10: Public trial-entry adjustment

Implementation commit: `01bc4f88` (`feat(portal): hide trial entry points for 1.0`)

## Delivered

- Added a render-time public-entry policy that hides local `/trial` URLs while retaining the route and its implementation.
- Applied it to both public shell paths, desktop/mobile navigation, footer, product/platform/partner CTA renderers, and solution detail CTA.
- Replaced the homepage hero action with `联系我们` → `/contact?topic=官网咨询`; the contact page displays that topic.
- Updated the five required center closing sentences exactly; the coding center and download-center copy remain unchanged.

## Evidence

- RED: new policy module unresolved; homepage, closing-copy, solution CTA, and header contracts failed before implementation.
- GREEN: Web focused suite: 16 files, 175 tests passed. UI focused suite: 4 files, 40 tests passed.
- `pnpm --filter @ai-agent-platform/web typecheck`, UI typecheck, both lints, and `pnpm format:check` passed.
- Source check confirms `/trial` route registration and `TrialExperience` page remain; retained literal data is routed through the shared render policy.

## Risks

- This task used component/unit coverage only; browser end-to-end validation remains part of Task 12.
- New public CTA data must continue to go through the shared action renderers or call `isPublicEntryVisible` directly.
