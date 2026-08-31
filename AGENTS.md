# Codex Repository Instructions

## Scope

This repository implements the Dark and Darker Companion v1: read-only stash capture and display, one-page sorting and preview, controlled normal-UI sorting, auction pricing/queue/listing, DarkerDB Gear Search, Settings, and shared Activity reporting.

Do not add maps, build recommendations, automatic purchasing, unattended monitoring, repricing, or cancellation unless the product specification changes. Cross-tab stash sorting is authorized only through the normal visible game UI and the verified character-bag route described below.

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
- Every visible stash tab has an independent automatic-sort on/off preference; verified tabs default on.
- Every enabled stash tab has an allowed-item policy. Supported categories are gear, weapon, necklace/ring, money, money container, utility, and other; canonical item-ID overrides may refine a category. Users may choose either compact top-left packing or category-row packing that starts every category on a fresh row and leaves the previous category row remainder empty.
- A disabled or exception stash tab is neither a sorting source nor a sorting destination.
- Cross-tab sorting must use source stash -> character bag -> target stash. Never model or execute a direct stash-to-stash drag.
- Sort input timing provides fast, balanced, reliable, and bounded custom settings for pointer settle, click hold, post-click, tab settle, drag duration, and post-drag delays.\n- Normal execution uses the verified 1920x1080 reference layout with DnDTools-compatible scaling and client-window origin. Stash bounds remain the existing verified layout; the 10x5 character bag reference bounds are (688,625)-(1090,823). Manual point calibration is diagnostic-only and must not block ordinary preparation.
- Derive the 10x5 character-bag occupancy from the complete successful character baseline. Capacity is spatial: a transfer requires a free rectangle matching the item's verified footprint; item count alone is insufficient.
- Build the complete sort from one fresh authoritative stash state, execute its dependency-ordered actions sequentially without intermediate character reselection, never retry input automatically, then perform exactly one automatic character-reselection refresh and full-state reconciliation after all moves.
- Do not require a preselected unsupported-item exception page. Prompt for one only after an unsupported item is observed. While unsupported items exist, the chosen exception page is forced out of sorting without overwriting its normal tab preference.
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
