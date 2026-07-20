# Domestic Enterprise Login UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace only `/login` and `/staff/login` with the approved light-blue domestic enterprise login layout while preserving all existing authentication and database behavior.

**Architecture:** Add an app-local `LoginPage` presentation component with customer and staff variants, leaving the shared `AuthPage`/`AuthShell` used by registration and security flows unchanged. Existing customer and staff forms continue to own `useActionState`, Server Action wiring, credential field names, pending state, generic errors, and `returnTo`; the new page owns only layout, disabled future-method affordances, and cross-realm navigation.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, scoped CSS, Lucide React, Vitest, Testing Library, ESLint.

**Required implementation practices:** Use @test-driven-development for each behavior change and @verification-before-completion before reporting success. Do not stage or modify unrelated worktree files.

**Execution prerequisite:** Commit this reviewed plan before Task 1 so the `cbddbe7..HEAD` audit includes the plan and every implementation commit while excluding pre-existing unrelated worktree files.

---

## Chunk 1: Isolated Login Experience

### Task 1: Build the login-only page contract

**Files:**

- Create: `apps/web/src/components/auth/login-page.tsx`
- Create: `apps/web/src/components/auth/login-page.test.tsx`

- [ ] **Step 1: Write the failing component tests**

Create `login-page.test.tsx` with two focused cases:

```tsx
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LoginPage } from "./login-page";

afterEach(cleanup);

describe("LoginPage", () => {
  it("renders customer-only future methods as disabled controls", () => {
    render(
      <LoginPage
        intro="使用已注册的客户账号继续访问。"
        title="登录客户控制台"
        variant="customer"
      >
        <form aria-label="客户登录表单" />
      </LoginPage>,
    );

    expect(screen.getByText("华鲲元启 · AI Agent Platform")).toBeVisible();
    expect(screen.getByRole("heading", { name: "欢迎登录" })).toBeVisible();
    const qrPlaceholder = screen.getByLabelText("扫码登录即将开放");
    expect(qrPlaceholder).toBeVisible();
    expect(within(qrPlaceholder).getByText("即将开放")).toBeVisible();
    for (const name of [
      "手机号登录，即将开放",
      "扫码登录，即将开放",
      "支付宝登录，即将开放",
      "微信登录，即将开放",
      "钉钉登录，即将开放",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(within(button).getByText("即将开放")).toBeVisible();
    }
    expect(screen.getByRole("link", { name: "员工登录" })).toHaveAttribute(
      "href",
      "/staff/login",
    );
    expect(screen.getByRole("form", { name: "客户登录表单" })).toBeVisible();
  });

  it("renders staff security content without customer login providers", () => {
    render(
      <LoginPage
        intro="使用企业管理员分配的内部账号。"
        title="登录运营后台"
        variant="staff"
      >
        <form aria-label="员工登录表单" />
      </LoginPage>,
    );

    const aside = screen.getByRole("complementary", {
      name: "员工安全登录说明",
    });
    expect(within(aside).getByText("分域访问")).toBeVisible();
    expect(within(aside).getByText("风险控制")).toBeVisible();
    expect(screen.queryByText("支付宝")).not.toBeInTheDocument();
    for (const name of [
      "动态口令登录，即将开放",
      "企业 SSO 登录，即将开放",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(within(button).getByText("即将开放")).toBeVisible();
    }
    expect(screen.getByRole("link", { name: "返回客户登录" })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
```

- [ ] **Step 2: Run the test and verify the missing component failure**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/auth/login-page.test.tsx
```

Expected: FAIL because `./login-page` does not exist.

- [ ] **Step 3: Implement the semantic login shell**

Create `login-page.tsx` as a server-compatible presentation component. Use `QrCode` and `ShieldCheck` from `lucide-react`; do not add client state or an external asset.

The public interface must be:

```tsx
import type { ReactNode } from "react";

