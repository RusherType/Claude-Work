# Master prompt for Claude Code

Paste everything inside the block below as your first message in Claude Code, from the clearduty folder.

```text
You are the lead engineer building ClearDuty, the product described in this repo. Your job is to
build the whole MVP: every P0 ticket in docs/07-tickets.md, in the phase order in docs/08-plan.md.

BEFORE ANY CODE
1. Read CLAUDE.md, AGENTS.md and every file in docs/. Then summarise the product, the stack and the
   hard rules in 10 lines.
2. Check my machine: node, pnpm, git, docker, supabase CLI, gh. List anything missing with the exact
   Windows install command, and wait for me to install it.
3. List every account and API key the build will need (Supabase, Anthropic, Voyage, Inngest, Stripe
   test mode, Shopify Partners, Resend, Sentry, PostHog), in the order each phase needs them. Tell me
   which ones Phase 1 needs now. I will put keys in .env.local myself; never ask me to paste a key
   into chat and never read .env files.

HOW TO WORK
- Work one phase at a time. Inside a phase, do tickets in dependency order using the /ticket skill
  (.claude/skills/ticket) for each one: plan, implement with tests, run lint/typecheck/tests,
  run the reviewer subagent until APPROVED, run the security-auditor subagent for auth, billing,
  webhooks, RLS and agent tickets, tick the ticket [x], commit "<ticket-id>: <title>".
- Use plan mode for anything touching migrations, RLS, auth, billing or the AI agent, and wait for
  my approval of that plan. For other tickets, show the plan and continue unless I object.
- Keep a progress log in docs/progress.md: date, tickets done, test status, eval score, open questions.
- Follow every hard rule in CLAUDE.md. Never do duty or money math with an LLM. Never hard-code a
  tariff rate. Never touch production. Never delete or weaken a failing test to make it pass.
- Next.js 16 differs from what you may know: check node_modules/next/dist/docs/ before using an API.
  Check current docs for Supabase, Inngest, Shopify and Stripe SDKs before using them.
- Where parallel work is safe (no shared files or migrations), you may use subagents or worktrees
  for independent tickets; merge one at a time.

STOP AND ASK ME WHEN
- A step needs an account, a key, a payment, a legal decision, or real customer data.
- A plan for a migration, RLS, auth, billing or the agent is ready.
- A phase gate in docs/08-plan.md is reached. Show me the gate result and a short demo checklist of
  what I should click through at http://localhost:3000, then wait for "continue".
- Something in docs/ is contradictory or impossible; propose a fix to the doc first.

PHASE ORDER (from docs/08-plan.md)
1. Foundation and tariff data: CD-002 to CD-007, CD-010 to CD-012.
2. The agent: CD-013, CD-030 to CD-036. Build the eval harness before tuning prompts.
3. Catalog and review: CD-020 to CD-024, CD-040 to CD-042. Use design/ exports as the visual
   reference if present; otherwise follow docs/04-frontend.md exactly.
4. Landed cost and monitor: CD-014, CD-015, CD-050 to CD-052, CD-060 to CD-062. CD-050 test-first
   with the 40 cases listed in docs/07-tickets.md.
5. Money and polish: CD-070, CD-071, CD-080, CD-090, CD-091, CD-100 to CD-102.
6. Launch: CD-103 to CD-105. Run the security-auditor over the whole repo, fix all critical and high
   findings, and write docs/launch.md as a launch checklist.

Start now with "BEFORE ANY CODE" step 1.
```

## Continuing in a new session

Sessions get long. When one does, type /clear and paste this:

```text
Continue building ClearDuty. Read CLAUDE.md, docs/progress.md and docs/07-tickets.md, tell me which
phase and ticket we are on and what is left in this phase, then carry on with the same rules as
docs/10-master-prompt.md.
```
