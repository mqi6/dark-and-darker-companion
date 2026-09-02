# Development Progress

## Marketplace M6 result-card and saved-filter checkpoint — 2026-09-02

- Clarified percentage input units at the point of entry. Percentage rules use the same displayed decimal-percent unit as normalized Market and Price Check data: a visible `2.2%` is entered as `2.2`, not `22`; each percentage rule shows this example beside its inclusive min/max controls.
- Added versioned, device-local named filter sets for the complete Marketplace draft: identity, equipment, rarity, price, attribute ranges, and K. Stored selections retain canonical IDs rather than localized labels. Save, load, and delete are local-only actions and never call DarkerDB.
- Replaced the dense result listing table with expandable cards. A collapsed card emphasizes localized item name, rarity, and random rolls in large type; expansion reveals quantity, unit and total prices, canonical item ID, all reported attributes, match count, and the copyable manual in-game search summary.
- Added a result-only item-family checkbox bar for multi-name searches. Each requested family shows its current matched count, all families start selected, and Select all/Clear all or individual toggles only change visible cards without querying DarkerDB or changing the evaluated result counts.
- Added English/Simplified Chinese parity, responsive layouts, persistence and result-filter tests. Full regression verification now covers 75 test files and 394 tests.

Next checkpoint: live user review of percentage entry, saved filter persistence after restarting the operator, multi-family result toggles, and collapsed/expanded cards. No stash-sort, Electron, automatic buying, or live listing work was added.

## Marketplace M5 live-runtime checkpoint — 2026-09-01

- Added a localhost read-only Marketplace operator. The Node process owns `DARKERDB_API_KEY`, the pinned DarkerDB client, catalog cache, query coordinator, and cancellation; the browser receives no key and can call only same-origin catalog/search/refresh/cancel endpoints.
- Added live bilingual catalog collection for Items, Attributes, Classes, and localized Facets. All English/Simplified Chinese joins use canonical IDs. Current live catalog startup resolved 2,430 variants, 796 item families, 10 classes, and 58 attributes.
- Corrected live contract drift discovered during this checkpoint: cursor envelopes may return null `page`/`num_pages`; one attribute currently omits name/description; untranslated item rows may omit name. These now preserve canonical identity and use display fallbacks instead of rejecting the whole catalog.
- Bound filter values to the current Facets keys (`item_rarity`, `item.item_type`, `item.slot_type`, armor/weapon/hand variants). DarkerDB currently returns English Facet labels even for `zh-Hans`, so known values receive a display-only Chinese mapping and unknown future values fall back to English.
- Added bounded, cached item-detail enrichment for searches with roll rules and at most 24 concrete variants. Broad searches do not fan out item-detail calls; missing possible-roll metadata retains the existing non-match semantics.
- Added renderer runtime discovery, live catalog loading/error/retry states, accurate top-bar DarkerDB connection state, and explicit refusal to silently replace a failed live connection with preview data. Ordinary Vite browser development remains clearly labeled preview-only.
- Refreshed all three sanitized live response fixtures. The current DarkerDB service reported `v1.0.0-rc.37`; the sampled Market family was stale, which exercises the existing stale-result UI rather than being represented as authoritative absence.
- Completed live read-only scenarios through the production controller: single family with two rarities, two names, class/category/slot local narrowing, K=N pushdown, K<N local matching, bounded incomplete counts, cache reuse, and stale freshness. No game process, game input, buying, listing automation, or per-row Price Check was used.
- Added catalog builder/cache, HTTP runtime, localhost origin/security, fallback, and runtime-selection tests. See `docs/marketplace-live-operator.zh-CN.md` for the runbook and observed counts.

Next checkpoint: user UI review of the live localhost workflow and any resulting polish. Marketplace logic is otherwise ready to freeze before D1/S0 Stash operator integration and the later Electron host.

## Marketplace M4 results and runtime checkpoint — 2026-09-01

