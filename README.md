# ClearDuty

AI tariff classification and landed-cost tool for cross-border e-commerce sellers. US first.

Phase 1 is partly built: schema, auth, workspaces and team, tenant-isolation tests, CI, the HTS importer and the rate parser. See `docs/progress.md` for what is done and what each remaining ticket needs.

## What's in here

| Path                                | What it is                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `docs/01`–`08`                      | PRD, architecture, security, frontend spec, app flow, schema, tickets, plan |
| `docs/09-design-prompt.md`          | Prompt for designing the UI in Claude Design                                |
| `CLAUDE.md`                         | Rules Claude Code reads at the start of every session                       |
| `.claude/agents/`                   | `reviewer`, `security-auditor`, `test-writer` subagents                     |
| `.claude/skills/ticket/`            | `/ticket CD-0xx` runs a whole ticket end to end                             |
| `.claude/settings.json`             | Permissions and an auto-format hook                                         |
| `supabase/migrations/0001_init.sql` | Full database schema with RLS (applied in CD-002)                           |
| `lib/tariff/hts.ts`                 | First real code: HTS code formatting, with tests                            |

## Run it (Windows, PowerShell)

1. Install Node.js 22 LTS from nodejs.org if `node -v` doesn't work.
2. Install pnpm: `npm install -g pnpm`
3. In this folder:

```powershell
pnpm install
supabase start          # needs Docker Desktop; applies every migration
copy .env.example .env.local   # then paste the URL and keys `supabase start` printed
pnpm hts:import         # optional: loads the current US tariff schedule (~5 minutes)
pnpm dev
```

Open http://localhost:3000 and sign in with any email; the magic link arrives in the local
mail inbox at http://127.0.0.1:54324. Tests: `pnpm test` (unit), `pnpm test:db` (database),
`pnpm build` then `E2E_PROD=1 pnpm test:e2e` (browser).

## Start Claude Code

1. Install it (once), in PowerShell: `irm https://claude.ai/install.ps1 | iex`, then open a new terminal and run `claude --version`.
2. In this folder run `claude` and sign in.
3. First message:

```text
Read CLAUDE.md and every file in docs/. Summarise the product, the stack and the hard rules
in 10 lines so I know you have them. Don't write code yet.
```

4. Then press Shift+Tab for plan mode and type: `/ticket CD-002`

Before CD-002 you need Docker Desktop and the Supabase CLI (`scoop install supabase`) for the local database.
