# ClearDuty

AI tariff classification and landed-cost tool for cross-border e-commerce sellers. US first.

Ticket CD-001 (scaffold) is done. Everything else is planned in `docs/`.

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
pnpm test
pnpm dev
```

Open http://localhost:3000.

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