- Connected the M3 filter draft to the M2 canonical query planner, bounded executor, cache, cancellation coordinator, and deterministic local evaluator through a renderer-safe injected runtime interface. The browser shell uses a clearly labeled sanitized preview Market source; live DarkerDB wiring remains the separate M5 checkpoint.
- Added an immutable evaluated-candidate snapshot, including prior K-of-N non-matches, so compatible K<N rule/range changes can be recomputed locally without another request. Local apply is disabled whenever the draft would change the server candidate query, including mandatory K=N attribute pushdown.
- Added explicit first Search, Refresh, Cancel, and Load more behavior. Refresh clears the 15-second page cache before replaying the last committed query; Load more expands the retrieved-row ceiling by another 1,000 (up to 5,000), reuses cached earlier pages, consumes a fresh bounded live-request budget, and reapplies any compatible local rules.
- Added desktop table and narrow-window card presentation with canonical item identity, localized family/rarity/attribute labels, K/N match explanation, quantity, unit price, total price, expandable raw listing attributes, and a copyable manual in-game search summary. No result row or expansion calls Price Check, controls the game Marketplace, or offers Buy.
- Added exact counts for matched/evaluated and complete/incomplete retrieved/server-reported totals, snapshot time, live/cache request counts, freshness age, and per-family retrieval diagnostics.
- Added distinct initial, first-loading skeleton, refresh/loading-more, catalog-authoritative-empty, complete fresh empty, local-filter empty, stale empty, incomplete, stale, rate-limit, authentication, partial-family, fatal-with-preserved-results, cancelled, and superseded behavior. Errors are never rendered as an empty market.
- Added English/Simplified Chinese parity and responsive result styling. Switching language re-renders canonical catalog labels without a Market request.
- Added UI/runtime/domain tests for explicit-request boundaries, cache-bypassing Refresh, immutable local re-filtering, unsafe local-apply rejection, Load more budget expansion and rule replay, cancellation, counts, empty-state authority, stale/auth/rate/partial/fatal states, unit/total stack price display, and manual-summary copy.

Next product phase: Marketplace M5 live read-only verification with the real bilingual catalog and runtime-injected API key. Stash integration, Electron, game Marketplace input, purchasing, Price Check-per-row, and automatic listing remain out of scope until Marketplace M5 is complete.

## Marketplace M3 filter UI checkpoint — 2026-09-01

- Replaced the Marketplace placeholder chips and fake `37/284/612` counts with a full catalog-driven filter workspace. The reusable panel accepts canonical catalog options; it does not hard-code filter values into JSX or join localized display names.
- Added searchable, scrollable multi-select groups for item families, classes, rarity, category, slot, armor type, weapon type, and hand type. Multiple item names are retained as canonical family IDs; group semantics remain AND between groups and OR within a group.
- Added unit-price/whole-stack price basis with optional inclusive minimum and maximum, immediate finite/nonnegative/range validation, and a removable visible price chip.
- Added a searchable naturally scrollable attribute catalog, per-rule inclusive min/max editors, possible-range and percentage hints, remove controls, zero-rule pass-through, and bounded K-of-N editing.
- Added draft summary chips, one-filter removal, Clear all, Reset draft, explicit Search, Refresh last submitted search, and Apply locally. Editing, removing, resetting, language changes, and focus do not invoke any request callback; Refresh replays the last committed identity filters while using the current display locale.
- Added English/Simplified Chinese parity for every new control, status, validation message, matching explanation, and action. Catalog option search accepts both English and Chinese aliases regardless of current UI language.
- Added desktop, tablet, and narrow-window layouts with a sticky explicit-action bar, standard checkbox/select/input/button semantics, visible focus states, field errors, disabled-state boundaries, and no dependency on custom arrow-key tab navigation.
- Added a clearly labeled sanitized preview catalog for browser UI testing. It is not represented as complete/current DarkerDB data and produces no fake Marketplace result rows or counts.
- Verification includes dedicated UI tests for no-request edits, canonical multi-name output, invalid-range blocking, K-of-N construction, last-query Refresh, local-only Apply, active-chip removal, bilingual alias search, removable price summary, and language switching.

Next product phase at this checkpoint was Marketplace M4 result/state UI and runtime wiring, followed by M5 read-only live verification. Stash, Electron, game Marketplace input, buying, and automatic listing remained out of scope.

## Marketplace M2 query planner and local pipeline checkpoint — 2026-09-01

