# Progress log

One entry per working session: date, tickets done, test status, eval score, open questions.

## 2026-10-07

**Tickets done:** none yet (CD-001 was done before this log started).

**Changes:**

- Docs fixed before Phase 1: CD-030 now depends on CD-002 (sample products in the repo) instead of
  CD-021, which is in a later phase; CD-002 staging apply is done by the owner; `/ticket` skill waits
  for plan approval only on migration, RLS, auth, billing and agent tickets, and works on the
  session's pinned branch in cloud sessions; master prompt account list adds Google OAuth, Vercel,
  LLM tracing and Upstash Redis.
- `pnpm typecheck` now runs `next typegen` first; it failed on a clean checkout because Next 16
  generates `LayoutProps` and other route types.

- CD-002 (in progress): Supabase CLI 2.120 as a dev dependency, `db:start|stop|reset|types`
  scripts, `supabase/config.toml`, and a static migration guard (`tests/db/`) that checks every
  table has RLS, tenant tables have a required `workspace_id` and workspace-scoped policies, and
  `audit_log` only allows select and insert. The migration is not yet applied anywhere: this
  sandbox cannot pull Supabase container images. CI applies it instead; `lib/supabase/types.ts`
  comes from the CI `db` job, which stays red until those types are committed.
- CD-006 (in progress): GitHub Actions `check` (lint, format, typecheck, unit, service-role guard,
  audit, build), `e2e` (Playwright) and `db` (migrations, `db lint`, security advisors, type
  drift); actions pinned to SHAs; Dependabot. Vercel previews wait for a Vercel account.
- ESLint blocks `SERVICE_ROLE` in `"use client"` files; CI requires `import "server-only"` in any
  file that mentions it. `server-only` added as a dependency.
- `PLAYWRIGHT_CHROMIUM_PATH` optionally points Playwright at a preinstalled Chromium.
- Next 16 renamed `middleware` to `proxy`; CD-003 will use `proxy.ts`.

**Test status:** lint, format, typecheck, build, unit tests (18) and Playwright (2) green locally.
`pnpm audit --prod` clean; one high in dev-only lint tooling (`braces` via eslint-config-next).

**Eval score:** n/a (eval harness is CD-036).

**Open questions:**

- Build runs in a Claude Code cloud session. Its network policy blocks `hts.usitc.gov`,
  `rulings.cbp.gov`, `api.voyageai.com` and the container image hosts
  (`pkg-containers.githubusercontent.com`, AWS CloudFront); CD-010, CD-012, CD-013 and a local
  Supabase need them allowed.
- (Approved and done, see below.) Migration findings waiting for approval: cross-tenant foreign keys
  (composite `(workspace_id, id)` keys), `audit_log` insert must pin `actor_id = auth.uid()`, and
  admins must not be able to grant or remove the owner role.
- Accounts not created yet: Supabase staging, Google OAuth client, Vercel, Sentry, PostHog, Langfuse,
  Voyage. Keys go in the cloud environment's settings, never in chat or the repo.

## 2026-10-07 (continued)

**Approved by owner ("go"):** migration fixes (cross-workspace links, audit actor, owner role) and
the CD-003 plan.

**Done (waiting for CI before ticking):**

- Migration 0001 (not yet applied anywhere, so edited in place): composite `(workspace_id, id)`
  foreign keys between tenant tables; `audit_log` inserts pin `actor_id = auth.uid()`; only owners
  grant, change or remove the owner role; a workspace always keeps an owner; only `memberships.role`
  and workspace settings columns are client-updatable; vector search `k` capped at 50; a profile row
  is created for every new auth user.
- CD-005: `tests/db/isolation.test.ts`, 159 live tests (every tenant table, workspaces, profiles,
  audit log, roles, shared data, every composite FK). Mutation-tested: 11 deliberately broken
  protections were each caught. Runs locally on Postgres 16 + `tests/db/supabase-shim.sql`; CI runs
  it on real Supabase.
- CD-003: magic-link and Google sign-in (`@supabase/ssr`, `getClaims`), `proxy.ts` protecting
  `/app`, `/auth/callback` with open-redirect protection, sign-out, `/app` layout re-checks the
  session. Playwright: redirect tests run locally; the full magic-link flow runs in CI against the
  local Supabase mailbox.
- CD-011: `lib/tariff/rate.ts` parses General, Column 2 and Special rate text into exact decimal
  strings; 61 tests. Must be re-checked against the real USITC export when CD-010 runs.

