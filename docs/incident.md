# Incident runbook

1. **Contain.** Revoke exposed keys (Supabase, Anthropic, Stripe, Shopify) and rotate. Pause affected Inngest functions.
2. **Preserve.** Export Vercel, Supabase and Sentry logs for the window. Note times in UTC.
3. **Fix.** Patch, add a regression test, deploy.
4. **Tell.** Email affected customers within 72 hours: what happened, what data, what you did, what they should do.
5. **Learn.** Write a short postmortem in `docs/postmortems/YYYY-MM-DD.md`.
