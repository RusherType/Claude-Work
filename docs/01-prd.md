# 1. Product Requirements Document

ClearDuty is an AI classification and landed-cost workspace that tells a cross-border e-commerce seller the correct US tariff code, the full duty and fees, and what changes when tariffs move, for every SKU they sell into the US. The MVP launches in the US; the UK, EU (Germany first), Canada and Australia follow as tariff "packs" on the same engine.

**Why now.** The US ended duty-free de minimis for every country, and CBP made that suspension a regulation on 24 June 2026 for both commercial and postal shipments. Postal shipments started paying normal MFN, Section 232 and Section 301 duties on 24 July 2026, and a Section 338 tariff on certain Canadian goods began on 22 August 2026. The EU dropped its €150 duty exemption on 1 July 2026 and now charges €3 per item per tariff line.

**Legal line.** In the US, determining classification and valuation for someone else's import entry is "customs business", which needs a licensed customs broker (19 CFR 111). An importer working on its own account does not need a licence. ClearDuty is a decision-support tool the seller uses for their own imports: it researches, explains and cites, and the seller confirms. Filing entries and paid "verified" classifications go through partner licensed brokers. Get a US trade attorney's opinion before launch.

The MVP must let a seller connect a Shopify store, get a cited 10-digit HTSUS code for every product, see the true landed cost per SKU and per order, and be alerted when a tariff change hits their catalog, within 15 minutes of signing up.

## Problem

Small cross-border sellers guess HS codes from Google or copy them from suppliers. Wrong codes mean surprise duty bills, held parcels, refused deliveries and angry customers. Existing tools (Zonos, Avalara, customs brokers) are priced and designed for larger merchants, and brokers charge per entry without explaining their choices. Sellers already pay and still get surprised, because nobody keeps their catalog's codes and duty math current as tariffs change.

## Target users

| Persona | Who | Main job | Pays today for |
| --- | --- | --- | --- |
| Foreign DTC brand | Brand in India, UK, EU, Canada or China selling direct to US shoppers, 50 to 5,000 SKUs | Quote DDP prices that don't lose money; stop held parcels | Carrier brokerage fees, Zonos-type tools, freight forwarders |
| US importer brand | US Shopify brand importing inventory from overseas, 100 to 10,000 SKUs | Know duty per SKU before placing a PO; survive tariff changes | Customs broker per entry, consultants |
| Ops or finance lead | Person at either brand who owns margins and compliance | Prove "reasonable care" and keep a clean audit record | Spreadsheets, broker emails |

## Goals and success metrics (first 90 days after launch)

| Goal | Metric | Target |
| --- | --- | --- |
| Fast first value | Time from signup to first classified SKU | Under 15 minutes |
| Trustworthy classification | Suggestions accepted without change | 80% or more |
| Accuracy | Agreement with broker-verified codes at 6 / 10 digits | 95% / 85% |
| Revenue | Paying workspaces | 30 by day 90 |
| Retention | Month-2 logo retention | 85% or more |

## MVP scope (P0)

1. **Catalog ingest.** Shopify app install with product sync, plus CSV upload.
2. **AI classification agent.** Suggests a 10-digit HTSUS code with GRI reasoning, a confidence score, cited CBP rulings, and asks the seller about missing facts (material, use, composition).
3. **Seller confirmation.** Every code is a suggestion until the seller confirms; confirmation is logged with who, when and what evidence.
4. **Landed-cost engine.** General rate plus Chapter 99 overlays by origin, merchandise processing fee, carrier fees, per SKU and per basket.
5. **Tariff change monitor.** Detects HTS revisions and new overlays, flags affected SKUs with before and after cost.
6. **Documents.** Commercial invoice and classification sheet as PDF and CSV.
7. **Broker handoff.** One click sends a SKU to a partner licensed broker for a verified code (paid add-on).
8. **Billing.** Stripe subscriptions with SKU limits and a 14-day trial.

## Later (P1 and P2)

- P1: UK, EU (Germany first), Canada and Australia packs; Shopify checkout duty display for DDP; bulk re-classification; team seats.
- P2: Amazon and WooCommerce connectors; supplier questionnaires; country-of-origin assistant; API for 3PLs; binding-ruling request drafting.

## Non-goals

- Does not file entries with CBP or act as a customs broker.
- Does not give legal advice or guarantee a code.
- No export controls, sanctions screening or product safety rules in the MVP.

## Pricing (starting point)

| Plan | Price per month | Includes |
| --- | --- | --- |
| Starter | $49 | 100 active SKUs, landed-cost calculator, documents |
| Growth | $199 | 1,000 SKUs, tariff monitor alerts, Shopify sync, 3 seats |
| Pro | $499 | 5,000 SKUs, priority re-classification, API, 10 seats |
| Broker-verified code | $15 to $25 per SKU | Reviewed by a partner licensed broker |

## Key risks

- **Licensing.** Own-account, seller-confirms framing and broker partners; attorney review before launch.
- **Wrong codes.** Confidence thresholds, forced clarifying questions, citations, human review below threshold.
- **Tariff volatility.** Overlays are data with effective dates, never hard-coded.
- **Competition.** Win on price, speed, explanations and small-seller focus.

## Open questions

- Which broker partners will review codes, and at what per-SKU price?
- First segment: foreign DTC brands or US importers? Decide after 20 discovery calls.

Sources: [CBP rule (Federal Register)](https://www.federalregister.gov/documents/2026/06/24/2026-12669/indefinite-suspension-of-the-de-minimis-exemption-for-mail-shipments-and-new-postal-informal-entry) · [Zonos US tariff updates](https://zonos.com/us-tariff-updates) · [European Commission €3 duty](https://commission.europa.eu/news-and-media/news/ensuring-fairness-and-safety-eur3-customs-duty-low-value-parcels-2026-06-29_en) · [19 CFR Part 111](https://www.ecfr.gov/current/title-19/chapter-I/part-111) · [CBP ruling H068278](https://rulings.cbp.gov/ruling/H068278)
