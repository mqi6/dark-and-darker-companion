# NAV-001 Windows runtime

NAV-001 is navigation-only. The runtime uses public foreground-window/client-bound APIs, private screen-reference features, ordinary foreground `SendInput` clicks, and the exclusive game-interaction lease. It never focuses the game, sends background input, retries a click, reads process memory, modifies game files, or clicks a stash item.

Private references are captured with `npm run nav001:operator -- --mode capture-reference ... --delay-seconds 5`. Screenshots, feature templates, detected coordinates, profiles, plans, previews, and logs remain under `fixtures-private/runtime/nav-001/`. The classifier recognizes only character selection, lobby, stash, merchant, unknown, and ambiguous; unknown or ambiguous stops.

Preparation uses `--mode prepare`, validates a protocol-derived visible-tab count from 2 through 10, detects the foreground starting page, builds scaled screen-absolute points through `buildGameScreenLayout()`, and produces a non-clicking private preview plus compact `nav001-...` fingerprint. Live execution is forbidden until the human confirms both.

For the verified UI contract, the complete command-44 storage-container count supplies the number of fixed top-to-bottom visible stash tabs; numeric inventory-ID order is not used as tab order. Character selection preserves the current selected character, so NAV-001 clicks `Enter Lobby` directly and never clicks a character card.

The approved sequence is exactly: Lobby -> Stash -> Lobby -> Character Selection -> Enter Lobby with the already-selected character -> Stash. Each step rechecks foreground identity, client bounds, display geometry, build, and classified screen. It dispatches at most one click and waits for the expected classified transition; timeout, cancellation, rejected input, or mismatch stops without retry.
