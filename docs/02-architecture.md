# 2. Technical Architecture

One Next.js app on Vercel backed by Supabase Postgres, with a retrieval-grounded Claude classification agent, a deterministic landed-cost engine, and durable background jobs for syncing catalogs and tariff data. The AI suggests; plain code does every calculation.

```
Shopify store --webhooks--> Next.js app on Vercel <--> Seller (browser / Shopify admin)
                                 |        \--> Stripe, Resend
                                 v
   Supabase (Postgres+RLS, pgvector, Auth, Storage, Realtime) <-- Background jobs (Inngest) --> AI models (Claude, Voyage)
          ^                                                          ^
   You (platform admin: tariff measures)              Public sources: USITC HTS API, CBP CROSS, Federal Register
```

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Web app | Next.js 16.3 (App Router, Server Actions), React 19, TypeScript strict | One codebase for app, API and Shopify app |
| UI | Tailwind CSS v4, shadcn/ui, TanStack Table, Recharts | Dense data tables fast |
| Database | Supabase Postgres + pgvector, Row Level Security | Tenant isolation in the database |
| Auth | Supabase Auth (magic link, Google) + Shopify OAuth | No auth code to maintain |
| Storage | Supabase Storage (private buckets) | CSVs, PDFs, images |
| AI | `claude-sonnet-5-5` reasoning, `claude-haiku-4-5-20251001` extraction, `claude-opus-5-5` escalation | Strong tool use; cheap bulk steps |
| Embeddings | Voyage AI (confirm model name at build time) | Retrieval over tariff text and rulings |
| Jobs | Inngest (durable steps, retries, cron) | Long syncs and nightly checks |
| Payments | Stripe Billing + Customer Portal | Subscriptions, trials, add-ons |
| Email | Resend + React Email | Alerts and digests |
| PDFs | `@react-pdf/renderer` | Invoices and classification sheets |
| Observability | Sentry, PostHog, Langfuse or Helicone | Errors, analytics, LLM cost |
| Hosting | Vercel, Supabase, GitHub Actions | Minimal ops |

## Components

1. **Web app** — dashboard, catalog, review queue, landed-cost calculator, alerts, settings, billing.
2. **Shopify app** — embedded (App Bridge); `products/create`, `products/update`, `app/uninstalled` webhooks; Admin GraphQL API.
3. **Tariff data service** — Inngest jobs pull the HTS from `https://hts.usitc.gov/reststop/exportList?format=JSON`, store each revision, diff, embed changed lines.
4. **Rulings index** — CBP CROSS rulings (rulings.cbp.gov) crawled politely or licensed; chunked, embedded; ruling number, date, HTS codes, revocation status.
5. **Tariff measures table** — Chapter 99 overlays (Section 232, 301, 338, new ones) with lines covered, origins, rate, effective dates. Maintained in admin.
6. **Classification agent** — below.
7. **Landed-cost engine** — pure TypeScript: `duty = customs value × general (or special) rate + every active overlay for that line and origin`, plus MPF, HMF for ocean, carrier fees. Every fee and rate is data with effective dates. Unit-tested.
8. **Change monitor** — nightly: new revision or measure → affected confirmed SKUs → recompute → alerts → digest.
9. **Documents service** — PDFs from confirmed data only.

## Landed-cost engine rules

`lib/tariff/landed-cost/` is a pure function of the lines, the shipment, and the measure, fee and
program rows in force. It uses exact decimals (`decimal.js`), never floats, and is split by
concern: `base-duty.ts`, `overlays.ts`, `fees.ts`, `validate.ts`, and `index.ts`, which puts them
together.

- **Customs value.** Each line's value × the shipment exchange rate, rounded half up to the cent.
- **Base duty.**
  - An origin in the Column 2 list pays the Column 2 rate.
  - A claimed program pays the Special rate only when the program is listed for the line and the
    origin qualifies:
    - With a program row in force (from the HTSUS General Notes), the origin must be in its
      country list. `A+` is its own row: least-developed beneficiaries only.
    - Without a row, a two-letter symbol that is a country code (`AU`, `KR`, `JO`) counts as an
      agreement with that country only.
    - Any other symbol is refused, and so is anything marked `*`, whose per-line country
      exclusions are not in our data.
    - A refused claim pays the General rate and goes to review.
  - A claimed program that isn't listed for the line pays the General rate, with a warning.
