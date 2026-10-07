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
- Migration findings waiting for approval (planned for CD-004/CD-005): cross-tenant foreign keys
  (composite `(workspace_id, id)` keys), `audit_log` insert must pin `actor_id = auth.uid()`, and
  admins must not be able to grant or remove the owner role.
- Accounts not created yet: Supabase staging, Google OAuth client, Vercel, Sentry, PostHog, Langfuse,
  Voyage. Keys go in the cloud environment's settings, never in chat or the repo.
