# Progress log

## 2026-10-22 — Phase 1, the parts that need no outside accounts

Branch `feat/phase-1-foundation` (local; not pushed — see "Open questions").

| Ticket | State | What is left |
| --- | --- | --- |
| CD-002 Supabase schema | Done locally: migrations 0001–0004 apply cleanly, types generated and checked in CI | Apply to a **staging** Supabase project (needs the project) |
| CD-003 Auth | Magic link, `/auth/callback`, `proxy.ts` protecting `/app`, sign-out, safe `?next=` | **Google**: create an OAuth client and enable the provider in Supabase |
| CD-004 Workspaces and roles | Create workspace, switcher, invite, revoke, accept (invited address only, single use), change role, remove, role guards on every action | Invite **emails** send only when `RESEND_API_KEY` + `EMAIL_FROM` are set (untested until then); until then the inviter copies the link |
| CD-005 Tenant isolation tests | `pnpm test:db`: 27 tests over every `workspace_id` table; fails when a policy is loosened (checked) | — |
| CD-006 CI and previews | `.github/workflows/ci.yml` (checks + database/e2e jobs), Dependabot, client-secret guard | **Vercel preview** per PR needs the Vercel project; CI has not run on GitHub yet |
| CD-007 Observability | Not started | Needs Sentry, PostHog and Langfuse/Helicone accounts |
| CD-010 HTS importer | Inngest function + `pnpm hts:import`; 2026 HTS Revision 21 imported locally: 35,805 lines, 23,529 leaves; re-runs are no-ops | Nightly trigger is CD-060 |
| CD-011 Rate parser | 69 tests; exact decimal strings; anything conditional is `complex`, never guessed | — |
| CD-012 Tariff embeddings | Not started | Needs `VOYAGE_API_KEY` |

Phase 1 gate ("search the HTS by meaning") needs CD-012, so the gate is not reached yet.

### Test status

- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm check:secrets`: clean
- `pnpm test`: 138 unit tests pass
- `pnpm test:db`: 27 pass (needs `supabase start`)
- `pnpm test:e2e` with `E2E_PROD=1` after `pnpm build`: 10 pass (desktop + mobile), twice in a row
- `pnpm audit --prod --audit-level high`: clean after moving to Next.js 16.3.8

### Data notes for later tickets

- 1,123 leaf lines (4.8%) have a conditional general rate (sliding scales, "but not less than",
  "on drained weight"). The parser marks them `complex`; CD-050 must ask for a manual rate
  rather than compute one.
- 10-digit statistical lines have no rate of their own; `tariff_lines.rate.inherited_from`
  names the 8-digit line it came from.
- The 571 rate-less leaves are all in chapter 99 (overlays); their duty comes from
  `tariff_measures` (CD-014/015), not from the line.

### Decisions made along the way (please review)

- **Migrations 0002–0004** tighten 0001 rather than edit it: admins can't add, change or remove
  owners; a workspace always keeps one owner; audit rows must carry the caller as actor; users
  can't set `is_platform_admin`; `current_revision()` ignores incomplete imports; `tariff_lines`
  is keyed by schedule position (codeless "Other:" rows repeat within a chapter).
- **Workspace creation and invite acceptance** go through `create_workspace()` and
  `accept_invitation()` (security definer), so there is no insert policy on `workspaces` or
  `memberships`. Invite tokens are stored only as SHA-256 hashes.
- **Site URL**: `NEXT_PUBLIC_SITE_URL` must be set when deployed; on localhost the request host is
  used so the dev server works on any port.
- `.gitattributes` pins LF line endings (the format hook was rewriting every file on Windows).

### Open questions

1. **Pushing**: the GitHub account on this machine (`ruchir-07`) has read-only access to
   `RusherType/Claude-Work`. Grant write access, or say whether to push to a fork and open a PR.
2. Accounts Phase 1 still needs: a Supabase staging project, a Google OAuth client, a Voyage
   API key, Sentry + PostHog (+ Langfuse or Helicone), Resend with a verified domain, and the
   Vercel project for previews.
