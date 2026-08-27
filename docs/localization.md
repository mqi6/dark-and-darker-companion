# Localization and Translation Data

## Application UI

The repository owns `en-US` and `zh-CN` resource dictionaries. Components reference stable keys. CI checks that the key sets remain equal.

## Game data

DarkerDB is the primary source. Its API documentation states that localized fields accept `?locale=<code>`, default to English, return the game's own strings, and fall back to English when a translation is missing. Items, Attributes, Price Check, and Market endpoints expose the locale parameter.

The sync flow is:

1. Fetch English catalog records.
2. Fetch the same resources using the verified Simplified Chinese locale code.
3. Join by canonical IDs such as `id.item.*` and `id.attribute.*`.
4. Store `{ id, en, zhCN, zhStatus, patch }`.
5. Fall back to English at display time when `zhCN` is missing/equal to the English fallback.
6. Export missing-ID diagnostics for later review.

Never join by translated name. DarkerDB documents that punctuation may be returned verbatim and should not be rewritten for identity matching.

## Human-in-the-loop verification still required

- Obtain a DarkerDB API key with data/live scopes required by the product.
- Confirm the accepted Simplified Chinese locale code; `zh-CN` is only the initial configured candidate.
- Capture paired item and attribute responses and measure Chinese coverage.
- Decide whether missing translations should remain English permanently or enter a reviewed local override table.

## Sources

- https://darkerdb.com/documentation/localization
- https://darkerdb.com/documentation/items
- https://darkerdb.com/documentation/attributes
- https://darkerdb.com/documentation/market
- https://darkerdb.com/documentation/price-check
