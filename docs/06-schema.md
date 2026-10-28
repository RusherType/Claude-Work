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
- `fee_schedules.fee_type` is one of `mpf_formal`, `mpf_informal`, `hmf`, `carrier_brokerage`,
  `informal_entry_limit`; the limit itself is stored in `flat_amount`. Every row has a `pct` or a
  `flat_amount`.
- Percentages are stored as percent: `fee_schedules.pct` 0.3464 means 0.3464%, and
  `tariff_measures.rate_value` 25 means 25%. A `flat_per_item` measure stores US dollars per item.
- `tariff_measures.hts_prefixes` and `excluded_prefixes` hold digits only, matching the start of
  the 10-digit code.
- **Special programs and exemptions (CD-014):**
  - `special_programs`: who may claim each Special-column symbol (`A`, `A+`, `S`, `AU`), its
    countries, and whether qualifying goods skip the MPF.
  - `tariff_measures.exempt_programs`: null means nobody has checked, so the engine sends lines
    claiming a program to review; `'{}'` means no program is exempt.
  - Until rows are published, multilateral program claims (A, P, S, ...) go to review.
- Code that reads numeric columns for the landed-cost engine selects them as text
  (`rate_value::text`). PostgREST returns numeric as a JSON number, which the engine rejects.
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
- `audit_log`: no client insert, update or delete; rows are written only by database functions and
  triggers, with `actor_id = auth.uid()`.
- Trigger `on_auth_user_created` creates a `profiles` row for every new auth user.

## Database functions

- `is_member(ws)`, `has_role(ws, roles[])`, `is_platform_admin()` — RLS helpers.
- `current_revision(market)` — latest imported revision (may not be in force yet; decisions use
  `revision_in_force`).
- `match_tariff_lines(embedding, revision_id, k)` and `match_rulings(embedding, hts_prefix, k)` — vector search for agent tools (revoked rulings excluded; `k` is clamped to 1–50).
- `active_measures(code, origin, mode, on_date)` — published overlays that apply.
- `content_hash` is computed by the database (`product_content_hash`, SHA-256) from everything the code can depend on: title, description, product type, tags, facts, images, customs value and currency, and weight (some HTS lines split on value or weight). A value sent by a client is never stored. Trigger `products_outdated` marks a confirmed or broker-verified code `outdated` when that hash changes (or when a client sends a different hash: a needless re-check at worst). Vendor and origin do not mark codes outdated.
- Constraint trigger `memberships_keep_owner` (`ensure_workspace_has_owner`) — deferred to commit; rejects any change that leaves an existing workspace with no owner. Account deletion (GDPR) must therefore delete the workspace or hand ownership over before deleting a sole owner's auth user.
- Trigger `on_auth_user_created` (`handle_new_user`) — creates the `profiles` row for each new auth user; sign-up metadata cannot set `is_platform_admin`.

- `create_workspace(name, home_country, business_type)` — creates the workspace with the caller as owner (max 20 owned per user) and audits it.
- `create_invitation(workspace, email, role)` — owner/admin only; only owners invite (or replace an invitation for) owners; at most 200 unexpired open invitations; returns the plain token once and stores its SHA-256; replaces any open invite for that address. Audit rows record the role, not the email.
- `accept_invitation(token)` — the signed-in user's confirmed email must match; single use; the inviter must still hold the role needed to send it and the workspace must not be deleted; adds the membership (keeps an existing role) and audits it.
- `revoke_invitation(invitation)` (admins cannot revoke owner invitations; audited only when something changed) and `workspace_members(workspace)` (members with emails, for members only).
- Trigger `memberships_audit` — every membership insert, role change and removal is written to `audit_log` with the acting user. `quotes.created_by` is always set to the signed-in user.

- `import_products(workspace, rows jsonb)` (CD-022): security invoker, so RLS applies.
  - **Who and how many:** owner, admin or member only, and never into a deleted workspace; 1–1,000 rows, each with a SKU and title, and no repeated SKU.
  - **Upsert:** upserts manual products by SKU. Manual means no integration and no external id; the unique index `products_manual_sku_key` covers these, so deleting an integration never collides with them.
  - **Blanks and currency:** blank fields never overwrite stored values. A customs value always comes with its currency, and neither is stored without the other.
  - **Returns:** `inserted`, `updated`, `unchanged`.
- Product value checks, the same limits as the import's Zod schema, so the Data API cannot skip
  them:
  - title 1–500 characters and not blank, SKU up to 100, description up to 20,000, vendor and
    product type up to 200, with no control characters (`is_clean_text`, `is_not_blank`);
  - ISO country and currency formats; value and weight non-negative and not NaN; a value always
    has a currency;
  - at most 250 tags of up to 100 characters, and at most 250 https image links of up to 2,000
    characters, with no empty elements (`all_match`);
  - `facts` is a JSON object of at most 64 KB.