- **Overlays.** Every measure passed in (the app passes published ones only) is added when all of
  these hold:
  - it is in force on the entry date (start and end dates inclusive) and covers the shipment mode;
  - the code starts with one of its prefixes and none of its excluded prefixes;
  - the origin is listed, or the measure lists `**`.

  Overlays always stack. Measures that must not stack belong in the data, through end dates and
  excluded prefixes. A line that qualifies for a program skips the measures whose `exemptPrograms`
  list that program (for example, USMCA goods). A measure with no exemption data is charged, and
  the line goes to review.
- **Rounding.** Every component is rounded half up to the cent before it is added.
- **Fees.**
  - **Informal or formal.** A shipment is informal when its total value is at or under the
    `informal_entry_limit` row's amount.
  - **MPF.** Uses the formal or informal row. Lines that qualify for an MPF-exempt program are
    left out of the fee's base. An entry with only exempt lines pays nothing, and a partly exempt
    entry goes to review so the proration can be checked.
  - **Other fees.** HMF applies to ocean only. A carrier fee is added when a row matches, and a
    named carrier without a row gets a warning.
  - **Choosing a row.** Among rows in force for the date, an exact-carrier row beats a mode row,
    which beats a generic row; then the latest start date wins.
  - **Amount.** `flat + pct% × value`, clamped to min and max.
  - **Allocation.** Each fee is spread over the lines that pay it, by value, using largest
    remainder, so the lines add up to the cent.
- **Needs review, never a guess.** A line or quote goes to review in any of these cases:
  - the rate is complex or missing, or a specific rate lacks its quantity;
  - a Column 2 origin has no Column 2 rate;
  - a program claim can't be checked;
  - a measure is specific (no unit), or has no exemption data for a claimed program;
  - the informal limit, MPF or HMF row is missing, or two equally specific fee rows apply;
  - the MPF exemption is partial or unknown.

  A suggested or unconfirmed code, and a rate basis such as "on drained weight", add a warning.
- **Invalid input throws.** Each of these throws a named error instead of producing NaN or
  skipping a row:
  - malformed amounts, dates, quantities, exchange rates or HTS codes (10 digits required);
  - unknown modes, fee types or rate types;
  - fee rows without an amount.

  Server actions validate with Zod before calling the engine.
- **Known limits, to check against a real duty bill at the Phase 4 gate:**
  - Form 7501 reports value in whole dollars and rounds per HTS line, so totals may drift by
    cents.
  - Section 232 derivative measures charged on metal content are not modelled; `ad_valorem`
    measures use the full value.

## The classification agent

Claude tool-use loop with a fixed step budget, inside an Inngest function, one product per run.

1. **Extract.** Haiku turns title, description, tags, images, variants into facts: material and %, function, user, form, missing.
2. **Ask.** A missing deciding fact pauses the run and creates a question for the seller.
3. **Retrieve.** Tools: `search_hts(query)`, `get_hts_node(code)`, `search_rulings(query, hts_prefix)`, `get_ruling(number)`.
4. **Reason.** Sonnet applies GRI 1–6 and returns strict JSON: 10-digit code, GRI path, rejected alternatives, cited rulings, confidence 0–1, plain-English reasoning.
5. **Verify.** Code exists in the current revision, is a leaf line, each ruling exists and is not revoked. Failure → one retry, then human review.
6. **Route.** ≥ 0.85 → Suggested. 0.6–0.85 → Opus re-run, then review. < 0.6 → review queue + broker-verified suggestion.

Prompts live in `lib/ai/prompts` with version numbers; every run stores prompt version, model, inputs, tool calls, output, tokens and cost.

## Multi-country design

Country logic sits behind a `TariffPack` interface: `loadSchedule()`, `searchLines()`, `getMeasures(code, origin, date)`, `computeFees(shipment)`, `docTemplates()`. US first; UK Trade Tariff, EU TARIC, Canada, Australia follow. Codes agree at 6 digits, so a confirmed US code seeds other markets.

## Performance and cost targets

- Classification under 60 s per SKU at p90; bulk concurrency 10.
- Landed-cost calculation under 200 ms.
- AI cost under $0.05 per SKU on average.
