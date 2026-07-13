# Pricing and M Assistant implementation verification

## Verification identity

- Date: 2026-07-13 CST (+0800)
- Final verified implementation HEAD: `5b23a1590ca4b73cce3dac4ec9d2f23343e77c09`
- Branch: `codex/feat-pricing-m-assistant`
- Node.js: `v26.0.0`
- pnpm: `11.5.2`
- Browser: Google Chrome `149.0.7827.115`
- Browser executable: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Playwright projects: `desktop` at 1440x1000; `mobile` at 390x844
- Production test server: target worktree build at `http://127.0.0.1:3107`

Port 3000 was already owned by the main worktree. Verification therefore used a production build from this worktree on port 3107 and did not stop the unrelated process.

## Fresh gates

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm --filter @ai-agent-platform/ui test` | 0 | 7 files, 60 tests passed |
| `pnpm --filter @ai-agent-platform/ui typecheck` | 0 | passed |
| `pnpm --filter @ai-agent-platform/web test` | 0 | 68 files passed, 3 skipped; 620 tests passed, 35 skipped |
| `pnpm --filter @ai-agent-platform/web typecheck` | 0 | passed in a fresh sequential run after build |
| `pnpm --filter @ai-agent-platform/web lint` | 0 | passed with zero warnings |
| `pnpm --filter @ai-agent-platform/web format:check` | 0 | passed |
| `pnpm --filter @ai-agent-platform/web build` | 0 | Next.js production build compiled, typechecked, and generated 26 static pages |
| `git diff --check` | 0 | no whitespace errors |

Build and web typecheck were finally run sequentially because both use generated `.next/types` files.

## Playwright result

Use two terminals so the production server stays alive during the browser run.

Terminal 1:

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec next start -p 3107
```

Wait for `✓ Ready`, then run in Terminal 2:

```bash
BASE_URL="http://127.0.0.1:3107" PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm --filter @ai-agent-platform/web exec playwright test e2e/pricing-assistant.spec.ts --project=desktop --project=mobile
```

Final result: exit 0, 8/8 passed in 8.7s. Four focused scenarios ran in both desktop and mobile projects:

1. API method rejection
2. Pricing, contact generation, layout, and focus
3. Assistant visibility, accessibility, and failure handling
4. Assistant session persistence and client navigation

After verification, stop Terminal 1 with Ctrl-C. `lsof -nP -iTCP:3107 -sTCP:LISTEN` must return no listener.

## Evidence covered

- GET `/api/v1/pricing/estimate` and GET `/api/v1/assistant/chat` each return an exact 405 in both projects.
- `/pricing` has the exact `价格计算` heading and disclosure. Currency and monetary amounts are absent both before and after module selection.
- Selecting `AI Agent Studio` and `Workflow` generates the exact contact query and contact-page summary.
- Desktop uses the expected 7:5 pricing layout; mobile stacks it without horizontal overflow. Keyboard focus is visible.
- The assistant is present on `/pricing` and `/product`, and absent on `/login`, `/register`, and `/staff/login`.
- Opening focuses the input; Escape closes the dialog and restores launcher focus. Reduced-motion mode removes launcher animation.
- Mobile controls meet the 44px target. The drawer reaches the viewport bottom.
- The mobile stylesheet contains the targeted `env(safe-area-inset-bottom)` contract. Chrome emulation reports an effective safe-area inset of 0; computed padding of at least 12px is base spacing only, not evidence of a nonzero effective inset.
- The exact shipped 503 body is asserted. The draft remains, no false history is added, fallback links remain visible, and the send plus two retries issue exactly three requests.
- A successful exchange survives both header and footer client-side portal navigation.
- A unique `window` and `document` sentinel survives identity navigation to `/login` and browser Back. This proves the navigation reused the document instead of performing a full reload. An explicit reload clears assistant history.

## Navigation implementation evidence

- Framework-neutral link injection now covers `PortalHeader`, menus, mobile navigation, and `SiteFooter`.
- The shared contract accepts anchor-compatible props only; a button adapter is rejected at typecheck time.
- The web adapter uses typed `next/link` navigation for internal paths and native anchors for external or protocol-relative URLs.
- Unit tests cover internal links, external links, protocol-relative links, modified clicks, and anchor attributes.

## Diagnostic policy

- Expected chat failures are matched structurally by pathname, POST method, 503 status, and exact count.
- Expected console errors are matched by level and source-location pathname, not English browser text.
- Direct request-context assertions cover the intentional API 405 responses.
- Next.js same-origin GET cancellations are allowed only when the error is `net::ERR_ABORTED` and the request is an RSC request or a `/_next/static/` asset.
- Any other console warning/error, page error, failed request, or HTTP response at or above 400 fails the test.

The final successful run had no unexpected diagnostics. Playwright removed earlier retained-on-failure screenshots and traces at the start of the run; the final run produced none.
