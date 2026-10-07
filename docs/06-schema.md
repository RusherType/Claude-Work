# 6. Backend Schema

Tenant data is scoped by `workspace_id` and protected by RLS; shared reference data (tariff lines, rulings, measures, fees) is readable by any signed-in user and written only by the service role. Everything that changes over time carries effective dates.

**The full migration is `supabase/migrations/0001_init.sql`.** It is the source of truth; update this file when it changes.

## Tables

| Table | Kind | Holds | Write access |
| --- | --- | --- | --- |
| `workspaces`, `memberships`, `profiles` | Tenant | Companies, members, roles | Owner/admin |
| `integrations` | Tenant | Shopify shop, Vault secret id for token | Owner/admin |
| `products` | Tenant | Catalog items and extracted facts | Owner/admin/member |
| `classifications` | Tenant | Every code suggested/confirmed/overridden/verified, per market; one current per product+market | Owner/admin/member |
| `agent_questions` | Tenant | Agent questions and seller answers | Owner/admin/member |
| `agent_runs` | Tenant | Model, prompt version, tool calls, tokens, cost | Service role only |
| `quotes`, `quote_lines` | Tenant | Saved landed-cost calculations | Owner/admin/member |
| `alerts`, `alert_items` | Tenant | Tariff-change notices and affected SKUs | Owner/admin/member (created by jobs) |
| `documents` | Tenant | Generated PDFs | Owner/admin/member |
| `broker_orders` | Tenant | Paid verification requests | Owner/admin |
| `subscriptions` | Tenant | Stripe billing state | Service role only (webhooks) |
| `api_keys` | Tenant | Hashed API keys | Owner/admin |
| `audit_log` | Tenant | Append-only decision record | Insert only |
| `tariff_revisions`, `tariff_lines` | Shared | Each schedule release and its lines + embeddings | Service role |
| `rulings`, `ruling_chunks` | Shared | CBP rulings and embedded chunks | Service role |
| `tariff_measures` | Shared | Chapter 99 overlays by line, origin, mode, date | Platform admin |
| `fee_schedules` | Shared | MPF, HMF, carrier fees by date | Service role |

## Enums

- `member_role`: owner, admin, member, viewer
- `class_status`: queued, needs_answer, in_review, suggested, confirmed, broker_verified, outdated
- `class_source`: ai, override, broker
- `market_code`: US, UK, EU, CA, AU

## Conventions

- HTS codes stored as digits only (`6109100012`); formatted with dots in the UI.
- `tariff_measures.origin_countries = '{**}'` means all origins.
- Money is `numeric`, never float.
- Embeddings are 1024-dimension; change the column type if the chosen Voyage model differs.
- Links between tenant rows use composite foreign keys on `(workspace_id, <parent>_id)` referencing
  `(workspace_id, id)`, so a row can only point at a parent in its own workspace (FK checks bypass
  RLS, so this is enforced by the keys, not the policies).
- `memberships`: owners manage every membership; admins manage non-owner memberships only, so only
  an owner can grant, change or remove the owner role. Only `role` is updatable, and a deferred
  constraint trigger keeps at least one owner in every workspace.
- `workspaces`: users can update settings columns only; `deleted_at` (soft delete) is set by the
  server after an owner check.
- `audit_log` inserts must set `actor_id = auth.uid()`; there is no update or delete policy.
- Trigger `on_auth_user_created` creates a `profiles` row for every new auth user.

## Tests

- `tests/db/rls-coverage.test.ts` statically checks every migration: RLS on every table, a required
  `workspace_id` on tenant tables, policies scoped by workspace, read-only shared data.
- `tests/db/isolation.test.ts` (CD-005) signs in as members of two workspaces against a live
  database and proves neither can read, change, move or link to the other's rows in any tenant
  table, that each role can only insert what docs/03-security.md allows, and covers `workspaces`,
  `profiles`, `audit_log`, owner rules and shared reference data. It refuses to run against a
  non-local database.
  - CI: runs against `supabase start` with `TEST_DATABASE_URL` and `REQUIRE_DB_TESTS=1`.
  - Locally with Supabase: `pnpm db:start`, then
    `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm test:db`.
  - Locally on plain Postgres (no Docker): create an empty database, apply
    `tests/db/supabase-shim.sql` and then the migrations with `psql`, and point
    `TEST_DATABASE_URL` at it. The shim fakes `auth.users`, `auth.uid()` and the Supabase roles;
    never apply it to a Supabase project.
