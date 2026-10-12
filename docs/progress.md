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

## 2026-10-12

**CD-050 (cost engine) ticked:** `lib/tariff/landed-cost/` is a pure function using exact
decimals (`decimal.js` added). Rules are in `docs/02-architecture.md`. Tests:
- the 46 hand-worked cases, written first;
- 33 rule tests, including program eligibility (`A+`, `A*`, bilateral agreements), MPF and overlay
  exemptions, data problems going to review, and invalid input;
- 23 money-helper tests;
- 13 deliberate rule breaks, each caught.

The reviewer approved after three rounds. The first round found guesses that returned "ok":
- unchecked program eligibility;
- MPF charged on FTA goods;
- no overlay exemption for USMCA goods;
- a missing code status treated as confirmed.

All of them now go to review or are modelled as data. The second round found two more:
- a claim the Special column doesn't list skipped the overlay and MPF exemptions;
- an exemption for `S+` also matched a plain `S` claim.

Both are fixed and tested.

**Follow-ups:**
- CD-014/CD-015: the `special_programs` table and `tariff_measures.exempt_programs` (see
  `docs/06-schema.md`). Until they exist, program claims go to review.
- CD-014: store measure prefixes as digits only.
- Phase 4 gate: compare against a real Form 7501 (per-line rounding; Section 232 metal-content
  value is not modelled).

**CD-022 (CSV import), plan recorded per the owner's standing approval:**
- The file is read in the browser: an RFC 4180 parser, at most 5,000 rows and 10 MB.
- Columns are matched automatically, including Shopify export headers, and can be changed.
- Each row is checked with the same Zod schema the server uses, and errors are listed per row
  (downloadable as CSV).
- Valid rows go to a server action in batches of up to 500 rows and 700 KB. It re-validates and
  calls `import_products`, a security-invoker function, so RLS applies.
- Migration `0003_catalog.sql`:
  - SKUs are unique per workspace for products without an integration, so a re-import updates
    instead of duplicating;
  - `content_hash` is now computed by the database, which closes a gap where a client could edit
    a confirmed product, keep the old hash, and skip "outdated";
  - products get value checks.
- A required SKU is the owner-facing rule: rows without one are reported, not imported.

**CD-022 review and audit, round 1:** the security audit passed with 4 mediums, and the reviewer
listed 14 changes. All are fixed except the rate limit and SKU cap, which belong to CD-104 and
CD-091. Fixes:
- **Uninstall:** deleting a store integration no longer collides with manual SKUs.
- **Database limits:** they now match the Zod schema (https-only images, no NaN, text lengths),
  and the hash is now SHA-256.
- **Deleted workspaces:** imports into a deleted workspace are refused.
- **Overflow and bad characters:** values too large for their column, and control characters such
  as NUL, are reported per row instead of failing a whole batch.
- **Encoding:** Windows-1252 files from Excel are read correctly, and UTF-16 or semicolon-separated
  files get clear instructions.
- **Shopify exports:** each variant becomes a product with the product's details and images, and
  image-only rows are merged.
- **Weight:** a bare "Weight" header is not assumed to be kilograms.
- **Value and currency:** they are always stored together, with ISO 4217 codes and a
  "Currency of customs values" choice per file.
- **Line numbers:** they are real file lines, and blank rows are ignored.
- **Re-importing problems:** the problems download is the failed rows in the file's own columns,
  so it can be fixed and imported again.
- **Screen:** step headings take focus, leaving mid-import asks for confirmation, Retry is offered
  only when it can help (otherwise "Download rows not imported"), and the e2e test now imports
  5,000 rows through the screen in under 60 s.

**Decision to confirm (owner):** at the auditor's request, changes to a product's images, customs
value or currency, or weight now mark a confirmed code Outdated. Some HTS lines split on value
("valued over $2.50/pair") or weight, and the agent reads images. This reverses my first design
(only text changes), so the DB test now asserts the stricter behaviour. Vendor and origin still
don't trigger a re-check. Say if you prefer fewer re-checks.

**CD-022 round 2:**
- The re-audit passed. Its low findings are fixed: null list elements, control characters and
  Unicode spaces are rejected in the database too, a value requires a currency at table level,
  and `facts` is capped at 64 KB.
- The reviewer's Shopify findings are fixed:
  - a variant without a SKU is reported, never dropped as an "image row";
  - every variant gets its own image first, then the product's other images;
  - re-imported downloads keep their titles.
- One static ISO 4217 list is shared by browser and server.

**Follow-ups:**
- **CD-021:** truncate Shopify descriptions over 20,000 characters.
- **CD-030/CD-032:** product text goes in `<product_data>` tags, and image URLs are fetched only
  through an SSRF-safe path (no private or link-local addresses after DNS resolution, no
  redirects to them) or passed to the Claude API as URLs.
- **CD-091:** enforce the SKU cap in the database.
- **CD-104:** rate-limit the import action.

**CD-022 ticked.** The reviewer approved after four rounds, the security audit passed in two,
and CI is green at 767558c, including the Playwright run that imports 5,000 rows through the
screen in under 60 s. Rounds 3–4 aligned the Zod and database rules for blank and control
characters; a database test now sends every row the schema accepts through `import_products`.
Totals: 302 unit tests, 245 database tests. The decision on value, weight and image changes
marking codes Outdated (above) is still open for the owner.
