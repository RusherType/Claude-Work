# 5. App Flow

A new seller goes from signup to a confirmed, costed catalog in one sitting: connect, classify, answer, confirm, then get alerted when tariffs move.

## Flow A — Signup and onboarding

1. Visitor tries the demo classifier on the landing page.
2. "Start free trial" → magic link or Google.
3. Step 1: company name, home country, business type (sell to US shoppers, import inventory, both).
4. Step 2: "Connect Shopify" (OAuth) or "Upload CSV" (template, column mapping, per-row errors).
5. Step 3: default origin, shipping mode (postal, express, ocean, air), incoterm (DDP or DAP).
6. "Classify my catalog" starts a bulk job → dashboard with live progress.

## Flow B — Life of one product

```
Queued → Extract facts → Deciding fact missing? --yes--> Needs answer --seller answers--> Extract facts
                                   |no
                                   v
                          Reason and verify → Confidence ≥ 0.85? --yes--> Suggested --you confirm--> Confirmed
                                                         |no                                        |  \--optional--> Broker verified
                                                         v                                          |
                                                     In review --Opus re-run, then you review-------/
Confirmed --tariff change or product edit--> Outdated --re-check--> Reason and verify
```

1. Product synced → **Queued**.
2. Missing deciding fact → **Needs answer**; answer → back to the agent.
3. Confidence ≥ 0.85 → **Suggested**; lower → **In review** (Opus re-run, then human review).
4. Seller confirms → **Confirmed** (audit record). Override → Confirmed with reason logged.
5. Optional broker check → **Broker verified**.
6. Tariff change or product edit → **Outdated** → re-check.

## Flow C — Landed cost quote

1. Add SKUs and quantities (or pick a Shopify order).
2. Choose origin, mode, destination (US).
3. Line-item breakdown; unconfirmed SKUs show a "suggested code used" warning.
4. Save quote or download PDF.

## Flow D — Tariff change alert

1. Nightly job imports a new revision, or you publish a measure in Admin.
2. Affected confirmed SKUs found, costs recomputed.
3. Alert + digest: "New 25% duty on 14 of your SKUs from 1 Nov; average landed cost rises $2.10."
4. Seller reviews affected SKUs → re-check or accept → optional price-change CSV.

## Flow E — Documents

1. Choose "Commercial invoice" or "Classification sheet".
2. Select an order or SKUs; shipper, consignee, incoterm (saved defaults).
3. Only confirmed SKUs allowed; others listed with a review link.
4. Generate → PDF saved to Storage and downloaded.

## Flow F — Team, billing and exit

1. Owner invites teammates and picks roles.
2. Trial ends day 14 → paywall → Stripe Checkout → back to app.
3. Over SKU limit → new SKUs stay Queued with upgrade prompt; nothing deleted.
4. Workspace delete → 7-day grace → hard delete; Shopify uninstall triggers the same.
