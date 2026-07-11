# Identity and Access Control Design

## 1. Status

| Field   | Value                                                                                      |
| ------- | ------------------------------------------------------------------------------------------ |
| Project | AI Agent Platform enterprise portal                                                        |
| Phase   | Phase 10 / Identity and Access Control                                                     |
| Status  | Approved                                                                                   |
| Date    | 2026-07-11                                                                                 |
| Scope   | Customer identity, workforce identity, database sessions, RBAC, registration review, audit |

## 2. Objective

Build the first real business foundation behind the existing Portal, Console, and CMS shells:

- customers can submit registration requests and track onboarding state;
- approved customers can sign in to the customer Console;
- employees are provisioned internally and can sign in to the workforce portal;
- administrators are employees with privileged roles, not a separate account species;
- every protected operation is authorized on the server;
- account disablement, role changes, and forced sign-out take effect immediately;
- customer email verification has a stable UI, state, and provider boundary without requiring SMTP in Phase 10.

## 3. Design Principles

1. **Separate identity realms.** Customer identity (CIAM) and workforce identity are different trust domains even though Phase 10 uses one application and one PostgreSQL cluster.
2. **Roles are not identity types.** `customer` and `workforce` describe where an identity belongs; `customer_admin`, `content_operator`, and `super_admin` describe what it may do.
3. **Server-side enforcement.** Navigation filtering is presentation only. The data-access layer and every mutation must re-check the current session and permission.
4. **Immediate revocation.** Session validity is read from PostgreSQL for protected requests. Session-cookie caching is disabled.
5. **No fake integrations.** Email delivery remains disabled behind a provider contract. The product must never report that a verification email was sent when no provider is enabled.
6. **Replaceable authentication source.** Customer CIAM and workforce SSO can replace local credentials independently later without changing the domain RBAC model.

This follows the mainstream workforce/external-identity split described by Microsoft Entra External ID while retaining a practical modular-monolith deployment for Phase 1.

## 4. Selected Approach

### 4.1 Authentication and session engine

Use Better Auth with its Drizzle/PostgreSQL adapter for local credentials and database-backed sessions. Use two realm-specific, server-only configurations over the same technical foundation:

- customer auth base path: `/api/auth/customer`;
- workforce auth base path: `/api/auth/staff`;
- customer cookie: `aap_customer_session`;
- workforce cookie: `aap_staff_session`.

Both configurations must enforce the expected `identityRealm` before completing sign-in. Phase 10 exposes no generic Better Auth Route Handler: project Server Actions call the correct server-only instance, and callers cannot select or mutate the realm in request data. Future OAuth or email callbacks require a separately reviewed explicit allow-list route.

Session-cookie caching is disabled so disabling a user, revoking a session, or changing permissions is visible on the next protected request.

### 4.2 Authorization engine

Keep authorization in project-owned tables and services:

- `roles` defines named roles within one realm;
- `permissions` defines stable capability keys;
- `user_roles` assigns roles to users;
- `role_permissions` grants capabilities to roles;
- authorization services reject cross-realm role assignment;
- protected data services accept an authenticated actor, not a client-supplied user ID.

Better Auth owns authentication and session mechanics. It does not own the business permission model.

### 4.3 Rejected approaches

- **Fully custom authentication:** rejected because password, cookie, rotation, and session edge cases would become project-owned security code without a business benefit.
- **Stateless JWT browser sessions:** rejected because immediate revocation, account disablement, and permission changes are core requirements.
- **External IdP in Phase 10:** rejected because the current product scope explicitly avoids SMTP, SSO, LDAP, and other external dependencies.

## 5. Identity Model

### 5.1 Realms

| Realm       | Users                                               | Provisioning                                 | Primary application |
| ----------- | --------------------------------------------------- | -------------------------------------------- | ------------------- |
| `customer`  | external enterprise customers                       | self-service registration followed by review | `/console/**`       |
| `workforce` | employees, operators, support staff, administrators | administrator-created only                   | `/admin/**`         |

An email address is globally unique in Phase 10. A user belongs to exactly one realm and cannot switch realms through profile or role APIs.

### 5.2 Customer roles

