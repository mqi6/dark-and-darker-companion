# Product Decisions — 2026-08-27

## Pricing

1. A no-roll recent-sale reference first takes the latest 5 applicable usable deals, then selects the 3 lowest unit prices from that recent window and uses their arithmetic mean. Both the recent-window size and selected-lowest count remain policy settings. If fewer than 3 deals exist, the engine uses the available deals when the configured minimum-sample threshold is met.
2. A price is rounded to the nearest whole gold. An exact `.5` rounds upward.
3. A stack starts with `per-unit reference × quantity`. The row-level percentage or fixed adjustment applies to that whole-stack reference, and the result is rounded.
4. Missing market data never silently falls back to another source. The row enters `NeedsPrice` and the UI raises a blocking `Price unknown` alert. The user may refresh, choose another source, or enter a manual value.
5. A confirmed listing failure defaults to Skip and continue. A possibly-submitted/ambiguous result always pauses and is never automatically retried.

The market endpoint documents `missing` as the practical disappearance/sale signal and notes that the game currently does not confirm `sold`. The adapter must preserve whether a comparable was confirmed or inferred; the UI must not overstate inferred samples as confirmed sales.

## Stash

Users may reserve fixed rectangular grid regions. The planner may neither move their contents nor use their cells as temporary or final placement space.

## Gear Search

1. Show `matching listings / locally evaluated candidates`.
2. If only part of the reported result set was retrieved, also show `retrieved / reported total` and an `Incomplete` label.
3. A query may contain multiple specific gear names/families.
4. If an item cannot naturally roll a configured attribute, the rule is false for that item, just like an absent roll. The item may still pass by satisfying K through other rules.

## Languages

English and Simplified Chinese are required. Application UI strings are repository-owned resources. Game entities are localized by canonical DarkerDB IDs, with English fallback when a Chinese value is absent.

## Open implementation policy

The initial minimum usable count is 1. The UI must display both `deals considered / recent window` and `lowest deals used / requested` so the user can distinguish recency from price selection. This is isolated as a policy setting so it can be changed without rewriting pricing logic.
