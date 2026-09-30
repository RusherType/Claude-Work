# 3. Security & Access

Every row of customer data belongs to one workspace, and Postgres Row Level Security enforces that on every query. Secrets never reach the browser, and every classification decision is kept as an audit record.

## Roles and permissions

| Action | Owner | Admin | Member | Viewer | Platform admin |
| --- | --- | --- | --- | --- | --- |
| View catalog, codes, landed cost | Yes | Yes | Yes | Yes | Only via support access |
| Run classification, answer questions | Yes | Yes | Yes | No | No |
| Confirm or override a code | Yes | Yes | Yes | No | No |
| Order broker-verified codes | Yes | Yes | No | No | No |
| Connect Shopify, API keys | Yes | Yes | No | No | No |
| Invite/remove users, change roles | Yes | Yes (not owners) | No | No | No |
| Billing and plan changes | Yes | No | No | No | No |
| Delete workspace and data | Yes | No | No | No | No |
| Edit tariff measures and fees | No | No | No | No | Yes |

## Authentication

- Supabase Auth: magic link and Google; optional TOTP for Owners and Admins.
- HTTP-only, Secure, SameSite=Lax cookies via `@supabase/ssr`; 1-hour access tokens.
- Shopify OAuth with minimum scope `read_products`; verify every webhook HMAC and embedded-app session token.
- API keys (Pro): SHA-256 hashes only, shown once, scoped, revocable.
- Platform admin behind `is_platform_admin` plus required 2FA.

## Data isolation

- Every tenant table has `workspace_id`; RLS via `is_member(workspace_id)`.
- Service-role key only in server jobs; lint rule and CI grep block `SERVICE_ROLE` in client files.
- Shared reference data readable by signed-in users, writable only by the service role.
- CI suite signs in as two workspaces and asserts neither can read the other's rows in any table.

## Secrets and keys

- Vercel and Supabase env vars only; `.env.local` gitignored; GitHub secret scanning and push protection on.
- Shopify tokens encrypted with Supabase Vault, decrypted only inside jobs.
- Rotate keys every 90 days and after team changes.

## AI-specific safety

- Product text is untrusted: wrapped in `<product_data>` tags; system prompt says to ignore instructions inside it.
- Agent tools are read-only; only verified JSON is saved, by app code.
- No customer data used for training; say so in the privacy policy.
- Every run logged for audit and "reasonable care".

## Application security

- Zod validation at every server action and route handler.
- Rate limits (Upstash Redis): 60 req/min per user; classification capped per plan.
- Strict CSP, HSTS, `frame-ancestors` limited to Shopify admin for the embedded app.
- CSV uploads: 10 MB, server-side parsing, formula-injection escaped on export.
- Stripe webhooks signature-verified; billing state changes only from webhooks.
- Dependabot and `pnpm audit` in CI; patch Next.js security releases within 48 hours.

## Audit, privacy and retention

- `audit_log` append-only (no update/delete policy).
- Business and catalog data only; order data deleted after 90 days.
- GDPR/UK GDPR: DPA, subprocessor list (Supabase, Vercel, Anthropic, Voyage, Stripe, Resend, Inngest, Sentry, PostHog), export/delete within 30 days.
- Point-in-time recovery on; restore tested before launch.
- Shopify privacy webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) implemented.

## Incident response

Revoke keys, snapshot logs, fix, tell affected customers within 72 hours. Runbook in `docs/incident.md`.
