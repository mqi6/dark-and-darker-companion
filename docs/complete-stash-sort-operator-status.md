# Complete stash-sort operator status

Status as of 2026-09-01:

- The localhost operator restores the rendered DungeonCrawler window, performs the established character-reselection refresh, captures one complete command-44 state, and prepares a complete-sort preview without dispatching a sort action.
- Refresh reuses the operator's resolved game-window binding. A successful screen capture now supplies both classification and verified window geometry, so the runtime does not start a second PowerShell inspection after every transition.
- Transition deadlines remain 10 seconds for ordinary screens and 30 seconds for Enter Lobby. They are maximum failure deadlines, not fixed sleeps; the next action begins as soon as the expected screen is classified.
- The scheduler supports more than one simultaneous character-bag buffer. This resolves overlapping footprint cycles that previously produced `destination-remains-occupied`.
- Every visible stash tab is rendered as a 12x20 before/after footprint graph. Enabled, disabled, and unknown-item quarantine pages are visually distinct.
- A page containing an unmapped item or missing gameplay metadata is automatically quarantined for that run. The operator does not guess a 1x1 footprint and does not read from or write to that page; verified pages can still be sorted.
- `Run Sort` remains enabled only for a fully scheduled prepared plan. One click is process-local approval for that exact plan; no copied fingerprint or terminal marker is required.
- Private captures, projections, plans, screen data, coordinates, journals, and post-state evidence remain below `fixtures-private` and are gitignored.

## Expected local behavior

The first game-window discovery after a game restart can still take several seconds because Windows must enumerate and verify the new top-level window. Once resolved, Focus, Refresh, transition observation, and sort execution reuse the live binding. Restart the operator after pulling this branch; an already-running Node process cannot load the new pipeline or graphical preview.

The preview exposes category, footprint, tab, position, page status, move count, cross-tab count, skipped diagnostics, and unknown-item counts. It intentionally omits private aliases and canonical IDs from the browser page.

## Verification

GitHub Actions CI run 93 passed on commit `a9311d40b03fcc0dc65f02f9389eb0725ea2d12b`:

- TypeScript typecheck
- Fixture validation
- 61 test files / 312 tests
- Production build

No live click, drag, game capture, or private fixture was required for these offline changes.
