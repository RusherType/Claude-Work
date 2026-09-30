# 9. Claude Design Prompt

Paste this into Claude and ask for it in Claude Design. Do the design system and the four core screens first, then the second pass. Export approved screens into `design/` so Claude Code builds against them in Phase 3.

```text
Design the web app UI for ClearDuty, an AI tariff classification and landed-cost tool for small
cross-border e-commerce sellers (Shopify brands selling into the US). Users are founders and ops leads
who are anxious about surprise customs duties. The product must feel calm, precise and trustworthy,
like a modern finance tool (think Linear or Stripe Dashboard density), not a flashy AI toy.

FIRST: create a design system.
- Colours (light / dark): background #FAFAF7 / #0E1116; surface #FFFFFF / #161B22; border #E4E4DE /
  #2A313C; text #15181D / #E8EAED; secondary text #5B616B / #9AA3AE; brand deep teal #0F5E5A /
  #3FB8AF; confirmed green #1F7A45 / #4CC38A; needs-review amber #B7791F / #F0B429; risk red #B42318 /
  #F97066; info blue #1D4ED8 / #60A5FA.
- Type: Inter for UI (12, 14 body, 16, 20, 24, 32); JetBrains Mono with tabular figures for tariff
  codes and money. Tariff codes always shown grouped like 6109.10.0012 with a small copy icon.
- 4px spacing grid, 8px card radius, 6px input radius, hairline borders, shadows only on popovers.
- Components: sidebar nav, top bar with search and market selector, buttons (primary, secondary,
  ghost, destructive), inputs, selects, choice chips, data table with sticky header and bulk select,
  status chips (Suggested, Needs answer, In review, Confirmed, Broker verified, Outdated) each with
  icon + text + colour, confidence bar (5 segments), cost breakdown list, diff badge (+$1.84 / +12.5%),
  toast, dialog, side drawer, empty state, skeleton rows, progress bar.

THEN design these screens at 1440px desktop, light theme, with realistic data (apparel, home goods,
electronics accessories from India, Vietnam, China, UK):
1. Dashboard: 4 stat cards (SKUs confirmed / suggested / need an answer; average duty rate; monthly
   duty exposure; open alerts), a "Needs your attention" list, a small tariff-change feed.
2. Catalog: dense table with image, product, SKU, origin flag, HTS code, status chip, duty %, landed
   cost, last checked; filter bar; bulk action bar when rows are selected.
3. Product detail: left column editable product facts; right column classification card with the
   code, chapter > heading > line breadcrumb, confidence bar, 3-line reasoning with "Show more",
   rejected alternatives, cited CBP rulings opening in a drawer, history timeline, and Confirm /
   Override buttons. Label the code "Suggested" until confirmed.
4. Review queue: one product at a time, focused layout, the agent's question in plain words with 2-5
   answer chips, keyboard hints (A confirm, E edit, Q answer, J/K next/previous), progress "12 of 48".

SECOND PASS:
5. Landed cost calculator with a line-item breakdown (general duty, each Chapter 99 overlay, MPF,
   HMF, carrier fees) and a bold total; warning banner when a suggested (unconfirmed) code is used.
6. Alerts feed: "New 25% duty on 14 of your SKUs from 1 Nov", before/after cost, source link, action.
7. Documents: generate commercial invoice or classification sheet, history list.
8. Onboarding: 3-step wizard (company, connect Shopify or upload CSV, origins and shipping mode).
9. Settings: team and roles, integrations, notifications, billing.
10. Marketing landing page: hero "Know your US duty on every SKU before it ships", a live demo
    input that classifies one product, 3-step how it works, pricing ($49 / $199 / $499), FAQ, and a
    small honest note that ClearDuty is decision support, not a customs broker.

ALSO: show dark theme for the dashboard and product detail; show mobile (375px) for the dashboard,
review queue and alerts with a bottom tab bar; show empty, loading (skeleton) and error states for
the catalog. Meet WCAG 2.2 AA contrast; never rely on colour alone for status. No stock photos, no
gradients, no emoji, no robot or sparkle AI imagery.
```

Tips: review one screen at a time and comment on the canvas; save the approved design system as your default; if a screen looks generic ask for "denser, more like a finance ops tool, fewer cards, more table".
