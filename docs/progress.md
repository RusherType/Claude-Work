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

**Test status:** lint, typecheck and unit tests green (6 tests).

**Eval score:** n/a (eval harness is CD-036).

**Open questions:**

- Build runs in a Claude Code cloud session. Its network policy blocks `hts.usitc.gov`,
  `rulings.cbp.gov` and `api.voyageai.com`; CD-010, CD-012 and CD-013 need them allowed.
- Accounts not created yet: Supabase staging, Google OAuth client, Vercel, Sentry, PostHog, Langfuse,
  Voyage. Keys go in the cloud environment's settings, never in chat or the repo.