- Replaced the narrow unused search model with a versioned, Zod-validated Marketplace SearchSpec covering canonical class/family selections, category/slot/armor/weapon/hand filters, rarity, unit/total price ranges, active state, deterministic sort, explicit budget, locale, and K-of-N roll rules.
- Added canonical catalog resolution with group-AND/group-OR semantics and unrestricted-class matching. Selected item families resolve to exact concrete item IDs; broad multi-rarity searches use one safe query family per rarity; an empty catalog resolution makes no Market request and never broadens silently.
- Added conservative API pushdown: active state, slot union, price, unit-price ordering, and only mandatory bounded secondary rules when K=N. K<N remains local and does not generate combinatorial query fan-out.
- Added one global default budget of 20 live requests and 1,000 raw rows, fair round-robin pagination across request families, listing-ID deduplication, precise retrieved/evaluated/matched counts, per-family totals/completeness/freshness/errors, and aggregate server-reported total only when every family reports one.
- Added per-concrete-item possible-roll lookup, zero-rule pass-through, missing/naturally-impossible false semantics, local price/active/catalog rechecks, and stable unit-price/created-time/listing-ID ordering.
- Added a 15-second in-memory Market-page cache, AbortSignal propagation, immediate stop on 429/auth failures, and a monotonic generation coordinator that prevents an older request from publishing over a newer explicit Search.
- Expanded the typed Items contract and added Marketplace catalog normalization for canonical family IDs, class restrictions, item/category/type fields, and normalized item-detail possible attributes. Missing family identity is omitted with a diagnostic rather than guessed from display names or suffixes.
- Verification at this checkpoint covers SearchSpec normalization/validation, class union, family/rarity resolution, safe pushdown, K-of-N, impossible rolls, deterministic ordering, request and row caps, round-robin fairness, dedupe/counts, partial failures, rate limits, authoritative empty, cache reuse, request supersession, and catalog normalization.

Next product phase: Marketplace M3 filter UI, followed immediately by M4 result/state UI and M5 read-only live verification. Stash operator integration and Electron remain after Marketplace M5; no game Marketplace input, buying, per-row Price Check, stash-sort TODO, or live listing automation was added in M2.

## Marketplace M1 API contract checkpoint — 2026-09-01

- Added typed DarkerDB contracts and client methods for Facets, Classes, Attributes, and concrete item detail while retaining unknown upstream columns through passthrough validation.
- Repaired the current Price Check contract drift: `selection.attributes` now accepts both the earlier array representation and the current attribute-keyed numeric object.
- Removed the incorrect multi-rarity Market encoding. A direct Market request accepts exactly one rarity; multi-rarity family collection deterministically splits and deduplicates the selected rarities into separate requests. Slot unions remain comma encoded because that behavior is documented separately.
- Added reusable bounded cursor collection that follows the response's opaque `pagination.next`, detects repeated cursors, reports an intentional page cap as incomplete, and does not assume the requested page size was honored.
- Exposed pinned contract version, service version, game build, patch, request ID, elapsed time, timestamp, rate-limit/credit fields, and Retry-After as runtime diagnostics. HTTP failures retain those diagnostics instead of becoming empty results.
- Added AbortSignal support to every DarkerDB client method and both page collectors. Request-generation/stale-result guards remain M2 orchestration work.
- Added explicit item-detail percentage normalization into the same displayed units used by Market and Price Check, plus a five-minute in-memory catalog cache isolated by contract version, patch, locale, and resource.
- Updated localization sync to consume the validated typed Attributes contract. All joins remain canonical-ID based; no localized name is used as an identity key.
- Verification: strict typecheck, sanitized fixture validation, full test suite, and production build pass at this checkpoint.

Next product phase: Marketplace M2 SearchSpec/query planner, overall 20-request/1,000-row budget, round-robin retrieval, per-family completeness, local K-of-N pipeline, runtime cache orchestration, and stale-response generation guards. No game Marketplace input, purchasing, stash-sort TODO, Price Check result-row calls, or live listing automation was added in M1.

## Three-workflow shell P0 — 2026-09-01

