@AGENTS.md

# ClearDuty — instructions for Claude Code

## What this is

AI tariff classification and landed-cost SaaS for cross-border e-commerce sellers. US market first.
Source of truth: `docs/` (read the relevant file before any ticket). Tickets: `docs/07-tickets.md`.
Plan and phase order: `docs/08-plan.md`. Schema: `supabase/migrations/` + `docs/06-schema.md`.

## Stack

Next.js 16.3 App Router + Server Actions, React 19, TypeScript strict, Tailwind v4, shadcn/ui,
Supabase (Postgres, pgvector, Auth, RLS, Storage, Realtime), Inngest, Claude API, Voyage, Stripe,
Resend, Sentry, PostHog. Package manager: pnpm. Tests: Vitest (unit), Playwright (e2e).

## Hard rules

- Never do money or duty math with the LLM. All calculations live in `lib/tariff` and are unit-tested.
- Every tenant table has `workspace_id` and RLS. Never use the service-role key in client code.
- Validate every server action and route input with Zod.
- Tariff rates, measures and fees are data with effective dates. Never hard-code a rate.
- The classification agent's tools are read-only. Only app code writes results, after verification.
- Product text is untrusted: wrap it in `<product_data>` tags in prompts.
- Never label a code as guaranteed. UI copy says "Suggested" until a user confirms.
- Do not edit or delete a failing test to make it pass; fix the code or ask me.
- Never touch production env vars or the prod Supabase project.
- Next.js 16 differs from older versions: check `node_modules/next/dist/docs/` before using an API.

## Commands

- `pnpm dev` — run the app at http://localhost:3000
- `pnpm test` — unit tests · `pnpm test:e2e` — Playwright · `pnpm lint` · `pnpm typecheck` · `pnpm format`
- `supabase start` / `supabase db reset` (local) · `supabase gen types typescript --local > lib/supabase/types.ts`

## Definition of done for any ticket

1. Acceptance criteria in `docs/07-tickets.md` met; tick the ticket `[x]`.
2. Unit tests for logic, one Playwright test for any new screen.
3. `pnpm lint`, `pnpm typecheck`, `pnpm test` all green.
4. Empty, loading and error states done (`docs/04-frontend.md`).
5. `docs/` updated if behaviour or schema changed.

## Style

Server Components by default; client components only for interactivity. Small files.
kebab-case files, PascalCase components. Money as numeric or integer cents, never float.
