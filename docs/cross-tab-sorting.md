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

## Offline/live boundary

Completed in cloud:

- authoritative 10x5 bag geometry and empty-bag derivation;
- bag occupancy and free-rectangle analysis;
- per-tab item category policies;
- reserved-region-aware target placement;
- bag-backed cross-tab planning;
- bounded execution state machine;
- automatic post-refresh reconciliation;
- bilingual policy controls;
- unit tests and documentation.

The calibration tool is already prepared for this checkpoint. From Windows PowerShell:

```powershell
npm run sort:calibrate -- `
  --profile-id "SORT-001-calibration" `
  --build-fingerprint "<current build fingerprint>" `
  --capture-cursor true
```

It records both the 12x20 stash and 10x5 bag in one pass, writes only below `fixtures-private/`, creates separate non-clicking HTML previews, and accepts negative virtual-desktop coordinates for a game window on a monitor left of the primary display.

The next human checkpoint is intentionally narrow:

1. In the existing local operator UI, calibrate the outer top-left and bottom-right boundaries of the visible 10x5 character bag once for the current game build/window profile.
2. Review the annotated preview. No input is sent.
3. Choose one ordinary, verified-size item whose source page rejects its category and whose target page accepts it.
4. Run one cross-tab smoke transfer: stash to bag, tab switch, bag to stash.
5. Observe the UI while local logs and the automatic complete refresh determine the protocol result.

Do not repeat the already-passed foreground activation, single normal drag, tab navigation, or character-reselection experiments. The purpose of the one remaining live checkpoint is only to validate the bag screen calibration and the composed two-drag path.
