# Pricing and M Assistant implementation verification

## Verification identity

- Date: 2026-07-13 CST (+0800)
- Implementation under test: `165a96f73f987c8bfb2c1de554d77bce04c153eb`
- Pricing fix: `81579b1fc6be1a83af7e5f4f6c4d75ef1b3ef879`
- Assistant safe-action fix: `af44f8279f246bbe6848210c44b46caf4fe6accb`
- Operations fix: `f1f82bf9d82b177af124c21dc2dde8cb621f0c25`
- Unicode request-limit fix: `2c445f68072769f66d81ef2325e15c893235ada6`
- Pricing component boundary refactor: `6c729afea06d8475150891aa4ad47ce8e0d433cf`
- Latest browser suite source: `165a96f73f987c8bfb2c1de554d77bce04c153eb`
- Branch: `codex/feat-pricing-m-assistant`
- Node.js: `v26.0.0`
- pnpm: `11.5.2`
- Browser: Google Chrome `149.0.7827.115`
- Browser executable: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Playwright projects: `desktop` at 1440x1000; `mobile` at 390x844
- Production test server: target worktree build at `http://127.0.0.1:3113`

Verification used a production build from this worktree on non-conflicting port 3113. The server was stopped after the browser run, and `lsof -nP -iTCP:3113 -sTCP:LISTEN` returned no listener.

## Fresh gates

| Command                                                                                      | Exit | Result                                                                                              |
| -------------------------------------------------------------------------------------------- | ---: | --------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                                                  |    0 | 92 files passed, 8 skipped; 802 tests passed, 47 skipped across database, integrations, UI, and web |
| `pnpm typecheck`                                                                             |    0 | database, integrations, UI, and web passed                                                          |
| `pnpm lint`                                                                                  |    0 | database, integrations, UI, and web passed with `--max-warnings=0`                                  |
| `pnpm format:check`                                                                          |    0 | database, integrations, UI, and web passed Prettier checks                                          |
| `pnpm build`                                                                                 |    0 | Next.js 16.2.10 production build compiled, typechecked, and generated 26 static pages               |
| `pnpm --filter @ai-agent-platform/database exec vitest run src/deployment-contracts.test.ts` |    0 | 15 deployment contracts passed                                                                      |
| pinned Nginx 1.28.3 `nginx -t`                                                               |    0 | environment-expanded Nginx template syntax and configuration were valid                             |
| `git diff --check`                                                                           |    0 | no whitespace errors                                                                                |

## Playwright result

Use two terminals so the production server stays alive during the browser run.

Terminal 1:

```bash
pnpm --filter @ai-agent-platform/web build
pnpm --filter @ai-agent-platform/web exec next start -H 127.0.0.1 -p 3113
```

Wait for `✓ Ready`, then run in Terminal 2:

```bash
BASE_URL="http://127.0.0.1:3113" PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm --filter @ai-agent-platform/web exec playwright test e2e/pricing-assistant.spec.ts --project=desktop --project=mobile
```

Final result: exit 0, 10/10 passed in 26.3s. Five focused scenarios ran in both desktop and mobile projects:

1. API method rejection
2. Preset assistant responses and safe suggested-action links
3. Pricing, contact generation, layout, and focus
4. Assistant visibility, input limits, accessibility, and failure handling
5. Assistant session persistence through pricing, header, footer, and identity client navigation

After verification, stop Terminal 1 with Ctrl-C. `lsof -nP -iTCP:3113 -sTCP:LISTEN` must return no listener.

## Evidence covered

- GET `/api/v1/pricing/estimate` and GET `/api/v1/assistant/chat` each return an exact 405 in both projects.
- `/pricing` has the exact `价格计算` heading and disclosure. Currency and monetary amounts are absent both before and after module selection.
- Selecting `AI Agent Studio` and `Workflow` generates the exact contact query and contact-page summary.
- Pricing query unit coverage proves module stable IDs are deduplicated and sorted lexically, invalid scalar IDs are omitted rather than replaced with defaults, and both declared and chunked bodies above 4096 bytes get the stable 400 response.
- The pricing calculator component, stylesheet, and component test live under `src/components/portal/pricing`; pricing domain/config/query/contract logic remains under `src/features/pricing`.
- Desktop uses the expected 7:5 pricing layout; mobile stacks it without horizontal overflow. Keyboard focus is visible.
- The assistant is present on `/pricing` and `/product`, and absent on `/login`, `/register`, and `/staff/login`.
- All three preset responses render their safe links for `/docs#quick-start`, `/contact`, and `/support`; unsafe protocol-relative, backslash, query-redirect, and encoded-slash actions are removed before response storage and rendering.
- Assistant request tests accept exactly 500 escaped emoji through both declared and chunked JSON bodies, contract-reject 501 code points, and reject declared or streamed bodies above 16 KiB.
- The assistant input uses code-point-aware validation without native UTF-16 `maxlength`; 500 emoji submit successfully in desktop and mobile Chrome, while 501 show accessible feedback and issue no request.
- Opening focuses the input; Escape closes the dialog and restores launcher focus. Reduced-motion mode removes launcher animation.
- Mobile controls meet the 44px target. The drawer reaches the viewport bottom.
- The mobile stylesheet contains the targeted `env(safe-area-inset-bottom)` contract. Chrome emulation reports an effective safe-area inset of 0; computed padding of at least 12px is base spacing only, not evidence of a nonzero effective inset.
- The exact shipped 503 body is asserted. The draft remains, the failed message is not added to the preserved successful history, fallback links remain visible, and the send plus two retries issue exactly three requests.
- A successful exchange survives the pricing-to-contact handoff and both header and footer client-side portal navigation.
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
