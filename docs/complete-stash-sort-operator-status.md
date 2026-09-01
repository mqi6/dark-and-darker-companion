# Complete stash-sort operator status

Status as of 2026-09-01.

## Current outcome

Complete stash sorting has reached a usable alpha, but it is not feature-complete.

Two live same-page runs completed with the intended visible result:

| Evidence label | Scope | Result |
| --- | --- | --- |
| `Copy` | visible tab 0 | Completed as intended |
| `(3)` | visible tab 1 | Completed as intended |

These runs validate the basic live chain for two pages: fresh projection, graphical before/after preview, plan approval, tab selection, ordinary visible click/drag input, and completion. They do not by themselves validate every visible page, a full cross-tab bag-backed run, performance targets, or final layout quality.

The localhost operator currently:

- restores the rendered DungeonCrawler window;
- performs the established character-reselection refresh;
- captures one complete command-44 state;
- renders every visible stash tab as a 12x20 before/after footprint graph;
- automatically quarantines a page containing an unmapped item or missing gameplay metadata instead of guessing a 1x1 footprint;
- schedules same-page and bag-backed cross-tab moves;
- stops on the first input failure;
- writes private session/journal/post-state evidence and a shareable sanitized log;
- performs one final refresh and exact reconciliation after a completed plan.

Private captures, projections, plans, screen data, coordinates, journals, and post-state evidence remain below `fixtures-private` and are gitignored.

## Known gaps and TODOs

### SORT-PERF-001 — Faster click and drag dispatch

Priority: P0. Status: open.

The live runs are correct but the individual click/drag cadence is still visibly too slow. The configured timing is only part of the cost. The current runtime performs a foreground/window inspection before each screen action, and the PowerShell drag path restores and verifies the foreground window again before dispatch. Repeated helper-process startup and duplicate foreground checks can dominate the requested delay.

Required work:

1. Add per-action timing fields to the sanitized log: preflight/window check, helper startup, pointer settle, hold/drag, post-input wait, and total action duration.
2. Replace one-PowerShell-process-per-action execution with a persistent input worker or equivalent in-process/native bridge for the duration of one approved sort.
3. Resolve and validate the HWND and client geometry once at run preflight, then use a lightweight same-process foreground/geometry check before each action.
4. Do not call the full foreground recovery path when the verified game window is already foreground and unchanged.
5. Lower Fast/Custom timing bounds only after the persistent path is measured; preserve Stop, mouse-up cleanup, bounds checks, and stop-on-first-failure.
6. Benchmark at least three live runs. Report configured delay separately from dispatch overhead.

Acceptance:

- No helper-process launch occurs per ordinary click or drag.
- Warm dispatch overhead, excluding configured waits and pointer travel, has a median below 75 ms.
- Fast mode is materially faster than the accepted `Copy` and `(3)` baselines without missed inputs.
- A failed or ambiguous input still stops immediately and releases the mouse button.

### SORT-NAV-002 — Faster focus and character reselection

Priority: P0. Status: open.

Refresh and Preview is functionally correct but still spends too long bringing the game forward and walking Stash/Lobby/Character Selection/Lobby/Stash. A recorded baseline reached projection-ready at about 24.5 seconds, including about 9 seconds before the window was ready. Some time is real game rendering, but companion overhead must not add multi-second waits after a screen is already visible.

Required work:

1. Record stage timing automatically for window discovery/focus, screenshot/classification, every click dispatch, every observed transition, capture startup/shutdown, protocol analysis, and projection construction.
2. Keep one verified window binding, capture process, and screen-classifier worker alive through the whole refresh.
3. Remove duplicate window enumeration, PowerShell startup, capture startup, and post-transition validation.
4. Advance immediately when the expected screen is observed; deadlines remain failure ceilings and must never act as fixed sleeps.
5. Evaluate whether a fresh complete command-44 state can be obtained through a shorter safe navigation path. Keep character reselection only where it is actually required for authoritative completeness.
6. Measure cold-window discovery separately from warm Refresh and Preview so the two problems are not conflated.

Acceptance:

- A warm foreground activation normally completes within 1 second.
- Companion overhead after an expected screen becomes observable is below 250 ms per transition.
- Refresh timing is emitted to both the local private journal and the sanitized shareable log.
- The authoritative complete-projection and final-reconciliation guarantees remain unchanged.

### SORT-ORDER-003 — Group exact items and rarity

Priority: P0 for layout quality. Status: open.

The current packing key considers footprint area, height, width, broad item category, and finally the per-instance alias. It does not pass canonical item identity or rarity into the packer. Consequently, two instances of the same exact item can be separated even when a more coherent placement exists.

Required work:

1. Extend the packing item contract with canonical item ID and normalized rarity rank.
2. Group by canonical item ID, never localized display name, so English and Chinese produce the same layout.
3. Within an exact-item group, order by configured rarity direction and then use footprint and stable instance alias only as deterministic tie-breakers.
4. Make the group order deterministic and compatible with both Compact top-left and Category rows.
5. Define how grouping trades off against packing density. The default should keep identical items adjacent when a valid adjacent placement exists, without causing avoidable no-space failures.
6. Show exact-item and rarity grouping in the graphical after-preview before live input.
7. Add unit fixtures covering same-name/different-rarity items, same-size/different-name items, localized names, stacks, reserved regions, and limited-space fallback.

Acceptance:

- Identical canonical item IDs are contiguous whenever the page geometry permits.
- Rarity order within an exact-item group is stable and visible in preview.
- Changing UI language does not change the target layout.
- Packing remains deterministic and never overlaps, escapes the grid, or enters a reserved/quarantined page.

## Completion estimate

These percentages are rough engineering readiness estimates based on implemented code plus the two reported live runs; they are not schedule estimates.

| Sorting area | Readiness | Remaining evidence/work |
| --- | ---: | --- |
| Complete state capture and projection | 90% | Reduce cold/warm latency; keep regression coverage |
| Graphical before/after preview | 90% | Add exact-item/rarity grouping cues |
| Unknown-item quarantine | 85% | More live unknown-item cases and recovery UX |
| Same-page execution | 80% | More pages, faster input, repeated-run reliability |
| Cross-tab bag-backed execution | 60% | Full live end-to-end acceptance across visible pages |
| Layout quality | 55% | Exact canonical item grouping and rarity ordering |
| Performance | 45% | Persistent input/navigation workers and measured targets |
| Safety, logs, and final reconciliation | 85% | More failure-path and recovery acceptance |

Overall complete stash-sort readiness: approximately **70%**. The core is usable, but speed, exact-item/rarity layout quality, and full cross-tab/all-page live acceptance are still material completion gates.

For the broader companion v1, stash sorting is only one milestone. Marketplace item search/filter is the next implementation phase, followed by listing-flow acceptance and final integration. On current evidence, the overall v1 is approximately **45–50%** complete.

## Next phase boundary

The next active development phase is Marketplace item search/filter. The three sorting issues above remain explicit backlog items and should not be silently treated as completed. Marketplace work may proceed without repeating the two successful same-page runs; sorting should return to live testing only after a performance or ordering change has a prepared preview and targeted acceptance plan.

## Verification boundary

Cloud tests and fixture checks can validate planning, deterministic ordering, UI preview, logging, and state-machine behavior. Cloud work cannot claim live-game validation. The `Copy` and `(3)` results are human-reported live acceptance evidence.