export type LoginPageProps = {
  children: ReactNode;
  intro: string;
  title: string;
  variant: "customer" | "staff";
};
```

Implement these fixed content contracts:

```tsx
const pageContent = {
  customer: {
    brand: "华鲲元启 · AI Agent Platform",
    asideLabel: "客户登录说明",
    asideTitle: "欢迎登录",
    asideDescription: "一站式管理企业授权、智能应用、团队与服务资源。",
    futureMethods: ["手机号", "扫码"],
    alternateHref: "/staff/login",
    alternateLabel: "员工登录",
  },
  staff: {
    brand: "华鲲元启 · 运营工作台",
    asideLabel: "员工安全登录说明",
    asideTitle: "员工安全登录",
    asideDescription: "仅限企业管理员开通的内部账号，登录行为将纳入安全审计。",
    futureMethods: ["动态口令", "企业 SSO"],
    alternateHref: "/login",
    alternateLabel: "返回客户登录",
  },
} as const;
```

The DOM structure must include:

- Root: `div.enterprise-login-page.enterprise-login-page--{variant}`.
- `aside.enterprise-login-page__aside` with `aria-label` from the variant.
- Brand link to `/`, aside title, and description.
- Customer-only `QrCode` placeholder labeled `扫码登录即将开放`, containing visible `扫码登录` and `即将开放` text, plus disabled provider buttons for 支付宝、微信、钉钉.
- Staff-only security list containing `分域访问` and `风险控制`, prefixed by a decorative `ShieldCheck`.
- `main.enterprise-login-page__operation` containing one `h1`, intro, and a `div` with `role="group"` and `aria-label="登录方式"`.
- A non-button active label `账号登录`; future methods use `button type="button" disabled` with accessible names ending in `登录，即将开放`. Every disabled method/provider button must also contain a visible child label `即将开放`; do not satisfy this contract with `aria-label` alone.
- Child form inside `div.enterprise-login-page__form`.
- Brand link with class `enterprise-login-page__brand-link` and alternate login link with class `enterprise-login-page__alternate-link`, using the fixed route and label from the variant.

Do not use `<nav>` for the method group: auth route tests intentionally verify that public portal navigation is absent.

- [ ] **Step 4: Run the component test and verify it passes**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/auth/login-page.test.tsx
```

Expected: 1 test file and 2 tests PASS.

- [ ] **Step 5: Commit the isolated component contract**

```bash
git add apps/web/src/components/auth/login-page.tsx apps/web/src/components/auth/login-page.test.tsx
git commit -m "feat(auth): add isolated login page shell"
```

### Task 2: Move only the two login routes to `LoginPage`

**Files:**

- Modify: `apps/web/src/app/login/page.test.tsx`
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/app/staff/login/page.test.tsx`
- Modify: `apps/web/src/app/staff/login/page.tsx`
- Verify unchanged: `apps/web/src/components/auth/auth-page.tsx`
- Verify unchanged: `packages/ui/src/auth-shell/auth-shell.tsx`

- [ ] **Step 1: Update route tests first**

For `/login`, replace the old `Customer Access` assertion with:

```tsx
expect(screen.getByText("华鲲元启 · AI Agent Platform")).toBeVisible();
expect(screen.getByRole("heading", { name: "登录客户控制台" })).toBeVisible();
expect(
  screen.getByRole("button", { name: "手机号登录，即将开放" }),
).toBeDisabled();
expect(screen.getByRole("link", { name: "员工登录" })).toHaveAttribute(
  "href",
  "/staff/login",
);
```

For `/staff/login`, replace the old `Workforce Access` assertion with:

```tsx
expect(screen.getByText("华鲲元启 · 运营工作台")).toBeVisible();
expect(screen.getByRole("heading", { name: "登录运营后台" })).toBeVisible();
expect(
  screen.getByRole("button", { name: "企业 SSO 登录，即将开放" }),
).toBeDisabled();
expect(screen.getByRole("link", { name: "返回客户登录" })).toHaveAttribute(
  "href",
  "/login",
);
```

Also make these exact test updates so no old-shell assertion remains:

- Rename the customer test to `uses the customer login page and preserves returnTo`.
- Replace `/管理企业授权、资源、团队与服务记录/` with `/使用已注册的客户账号继续访问/`.
- Rename the staff test to `uses the staff login page and preserves returnTo`.
- Replace `/仅限已由企业管理员开通/` with `/使用企业管理员分配的内部账号/`.
- Keep both existing hidden `returnTo` assertions and the assertions that public navigation/assistant chrome is absent.

- [ ] **Step 2: Run the route tests and verify they fail against `AuthPage`**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/app/login/page.test.tsx src/app/staff/login/page.test.tsx
```

