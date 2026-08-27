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

## Automated verification

- TypeScript strict type checking.
- Synthetic fixture validation.
- 26 passing tests across pricing, search, reserved regions, task state, adapters, localization, DarkerDB contracts, snapshots, and UI shell.
- Successful production renderer build.

## Current external blocker

DarkerDB catalog endpoints require an API key. Complete `human-checkpoint-001-darkerdb.md` so live response shapes and Simplified Chinese coverage can be validated.

## Later local-game blockers

After DarkerDB integration, local work will require BUILD-001 and CAP-001 through CAP-010 evidence from the actual Windows game installation. No game-side validation has been claimed yet.
