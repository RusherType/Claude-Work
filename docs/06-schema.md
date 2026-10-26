# 6. Backend Schema

Tenant data is scoped by `workspace_id` and protected by RLS; shared reference data (tariff lines, rulings, measures, fees) is readable by any signed-in user and written only by the service role. Everything that changes over time carries effective dates.

**The migrations in `supabase/migrations/` are the source of truth** (`0001_init.sql` schema, `0002_workspaces_invites.sql` onboarding and invitations, `0003_workspace_members.sql` team list, `0004_tariff_import.sql` import bookkeeping); update this file when they change.

## Tables

| Table | Kind | Holds | Write access |
| --- | --- | --- | --- |
| `workspaces`, `memberships`, `profiles` | Tenant | Companies, members, roles | Owner/admin (admins cannot add, change or remove owners; a workspace always keeps one owner) |
| `invitations` | Tenant | Pending email invites; only a SHA-256 hash of the link token is stored; never role `owner` | Owner/admin |
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
| `tariff_revisions`, `tariff_lines` | Shared | Each schedule release (`status` importing/complete/failed, `line_count`) and its lines + embeddings, keyed by schedule `position`; `rate` holds the parsed general/special/column 2 rates and `inherited_from` for statistical lines | Service role |
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

## Database functions

- `is_member(ws)`, `has_role(ws, roles[])`, `is_platform_admin()` — RLS helpers.
- `current_revision(market)` — latest revision whose import is complete.
- `workspace_members(ws)` — members with email and role, for members of `ws` only.
- `match_tariff_lines(embedding, revision_id, k)` and `match_rulings(embedding, hts_prefix, k)` — vector search for agent tools (revoked rulings excluded).
- `active_measures(code, origin, mode, on_date)` — published overlays that apply.
- Trigger `products_outdated` — a changed `content_hash` on a confirmed product marks its classification `outdated`.
- Trigger `on_auth_user_created` — creates the `profiles` row for every new auth user. Users can update only `full_name`; `is_platform_admin` is set by the service role.
- Trigger `memberships_keep_owner` — blocks demoting or removing the last owner.
- `create_workspace(name, home_country, business_type)` — creates the workspace, the caller's owner membership and an audit row in one transaction (there is no insert policy on `workspaces` or `memberships`).
- `accept_invitation(token)` — checks the token hash, expiry, revocation and that the caller's email matches the invite, then adds the membership.
- `audit_log` inserts must carry `actor_id = auth.uid()`.
