# DarkerDB spatial metadata recovery

EXC-001 and the private REF-004 replay identified 11 affected item instances across six game design IDs. Bounded live DarkerDB lookups used API version `2026-08-03`, with credentials supplied only through the `X-API-Key` header. Sanitized evidence contains no request headers, cookies, rate-limit metadata, account data, or private inventory positions.

Exact lookups using the original normalization candidates returned no rows. Exact name-and-rarity queries returned one row per design, and subsequent canonical detail lookups confirmed positive inventory width, height, and stack limits for every row. All six canonical IDs were already present in the pinned DnDTools-derived gameplay catalog with matching spatial metadata. The defect was therefore raw game-design-ID normalization, not missing gameplay data.

The bridge now contains explicit mappings for three additional Potion of Water Breathing rarities, Tome of Sheol, Seal of Dominion, and Fangs of Death Necklace. The existing fourth potion rarity exception remains. These are exact ID joins; display names are not used at runtime.

The existing unknown-item behavior remains intentionally strict. A future item absent from the catalog receives no default footprint, its page is excluded from sorting, other valid pages remain independently eligible, and an exception page is selected only on demand. An unsupported item is never represented as 1×1.

After the mapping repair, the existing private REF-004 capture replays with two complete fresh states, zero spatial diagnostics, and zero blocked containers. All ten containers pass footprint, bounds, stack, overlap, identity, and freshness validation. This offline repair does not authorize any item move or game automation.