| Role              | Purpose                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `customer_member` | normal approved member of a customer organization                                                                                |
| `customer_admin`  | manages membership for one customer organization; advanced team actions remain placeholders until the team module is implemented |

### 5.3 Workforce roles

| Role               | Purpose                                                                         |
| ------------------ | ------------------------------------------------------------------------------- |
| `employee`         | authenticated employee with no CMS mutation permission by default               |
| `content_operator` | manages authorized content modules                                              |
| `support_operator` | reviews customer registration and later support workflows                       |
| `admin`            | manages users within allowed boundaries and assigns non-super roles             |
| `super_admin`      | manages users, roles, permissions, site configuration, and other administrators |

`admin` and `super_admin` are workforce roles. Public registration can never create them.

## 6. Account and Registration States

### 6.1 User status

| Status           | Meaning                                                     | Authentication result                              |
| ---------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| `pending_review` | customer credentials exist but registration is not approved | onboarding-only session                            |
| `active`         | account may enter its realm application                     | normal session                                     |
| `disabled`       | account is administratively blocked                         | reject and revoke all sessions                     |
| `rejected`       | customer registration was rejected                          | reject normal login; show registration status only |

Workforce users are created as `active` with `mustChangePassword=true`, or as `disabled` when staged before handoff.

### 6.2 Email verification state

Track email ownership separately from account review:

- `unverified`;
- `pending`;
- `verified`.

Phase 10 defaults `FEATURE_EMAIL_VERIFICATION=false`. Pending customers see a stable “验证邮箱” entry on the onboarding page with:

- current verification state;
- a clear “尚未启用” explanation;
- a disabled resend action;
- no success toast and no claim that an email was delivered.

The future provider contract supports `requestVerification`, `verifyToken`, and `resendVerification`. Enabling a provider must not require changing registration or onboarding routes.

## 7. User Flows

### 7.1 Customer registration

1. Customer opens `/register`.
2. Server validates name, normalized email, password, company name, and agreement acceptance.
3. Rate limits and duplicate checks run before account creation.
4. The system creates a customer user in `pending_review`, a registration request, and an onboarding audit event in one transaction.
5. The customer receives an onboarding-only customer session and is redirected to `/console/onboarding`.
6. The page shows review state and the disabled email-verification entry.
7. A permitted workforce reviewer approves or rejects the request.
8. Approval creates or links the customer organization and membership. The first approved member becomes `customer_admin`; later members default to `customer_member` unless explicitly approved otherwise.
9. Existing onboarding sessions remain limited until the next server validation observes `active`, after which normal Console access is allowed.

### 7.2 Customer login

1. `/login` accepts email and password only.
2. The customer auth service looks up a `customer` identity and verifies credentials.
3. Invalid credentials return one generic message.
4. `pending_review` and `rejected` identities may access onboarding/status only.
5. `active` identities enter `/console`.
6. `disabled` identities are denied and all sessions are revoked.

### 7.3 Workforce provisioning and login

1. A super administrator or authorized administrator creates the employee.
2. The creator assigns allowed workforce roles and a temporary password through a server-side transaction.
3. The temporary password is handed over through an approved out-of-band company process; the portal does not email it in Phase 10.
4. `/staff/login` accepts username or email plus password.
5. `mustChangePassword=true` redirects to the forced password-change flow before any CMS page.
6. Administrators enroll TOTP before using privileged user, role, or site-configuration actions.

### 7.4 Logout, disablement, and forced sign-out

- Logout deletes the current database session and realm cookie.
- “Sign out all devices” revokes every session for that user in the same realm.
- Disabling a user revokes all sessions in the same transaction.
- Password reset or administrative password replacement revokes all previous sessions.
- Role and permission changes do not require a new session because authorization is resolved server-side.

## 8. Route and Permission Boundaries

### 8.1 Public routes

- `/login` and `/register` are customer entry points.
- `/staff/login` is the workforce entry point.
- An authenticated customer visiting `/staff/login` does not gain workforce context.
- An authenticated employee visiting `/login` does not gain customer context.

### 8.2 Customer routes

