# Admin Core Simplification Design

## Goal

Reduce the Admin workspace to three primary areas—Agent management, document management, and user management—remove two-factor and sensitive-action re-authentication, provision one case-sensitive local super administrator, and activate the requested key-optional DeepSeek-compatible endpoint.

## Authentication and identity

- Remove the Better Auth two-factor plugin, TOTP enrollment/challenge/removal pages and actions, recovery codes, MFA assurance stamps, and password/TOTP re-authentication gates.
- Keep ordinary authenticated workforce sessions, permission checks, rate limiting, audit events, session expiry, and destructive-action confirmations.
- Sensitive Admin actions require a valid session and the existing permission only; they do not require password or TOTP re-authentication.
- Preserve username case by setting Better Auth username normalization to `false` and by trimming/NFKC-normalizing without lowercasing.
- Keep the existing case-insensitive unique username index so case-only duplicate accounts cannot be created.
- Permit `@` in workforce usernames. During login, an exact username match takes precedence over email lookup.
- Provision the sole local account with:
  - username/display name: `Hkzy@admin`
  - email: `admin@schkzy.com`
  - password: `Hkzy@admin2020!`
  - realm/status/role: `workforce`, `active`, `super_admin`
  - `must_change_password=false`

## Admin information architecture and UI

- Primary sidebar entries: `Agent 管理`, `文档管理`, `用户管理`.
- Existing non-primary Admin routes remain available under one collapsed `其他功能` group; this is navigation reduction, not route deletion.
- Use the approved dark frosted-glass sidebar. Reuse the current AppShell/sidebar components and CSS; do not add a UI dependency.
- Agent management becomes a single-Agent control plane for the existing default Agent. It uses status summaries and four sections: overview, model configuration, Skill management, and test/session tools. Remove unsupported roadmap cards.
- User management consolidates accounts, roles/permissions, and sessions into one workbench. Creation moves to a focused disclosure/dialog pattern; row actions remain permission-gated, and destructive actions retain explicit confirmation.
- Document management retains its current behavior and moves into the primary navigation.

## Custom model endpoint

- `Endpoint` remains a deployment-owned allowlist selector, not a free-form URL field.
- Add the exact endpoint `http://125.122.36.24:8810/v1` for the DeepSeek provider and label it clearly as a custom HTTP endpoint.
- Official endpoints continue to require API keys. Deployment endpoints declare whether a key is required or optional; the requested endpoint is optional.
- For optional-key endpoints, an empty field means unauthenticated operation and a supplied value means Bearer-key operation.
- Permit insecure HTTP only when a deployment endpoint explicitly opts in. Continue rejecting loopback, private, link-local, multicast, wildcard, credential-bearing, query, and fragment URLs.
- Surface an HTTP warning in Admin metadata/UI. The accepted trade-off is that prompts and model responses are transported without TLS.
- Configure and activate model ID `DeepSeek-V4-Flash-code` with no stored API key. The endpoint was read-only probed without a key: `/v1/models` returned HTTP 200 and listed that exact ID.

## Data changes

- Add a forward migration that removes the TOTP table and MFA-only user/session columns after application code no longer references them.
- Make model-config secret fields nullable as one consistent group for unauthenticated endpoints; reject partially-null encrypted secret state.
- Transactionally delete all local user records and their cascading credentials, sessions, assignments, and account-owned data while retaining the role/permission catalog and unrelated platform data.
- Create the sole super administrator in the same audited transaction after confirming the `super_admin` role exists.
- The account reset targets only the currently running local Compose database `ai-agent-platform-db-1`.

## Verification

- Unit tests cover removed MFA routes/contracts, case-sensitive username login and uniqueness, exact-username precedence, Admin navigation grouping, optional-key endpoint validation, HTTP opt-in rejection/acceptance, nullable-secret invariants, and the revised Agent/user UI.
- Agent tests cover construction and smoke verification for the custom no-key endpoint.
- Run Web, database, UI, and Agent test suites plus typecheck/lint/build gates relevant to changed packages.
- Apply migrations to the local Compose database, verify exactly one user exists with the requested identity and complete `super_admin` permissions, then configure/test/activate the requested model and verify the active runtime snapshot.

