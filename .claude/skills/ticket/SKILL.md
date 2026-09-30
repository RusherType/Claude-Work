---
name: ticket
description: Implement one ClearDuty ticket end to end. Use when the user types /ticket followed by a ticket ID such as CD-002.
---

The ticket ID is in the arguments: $ARGUMENTS

1. Read docs/07-tickets.md and find that ticket. Read every docs/ file it touches (schema → 06, UI → 04, security → 03, agent → 02).
2. Check its "Depends on" tickets are ticked `[x]` and their code exists. If not, stop and say which are missing.
3. Create branch `feat/<ticket-id>-<short-name>` from main.
4. Write a plan: files to create or change, schema changes, tests. Wait for my approval before writing code.
5. Implement. Write tests alongside. Run `pnpm lint`, `pnpm typecheck` and `pnpm test` until all are green.
6. Run the reviewer subagent. Fix everything it reports. Re-run until it says APPROVED.
7. If the ticket touches auth, billing, webhooks, RLS or the AI agent, also run the security-auditor subagent and fix critical and high findings.
8. Tick the ticket `[x]` in docs/07-tickets.md and update docs/ if behaviour or schema changed.
9. Commit with message `<ticket-id>: <title>`, push, and open a pull request with a summary and test notes (use `gh` if available).
