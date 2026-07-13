# Pricing and M Assistant implementation verification

## Verification identity

- Date: 2026-07-13 11:23:24 CST (+0800)
- Implementation Git HEAD: `b29512441aaf0f83e24e3cf123f4daa0cb8d6b0d`
- Branch: `codex/feat-pricing-m-assistant`
- Node.js: `v26.0.0`
- pnpm: `11.5.2`
- Browser: Google Chrome `149.0.7827.115`
- Browser executable: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Playwright projects: `desktop` at 1440x1000; `mobile` at 390x844
- Production test server: target worktree build on `http://127.0.0.1:3107`

The normal Playwright server port, 3000, was already owned by the main worktree. The verification used `BASE_URL` and a target-worktree `next start -p 3107` process instead of stopping that unrelated server. The target worktree used an ignored local `.env.local`; no values were printed or committed.

## Fresh repository gates after browser-driven fixes

| Command             | Exit | Result                                                                                |
| ------------------- | ---: | ------------------------------------------------------------------------------------- |
| `pnpm test`         |    0 | 91 files passed, 8 skipped; 782 tests passed, 47 skipped                              |
| `pnpm typecheck`    |    0 | database, integrations, UI, and web passed                                            |
| `pnpm lint`         |    0 | database, integrations, UI, and web passed with `--max-warnings=0`                    |
| `pnpm format:check` |    0 | all four projects passed Prettier checks                                              |
| `pnpm build`        |    0 | Next.js 16.2.10 production build compiled, typechecked, and generated 26 static pages |
| `git diff --check`  |    0 | no whitespace errors                                                                  |

Unit-test detail:

- integrations: 2 files, 7 tests passed
- UI: 7 files, 57 tests passed
- database: 15 files and 102 tests passed; 5 files and 12 tests skipped
- web: 67 files and 616 tests passed; 3 files and 35 tests skipped

## Playwright result

Reproducible commands:

```bash
pnpm --filter @ai-agent-platform/web exec next start -p 3107
BASE_URL="http://127.0.0.1:3107" PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm --filter @ai-agent-platform/web exec playwright test e2e/pricing-assistant.spec.ts --project=desktop --project=mobile
```

Final committed-state result: exit 0, 2/2 passed in 15.1s.

- desktop: passed in 2.9s
- mobile: passed in 2.8s
- GET `/api/v1/pricing/estimate`: exact 405 in both projects
- GET `/api/v1/assistant/chat`: exact 405 in both projects
- Expected console resource errors: 3 per project, each caused by the deliberately intercepted 503 chat response
- Unexpected console errors: 0 in both projects
- Horizontal overflow: none at either viewport
- Reduced motion computed launcher result: `animation-name: none`, `animation-duration: 0s` in both projects
- Desktop pricing layout: 7:5 column ratio asserted; keyboard focus outline visible
- Mobile pricing layout: stacked; assistant drawer shape, 44px minimum controls, safe-area rule, and viewport containment asserted

## Covered behavior

- `/pricing` has the exact `价格计算` h1 and disclosure, no currency amount, exact contact query generation, and the exact contact-page summary after selecting `AI Agent Studio` and `Workflow`.
- The assistant is present on `/pricing` and `/product`, and absent on `/login`, `/register`, and `/staff/login`.
- Opening focuses the input; Escape closes the dialog and returns focus to the launcher.
- A deliberately intercepted 503 retains the draft, adds no false user or assistant history, keeps Help and Business fallbacks visible, and issues exactly one request for each of two retry clicks.
- A successful exchange survives a real Next header navigation to `/product`.
- A real client-side identity link hides the widget on `/login`; browser Back restores `/product` with the same history; full reload clears the history.

## Browser-found fixes

The first session-lifecycle run exposed that portal header links were plain anchors, so a route change reloaded the document and discarded assistant state. The UI package now accepts an injected link component, and the web shell supplies `next/link`. This keeps the shared UI package framework-neutral while making web portal navigation client-side.

The mobile run then exposed a stacking-context bug: the assistant launcher could cover the full-navigation identity action. While the mobile navigation overlay is open, the site header now stacks above the assistant.

## Failure artifacts

Diagnostic failures produced the configured `test-failed-1.png` and `trace.zip` under:

- `artifacts/playwright/test-results/pricing-assistant-verifies-fd38b--public-and-identity-routes-desktop/`
- `artifacts/playwright/test-results/pricing-assistant-verifies-fd38b--public-and-identity-routes-mobile/`

Playwright cleaned those retained-on-failure artifacts at the start of the final successful run. The final run produced no failure screenshot or trace; only `.last-run.json` remains.
