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

## Automated verification

- TypeScript strict type checking.
- Synthetic fixture validation.
- 26 passing tests across pricing, search, reserved regions, task state, adapters, localization, DarkerDB contracts, snapshots, and UI shell.
- Successful production renderer build.

## Current external checkpoint

Localization checkpoint 001 is complete. Run `npm run darkerdb:samples` and return the three sanitized files described in `human-checkpoint-002-market-price-check.md`. They are needed to validate live Market and Price Check row shapes without sharing an API key.

## Later local-game blockers

After DarkerDB integration, local work will require BUILD-001 and CAP-001 through CAP-010 evidence from the actual Windows game installation. No game-side validation has been claimed yet.
