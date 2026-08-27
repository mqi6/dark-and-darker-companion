# Localization and Translation Data

## Application UI

The repository owns `en-US` and `zh-CN` resource dictionaries. Components reference stable keys. CI checks that the key sets remain equal.

## Game data

DarkerDB is the primary source. Its API documentation states that localized fields accept `?locale=<code>`, default to English, return the game's own strings, and fall back to English when a translation is missing. Items, Attributes, Price Check, and Market endpoints expose the locale parameter.

The verified Simplified Chinese locale in the 2026-08-27 catalog is `zh-Hans`. The application locale remains `zh-CN`; canonical IDs bridge the API data to the UI without using display names as keys.

The sync flow is:

1. Fetch English catalog records.
2. Fetch the same resources using the verified Simplified Chinese locale code.
3. Join by canonical IDs such as `id.item.*` and `id.attribute.*`.
4. Store `{ id, en, zhCN, zhStatus, patch }`.
5. Fall back to English at display time when `zhCN` is missing/equal to the English fallback.
6. Export missing-ID diagnostics for later review.

Never join by translated name. DarkerDB documents that punctuation may be returned verbatim and should not be rewritten for identity matching.

## Verified catalog fixture

- `fixtures/darkerdb/localization/catalog.json` contains 2,430 items and 58 attributes.
- 2,422 item names and 56 attribute names have Simplified Chinese translations.
- Eight item IDs and two attribute IDs have neither an English nor Chinese name and are explicitly marked `missing`.
- Missing display text renders its canonical ID rather than a blank label.

Raw Market and Price Check record shapes are validated by the sanitized fixtures in `fixtures/darkerdb/live-samples`. Their English canonical IDs join to this catalog; the application does not treat API display names as identifiers.

## Sources

- https://darkerdb.com/documentation/localization
- https://darkerdb.com/documentation/items
- https://darkerdb.com/documentation/attributes
- https://darkerdb.com/documentation/market
- https://darkerdb.com/documentation/price-check