Expected: FAIL because the new brands, future-method buttons, and alternate links do not exist.

- [ ] **Step 3: Replace only the route-level presentation wrapper**

In `apps/web/src/app/login/page.tsx`:

```tsx
import { LoginPage } from "@/components/auth/login-page";

<LoginPage
  intro="使用已注册的客户账号继续访问。"
  title="登录客户控制台"
  variant="customer"
>
  <CustomerLoginForm returnTo={returnTo} />
</LoginPage>
```

In `apps/web/src/app/staff/login/page.tsx`:

```tsx
import { LoginPage } from "@/components/auth/login-page";

<LoginPage
  intro="使用企业管理员分配的内部账号。"
  title="登录运营后台"
  variant="staff"
>
  <StaffLoginForm returnTo={returnTo} />
</LoginPage>
```

Remove only the obsolete `AuthPage` imports and props from these two files. Do not edit `AuthPage`, `AuthShell`, registration, two-factor, change-password, or re-auth routes.

- [ ] **Step 4: Run route and legacy auth shell tests**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/app/login/page.test.tsx src/app/staff/login/page.test.tsx src/components/auth/auth-page.test.tsx
```

Expected: 3 test files PASS. `AuthPage` continues to render the old secure shell for non-login flows.

- [ ] **Step 5: Commit the isolated route migration**

```bash
git add apps/web/src/app/login/page.tsx apps/web/src/app/login/page.test.tsx apps/web/src/app/staff/login/page.tsx apps/web/src/app/staff/login/page.test.tsx
git commit -m "feat(auth): adopt enterprise login shell"
```

### Task 3: Apply the approved form copy without changing form contracts

**Files:**

- Modify: `apps/web/src/components/auth/customer-login-form.test.tsx`
- Modify: `apps/web/src/components/auth/customer-login-form.tsx`
- Modify: `apps/web/src/components/auth/staff-login-form.test.tsx`
- Modify: `apps/web/src/components/auth/staff-login-form.tsx`
- Verify: `apps/web/src/components/auth/login-form-contract.test.ts`

- [ ] **Step 1: Add failing assertions for placeholders and approved CTA labels**

Customer test additions:

```tsx
expect(screen.getByLabelText("邮箱")).toHaveAttribute(
  "placeholder",
  "请输入邮箱地址",
);
expect(screen.getByLabelText("密码")).toHaveAttribute(
  "placeholder",
  "请输入登录密码",
);
expect(screen.getByRole("button", { name: "立即登录" })).toBeEnabled();
expect(screen.getByLabelText("邮箱")).toHaveAttribute("name", "email");
expect(screen.getByLabelText("密码")).toHaveAttribute("name", "password");
```

Staff test additions:

```tsx
expect(screen.getByLabelText("员工用户名或邮箱")).toHaveAttribute(
  "placeholder",
  "请输入用户名或企业邮箱",
);
expect(screen.getByLabelText("密码")).toHaveAttribute(
  "placeholder",
  "请输入登录密码",
);
expect(screen.getByRole("button", { name: "安全登录" })).toBeEnabled();
expect(screen.getByLabelText("员工用户名或邮箱")).toHaveAttribute(
  "name",
  "identifier",
);
expect(screen.getByLabelText("密码")).toHaveAttribute("name", "password");
```

Replace the old submit-button label assertions, but retain all autocomplete, registration/no-registration, `aria-live`, and stable generic error assertions.

- [ ] **Step 2: Run form tests and verify the new copy fails**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/auth/customer-login-form.test.tsx src/components/auth/staff-login-form.test.tsx
```

Expected: FAIL only on the new placeholder and button-label expectations.

- [ ] **Step 3: Make the smallest form presentation changes**

In `customer-login-form.tsx`:

- Change the idle submit text from `登录客户控制台` to `立即登录`; keep `正在登录…` unchanged.
- Add `placeholder="请输入邮箱地址"` to the `email` input.
- Add `placeholder="请输入登录密码"` to the password input.
- Do not change `action`, `name`, `type`, `required`, autocomplete, maximum lengths, error mapping, registration link, or hidden `returnTo`.

In `staff-login-form.tsx`:

- Change the idle submit text from `登录运营后台` to `安全登录`; keep `正在验证…` unchanged.
- Add `placeholder="请输入用户名或企业邮箱"` to the identifier input.
- Add `placeholder="请输入登录密码"` to the password input.
- Do not change `action`, `name`, `type`, `required`, autocomplete, maximum lengths, error mapping, notice, or hidden `returnTo`.

- [ ] **Step 4: Run the form and interaction-contract tests**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/auth/customer-login-form.test.tsx src/components/auth/staff-login-form.test.tsx src/components/auth/login-form-contract.test.ts
```

Expected: 3 test files PASS; `useActionState`, `useFormStatus`, and the 44px shared interaction contract remain intact.

- [ ] **Step 5: Commit the copy-only form update**

```bash
git add apps/web/src/components/auth/customer-login-form.tsx apps/web/src/components/auth/customer-login-form.test.tsx apps/web/src/components/auth/staff-login-form.tsx apps/web/src/components/auth/staff-login-form.test.tsx
git commit -m "refactor(auth): clarify login form copy"
```

### Task 4: Add strictly scoped responsive styling

**Files:**

- Create: `apps/web/src/components/auth/login-page.css`
- Create: `apps/web/src/components/auth/login-page-css-contract.test.ts`
- Modify: `apps/web/src/components/auth/login-page.tsx`
- Verify unchanged: `apps/web/src/components/auth/login-form.css`

- [ ] **Step 1: Write a failing CSS isolation contract**

Create `login-page-css-contract.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("login page CSS contract", () => {
  it("keeps the redesign scoped, responsive, and touch accessible", () => {
    const css = readFileSync("src/components/auth/login-page.css", "utf8");

    expect(css).toContain(".enterprise-login-page");
    expect(css).toMatch(/grid-template-columns:\s*minmax\(300px,\s*0\.8fr\)\s+minmax\(420px,\s*1\.2fr\)/u);
    expect(css).toMatch(/\.enterprise-login-page .*\.auth-form__submit[^{]*\{[^}]*min-height:\s*48px/isu);
    expect(css).toMatch(/@media\s*\(max-width:\s*860px\)/u);
    expect(css).toMatch(/@media\s*\(max-width:\s*560px\)/u);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
    expect(css).toMatch(/\.enterprise-login-page__brand-link\s*\{[^}]*min-height:\s*44px/isu);
    expect(css).toMatch(/\.enterprise-login-page__alternate-link\s*\{[^}]*min-height:\s*44px/isu);
    expect(css).not.toMatch(/^\.auth-form(?:__|\s|\{)/mu);
  });
});
```

- [ ] **Step 2: Run the CSS contract and verify the missing-file failure**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/auth/login-page-css-contract.test.ts
```

Expected: FAIL because `login-page.css` does not exist.

- [ ] **Step 3: Implement the approved visual system**

Import `./login-page.css` from `login-page.tsx`. Create `login-page.css` with every selector rooted at `.enterprise-login-page` and these exact layout constraints:

- Root grid: `minmax(300px, 0.8fr) minmax(420px, 1.2fr)`, `min-height: 100vh`, light-blue auth background, platform body font.
- Aside: `position: relative`, grid/flex vertical distribution, `overflow: hidden`, `padding: clamp(32px, 5vw, 64px)`, subtle blue-white background, and a 1px divider.
- Brand: compact blue `AI` mark plus Chinese platform name; `.enterprise-login-page__brand-link` uses `inline-flex`, has at least `44px` height, and has a visible focus outline.
- Customer QR placeholder: visibly disabled, no scannable pattern, `QrCode` icon, copy `扫码登录` and `即将开放`.
- Provider buttons and future-method buttons: native disabled appearance with at least `44px` height, muted blue-gray colors, and `cursor: not-allowed`.
- Staff security items: two compact rows with a blue rule/icon, no customer providers.
- Operation: centered content with `width: min(100%, 520px)` and `padding: clamp(32px, 7vw, 88px)`.
- Typography: h1 around `clamp(30px, 4vw, 42px)`, compact intro, blue active method underline.
- Scoped form overrides only under `.enterprise-login-page .auth-form`: 14-16px gaps, input and submit height `48px`, small 4-6px radii, white input backgrounds, solid primary-blue submit, and no gradient.
- Scoped secondary/notice layout that keeps the existing registration link usable and places `.enterprise-login-page__alternate-link` below it without overlap; the alternate link uses `inline-flex` and has at least `44px` height.
- At `max-width: 860px`, switch the root to one column, make the aside a compact header section, and hide customer QR/provider detail plus staff security detail.
- At `max-width: 560px`, reduce horizontal padding, keep method controls wrapping safely, and ensure no fixed width can cause horizontal overflow.
- Under `prefers-reduced-motion: reduce`, remove transitions from the page and scoped form controls.

Do not edit `login-form.css`; this is the enforcement boundary that protects registration, two-factor, change-password, and re-auth styling.

- [ ] **Step 4: Run CSS, component, route, and legacy auth tests**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/auth/login-page-css-contract.test.ts src/components/auth/login-page.test.tsx src/app/login/page.test.tsx src/app/staff/login/page.test.tsx src/components/auth/auth-page.test.tsx
```

Expected: 5 test files PASS.

- [ ] **Step 5: Commit the isolated visual layer**

```bash
git add apps/web/src/components/auth/login-page.css apps/web/src/components/auth/login-page-css-contract.test.ts apps/web/src/components/auth/login-page.tsx
git commit -m "style(auth): add responsive enterprise login UI"
```

### Task 5: Prove authentication and unrelated flows remain unchanged

**Files:**

- Verify: `apps/web/src/components/auth/*`
- Verify: `apps/web/src/app/login/*`
- Verify: `apps/web/src/app/staff/login/*`
- Verify unchanged: `apps/web/src/server/auth/*`
- Verify unchanged: `packages/database/*`
- Verify unchanged: database migration directories

- [ ] **Step 1: Run the complete focused auth UI suite**

Run:

```bash
pnpm --filter @ai-agent-platform/web test -- src/components/auth src/app/login/page.test.tsx src/app/staff/login/page.test.tsx src/app/staff/two-factor/page.test.tsx src/app/staff/change-password/page.test.tsx src/app/staff/re-auth/page.test.tsx src/app/register/page.test.tsx
```

Expected: all selected test files PASS. The unchanged flows continue using `AuthPage`.

- [ ] **Step 2: Run static verification**

Run:

```bash
pnpm --filter @ai-agent-platform/web typecheck
pnpm --filter @ai-agent-platform/web lint
```

Expected: both commands exit 0 with no TypeScript or ESLint errors.

- [ ] **Step 3: Run the full Web test suite**

Run:

```bash
pnpm --filter @ai-agent-platform/web test
```

Expected: all unit/contract tests PASS. PostgreSQL integration tests may remain explicitly skipped when their opt-in environment is absent; skipped integration tests must not be reported as executed database validation.

- [ ] **Step 4: Audit the implementation diff boundary**

Run:

```bash
git diff cbddbe7..HEAD --name-only
git diff cbddbe7 -- apps/web/src/server packages/database
git status --short -- apps/web/src/server packages/database
git status --short
```

Expected:

- The commit-range name list contains only the plan plus login page/form/test files named above.
- The server/database diff command prints nothing, including committed, staged, and unstaged changes relative to `cbddbe7`.
- The scoped server/database status command prints nothing; this includes `packages/database/drizzle` migration files.
- Pre-existing unrelated worktree changes remain present but unstaged and untouched.

- [ ] **Step 5: Verify both pages in a real browser**

Start the Web app:

```bash
pnpm --filter @ai-agent-platform/web dev
```

Use `curl --noproxy '*'` and a browser to inspect `/login` and `/staff/login` at approximately 1440px and 390px widths. Verify:

- Both pages load without browser console errors or missing assets.
- Desktop uses the approved blue-white dual-column layout.
- Mobile uses one column with no horizontal scroll.
- Real email/identifier and password fields remain editable.
- Future login methods are visibly disabled and do not emit a request.
- Keyboard focus is visible on inputs, real buttons, registration, and alternate-login links.
- Customer and staff pages link to each other correctly.

Stop the dev server after verification.

- [ ] **Step 6: Commit only if verification required a corrective change**

If no correction was required, do not create an empty commit. If a correction was required, stage only the exact login UI files changed and commit:

```bash
git commit -m "fix(auth): complete login UI verification"
```