- `/console/onboarding` accepts only an onboarding-capable customer session.
- other `/console/**` routes require an active customer session;
- customer organization queries always derive organization membership from the server-side actor;
- workforce sessions are rejected by default rather than treated as customer sessions.

### 8.3 Workforce routes

- `/admin/**` requires an active workforce session;
- each page and mutation declares a stable permission such as `admin:users`, `admin:roles`, or `admin:audit`;
- the existing sidebar permission filtering consumes granted permissions but is not an authorization boundary;
- super-admin-only actions are checked explicitly in the service layer.

## 9. Data Model

### 9.1 Authentication tables

Adapt the Better Auth Drizzle schema and extend it with project fields:

- `users`: identity realm, status, display name, normalized email, optional workforce username, email-verification state, forced-password-change flag, last-login time, timestamps;
- `accounts`: credential account and Argon2id password hash;
- `sessions`: opaque token, user, realm, expiry, IP address, user agent, created/updated timestamps;
- `verifications`: future email-verification tokens and expiry.

The existing foundation schema has no production data. Replace its single `roleId` and inline `passwordHash` design through a forward migration rather than preserving the temporary structure.

### 9.2 Authorization and organization tables

- `roles`: key, name, realm scope, system flag, timestamps;
- `permissions`: stable key, description, timestamps;
- `user_roles`: user-role assignment with assigning actor and timestamp;
- `role_permissions`: role-permission mapping;
- `organizations`: customer company identity and status;
- `organization_memberships`: user, organization, membership status, timestamps;
- `registration_requests`: applicant, company data, review status, reviewer, review note, timestamps;
- `audit_logs`: actor realm/user, action, target type/id, safe metadata, IP/user agent, timestamp.

### 9.3 Required constraints

- normalized email is unique;
- workforce username is unique when present;
- one user belongs to one immutable realm;
- role keys are unique and role scope is immutable after assignment;
- duplicate user-role, role-permission, and organization-membership rows are prohibited;
- service transactions reject cross-realm assignments;
- audit records are append-only through application services;
- expired and revoked sessions are rejected and eligible for scheduled cleanup.

## 10. Security Policy

### 10.1 Passwords

- hash with Argon2id using a reviewed library implementation;
- minimum length 12, maximum length 128;
- allow password managers and long passphrases;
- do not impose arbitrary composition rules;
- never log passwords, hashes, verification tokens, or session tokens.

### 10.2 Sessions

| Realm     | Maximum session | Remember me                       | Additional rule                                      |
| --------- | --------------: | --------------------------------- | ---------------------------------------------------- |
| customer  |          7 days | allowed later; off in Phase 10 UI | database validation on protected requests            |
| workforce |         8 hours | disabled                          | recent authentication required for sensitive actions |

Cookies use `HttpOnly`, `Secure` in non-local environments, `SameSite=Lax`, and `Path=/`. Customer and workforce cookies use different names. Logout clears only the current realm cookie unless “all devices” is selected.

### 10.3 TOTP

- TOTP is required for `admin` and `super_admin` before privileged account, role, permission, and site-configuration mutations;
- recovery codes are generated once, stored hashed, and never shown again;
- non-privileged employee TOTP remains supported but optional in Phase 10;
- no SMS provider is introduced.

### 10.4 Abuse controls

- generic invalid-credential response prevents account enumeration;
- login and registration are rate-limited by normalized identifier and IP;
- Nginx supplies coarse POST throttling on the actual login, registration, and TOTP page routes; the application enforces normalized identifier/IP limits;
- return URLs are restricted to same-origin allow-listed paths;
- mutations require same-site cookie protection and origin validation;
- pending registration submissions cannot call normal Console APIs.

## 11. Error Handling

Expose stable application errors without leaking internals:

| Code                            | HTTP | Meaning                                                 |
| ------------------------------- | ---: | ------------------------------------------------------- |
| `AUTH_INVALID_CREDENTIALS`      |  401 | generic login failure                                   |
| `AUTH_SESSION_REQUIRED`         |  401 | no valid realm session                                  |
| `AUTH_REALM_MISMATCH`           |  403 | valid session from the wrong identity realm             |
| `AUTH_ACCOUNT_PENDING`          |  403 | onboarding-only customer                                |
| `AUTH_ACCOUNT_DISABLED`         |  403 | administratively disabled account                       |
| `AUTH_PASSWORD_CHANGE_REQUIRED` |  403 | workforce password must be changed                      |
| `AUTH_MFA_REQUIRED`             |  403 | privileged action needs TOTP enrollment or verification |
| `AUTH_PERMISSION_DENIED`        |  403 | missing server-side permission                          |
| `AUTH_RATE_LIMITED`             |  429 | authentication or registration limit reached            |
| `EMAIL_VERIFICATION_DISABLED`   |  501 | email provider is disabled                              |

Unexpected database and library errors are logged with a correlation ID and returned as a generic server error. Sensitive fields are redacted before logging.

## 12. Audit Events

At minimum, record:

- customer registration submitted, approved, or rejected;
- login success and failure category without passwords;
- logout, all-device sign-out, and administrative session revocation;
- employee or customer account creation, disablement, reactivation, and password reset;
- role assignment and removal;
- permission changes;
- TOTP enrollment, recovery-code regeneration, and removal;
- organization creation and membership change.

Audit metadata must be allow-listed. Request bodies are never copied wholesale.

## 13. Testing Strategy

### 13.1 Unit tests

- realm and status transition rules;
- role-scope assignment guards;
- permission resolution;
- password policy and safe error mapping;
- cookie configuration;
- email-verification disabled provider;
- audit metadata redaction.

### 13.2 Database integration tests

- empty-database migration;
- seed roles and permissions;
- customer registration transaction;
- approval creates organization membership and correct first-member role;
- duplicate and cross-realm constraints;
- disablement revokes sessions atomically;
- role changes affect the next authorization check.

### 13.3 Route and action tests

- customer session cannot access `/admin/**`;
- workforce session cannot access customer organization data;
- pending customer can access onboarding but not normal Console pages;
- employee without permission cannot mutate CMS data;
- administrator cannot assign `super_admin` unless explicitly authorized;
- disabled users and revoked sessions are rejected;
- email verification returns `501 EMAIL_VERIFICATION_DISABLED` without a provider.

### 13.4 Browser acceptance

- customer registration, pending state, and verification placeholder;
- customer login and Console redirect;
- workforce login, forced password change, and Admin redirect;
- invalid credentials, rate-limit state, forbidden state, and expired-session redirect;
- keyboard, focus, labels, error announcements, desktop, and mobile behavior.

### 13.5 Deployment acceptance

- Docker Compose starts from an empty PostgreSQL volume;
- migrations and seed data complete without a built-in password;
- a one-time command creates the first super administrator securely;
- production cookies are Secure and health endpoints remain public;
- restart preserves valid database sessions and revoked sessions stay revoked.

## 14. Delivery Slices

1. Reconcile project status documentation and establish the Phase 10 plan.
2. Replace the temporary identity schema and add migrations, seed permissions, and database tests.
3. Integrate Better Auth, realm-specific cookies, password hashing, and session services.
4. Implement customer registration, onboarding, approval, and email-verification placeholder.
5. Implement workforce provisioning, login, forced password change, and TOTP for privileged roles.
6. Protect Console and Admin routes through a server-only authorization DAL.
7. Implement minimal user, role, registration-review, session, and audit administration pages.
8. Run full unit, integration, browser, Docker, security, and migration gates.

## 15. Non-goals

- real SMTP delivery or external email verification;
- customer or workforce SSO, LDAP, SAML, or OIDC federation;
- SMS authentication;
- License, Download, or OpenLab business logic;
- full customer team-management UI;
- customer impersonation by workforce users;
- production multi-node session caching.

## 16. Future Replacement Boundaries

- `CustomerIdentityProvider` can later delegate to a CIAM platform.
- `WorkforceIdentityProvider` can later delegate to company OIDC/SAML SSO.
- `EmailVerificationProvider` can later use SMTP or a transactional-email API.
- `SessionRepository` can later move hot session reads to Redis while retaining PostgreSQL audit history.
- domain roles, permissions, organizations, and audit logs remain project-owned across all replacements.
