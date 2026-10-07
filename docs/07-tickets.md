# 7. Feature Tickets

45 P0 tickets across 11 epics, about 73 estimated days, compressed to 12 weeks by running independent tickets in parallel. P1 starts after the first 10 paying customers. Mark a ticket `[x]` when merged.

| Done | ID | Epic | Ticket | Done when | Pri | Days | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [x] | CD-001 | Foundation | Scaffold repo | Next.js 16.3, TS strict, Tailwind v4, ESLint, Prettier, Vitest, Playwright run; `docs/` holds the pack | P0 | 1 | — |
| [ ] | CD-002 | Foundation | Supabase schema | Migration 0001 applied locally; generated types committed; owner applies it to staging (`supabase link` + `supabase db push`, which Claude Code is not allowed to run) | P0 | 1 | CD-001 |
| [ ] | CD-003 | Foundation | Auth | Magic link and Google; middleware protects `/app`; sign-out works | P0 | 1 | CD-002 |
| [ ] | CD-004 | Foundation | Workspaces and roles | Create workspace, invite by email, accept, role guards on server actions | P0 | 2 | CD-003 |
| [ ] | CD-005 | Foundation | Tenant isolation tests | CI proves workspace A cannot read/write workspace B in every tenant table | P0 | 1 | CD-004 |
| [ ] | CD-006 | Foundation | CI and previews | GitHub Actions: lint, typecheck, tests, build; Vercel preview per PR | P0 | 0.5 | CD-001 |
| [ ] | CD-007 | Foundation | Observability | Sentry, PostHog, LLM tracing; test error and trace visible | P0 | 0.5 | CD-001 |
| [ ] | CD-010 | Tariff data | HTS importer | Inngest job pulls all 99 chapters from USITC into a revision; idempotent | P0 | 2 | CD-002 |
| [ ] | CD-011 | Tariff data | Rate parser | Parses "Free", "5.3%", "2.4¢/kg", "25¢/kg + 3.4%" etc.; 50 unit tests | P0 | 1.5 | CD-010 |
| [ ] | CD-012 | Tariff data | Tariff embeddings | Leaf lines embedded with path text; sensible top-10 for 20 test queries | P0 | 1 | CD-010 |
| [ ] | CD-013 | Tariff data | Rulings index | Rulings ingested politely (or licensed), chunked, embedded, revoked status; `match_rulings` works | P0 | 3 | CD-002 |
| [ ] | CD-014 | Tariff data | Admin editors | Create/edit/publish measures and fees with sources; platform admin only | P0 | 2 | CD-004 |
| [ ] | CD-015 | Tariff data | Seed measures | Current Section 232, 301, 338 measures with FR/CSMS links and dates | P0 | 2 | CD-014 |
| [ ] | CD-020 | Catalog | Shopify app shell | OAuth install, embedded app loads, HMAC and session tokens verified | P0 | 2 | CD-004 |
| [ ] | CD-021 | Catalog | Shopify product sync | Bulk initial import; create/update/uninstall webhooks keep it current | P0 | 2 | CD-020 |
| [ ] | CD-022 | Catalog | CSV import | Template, mapping, per-row errors, 5,000 rows under 60 s | P0 | 1.5 | CD-002 |
| [ ] | CD-023 | Catalog | Catalog table | Paginated, filters (status, origin, chapter), search, bulk select, fast at 10,000 rows | P0 | 2 | CD-021 |
| [ ] | CD-024 | Catalog | Product detail | Editable facts; edit on a confirmed product marks it Outdated | P0 | 1.5 | CD-023 |
| [ ] | CD-030 | Agent | Fact extraction | Haiku returns schema-valid facts with `missing` list for 30 sample products (repo fixtures; real Shopify data arrives with CD-021) | P0 | 1.5 | CD-002 |
| [ ] | CD-031 | Agent | Agent tools | `search_hts`, `get_hts_node`, `search_rulings`, `get_ruling` with tests | P0 | 1.5 | CD-012, CD-013 |
| [ ] | CD-032 | Agent | Classification loop | Sonnet tool loop, schema-valid result; verify rejects non-leaf codes and revoked/fake rulings | P0 | 3 | CD-030, CD-031 |
| [ ] | CD-033 | Agent | Confidence routing | Thresholds route to Suggested, Opus re-run, or review; config-driven | P0 | 1 | CD-032 |
| [ ] | CD-034 | Agent | Seller questions | Run pauses on missing fact, question in UI, answer resumes run | P0 | 2 | CD-032 |
| [ ] | CD-035 | Agent | Bulk classification | Concurrency 10, live progress via Realtime, failed items retryable | P0 | 1.5 | CD-033 |
| [ ] | CD-036 | Agent | Eval harness | 200-product golden set; `pnpm eval` reports 6/10-digit accuracy and cost | P0 | 3 | CD-032 |
| [ ] | CD-040 | Review | Review queue | One at a time; A, E, Q, J, K shortcuts; empty state | P0 | 2 | CD-033 |
| [ ] | CD-041 | Review | Confirm and override | Confirm/override with reason; audit row; chips update everywhere | P0 | 1 | CD-040 |
| [ ] | CD-042 | Review | Classification card | Breadcrumb, confidence, reasoning, alternatives, rulings drawer, history | P0 | 2 | CD-041 |
| [ ] | CD-050 | Landed cost | Cost engine | Pure function; 40 hand-worked tests incl. overlays, specific rates, MPF min/max, postal vs commercial | P0 | 3 | CD-011, CD-015 |
| [ ] | CD-051 | Landed cost | Calculator UI | Pick SKUs, origin, mode; breakdown; save quote; PDF | P0 | 2 | CD-050 |
| [ ] | CD-052 | Landed cost | Order to quote | Shopify order → landed cost in one click | P0 | 1 | CD-051 |
| [ ] | CD-060 | Monitor | Revision diff | Nightly job detects new USITC revision, imports, lists changed lines | P0 | 1.5 | CD-010 |
| [ ] | CD-061 | Monitor | Impact recompute | New revision/measure → affected SKUs, costs recomputed, alert rows | P0 | 2 | CD-050, CD-060 |
| [ ] | CD-062 | Monitor | Alerts and digest | Alerts page with before/after; daily Resend digest; settings respected | P0 | 1.5 | CD-061 |
| [ ] | CD-070 | Documents | Commercial invoice | PDF with shipper, consignee, lines, HTS, origin, value, incoterm; confirmed SKUs only | P0 | 1.5 | CD-041 |
| [ ] | CD-071 | Documents | Classification sheet | PDF and CSV: SKU, code, description, origin, value, status, confirmed by/date | P0 | 1 | CD-041 |
| [ ] | CD-080 | Broker | Broker handoff | Order verified code, Stripe payment, partner secure link, result → `broker_verified` | P0 | 2 | CD-090 |
| [ ] | CD-090 | Billing | Stripe subscriptions | Plans, 14-day trial, Checkout, Portal, webhooks update `subscriptions` | P0 | 2 | CD-004 |
| [ ] | CD-091 | Billing | Limits and paywall | SKU limit enforced; over-limit stays Queued; trial-end paywall | P0 | 1 | CD-090 |
| [ ] | CD-100 | Launch | Landing page and demo | Marketing page; demo classifies one pasted product, 3 per IP per day | P0 | 2 | CD-032 |
| [ ] | CD-101 | Launch | Legal pages | Terms, privacy, DPA, subprocessors, "not a customs broker" disclaimer, attorney-reviewed | P0 | 1 | — |
| [ ] | CD-102 | Launch | Onboarding wizard | 3-step wizard; first classification starts at the end | P0 | 1.5 | CD-021, CD-022 |
| [ ] | CD-103 | Launch | Shopify App Store listing | Listing, screenshots, privacy webhooks, passes review | P0 | 2 | CD-021 |
| [ ] | CD-104 | Launch | Security hardening | Headers, rate limits, Zod everywhere, key rotation, restore test | P0 | 1 | all P0 |
| [ ] | CD-105 | Launch | Mobile pass | Dashboard, review queue, alerts usable at 375 px | P0 | 1 | CD-040, CD-062 |
| [ ] | CD-110 | Markets | UK pack | UK Trade Tariff data, duty and VAT, documents | P1 | 5 | MVP |
| [ ] | CD-111 | Markets | EU pack (Germany first) | TARIC, €3 per-line low-value duty, import VAT | P1 | 6 | MVP |
| [ ] | CD-112 | Markets | Canada and Australia | Tariff data, GST, local fees | P1 | 8 | MVP |
| [ ] | CD-113 | Growth | Checkout duty display | Shopify checkout extension for DDP | P1 | 4 | CD-050 |
| [ ] | CD-114 | Growth | Public API | Read and classify endpoints, API keys, OpenAPI docs | P1 | 3 | CD-032 |
| [ ] | CD-115 | Growth | Amazon and WooCommerce | Catalog connectors | P2 | 6 | MVP |

## CD-050 required test cases (40)

Free lines; ad valorem; specific (per kg, per unit); compound; special rate by FTA origin; one Chapter 99 overlay; two stacked overlays; overlay excluded prefix; overlay by origin match and non-match; measure starting mid-month (before/after); measure ending mid-month; MPF formal min, max and between; MPF informal; postal vs express vs ocean; ocean HMF; carrier brokerage fee; multi-line basket; zero value; currency conversion input; rounding to cents.
