# MOVE-003 automatic refresh and plan workflow

MOVE-003 uses a separately approved navigation-only refresh before preparing any item action. Its route is derived from the positively classified starting screen and never includes the NAV test-only `Lobby -> Stash -> Lobby` prefix.

- Lobby: Character Selection -> Lobby -> Stash.
- Stash: Lobby -> Character Selection -> Lobby -> Stash.
- Character Selection: Lobby -> Stash.
- Merchant: Lobby -> Character Selection -> Lobby -> Stash.

The refresh fingerprint binds the pinned build, foreground window and bounds, primary and virtual display geometry, `dndtools-sendinput-v1`, starting screen, exact controls, click count, 10-second ordinary deadline, 30-second Enter Lobby deadline, 500 ms polling, zero retries, TCP port-range capture filter, and the navigation-only/no-item-drag approval scope.

The coordinator starts passive capture before navigation and requires both positively classified Stash and a newer successful complete command-44 state. That state must contain ten stash containers and pass spatial validation with zero blocked containers, overlaps, or bounds diagnostics. Capture is stopped in every terminal path. Missing or incompatible state blocks without preparing a move.

After a successful refresh, candidate selection considers only mapped pages currently eligible for Auto Sort. It excludes page-level failures, unsupported-item pages, reserved regions, occupied destinations, unverified footprints, stacks, and non-rectangular containers. The first move is deterministically restricted to one quantity-one `1x1` item and one empty same-tab destination. `prepareSupervisedMove` then binds the fresh snapshot, mapping, calibration, source, destination, alias, quantity/footprint contract, build, window, and exactly one no-retry drag into the separate `move003-...` action fingerprint.

All capture data, complete snapshots, aliases, layouts, screen coordinates, calibration, account/character information, and runtime plans remain below `fixtures-private`. Refresh approval never authorizes an item drag. A second exact approval is required after the private action preview is generated.
