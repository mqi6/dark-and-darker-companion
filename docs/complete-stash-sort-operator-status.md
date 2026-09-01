# Complete stash-sort operator status

Status as of 2026-08-31:

- The localhost operator can restore the rendered DungeonCrawler window, run the established character-reselection route, capture one complete command-44 state, and prepare a complete-sort preview without dispatching a sort action.
- The preview renders each included 12x20 stash page twice: captured occupancy before sorting and calculated occupancy after packing. It uses category-colored footprints and does not expose item IDs or aliases in the page.
- `Run Sort` is enabled only for a fully scheduled prepared plan. One click is the process-local approval for that plan; no copied fingerprint or terminal marker is required.
- Private captures, projections, plans, screen data, coordinates, journals, and post-state evidence remain below `fixtures-private` and are gitignored.

## Current issues

1. The current local acceptance state reaches logical planning but schedule preparation reports `destination-remains-occupied`. The operator therefore remains blocked and correctly keeps `Run Sort` disabled. No drag was dispatched. This scheduler conflict still needs a generic reproduction and correction before a live complete-sort acceptance run.
2. When the game has restarted, the first foreground request may require the full shared window enumeration and verified-process scan. A local measurement observed roughly 8.5 seconds for that stale-handle path. After the request resolves the current HWND, subsequent foreground checks in the same operator workflow use live-handle revalidation; the measured cost was roughly 0.7 seconds. The repeated near-ten-second delay between navigation steps is removed, but first discovery can still be slow.
3. The preview is an occupancy/footprint view, not an item-detail browser. Category, footprint, tab, and position are shown; private aliases and canonical IDs intentionally are not.
4. Operator progress is returned by the localhost API and persisted to private logs. A browser reload reconnects to process-local state, but restarting the operator discards an unexecuted in-memory approval and requires a new Refresh and Preview.

## Acceptance boundary

Do not treat a completed character-reselection route as sort readiness by itself. Readiness requires a newer complete projection, a ready logical plan, a conflict-free schedule, and generated screen actions. On any rejected, failed, ambiguous, or cancelled-after-dispatch action, execution stops immediately and requires a fresh preview rather than continuing from stale projected occupancy.