- **Reference data editing (CD-014), for `tariff_measures`, `fee_schedules` and `special_programs`:**
  - **Who:** only platform admins whose session passed a TOTP check in the last 12 hours
    (`is_platform_admin_mfa()`: `is_platform_admin()`, JWT `aal = aal2` and a `totp` entry in
    `amr` under 12 hours old) can insert, update or delete. Everyone signed in reads published
    rows; admins with a fresh second factor also see drafts.
  - **Reading for quotes:** RLS shows drafts to an admin with a fresh second factor, so every
    loader that feeds the landed-cost engine filters `published = true` explicitly (like
    `active_measures`), whoever is signed in.
  - **Market:** `market` defaults to `US` on all three tables; other markets arrive with their
    packs.
  - **Author columns:** `created_by` and `published_by` are not granted to users, so select
    explicit columns (`select *` fails). Who changed what is in `reference_audit`.
  - **Second-factor attempts:** `admin_mfa_attempts` is private (RLS on, no policies). Only
    `record_mfa_event(kind)` and `mfa_failures_recent()` touch it; the app allows 5 wrong codes per
    admin per 15 minutes.
  - **Publishing (trigger `guard_reference_row`):** rows are drafts until `published`. Publishing
    stamps `published_at` and `published_by`, and `created_by` is always the inserting user.
  - **Published rows:** a signed-in user can never edit, unpublish or delete one. It accepts one
    end date (`effective_to`, not before its start). Server jobs with no signed-in user are not
    limited, like `protect_product_records`.
  - **Audit:** every insert, update and delete is written to `reference_audit` (table, row id,
    action, actor, old and new row), readable only by admins with aal2.
  - **Value checks match the landed-cost engine:**
    - digits-only HTS prefixes (2–10 digits);
    - ISO or `**` origins;
    - known modes, fee types and rate types;
    - a percentage or flat amount on every fee, with the informal limit in `flat_amount`;
    - min ≤ max, end ≥ start, and https sources.

- `catalog_items` (CD-023): view over products and their current US classification, with
  `security_invoker = true`, so the products and classifications policies apply. It is select-only
  for signed-in users and covered by the isolation suite. `catalog_facets(workspace)` counts
  products per status, origin and chapter for the catalog filters. Trigram indexes on product
  title and SKU keep search fast at 10,000+ products.

- `products.facts` (CD-024, used by CD-030):
  `{ materials: [{ name, percent | null }] (≤ 8; percent as a string, total ≤ 100), function, user,
  form, missing? }`. Validated by `lib/catalog/facts.ts`. Sellers edit it on the product page; the
  agent fills it and owns `missing`. It is part of the content hash, so an edit marks a confirmed
  code Outdated.
- Product edits from the page are conditional on the `updated_at` the page loaded (as text, to
  keep microseconds), so a save never overwrites a newer edit.

- **Review and decisions (CD-040 to CD-042, `0006_review.sql`):**
  - **Tariff in force:** `revision_in_force(market)` is the latest revision whose
    `effective_from` is today or earlier (`current_revision` also returns future ones).
    `is_filing_code(revision, code)` is true for a 10-digit leaf line of that revision.
    `hts_breadcrumb(revision, code)` returns the heading, each parent line and the line itself:
    a line's parent is the closest line above it with a smaller indent (indents can skip
    levels). This relies on `tariff_lines.id` being schedule order, so **the CD-010 importer
    must insert each revision as one ordered stream** (no parallel or reordered batches).
  - **Queue:** `review_queue` is a security-invoker view of current codes that need a person
    (`needs_answer`, `in_review`, `outdated`, `suggested`, in that priority, oldest first).
    `review_position(workspace, at, market)` returns the item at `at` (or the first one), the
    previous and next ids, its position and the total.
  - **Who:** `can_decide(workspace)` is owners, admins and members of a workspace that is not
    deleted. Each decision function checks it on an unlocked read first, then locks the product
    and then the classification or question (the same order as the product triggers), so
    decisions on one product run one at a time, never deadlock, and nobody can lock another
    tenant's rows.
  - **Confirm:** `confirm_classification(classification, code, content_hash)` accepts the
    current code only, and only when its code and the product's content hash are the ones the
    person saw. The status must be `suggested`, `in_review` or `outdated` and the code a filing
    line of the tariff in force. It sets `confirmed`, `confirmed_by`, `confirmed_at` and the
    revision, and writes `classification.confirm` (code, previous status, confidence, run,
    revision, content hash) to `audit_log`.
  - **Override:** `override_classification(product, expected_id, expected_code,
    expected_status, code, reason, content_hash, market)`: the expected values are the current
    classification the person saw (all null when there was none), so a code a colleague just
    confirmed or changed is never replaced unseen. It needs a 3–500 character reason. A
    `broker_verified` code can be replaced only by an owner or admin. The old row stays as
    history (`is_current = false`); the new row is `confirmed` with source `override`. It
    writes `classification.override` with the previous code, the reason and the revision.
  - **Answers:** `answer_agent_question(question, answer)` takes a 1–300 character answer, once,
    and only for a question of the run behind the product's current `needs_answer` code
    (`agent_run_id` matches; older questions are stale). When that run has no open questions
    left, the code goes back to `queued` for the agent (CD-034 starts the re-run). It writes
    `question.answer` with the question and answer.
  - **Errors:** 42501 not allowed (also no session: `not_authenticated`), 22023 invalid input,
    P0001 `stale`, `not_confirmable`, `unknown_code`, `broker_verified`, `already_answered`.
  - **Agent output (CD-032 writes, CD-042 shows):** `alternatives` is
    `[{ code (10 digits), why }]` (at most 5 shown), `citations` is
    `[{ kind: 'ruling', number, note? } | { kind: 'note', ref, note? }]`, `gri_path` is
    `['GRI 1', 'GRI 6', ...]`, and `agent_questions.options` is 2–5 answer strings. The page reads
    them leniently (`lib/classification/result.ts`) and leaves out anything malformed.

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
