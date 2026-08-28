# NET-000 Semantic Decode and Phase 4 Handoff

Status: accepted local replay for game build `0.17.151.9472`, SHA-256 `7ef0cbe431ec49f5724b213b629d73aad9f524d7cdc5a43bae1d6307647cfb87`.

This report is sanitized. It contains no packet payloads, player identifiers, raw unique IDs, network addresses, or reconstructable personal-stash fixture.

## Accepted NET-000 results

- Five containers and 395 total items.
- Inventory 3: 11 items.
- Storage 4: 35 items.
- Storage 20: 122 items.
- Storage 21: 130 items.
- Storage 30: 97 items.
- 208 primary properties and 113 secondary properties.
- 395 unique deterministic item aliases.
- Zero missing game item IDs and zero container ownership mismatches.
- Canonical snapshot hash: `7b8c8fbb230724b5b02404d1d4580d8fffe3051c43bc3f5e79ccfb19959f4377`.
- Two `S2C_LOBBY_CHARACTER_INFO_RES` messages decoded successfully; the latest successful `result=1` response is the baseline.

## Framing correction

The initial 52-frame review incorrectly applied DnDTools's inbound-only final-header-word constraint (`0` or `256`) to both directions. Outbound frames use changing counter values; known examples were command 21 with counter 5 and command 3001 with counter 6. Direction-aware validation now requires membership in the pinned full `PacketCommand` enum for outbound frames while retaining the inbound constraint.

Final deterministic replay: 82 valid frames, zero discarded bytes, zero gaps, zero retransmissions, zero out-of-order segments, and zero resynchronizations.

## ID bridge and localization

Protocol game IDs and DarkerDB canonical IDs are distinct branded types. The bridge joins by ID only, validates every target against the localization catalog, preserves original game IDs, provides English and Simplified Chinese display data, and reports unknowns rather than guessing.

- All 112 distinct observed item IDs map successfully.
- All 40 distinct observed attribute IDs map successfully.
- Unknown bridge diagnostics: zero.
- Includes the water-breathing potion exception and 13 reviewed attribute exceptions.

## Phase 4 reducer

The reducer selects the latest successful character response, validates a complete candidate before atomic replacement, increments versions monotonically, hashes canonical content deterministically, rejects duplicate aliases and invalid container ownership, and preserves stacks, ammo/content counts, properties, tradability, and permitted areas. Localization enrichment occurs after protocol-state validation.

The schema and catalog do not prove item footprints, storage grid geometry, or slot-to-coordinate mapping. No spatial values were invented. NET-001 is the next recording boundary and requires explicit operator approval.

## Repository fixture boundary

- Aggregate review: `fixtures/game/NET-000-transport-smoke/review.sanitized.json`.
- Minimal non-reconstructable regression: `fixtures/game/NET-000-transport-smoke/reducer.synthetic.json`.
- The full 395-item snapshot remains local and gitignored under the private NET-000 session.
- No raw PCAP or private decoder output is tracked.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 83 tests passed.
- `npm run build`: passed.
- Synthetic protocol replay: passed.
- Existing private NET-000 semantic replay: deterministic and passed.
- `git diff --check`: passed.
- All four gates pass: transport capture, application framing, schema compatibility, and semantic stash decoding.
