# Cross-tab stash sorting

## Implemented offline contract

Cross-tab sorting is now a bounded, bag-backed workflow. The planner never treats two stash pages as simultaneously visible and never plans a direct stash-to-stash drag.

For each visible stash tab, the user can independently:

- enable or disable automatic sorting;
- allow gear;
- allow weapons;
- allow necklaces and rings;
- allow money;
- allow money containers;
- allow utility items;
- allow other items;
- refine a category with canonical item-ID allow or deny overrides;
- keep rectangular reserved regions unavailable to the planner.

A disabled, blocked, or active exception page is neither a source nor a destination.

## Bag capacity

The successful complete character baseline contains the character item list. Inventory ID 2 is modeled as the 10-column by 5-row character bag.

The planner reports both item count and spatial capacity:

- number of item instances;
- occupied cells;
- free cells out of 50;
- largest free rectangular area.

A cross-tab item is eligible only when the bag has a free rectangle matching the item's verified width and height. Counting item instances alone is not sufficient.

If the complete baseline contains no inventory-2 rows, the derived bag is empty. A missing, blocked, or spatially invalid bag blocks cross-tab planning.

## Per-item state machine

Each transfer has exactly four logical actions:

1. Select the source stash tab.
2. Drag the item from the source stash cell to a verified free bag cell.
3. Select the destination stash tab.
4. Drag the same item from the bag cell to its planned destination stash cell.

The first execution batch is bounded to one through three independent transfers and processes one item at a time. There is no automatic retry.

If step 3 or 4 fails after the first drag, the run is ambiguous and reports that the item may remain in the character bag. The operator must inspect the game before any further sorting.

## Refresh and confirmation

After all planned two-leg transfers, the runtime invokes the already-established automatic character-reselection refresh. This behavior was confirmed by NAV-002 and is not a separate test target.

The run is confirmed only when a newer complete projection shows every moved deterministic alias exactly once at its planned target inventory and slot with the same verified footprint. A stale state, missing or duplicated alias, wrong destination, wrong footprint, or spatial validation error produces an ambiguous result.

## Approval and lease

Execution uses an opaque process-local approval bound to the exact plan. The operator confirms in the local UI; there is no long fingerprint to copy through chat. Preview mode dispatches no input.

All actions share the existing game-interaction lease. Automatic sorting cannot overlap navigation, supervised moves, or auction automation.

## Fixed screen-coordinate profile

Normal execution does not require the operator to mark either grid.

At the 1920x1080 reference resolution:

| Region | Top-left | Bottom-right | Grid |
| --- | ---: | ---: | ---: |
| Stash | existing verified `(1378,199)` | existing verified `(1864,1009)` | 12x20 |
| Character bag | `(688,625)` | `(1090,823)` | 10x5 |

The layout uses the existing DnDTools-compatible transform:

- normal aspect ratios scale X and Y from the game client size;
- ultrawide clients use a centered 16:9 viewport;
- the game client origin is added after scaling, so the game may be on another monitor;
- the 1280x720 hand-tuned override remains supported;
- stash tab buttons are generated vertically for 2 through 10 visible tabs.

Item drags use the center of the verified item footprint, not the top-left pixel. The same calculated bag center is used for the first drag destination and second drag source.

`npm run sort:calibrate:diagnostic` remains available only if a later game update visibly moves the UI. It is not an ordinary prerequisite.

## Offline/live boundary

Completed in cloud:

- authoritative 10x5 bag geometry and empty-bag derivation;
- bag occupancy and free-rectangle analysis;
- per-tab item category policies;
- reserved-region-aware target placement;
- bag-backed cross-tab planning;
- fixed screen coordinates with DnDTools-compatible scaling;
- Windows foreground click/drag adapter;
- bounded execution state machine;
- automatic post-refresh reconciliation adapter;
- bilingual policy controls;
- unit tests and documentation.

The composed Windows checkpoint subsequently passed locally: one approved item followed the stash-to-bag-to-stash route, automatic character reselection produced a newer complete state, and reconciliation returned `confirmed`. The operator recorded two completed drags, one completed transfer and no automatic retry. All raw evidence remains gitignored.

The next human checkpoint contains no coordinate marking:

1. Open the game on Stash and start the local smoke-test operator.
2. Review its source tab, source item, temporary bag cell, target tab, target cell, and the two calculated drags.
3. Press the single local confirmation button.
4. Observe one cross-tab item move while logs record both drags and the established automatic character-reselection refresh supplies the newer complete state.

Do not repeat foreground activation, single-drag, navigation, character-reselection, stash calibration, or bag calibration tests. If the calculated preview is visibly wrong, stop before input and provide one screenshot; only then use diagnostic calibration.
