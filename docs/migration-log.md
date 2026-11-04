# Cloudflare migration log

Spec: [cloudflare-migration-spec.md](cloudflare-migration-spec.md).

## How this run is executed

- Builders run headless through the Cursor CLI (`cursor-agent -p`), one git worktree per ticket under `/home/oscar/Projects/plan-bet-wt/`. Grok 4.7 (`grok-4.7-high`) builds even tickets; Composer 2.5 (`composer-2.5`) builds odd tickets. GLM and DeepSeek were the first choice but are not included in the Cursor plan; Oscar chose the included models.
- The coordinator (Claude Opus 5.5, Claude Code session) writes each ticket plan to `.cursor/plans/Txx.md`, reviews the result, sends findings back to the same builder chat, and merges into `cf/main` after review passes. Oscar asked for the run to continue without per-ticket approval; production (T15) still waits for Oscar.
- Bugbot and Agent Review are not used in this headless run; the coordinator's review plus a fresh-context reviewer on Tier A tickets replace them.

## Builder scorecard

| Ticket | Tier | Builder | Plan followed | Gate loops | Review rounds | Blocker / major / minor | Invariant breaks | SvelteKit 2 slips | Invented APIs | Sandbox | Outcome | Wall time | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Tickets
