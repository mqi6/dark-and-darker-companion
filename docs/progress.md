# Development Progress

## Completed offline foundation

- Four-tab React shell with persistent status and Activity regions.
- English and Simplified Chinese UI dictionaries and runtime switching.
- Canonical-ID game-data localization merge with English fallback.
- DarkerDB HTTP adapter for Items, Attributes, Market, and Price Check.
- Lowest-3-of-latest-5 recent-sale reference and inferred-vs-confirmed comparable metadata.
- Stack pricing, percentage/fixed adjustment, half-up gold rounding, and blocking Price unknown result.
- Local K-of-N evaluation across multiple item families.
- Naturally impossible and missing rolls both evaluate false without excluding the whole item prematurely.
- Matching/evaluated and retrieved/reported incomplete summaries.
- Reserved rectangular stash-region validation and occupancy checks.
- Task transition engine, confirmed-failure Skip rule, ambiguous-submission Pause rule, and exclusive game-interaction lease.
- Versioned snapshot and sample-manifest validation.
- Fixture capture and dry-run game-interaction adapters.
- Synthetic CAP-001 empty-inventory sample bundle and fixture validator.
- Validated real DarkerDB en/zh-Hans localization catalog with 2,430 items and 58 attributes.
- Catalog schema, duplicate-ID checks, status-consistency checks, coverage reporting, and canonical-ID display fallback.
- Documented page-based Market filters/metadata, a 50-row cap, bounded incomplete-result collection, gem-aware Price Check queries, and pinned API version `2026-08-03`.
- Validated real Market and Price Check envelopes: active asks, inferred disappearances, freshness metadata, valuation, comparables, and possible roll ranges.
- Mapped real Market rows into bilingual Gear Search candidates and recent-sale samples.
- Wired multiple selected gear IDs, local K-of-N filtering, naturally impossible rolls, and retrieved/reported incomplete summaries across the API boundary.
- Added a sanitized Windows BUILD-001 contract and collection helper for the next local-game checkpoint.
- Completed NET-000 passive transport, bidirectional application framing, pinned semantic Protobuf decoding, and a sanitized Phase 4 baseline reducer. The accepted private replay contains five containers and 395 items; only aggregate evidence and synthetic regression data are repository-visible.
- Added explicit `GameDesignItemId`/`GameDesignAttributeId` to DarkerDB canonical-ID bridges. Enrichment joins only by validated catalog IDs and preserves the original protocol IDs for diagnostics.

## NET-000 framing count correction

The initial review reported 52 frames because it applied DnDTools's inbound-only header validation (`padding` limited to `0` or `256`) to both directions. Outbound frames use the final header word as a changing counter: the rejected evidence included command 21 with counter 5 and command 3001 with counter 6. Rejecting those valid client frames caused 22 discarded bytes and three false resynchronizations. Direction-aware validation now retains the pinned `0/256` rule for server-to-client traffic and accepts outbound counter values only when the command belongs to the complete pinned `PacketCommand` enum. The deterministic replay consequently reports 82 valid frames, zero discarded bytes, and zero resynchronizations.

## Phase 4 geometry boundary

The baseline reducer preserves inventory/storage ownership, slot IDs, stacks, properties, tradability, and permitted-area values. The extracted message schema and current DarkerDB localization catalog do not establish item footprint dimensions, storage grid geometry, or a slot-to-coordinate mapping. Phase 4 therefore stops before spatial validation; no dimensions or coordinates are inferred.

## Automated verification

- TypeScript strict type checking.
- Synthetic fixture validation.
- CI-verified passing tests across pricing, search, reserved regions, task state, adapters, localization, live DarkerDB contracts/mappings, Windows baseline validation, snapshots, and UI shell.
- Successful production renderer build.

## Current external checkpoint

DarkerDB checkpoints 001 and 002 and all four NET-000 protocol gates are complete. NET-001 is the next approved recording boundary, but must not start without explicit operator approval.

## Later local-game blockers

No game-side validation has been claimed yet. Visual design in Figma also remains blocked until the Figma MCP quota resets or the plan is upgraded; no substitute design has been represented as a Figma artifact.
