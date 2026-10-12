# Owner checklist: everything Claude needs from you

Do these once and the build can run to the end without stopping. Tick them as you go. Never paste
a key into chat or commit it; put keys only where each item says.

Where it says **cloud env**, that means this Claude Code cloud environment's settings: the
environment menu in the session's title bar, then **Edit**. Changes there apply to the **next**
session, so after a batch of changes start a new session and paste the "Continuing in a new
session" prompt from `docs/10-master-prompt.md`.

## 1. Today (unblocks the rest of Phase 1)

- [ ] **Network access (cloud env → Network access): choose _Full_.**
  - _Full_ is simplest, because every later phase needs more hosts.
  - If you prefer _Custom_, keep the package managers and allow:
    - `hts.usitc.gov`, `rulings.cbp.gov`, `www.federalregister.gov`, `www.cbp.gov`
    - `api.voyageai.com`
    - `pkg-containers.githubusercontent.com`
    - `api.stripe.com`
    - `*.myshopify.com`, `partners.shopify.com`
    - `api.resend.com`
    - `*.sentry.io`, `*.posthog.com`, `cloud.langfuse.com`
    - `*.upstash.io`, `*.inngest.com`
    - `*.supabase.co`, `*.vercel.app`
- [ ] **Voyage AI** (voyageai.com): create an API key and add the cloud env variable
      `VOYAGE_API_KEY`. Needed for CD-012 (tariff search by meaning, the Phase 1 gate).
- [ ] **Supabase staging project** (supabase.com, free plan): create a project named
      `clearduty-staging`. It must never be the production project.
  - Authentication → URL configuration:
    - Site URL: your Vercel staging URL (see Vercel below), or `http://localhost:3000` for now.
    - Redirect URLs: `http://localhost:3000/**` plus the staging URL with `/**`.
  - Authentication → Providers → Email: keep **Confirm email ON**.
  - Add cloud env variables (Project settings → API):
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
    - `SUPABASE_SECRET_KEY` (server jobs only)
  - **Applying migrations:** either run them yourself with
    `supabase link --project-ref <ref>` then `supabase db push`, or reply _"use the Supabase
    connector for staging"_ and give the project's name. Claude then applies each new migration
    to that staging project only, and never to production.
- [ ] **Vercel** (vercel.com, Hobby plan): import `RusherType/Claude-Work` as a project.
  - Add the same Supabase variables in Vercel → Settings → Environment Variables.
  - Also add `NEXT_PUBLIC_SITE_URL` = the deployment URL.
  - Alternatively, reply _"create the Vercel project"_ and Claude will do it with the Vercel
    connector. You then add the secret values yourself.
- [ ] **Sentry** (sentry.io, Developer plan): create a Next.js project.
  - Cloud env: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`.
  - Optional: `SENTRY_AUTH_TOKEN`, for source maps.
- [ ] **PostHog** (posthog.com, free): create a project.
  - Cloud env: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.
- [ ] **Langfuse** (cloud.langfuse.com, Hobby): create a project.
  - Cloud env: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`.
- [ ] **Google sign-in** (console.cloud.google.com):
  - Create an OAuth client of type _Web application_.
    - Authorised redirect URI: `https://<your-staging-ref>.supabase.co/auth/v1/callback`.
  - Paste the client ID and secret into Supabase → Authentication → Providers → Google, not into
    the app.
  - Cloud env and Vercel: `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`.

## 2. Phase 2: the AI agent

- [ ] **Anthropic** (console.anthropic.com): create an API key for the app, and add credits
      (about $50 covers development and evals). Cloud env: `ANTHROPIC_API_KEY`.
- [ ] **Inngest** (inngest.com, free).
  - Cloud env and Vercel: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`.
  - Local development needs no account.
- [ ] **Decision: CBP rulings source** (CD-013). Choose one:
  - (a) Claude collects rulings from rulings.cbp.gov politely: low rate, robots.txt respected,
    public rulings only. This is the default if you don't answer.
  - (b) A licensed data source you pay for.
- [ ] **Golden eval set** (CD-036, needed for the Phase 2 gate). The plan calls for 200 products
      with broker-verified codes. Until you have them, Claude builds a provisional set from public
      CBP rulings, where each ruling gives a product description and its official code. Reply
      only if you object, and send the broker-verified set as a CSV when you have it.

## 3. Phase 3: catalog

- [ ] **Shopify Partners** (partners.shopify.com):
  - Create a partner account, a **development store** and an app named `ClearDuty`.
  - Cloud env and Vercel: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`.
  - Set the app URL and redirect URL to the Vercel staging URL. Claude gives the exact paths
    when CD-020 starts.
- [ ] Optional: export screens from Claude Design into `design/` (see `docs/09-design-prompt.md`).
      Without them, Claude follows `docs/04-frontend.md`.

## 4. Phase 4: landed cost and monitor

- [ ] **Resend** (resend.com, free):
  - Needs a domain you own: buy one if needed, for example `clearduty.app`. That's a payment, so
    only you can do it.
  - Verify the domain's DNS records in Resend.
  - Cloud env and Vercel: `RESEND_API_KEY`, and `RESEND_FROM` (for example
    `ClearDuty <alerts@yourdomain>`).
- [ ] **Sign-off on tariff measures** (CD-015). Claude researches the current Section 232, 301 and
      338 measures from the Federal Register and CBP notices, cites every source, and marks them
      **unpublished**. You (or your broker) check them and publish them in Admin. They drive real
      money, so a person must approve them.
- [ ] **A real duty bill** from one design partner (entry summary / CBP Form 7501, with personal
      data removed) to check the Phase 4 gate: our calculation within 2%.

## 5. Phase 5: money and polish

- [ ] **Stripe, test mode** (stripe.com):
  - Cloud env and Vercel: `STRIPE_SECRET_KEY` (`sk_test_…`),
    `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.
  - Claude creates the test products and prices for $49 / $199 / $499 and the 14-day trial.
- [ ] **Upstash Redis** (upstash.com, free): rate limits.
  - Cloud env and Vercel: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- [ ] **Cloudflare Turnstile** (free): CAPTCHA on sign-in and the demo.
  - Cloud env and Vercel: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.
- [ ] **Broker partner** (CD-080): their name, price per SKU, and how they want to receive
      requests and return results. Until then Claude builds the flow with a placeholder broker.
- [ ] **Legal** (CD-101): Claude drafts terms, privacy policy, DPA, subprocessor list and the
      "not a customs broker" disclaimer, all marked **DRAFT**. A US trade attorney must review
      them before launch.

## 6. Phase 6: launch

- [ ] **Production**: a separate Supabase production project and Vercel production settings,
      created and configured by you. Claude never touches production.
- [ ] **Stripe live mode**, after the US LLC and bank account are set up (sales track).
- [ ] **Shopify App Store listing**:
  - app name, support email, privacy policy URL, and a demo store login for the reviewers;
  - you submit it from the Partners dashboard. Claude prepares the screenshots and text.
- [ ] **Launch decision**: the go/no-go after the final security audit (`docs/launch.md`).

## What Claude does without asking

Everything not listed above. That covers code, tests, migrations and RLS on local and CI
databases, reviews, security audits, docs, commits to the working branch, and moving on to the
next ticket. Plans for migrations, RLS, auth, billing and the agent are recorded in
`docs/progress.md` instead of waiting for approval, and phase gates are reported there with a
demo checklist without pausing. Claude still stops for: payments, legal sign-off, production,
real customer data, and anything in this list that isn't done yet.
