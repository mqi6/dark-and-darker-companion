# Development Progress

## Completed offline foundation

- Four-tab React shell with persistent status and Activity regions.
- English and Simplified Chinese UI dictionaries and runtime switching.
- Canonical-ID game-data localization merge with English fallback.
- DarkerDB HTTP adapter for Items, Attributes, Market, and Price Check.
- Recent-K arithmetic mean and inferred-vs-confirmed comparable metadata.
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

## Automated verification

- TypeScript strict type checking.
- Synthetic fixture validation.
- 39 passing tests across pricing, search, reserved regions, task state, adapters, localization, live DarkerDB contracts/mappings, Windows baseline validation, snapshots, and UI shell.
- Successful production renderer build.

## Current external checkpoint

DarkerDB checkpoints 001 and 002 are complete. The next boundary is the actual Windows game. Collect BUILD-001 and CAP-001 through CAP-010 using `human-checkpoint-003-windows-game-baseline.md`.

## Later local-game blockers

No game-side validation has been claimed yet. Visual design in Figma also remains blocked until the Figma MCP quota resets or the plan is upgraded; no substitute design has been represented as a Figma artifact.
