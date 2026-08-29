# REFRESH-001 handoff

The read-only checkpoint completed all four documented samples without modifying an item. Tab changes (REF-001 and REF-002) and leaving/reopening Stash (REF-003) emitted no command 44 or 552 state. Same-character reselection followed by opening Stash (REF-004) emitted two successful `S2C_LOBBY_CHARACTER_INFO_RES` command-44 snapshots strictly after `ACTION_START`; both contained the same ten containers and passed structural completeness and unique-identity checks.

Protocol evidence derives the ten-inventory set as `4, 5, 6, 7, 8, 9, 20, 21, 30, 200`. ID `200` is directly observed; ID `22` is not inferred from enum order. The command-44 container sequence is preserved only in the private review because this checkpoint establishes the set, not a durable visible-tab-index mapping.

The refresh and spatial gates now pass. Live DarkerDB lookups showed that the six affected canonical rows already existed in the pinned gameplay catalog; the defect was exact raw-design-ID normalization for `Potionof`, `Tomeof`, `Sealof`, and `Fangsof` spellings. Six explicit source-backed bridge exceptions resolve all 11 affected instances. The private REF-004 replay now reports zero diagnostics and zero blocked containers, with footprint, bounds, stack, overlap, identity, and freshness validation passing across all ten containers. No unknown item receives a guessed footprint or fallback size.

Future catalog misses remain page-scoped: supported pages stay eligible, affected pages require manual relocation, and an on-demand exception page is forced out of sorting only while unresolved items remain. This metadata repair does not authorize a move experiment or enable unattended execution.

All PCAPs, full snapshots, item unique IDs, identifiers, addresses, and complete layouts remain under `fixtures-private/game/`. The committed evidence contains aggregate counts and a synthetic freshness fixture only.