- Replaced the former four-item primary navigation with exactly three product workflows: Stash, Marketplace Search, and Auto Listing.
- Moved Settings out of primary navigation into a global right-side drawer; language switching remains available in English and Simplified Chinese.
- Kept all three workflow panels mounted while switching tabs, so page draft/input state is preserved instead of being destroyed on navigation.
- Added ARIA tab/list/panel relationships, roving keyboard focus with Arrow/Home/End, global-settings focus containment and restoration, and a persistent collapsible Activity region.
- Extended the shared status surface with character and snapshot placeholders plus a disabled-state Emergency stop control. No game-changing task is authorized or connected by this shell work.
- Removed the shell's fixed 920px minimum width and added tablet/narrow-window behavior for the top bar, tabs, workspace, settings drawer, forms, and Activity.
- Replaced hard-coded shell/search placeholder text with parity-tested `en-US` / `zh-CN` resources.
- Verification: strict typecheck passed; 61 test files / 320 tests passed; production Vite build passed.

Next product phase: Marketplace M1 contract/catalog repair. No Marketplace query, game input, purchasing, stash-sort TODO, or live listing automation was added in P0.

## Completed offline foundation

- Three-workflow React shell with global Settings plus persistent status and Activity regions.
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

The baseline reducer preserves inventory/storage ownership, slot IDs, stacks, properties, tradability, and permitted-area values. A deeper pinned DnDTools review established that footprints come from DarkerDB item metadata, while 12x20 storage geometry and row-major slot conversion are upstream derivations rather than wire fields. Applying those inputs privately to NET-000 matched all 112 observed designs and placed all 384 storage items with zero overlap or out-of-bounds results. Implementation now follows the fail-closed provenance and validation plan in `docs/dndtools-spatial-review-and-revised-plan.md`. VIS-001 confirmed visible tab order and orientation for the current character; mappings remain character-local and are invalidated when the page set changes.

## Offline spatial implementation

- Added a validated gameplay metadata catalog for DarkerDB dimensions, maximum stack, rarity and item classifications, with API version, timestamp and deterministic source hash.
- Added a paginated `gameplay:sync` tool. It requires `DARKERDB_API_KEY`, never writes the key, and pins the existing API version.
- Added a token-free reproducible import path for the pinned DnDTools asset. The committed catalog contains 2,428 spatial item records and explicitly omits the two non-spatial unarmed records; provenance pins repository commit `dbbb4d3ed547b510b780edcbfd013b91f25c74ee`, source blob `f2c1f0da0e68b50aeaed0b02e6a22fe21af70c53`, and the source-content SHA-256.
- Added fail-closed spatial projection for storage inventories 4-9, 20, 21 and 30 using a 12x20 top-left row-major grid. Equipment remains non-rectangular and bag geometry remains unverified.
- Missing ID mappings, missing metadata, invalid stacks, invalid slots, out-of-bounds footprints and overlaps block the affected container.
- Added a character/build/page-set scoped stash-tab mapping; the VIS-001 mapping is test evidence, not a global default.
- Added a logical 240-cell stash preview and all seven NET-000 footprint classes to the offline UI fixture. The preview is independent of screen coordinates.
- Added strict move correlation: an acknowledgement alone is ambiguous; confirmation requires one matching request and a newer protocol state showing the same deterministic alias at the intended destination.

## Automated verification

- TypeScript strict type checking.
- Synthetic fixture validation.
- CI-verified passing tests across pricing, search, reserved regions, task state, adapters, localization, live DarkerDB contracts/mappings, Windows baseline validation, snapshots, and UI shell.
- Successful production renderer build.

## Current external checkpoint

DarkerDB checkpoints 001 and 002, all four NET-000 protocol gates, VIS-001, REFRESH-001, and spatial metadata recovery are complete. ACT-001 proved one outbound move request but remained ambiguous because it lacked complete pre/post state. REF-004 established same-character reselection as the reliable complete-state refresh.

A sanitized cross-capture audit compared NET-000, ACT-001, and REF-004. Build compatibility, wall-clock order, both complete states, both spatial gates, and exactly one ACT request passed, but the request identity was present in neither comparison state. The result is `insufficient / identity-missing` and cannot replace same-capture confirmation.

The MOVE-002 offline gate enforces ordered markers, exactly one request inside the action window, a complete pre-state after READY, and a complete post-refresh state after ACTION_END. The next checkpoint remains the single human-performed MOVE-002 recording documented in `docs/move002-human-checkpoint.md`. It does not authorize Codex-generated game input, automatic sorting, or marketplace activity.

## Later local-game blockers

No game-side validation has been claimed yet. Visual design in Figma also remains blocked until the Figma MCP quota resets or the plan is upgraded; no substitute design has been represented as a Figma artifact.
