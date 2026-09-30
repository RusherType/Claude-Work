# 4. Frontend Specification (UI/UX)

A calm, dense, trustworthy operations tool: every code shows its evidence one click away, every number shows how it was calculated, and the review queue is the heart of the product. Desktop first, usable on a phone for approvals and alerts.

## Design principles

1. **Show the evidence.** Never show a code without confidence, reasoning and citations nearby.
2. **Numbers you can audit.** Every landed-cost figure expands into line items, rates and dates.
3. **One next action.** One primary button per screen; the dashboard says what needs attention first.
4. **Speak plainly.** "Duty you'll pay", not "ad valorem assessment"; customs terms get tooltips.
5. **Never imply a guarantee.** "Suggested" until the seller confirms.

## Design tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| Background | `#FAFAF7` | `#0E1116` | Page |
| Surface | `#FFFFFF` | `#161B22` | Cards, tables |
| Border | `#E4E4DE` | `#2A313C` | Dividers, inputs |
| Text primary | `#15181D` | `#E8EAED` | Body |
| Text secondary | `#5B616B` | `#9AA3AE` | Labels, meta |
| Brand (deep teal) | `#0F5E5A` | `#3FB8AF` | Primary buttons, links, focus |
| Confirmed | `#1F7A45` | `#4CC38A` | Confirmed status |
| Needs review | `#B7791F` | `#F0B429` | Review, questions |
| Risk | `#B42318` | `#F97066` | Cost increases, errors |
| Info | `#1D4ED8` | `#60A5FA` | Tariff change notices |

- Type: Inter for UI; JetBrains Mono (tabular figures) for HTS codes and money. Sizes 12, 14 (body), 16, 20, 24, 32.
- 4 px grid; radius 8 px cards, 6 px inputs; shadows only on popovers and dialogs.
- HTS codes shown as `6109.10.0012` in mono with a copy button.
- Icons: Lucide, 16 px in tables, 20 px in navigation.

## Layout

- Collapsible left sidebar: Dashboard, Catalog, Review queue (badge), Landed cost, Alerts (badge), Documents, Settings. Workspace switcher top, user menu bottom.
- Top bar: global search (SKU, product, HTS code), market selector (US; UK, EU, CA, AU "Coming soon"), "Import products".
- Content max width 1280 px; tables full width.
- Under 768 px: bottom tab bar (Dashboard, Review, Alerts, More); tables become stacked cards.

## Screens

| # | Screen | What it shows | Primary action |
| --- | --- | --- | --- |
| 1 | Landing page | Hero "Know your US duty on every SKU before it ships", live demo classifier, 3-step how it works, pricing, FAQ, legal note | Start free trial |
| 2 | Sign in / up | Magic link and Google | Continue |
| 3 | Onboarding (3 steps) | Company, home country, business type; connect Shopify or CSV; origins and shipping mode | Classify my catalog |
| 4 | Dashboard | Cards: confirmed / suggested / needs answer; avg duty rate; monthly duty exposure; open alerts; "Needs your attention" | Review next item |
| 5 | Catalog | Image, product, SKU, origin, HTS code, status, duty rate, landed cost, last checked; filters; bulk select | Classify selected |
| 6 | Product detail | Left: editable facts. Right: classification card (code, breadcrumb, confidence, reasoning, alternatives, rulings drawer, history) | Confirm code |
| 7 | Review queue | One product at a time; A confirm, E edit, Q answer, J/K next/previous; questions as chips | Confirm and next |
| 8 | Landed cost | SKUs, quantities, origin, mode; breakdown (general duty, each overlay, MPF, HMF, carrier fees) and total | Save quote |
| 9 | Alerts | What changed, effective date, affected SKUs, before vs after, source link | Review affected SKUs |
| 10 | Documents | Commercial invoice or classification sheet; history | Generate PDF |
| 11 | Settings | Workspace, team, integrations, notifications, billing, export and delete | Save |
| 12 | Admin (you) | Tariff measures, fee tables, HTS imports, agent run explorer | Publish measure |

## Key components

- **StatusChip**: Suggested (teal outline), Needs answer (amber), In review (amber solid), Confirmed (green), Broker verified (green + shield), Outdated (red outline).
- **ConfidenceBar**: 5 segments; below 0.6 shows "Low confidence, needs a closer look".
- **ClassificationCard**: code, breadcrumb, confidence, reasoning (3 lines collapsed), alternatives, citations, confirm/override.
- **CostBreakdown**: each rate with source and effective date; bold mono total.
- **QuestionPrompt**: plain-words question, 2–5 answer chips, "Other" free text.
- **DiffBadge**: +$1.84 / +12.5% in red or green.

## States every screen must handle

- Empty: illustration, one sentence, the primary action.
- Loading: skeleton rows; long jobs show "x of y classified" live via Supabase Realtime.
- Error: plain message, next step, retry; Sentry ID shown.
- Partial: bulk runs show failures and let the user retry only those.

## Accessibility

- WCAG 2.2 AA: 4.5:1 text contrast, visible focus, full keyboard, labelled inputs.
- Status never by colour alone: chips carry text and icon.
- Respect `prefers-reduced-motion`; motion 150–200 ms.
