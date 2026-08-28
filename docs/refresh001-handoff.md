# REFRESH-001 handoff

The read-only checkpoint completed all four documented samples without modifying an item. Tab changes (REF-001 and REF-002) and leaving/reopening Stash (REF-003) emitted no command 44 or 552 state. Same-character reselection followed by opening Stash (REF-004) emitted two successful `S2C_LOBBY_CHARACTER_INFO_RES` command-44 snapshots strictly after `ACTION_START`; both contained the same ten containers and passed structural completeness and unique-identity checks.

Protocol evidence derives the ten-inventory set as `4, 5, 6, 7, 8, 9, 20, 21, 30, 200`. ID `200` is directly observed; ID `22` is not inferred from enum order. The command-44 container sequence is preserved only in the private review because this checkpoint establishes the set, not a durable visible-tab-index mapping.

The refresh method is protocol-reliable, but the overall execution gate remains **ambiguous**. Eleven item instances lack a verified game-design-ID to DarkerDB catalog mapping, so their footprints cannot be checked and complete no-overlap spatial reduction cannot yet be proven. There are zero unknown container geometries and zero observed identity collisions. No move execution is enabled.

All PCAPs, full snapshots, item unique IDs, identifiers, addresses, and complete layouts remain under `fixtures-private/game/`. The committed evidence contains aggregate counts and a synthetic freshness fixture only.
