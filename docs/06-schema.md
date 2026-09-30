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

## Database functions

- `is_member(ws)`, `has_role(ws, roles[])`, `is_platform_admin()` — RLS helpers.
- `current_revision(market)` — latest imported revision.
- `match_tariff_lines(embedding, revision_id, k)` and `match_rulings(embedding, hts_prefix, k)` — vector search for agent tools (revoked rulings excluded).
- `active_measures(code, origin, mode, on_date)` — published overlays that apply.
- Trigger `products_outdated` — a changed `content_hash` on a confirmed product marks its classification `outdated`.
