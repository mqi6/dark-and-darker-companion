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

## Public stash-page mapping

The verified maximum ten-page mapping is version-controlled in
`src/data/stash-tabs.v1.json`:

| Visible tab in the full ten-page layout | Inventory ID | Page kind |
| ---: | ---: | --- |
| 0 | 4 | Personal 1 |
| 1 | 5 | Personal 2 |
| 2 | 6 | Personal 3 |
| 3 | 7 | Personal 4 |
| 4 | 8 | Personal 5 |
| 5 | 9 | Personal 6 |
| 6 | 20 | Shared 1 |
| 7 | 21 | Shared 2 |
| 8 | 30 | Shared 3 |
| 9 | 200 | Mission 1 |

Characters with fewer owned pages use a compact mapping derived from that
canonical order and their explicitly observed visible-page profile. Do not
derive visibility from command-44 container presence alone because a complete
state may include containers whose buttons are not visible for that character.
Only the character-specific visible selection remains private.

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

The planner schedules every eligible move from one initial complete snapshot. It resolves destination dependencies and uses one verified character-bag rectangle to break placement cycles. Actions run sequentially with no intermediate character reselection and no automatic input retry.

If step 3 or 4 fails after the first drag, the run is ambiguous and reports that the item may remain in the character bag. The operator must inspect the game before any further sorting.

## Refresh and confirmation

After every planned same-page and two-leg transfer has completed, the runtime invokes the already-established automatic character-reselection refresh exactly once. This behavior was confirmed by NAV-002 and is not a separate test target.

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
- complete one-snapshot dependency scheduler, including bag-backed cycle breaking;
- compact top-left and category-row packing modes;
- fast, balanced, reliable, and bounded custom input timing;
- private atomic session, journal, and post-state files for crash diagnosis;
- complete execution state machine with no intermediate refresh;
- one automatic final-refresh reconciliation adapter;
- bilingual policy controls;
- unit tests and documentation.

The next human checkpoint contains no coordinate marking:

1. Open the game and start the local sort operator.
2. Choose compact top-left or category-row layout and a speed preset.
3. Review the complete before/after preview, skipped items, action count, and bag usage.
4. Press the single local confirmation button.
5. Observe the complete sort; the established automatic character-reselection refresh runs once at the end and the UI reports full reconciliation.

Do not repeat foreground activation, single-drag, navigation, character-reselection, stash calibration, or bag calibration tests. If the calculated preview is visibly wrong, stop before input and provide one screenshot; only then use diagnostic calibration.

## Packing modes

- **Compact top-left:** first-fit decreasing over all available cells, starting
  at the top-left. Larger footprints are placed first and output is
  deterministic.
- **Category rows:** categories follow the configured category order. Every
  category begins on a fresh row band; unused cells in the previous category's
  final row are intentionally left empty.

Both modes treat reserved regions and their intersecting items as fixed
obstacles. Disabled and exception tabs are excluded from both source and
destination planning.

The current implementation groups only at the broad category/footprint level.
It does not yet use exact canonical item identity or rarity as packing keys.
This is an open product-quality requirement:

1. use canonical item ID, never localized display name, to keep exact items
   adjacent when geometry permits;
2. sort rarity deterministically inside each exact-item group;
3. preserve deterministic footprint-based fallback when strict adjacency would
   make an otherwise valid layout impossible;
4. expose the grouping in the graphical after-preview before input.

Until this requirement is implemented, a successful run can still place two
instances of the same exact item in different locations.

## Input speed

The sort UI exposes Fast, Balanced, Reliable, and Custom profiles. Custom mode
edits pointer settle, click hold, post-click wait, tab settle, drag duration,
and post-drag wait within validated limits. Timing changes affect only ordinary
foreground UI input; they do not change coordinates, item identity, or the
planned layout.

The current live implementation is functionally accepted on visible tabs 0 and
1, but click/drag cadence and character-reselection refresh remain too slow.
Timing presets alone are not considered a complete fix: the runtime currently
performs repeated window checks and helper-process work around ordinary actions.
The performance backlog requires a persistent per-run input/navigation worker,
stage and per-action timing in the sanitized log, no full foreground recovery
when the verified game window is already foreground, and live benchmarks that
separate configured waits from dispatch overhead.

## Private session data

The initial projection, complete plan, action schedule, timing, progress
journal, and final projection are written atomically to gitignored
`*.private.json` or `*.private.jsonl` files. No PCAP or raw network stream is
required for a sort run. A stale session is never resumed without first reading
a new authoritative game state.
