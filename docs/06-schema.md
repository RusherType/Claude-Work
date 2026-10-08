# 6. Backend Schema

Tenant data is scoped by `workspace_id` and protected by RLS; shared reference data (tariff lines, rulings, measures, fees) is readable by any signed-in user and written only by the service role. Everything that changes over time carries effective dates.

**The full migration is `supabase/migrations/0001_init.sql`.** It is the source of truth; update this file when it changes.

## Tables

| Table | Kind | Holds | Write access |
| --- | --- | --- | --- |
| `workspaces`, `memberships`, `profiles` | Tenant | Companies, members, roles | Created by `create_workspace` / `accept_invitation`; settings and roles by owner/admin |
| `integrations` | Tenant | Shopify shop, Vault secret id for token | Server (OAuth callback, CD-020) |
| `products` | Tenant | Catalog items and extracted facts | Owner/admin/member |
| `classifications` | Tenant | Every code suggested/confirmed/overridden/verified, per market; one current per product+market | Agent jobs and confirm/override functions (CD-032, CD-041) |
| `agent_questions` | Tenant | Agent questions and seller answers | Agent jobs and answer function (CD-034) |
| `agent_runs` | Tenant | Model, prompt version, tool calls, tokens, cost | Service role only |
| `quotes`, `quote_lines` | Tenant | Saved landed-cost calculations | Owner/admin/member |
| `alerts`, `alert_items` | Tenant | Tariff-change notices and affected SKUs | Jobs (CD-061) |
| `documents` | Tenant | Generated PDFs | Server (CD-070/071) |
| `broker_orders` | Tenant | Paid verification requests | Server after payment (CD-080) |
| `subscriptions` | Tenant | Stripe billing state | Service role only (webhooks) |
| `api_keys` | Tenant | Hashed API keys | Server (CD-114) |
| `invitations` | Tenant | Pending invites: email, role, SHA-256 of the token, expiry (7 days) | `create_invitation` / `accept_invitation` / `revoke_invitation` only |
| `audit_log` | Tenant | Append-only decision record | Database functions and triggers only |
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
- `workspaces`: users can update settings columns only. There is no client delete: deleting is a
  soft delete (`deleted_at`) with a 7-day grace period, done by the server after an owner check.
- Anyone may leave a workspace (`mem_self_delete`); the owner trigger still keeps one owner.
- Products with confirmed codes or broker orders cannot be deleted by clients
  (`products_protect_records`), since the cascade would erase compliance records.
- `is_member`, `has_role`, `is_platform_admin` and every other SECURITY DEFINER function pin
  `search_path = ''` (checked by a test).
- `audit_log` inserts must set `actor_id = auth.uid()`; there is no update or delete policy.
- Trigger `on_auth_user_created` creates a `profiles` row for every new auth user.

## Database functions

- `is_member(ws)`, `has_role(ws, roles[])`, `is_platform_admin()` — RLS helpers.
- `current_revision(market)` — latest imported revision.
- `match_tariff_lines(embedding, revision_id, k)` and `match_rulings(embedding, hts_prefix, k)` — vector search for agent tools (revoked rulings excluded; `k` is clamped to 1–50).
- `active_measures(code, origin, mode, on_date)` — published overlays that apply.
- Trigger `products_outdated` — a changed `content_hash` on a confirmed product marks its classification `outdated`.
- Constraint trigger `memberships_keep_owner` (`ensure_workspace_has_owner`) — deferred to commit; rejects any change that leaves an existing workspace with no owner. Account deletion (GDPR) must therefore delete the workspace or hand ownership over before deleting a sole owner's auth user.
- Trigger `on_auth_user_created` (`handle_new_user`) — creates the `profiles` row for each new auth user; sign-up metadata cannot set `is_platform_admin`.

- `create_workspace(name, home_country, business_type)` — creates the workspace with the caller as owner (max 20 owned per user) and audits it.
- `create_invitation(workspace, email, role)` — owner/admin only; only owners invite (or replace an invitation for) owners; at most 200 unexpired open invitations; returns the plain token once and stores its SHA-256; replaces any open invite for that address. Audit rows record the role, not the email.
- `accept_invitation(token)` — the signed-in user's confirmed email must match; single use; the inviter must still hold the role needed to send it and the workspace must not be deleted; adds the membership (keeps an existing role) and audits it.
- `revoke_invitation(invitation)` (admins cannot revoke owner invitations; audited only when something changed) and `workspace_members(workspace)` (members with emails, for members only).
- Trigger `memberships_audit` — every membership insert, role change and removal is written to `audit_log` with the acting user. `quotes.created_by` is always set to the signed-in user.

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
