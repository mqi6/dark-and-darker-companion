# First supervised generated move: offline gate

The cloud-only portion is complete when this change is merged. It does not generate mouse input and does not claim a live Windows implementation.

## Enforced scope

The first Codex-generated move is deliberately limited to exactly one unstacked `1x1` item moving within one currently visible, enabled stash tab to one currently empty cell. Preparation fails closed when any of the following changes or cannot be proven:

- authoritative snapshot hash or version;
- character-specific tab-to-inventory mapping or visible tab;
- game build, foreground window, window bounds, calibration profile, or `12x20` geometry;
- source alias uniqueness, item footprint, or stack quantity;
- destination bounds, occupancy, or user-reserved regions.

The two-anchor calibration treats the supplied top-left and bottom-right points as the **outer edges of the complete stash grid**. Cell centers are derived from those anchors. The approval fingerprint binds the item alias, logical source and destination, snapshot, tab, build, window, calibration, and screen coordinates.

Execution requires a matching human-confirmation object, an exclusive game-interaction lease, a preflight before the countdown, a second preflight after the countdown, and one left-drag dispatch. There is no retry. A dispatched drag becomes `confirmed` only after a newer authoritative protocol state verifies the move. Cancellation or an exception after dispatch is `ambiguous`.

## Still requires the local Windows/game checkpoint

The repository intentionally has no production `SupervisedMoveRuntime` yet. Local Codex must implement and test a normal foreground-UI Windows adapter that can:

1. inspect the foreground game window and exact bounds without reading process memory;
2. show a cancellable countdown;
3. dispatch one ordinary left-button drag between the approved screen points;
4. wait for passive protocol verification using the established complete-state refresh method.

Before that adapter may dispatch, the human must choose a harmless `1x1`, quantity-one item and an empty destination on the same enabled tab, verify the on-screen source/destination overlay, and give a final explicit confirmation for that exact fingerprint. The adapter must first run in dry-run mode. No page sorting, second move, marketplace action, packet injection, background input, or automatic retry is authorized by this checkpoint.
