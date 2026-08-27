# Codex Repository Instructions

## Scope

This repository implements the Dark and Darker Companion v1: read-only stash capture and display, one-page sorting and preview, controlled normal-UI sorting, auction pricing/queue/listing, DarkerDB Gear Search, Settings, and shared Activity reporting.

Do not add maps, build recommendations, automatic purchasing, unattended monitoring, repricing, cancellation, or multi-stash execution unless the product specification changes.

## Runtime boundary

- Cloud development does not have the installed game or a live account.
- Keep capture and game interaction behind adapters.
- Never claim live-game validation from mocks or fixtures.
- All state-changing actions default to dry-run.
- Use normal game-interface interaction only.
- Do not add anti-cheat bypass, stealth, credential extraction, or hidden background activity.
- An ambiguous auction submission always pauses and is never retried automatically.
- Only one game-interaction automation task may own the execution lease.

## Stable product rules

- Recent-sale reference: take the latest 5 usable deals, select the 3 lowest unit prices in that window, and average those 3. If fewer than 3 exist, use the available deals when the minimum-sample threshold is met.
- Gold rounding: nearest integer, half upward.
- Stack reference: per-unit reference multiplied by quantity, then apply the row adjustment and round.
- Missing market price: no automatic fallback; raise Price unknown and leave the row blocked.
- Confirmed listing failure: skip and continue by default. Ambiguous submission: pause.
- Fixed rectangular stash regions are supported and unavailable to the planner.
- Gear Search displays matches/evaluated and, when incomplete, retrieved/reported total.
- Missing or naturally impossible roll means that rule does not match; other K-of-N rules may still let the item pass.
- UI and game data support English and Simplified Chinese. Join localized game data by canonical ID, never display name.

## Commands

Run before completing a code task:

```text
npm run typecheck
npm test
npm run build
```

Add or update tests for every behavior change. Keep live-only checks explicitly marked and provide a local runbook rather than pretending they ran in the cloud.