**Env vars the app reads:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` (`true` once the Google OAuth client is set up).

**Security follow-ups from the CD-005 audit (assigned to the ticket that builds the feature):**

- CD-020: `integrations` writable only by the service role (OAuth callback); today any owner/admin
  can claim a `shop_domain` and the global unique key reveals other workspaces' stores.
- CD-041: classifications status/source/`confirmed_by` set by server code only (members can
  currently write `broker_verified` and forge `confirmed_by`; same for `answered_by`,
  `created_by`).
- CD-070/071: `documents.storage_path` must start with the workspace id; add Storage policies.
- CD-080: `broker_orders` insert-only for clients; status, payment and verified code via service
  role.
- CD-014: platform-admin policies must also require MFA (`aal2`).
- CD-104: `search_path = ''` on all functions; server-generated ids; api key and audit inserts via
  the server.

- CD-004 is the real gate for the items above: once users can create workspaces, every tenant
  table is writable through the Data API. CD-004 must revoke direct client writes on
  `integrations` and `broker_orders` and restrict `classifications`/`documents` columns before it
  ships, then each feature ticket opens what it needs.

**Fixed after the second review and audit:** open redirect via dot segments (`/.//evil.example`)
in `safeNext`; `token_hash` callback branch removed (login CSRF); HTTP-only, Secure session
cookies; baseline security headers (frame-ancestors none, nosniff, referrer policy, HSTS in
production); sign-in links use `NEXT_PUBLIC_SITE_URL` when set; owner trigger locks the workspace
row; `TRUNCATE`/`TRIGGER`/`REFERENCES` revoked from API roles; isolation writes clear referencing
rows first and fail on any error other than 42501; `/app` loading and error states. 15 broken
protections now each fail the suite.

**Still open from the audit:**

- Sign-in rate limits and CAPTCHA (needs Upstash and Turnstile/hCaptcha accounts) — CD-104.
- Production Supabase must keep `enable_confirmations = true` (set locally); add to launch
  checklist.

**Test status:** lint, format, typecheck, build, 124 unit tests, 161 + 25 database tests, 8 local
Playwright tests green. GitHub CI was stuck in "queued" from 15:12 to about 16:05 UTC.

**Open questions:** none new.

## 2026-10-07 (ticket status)

- **Ticked:** CD-005 (isolation suite; reviewer APPROVED, security audit PASSED, CI green on real
  Supabase at 6674cfb) and CD-011 (rate parser, 61 tests).
- **Done but not ticked:**
  - CD-002: migration applies cleanly on local Supabase in CI and types are committed; waiting on
    the owner's staging apply (`supabase link` + `supabase db push`).
  - CD-003: magic-link sign-in, sign-out and `/app` protection pass in CI against real Supabase
    Auth; Google sign-in is untested until a Google OAuth client exists.
  - CD-006: CI done; Vercel previews need a Vercel account. Previews must set
    `NEXT_PUBLIC_SITE_URL` (e.g. from `VERCEL_URL`) and add the preview domain to Supabase's
    redirect allow list, or magic-link sign-in fails there.
- **Mutation testing:** 17 deliberately broken protections, each caught by the suite.

## 2026-10-08

**CD-004 (approved by owner, "go"):** migration `0002_workspaces.sql` closes direct client writes
on every table whose rows come from server code (integrations, classifications, agent questions,
alerts, documents, broker orders, API keys, audit log, new memberships) and adds `invitations`
plus `create_workspace`, `create_invitation`, `accept_invitation`, `revoke_invitation`,
`workspace_members` and a membership audit trigger. App: create-workspace empty state on `/app`,
workspace switcher, Team page (members, role changes, remove/leave, invite with copyable link,
pending invitations, revoke), `/invite/[token]` accept page. Invite emails arrive with Resend in
Phase 4; until then the inviter copies the link (owner's decision).

**Tests:** 22 live tests for the new functions (6 deliberately broken function rules each caught);
isolation suite extended to `invitations` and the stricter insert matrix (194 tests); role helper,
country and error-message unit tests; Playwright end-to-end flow (create, invite, accept in a
second browser, reuse refused, role change, last owner cannot leave) runs in CI.

**CD-004 review and audit round 1:** reviewer found 10 issues, security audit PASSED with 4
mediums; all fixed. Forms post their workspace id (no stale-tab cross-workspace actions); admins
cannot revoke or replace owner invitations; expired invitations no longer count toward the cap;
anyone can leave; no client hard-delete of workspaces; invitations from a removed/demoted inviter
stop working; RLS helpers pin `search_path = ''`; product content edits mark confirmed codes
outdated again; products with confirmed codes or broker orders cannot be deleted by clients;
leftover write grants revoked; Team page accessible names, error states and copy-link handling.
Next.js patched to 16.3.8 (GHSA-cjq9-62q9-8jv4). Database test files now run one at a time (they
share one database and take table locks). 12 more deliberately broken rules, each caught.
Deferred: invite token in the URL path (L4) — scrub `/invite/*` when PostHog/Sentry land (CD-007).

**CD-004 ticked:** reviewer APPROVED, security audit PASSED (two rounds), CI green at a86f9bf
including the end-to-end invite flow on desktop and mobile against real Supabase. Final round also
closed an edit-then-delete bypass for confirmed codes and an accept-vs-removal race (inviter
membership locked FOR SHARE, verified with two concurrent sessions).

**Phase 1 status:** done CD-001, CD-004, CD-005, CD-011. Done but waiting on the owner: CD-002
(staging apply), CD-003 (Google OAuth client), CD-006 (Vercel account). Blocked on network access
and accounts: CD-007 (Sentry, PostHog, Langfuse), CD-010 (hts.usitc.gov), CD-012 (Voyage).
