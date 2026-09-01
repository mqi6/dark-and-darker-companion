# Marketplace item search/filter — research and first-phase design

Status: research and design only  
Date: 2026-09-01  
Implementation baseline: `codex/complete-stash-sort-offline` at `5985770cead27cd569c74cd7e91ae2039999b1e2`  
Report branch: `codex/marketplace-search-filter-analysis`

## 0. Scope and conclusions

This phase covers the companion's read-only Marketplace item search/filter workflow. It does not implement code, resume stash-sort backlog work, or authorize automatic listing.

The verified baseline is 124 commits ahead of `main`. `codex/complete-stash-sort-local` is 39 commits behind it. Other recent-looking operator branches are divergent, not descendants containing the full integrated baseline. Therefore `codex/complete-stash-sort-offline` is the correct source.

The repository already has useful foundations: a DarkerDB client, response schemas and fixtures, canonical-ID localization, Market mapping, bounded page collection, multiple-item-family collection, local K-of-N evaluation, incomplete-result counts, and the agreed pricing functions. It does not yet have a functional Gear Search product. The current Gear Search page is static placeholder content.

Two live API checks expose current correctness defects:

1. The adapter serializes multiple rarities as a comma-separated value. On 2026-09-01, `rarity=rare,epic` returned zero Market rows while either rarity alone returned results. The Market documentation only explicitly defines comma-union behavior for `slot_type`, not `rarity`.
2. The checked-in Price Check schema requires `selection.attributes` to be an array. A current pinned-contract response returned it as an object keyed by attribute slug. Live validation can therefore fail.

A third normalization risk is confirmed: item-detail secondary percentage ranges use raw-looking units (for example 15–30) while Price Check and Market use displayed decimal percentages (for example 1.5–3.0 and an actual roll of 2.4). Range controls must use one explicitly normalized unit.

Engineering-weighted Marketplace search/filter readiness is approximately **30% complete / 70% remaining**. User-visible readiness is lower, approximately **10%**, because the screen has no working controls, query orchestration, or results.

## 1. Evidence and confidence boundary

### 1.1 Primary and authoritative sources

- IRONMACE patch notes confirm Marketplace item-search behavior and recent fixes, including the random-option dropdown, item-name maximum-page calculation, non-tradable listing handling, and changing random-modifier rules: [Hotfix #80](https://darkanddarker.com/news/98), [Early Access Season #6.5](https://darkanddarker.com/news/126), [Early Access Season #8](https://darkanddarker.com/news/168), and [Hotfix #69](https://darkanddarker.com/news/83).
- The pinned game protocol exposes Marketplace filter types `NAME`, `RARITY`, `SLOT`, `TYPE`, `STATIC_ATTRIBUTE`, `RANDOM_ATTRIBUTE`, `PRICE`, and `CLASS`; ascending/descending sort; request `currentPage`; and response `currentPage`/`maxPage`. The protocol also distinguishes total listing price from stack/item counts. See the pinned [MarketPlace.proto](https://github.com/Beelzebub2/DnDTools/blob/dbbb4d3ed547b510b780edcbfd013b91f25c74ee/UI/networking/protos/MarketPlace.proto).
- DarkerDB endpoint behavior comes from its current documentation and live requests against pinned API contract `2026-08-03`: [Items](https://darkerdb.com/documentation/items), [Attributes](https://darkerdb.com/documentation/attributes), [Classes](https://darkerdb.com/documentation/classes), [Market](https://darkerdb.com/documentation/market), [Price Check](https://darkerdb.com/documentation/price-check), [Parameters](https://darkerdb.com/documentation/parameters), [Facets](https://darkerdb.com/documentation/facets), [Pagination](https://darkerdb.com/documentation/pagination), [Localization](https://darkerdb.com/documentation/localization), [Authentication](https://darkerdb.com/documentation/authentication), and [Retention](https://darkerdb.com/documentation/retention).

DarkerDB and DnDTools are community projects, not IRONMACE products. DarkerDB is nevertheless the primary source for its own API contract, and the pinned protobuf is direct extracted build evidence. Neither should be used to invent game UI semantics not present in their data.

### 1.2 Supporting evidence

The community wiki is useful where it mirrors current game data and patch notes. It reports eight rarities, random-modifier restrictions/ranges, a 7-day listing lifetime, and the current Marketplace fee model. These facts should remain versioned because the game can change them: [Enchantments](https://darkanddarker.wiki.spellsandguns.com/Enchantments), [Weapons rarity](https://darkanddarker.wiki.spellsandguns.com/Weapons), and [Merchants/Marketplace](https://darkanddarker.wiki.spellsandguns.com/Merchants).

### 1.3 What is not yet proven

The protocol proves filter categories, paging fields, and sort direction, but not:

- the current fixed number of in-game results per page;
- exact serialized strings for every in-game filter value;
- OR/AND behavior within every in-game dropdown;
- the precise current layout/order of all in-game controls;
- whether every displayed min/max field uses inclusive comparison at the game server;
- current special-case behavior for every artifact, crafted item, socketed item, or non-tradable item.

Those are research/capture questions, not product choices. They should be answered later by a short read-only Marketplace request capture or current-game visual inspection. They do not block the DarkerDB-based companion screen.

## 2. Current game and data behavior

### 2.1 Game Marketplace search model

The pinned build protocol establishes these filter families:

| Game filter | Proven wire enum | Companion interpretation |
| --- | --- | --- |
| Item name | `NAME` | One or more concrete item families/names |
| Quality | `RARITY` | Poor, Common, Uncommon, Rare, Epic, Legendary, Unique, Artifact |
| Equipment position | `SLOT` | Head, chest, hands, legs, foot, back, necklace, ring, sash, primary, secondary, utility, unarmed |
| Item category/type | `TYPE` | Armor, weapon, accessory, utility, misc |
| Fixed/base stat | `STATIC_ATTRIBUTE` | Primary attributes that always occur on the concrete item |
| Random modifier | `RANDOM_ATTRIBUTE` | Secondary/random rolls |
| Price | `PRICE` | Listing price filter/sort input |
| Class | `CLASS` | Usability/class restriction |
| Sort | ascending/descending | Sort field is encoded separately from direction |
| Paging | `currentPage`/`maxPage` | Server-paged results |

IRONMACE's 2025 fixes confirm that item-name and random-attribute selection are separate Marketplace UI concepts and that item-name selection affects maximum page count. The protocol allows repeated strings within one filter record, but it does not alone prove whether every filter uses union or intersection semantics.

### 2.2 Current facets observed on 2026-09-01

DarkerDB's live facet dictionary reported:

- Rarity: Artifact, Common, Epic, Legendary, Poor, Rare, Uncommon, Unique.
- Item type: Accessory, Armor, Misc, Utility, Weapon.
- Slot: Back, Chest, Foot, Hands, Head, Legs, Necklace, Primary, Ring, Sash, Secondary, Unarmed, Utility.
- Armor type: Cloth, Leather, Plate.
- Weapon type: Axe, Bow, Crossbow, Dagger, Firearm, Mace, Magic Stuff, Polearm, Shield, Sword, Throwable Stuff, Unarmed.
- Hand type: One Handed, Two Handed.
- Classes: Barbarian, Bard, Cleric, Druid, Fighter, Ranger, Rogue, Sorcerer, Warlock, Wizard.

Controls must bind to facet values or the canonical catalog, not hard-code this list as an eternal enum.

### 2.3 Random attributes and ranges

Random modifiers are secondary attributes. Their possible set depends on the concrete item. Current game rules also prevent a base primary attribute from appearing again as the same random modifier and prevent duplicate copies of one modifier on the same item. Modifier-family exclusions can further make combinations impossible.

DarkerDB exposes possible-roll data in two places:

- `GET /v2/items/{id}`: primary and secondary attribute ranges for a concrete item;
- `GET /v2/price-checks`: `available_attributes.primary/secondary`, including minimum, maximum, enchanted bounds, percentage formatting, and market-model metadata.

For Marketplace filtering, Price Check's `available_attributes` currently matches Market/display units. Example live evidence for an Epic Arcane Garb:

- Strength range: 1–3;
- Magic Penetration: 1.5–3.0%;
- actual Market roll: 2.4%.

The item-detail endpoint returned Magic Penetration as 15–30. The product must not combine these values without a verified percentage normalization rule. The safe initial source for range UI is the Price Check available-attribute record for the selected concrete item; catalog detail can be normalized and used after fixtures prove equivalence.

### 2.4 Listing, stack, and price behavior relevant to search

DarkerDB Market rows contain:

- `price`: whole-listing price;
- `price_per_unit`: unit price;
- `quantity`: stack count;
- canonical item ID, archetype, rarity, slot/item type, attributes, sockets, loot state, timestamps, and lifecycle flags.

The game protocol's listing request contains `itemCount`, `itemContentsCount`, and one or more item/price records. Search results should therefore display both total and per-unit prices when quantity is greater than one. Sorting must explicitly say “total price” or “unit price.”

Current observed listings expire seven days after creation, matching the community wiki. Listing eligibility can depend on `is_tradable`, loot state, and current game rules. Search is read-only and can show available active listings even when the companion does not yet automate listing.

The preserved automatic-listing pricing rules remain unchanged:

- latest five usable deals;
- select the three lowest unit prices;
- arithmetic mean;
- no automatic fallback when missing;
- stack quantity × unit reference before adjustment;
- half-up whole-gold rounding.

Those rules are not the default ordering algorithm for active search results.

## 3. DarkerDB endpoint and contract analysis

### 3.1 Items

`GET /v2/items` is the current-patch catalog. It supports server filters for archetype, exact name, rarity, item/armor/hand/weapon/slot type, dimensions, prices/scores, class restriction, craft/artifact status, and primary/secondary ranges. Catalog pages use opaque cursors.

`GET /v2/items/{id}` adds detailed primary and secondary possible-roll ranges. Canonical `id.item.*` must be used internally. Raw upstream IDs are compatibility input only.

Important semantics:

- `required_class=a|b` is a union.
- Items with no class gate match every selected class.
- `archetypes=1` collapses rarity variants into families.
- Artifacts stand outside the ordinary rarity ladder; minor artifacts are named Epic items with a passive and require separate artifact metadata.
- Current live cursor envelopes included `total`, although the pagination documentation says cursor mode does not report total. Treat cursor total as optional, not guaranteed.

### 3.2 Attributes and classes

`GET /v2/attributes` supports group, locale, sort, cursor, and limit. Attribute rows include canonical ID, name, description, `is_percentage`, and primary/secondary group. A live pinned request asking for 200 returned an effective limit of 50, 51 secondary attributes total, and a next cursor. The client must follow the returned cursor rather than assume the documented ceiling was honored.

`GET /v2/classes` returns canonical class IDs and localized labels. The current catalog has ten classes.

### 3.3 Market

`GET /v2/market` supports:

- one `item_id` or archetype;
- one rarity value;
- comma-union slot types;
- whole price, unit price, quantity, and timestamps as ranges;
- primary and secondary attribute range filters;
- listing and lifecycle state;
- loot state;
- sort fields `created_at`, `price`, `price_per_unit`, and `id`;
- pages of 1–50, default 25.

Repeated attribute filters are server-side AND. That is compatible with K-of-N only when every pushed rule is logically required. For K < N, pushing all selected attributes would incorrectly remove valid candidates.

Exact item/archetype queries include scan freshness. Empty results are authoritative only when freshness is fresh. A live query on 2026-09-01 returned a stale family scan roughly 95 minutes old; stale is a first-class UI state, not an empty/error equivalent.

The endpoint reports `page`, `num_pages`, `total`, and `next`. Totals above about 50,000 can be estimates. The UI must say “server-reported” rather than imply an audited exact total.

### 3.4 Price Check

`GET /v2/price-checks` values one exact concrete item and supplied rolls against active asks and recent disappearances of the same archetype/rarity. It returns:

- item identity and number of secondary attributes;
- selected primary/secondary rolls;
- available primary/secondary attributes and possible ranges;
- fair/low/high/quick-list and confidence fields;
- active listing and 30-day inferred-sale counts;
- similar sales and listings;
- optional socket upgrade plans.

It is not a bulk search endpoint. Calling it for every search row would exceed the live rate budget. Use it for range metadata when item selection changes and for an explicitly expanded/selected result, not for every retrieved listing.

The current live `selection.attributes` object conflicts with the checked-in array schema and must be fixed before Price Check is used in the screen.

### 3.5 Authentication, rate, version, cache, and retention

- Send the key in `X-API-Key`, never a URL.
- Pin `X-API-Version: 2026-08-03` until an explicit contract-upgrade task updates fixtures.
- Documented scope limits are 300 requests/60 seconds for static data and 60/60 seconds for live data. Current response headers also expose `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-credits-cost`, and `x-credits-remaining`.
- Static catalog responses observed `max-age=300`; Market was private/no-cache; Price Check observed `max-age=15`.
- Static game data is replaced when a patch is imported. Market listing rows are retained indefinitely, while analytics price history is 30 days.
- The response envelope carries API version, game build, patch, request ID, elapsed time, and optional pagination. Preserve these as diagnostics.

## 4. Current implementation inventory

| Area | Status | Evidence | Gap or inconsistency |
| --- | --- | --- | --- |
| Stable product rules | Complete | `AGENTS.md`, `docs/product-decisions.md` | None for this phase |
| Canonical IDs | Complete | `CanonicalId`, catalog merge/mapping | Must remain the only join key |
| English/Chinese game labels | Complete foundation | 2,430 items, 58 older fixture attributes; `zh-Hans` bridge | Catalog now reports 51 secondary attributes plus primary attributes; refresh/version UX missing |
| UI resource parity | Complete foundation | locale key-set test | Search control/result/state strings are missing |
| Price calculation | Complete domain | latest-5/lowest-3, stack math, half-up, no fallback | Search result presentation and reference-detail UI missing |
| Local K-of-N evaluator | Complete core | exact K, min/max, missing/impossible reasons, dedupe tests | No zero-rule pass-through; no UI; candidate metadata is too narrow |
| Missing/impossible semantics | Complete core | rule-level reason preserved | Possible attributes are currently supplied as one shared list, not per concrete item |
| DarkerDB HTTP client | Partial | Items, Attributes, Market, Price Check | No AbortSignal, retry/rate metadata, facets/classes, detail methods, or catalog collectors |
| Market paging | Partial | 50-row cap and max-pages loop | Cap is per family; can explode across many items; no overall request/candidate budget |
| Multiple item names | Partial | sequential `collectMarketItemFamilies` and dedupe IDs | No query planner, concurrency/rate control, family-level errors, or merged freshness |
| Market response schema | Partial | real August fixtures | Missing some current optional fields and live contract drift coverage |
| Price Check schema | Incorrect | requires array at `selection.attributes` | Live response currently uses an object |
| Multi-rarity Market query | Incorrect | `rarities.join(",")` | Live comma rarity query returned zero; split/resolve rarities |
| Slot union | Complete adapter encoding | comma-separated slots | Must validate against facets |
| Class filter | Placeholder model only | `SearchQuery.classIds` | Not used by adapter or pipeline; Market has no class parameter |
| Item category/body type | Missing | no SearchQuery fields/UI | Resolve from Items catalog; Market only has slot, not item type/class |
| Item-name selector | Missing UI | static chips only | Needs canonical multi-select and family/variant resolution |
| Attribute selector/ranges | Missing UI/orchestration | only domain rules exist | Searchable list, per-item possible ranges, percent formatting, remove/edit states |
| Server/local split | Partial concept | Market supports attribute filters; local K exists | No semantics-safe query planner |
| Result counts | Complete domain foundation | matches/evaluated/retrieved/reported | Static UI only; per-family completeness unavailable |
| Freshness | Partial | parsed and stored on Market collection | Not rendered; aggregate drops freshness |
| Results | Missing | no table/cards | Need fields, sorting, paging/load-more, details |
| Loading/empty/error/stale states | Missing | none | Must distinguish all five plus incomplete |
| Cancellation/stale response protection | Missing | none | Required before interactive filters |
| Caching | Missing | pinned fixture only | Runtime catalog/facet/Market/Price Check policies absent |
| Responsive/accessibility | Missing | `body min-width: 920px` | Current shell cannot support narrow widths |
| Gear Search page | Placeholder | hard-coded Ranger/Chest/counts | No live or fixture-driven behavior |

### Incorrect shared possible-roll handling

`filterDarkerDbMarketCollection` accepts one `possibleSecondaryAttributeIds` array and applies it to every listing. That is correct only when every candidate is the same concrete item family/rarity with identical natural rolls. In a mixed-name or mixed-slot result set, possible attributes must be indexed by canonical concrete item ID. Otherwise a roll can be mislabeled naturally impossible or merely missing.

## 5. Proposed user-visible feature list

### 5.1 Primary controls

| Control | Behavior |
| --- | --- |
| Classes | Searchable multi-select. Within the group: OR (“usable by any selected class”). Unrestricted items match. |
| Item category | Multi-select from current facets: armor, weapon, accessory, utility, misc. Within group: OR. |
| Equipment slot | Multi-select from current slot facet. Within group: OR. Label “Equipment slot / 装备栏位”; do not call inventory dimensions “body type.” |
| Advanced type | Contextual armor type, weapon type, and hand type when relevant. Within each group: OR. |
| Rarity/quality | Multi-select of current facet values. Within group: OR. Artifact remains distinct. |
| Item names | Searchable, virtualized canonical-family multi-select. Display localized names; store canonical archetype/family IDs. Multiple selected names are OR. |
| Listing price | Optional min/max and basis selector: total price or unit price. Inclusive bounds. |
| Attribute rules | Add, enable/disable, edit, remove, and reorder rules. Each rule has a searchable attribute selector and optional inclusive min/max. |
| K-of-N | Integer control from 1 to enabled-rule count. Hidden/pass-through when there are no enabled rules. |
| Sort | Total price, unit price, newest listing; ascending/descending. Default unit price ascending, then newest, then listing ID for deterministic ties. |
| Search | Explicitly starts a new server query. Disabled with a clear reason only for invalid ranges/query budget. |
| Apply locally | Appears when edits affect only local rules/sort and the retrieved candidate set is still reusable. No network call. |
| Refresh | Re-runs the same query and replaces the cached live result. |
| Reset all | Clears all groups after one action; no confirmation needed because it is reversible. |

All non-attribute filter groups combine with AND. Within a multi-select group, selections combine with OR. Specific item names are still ANDed with category/slot/class/rarity groups; conflicting selections produce zero resolved concrete items before a Market call and an explanatory empty state.

### 5.2 Attribute semantics

For enabled rules `R1…RN`, a listing passes when at least K rules match.

A rule matches only when:

1. the candidate actually contains that secondary attribute; and
2. its value is within every configured bound.

Out-of-range, absent, and naturally impossible all count as false for that rule. They do not invalidate or skip other rules. A candidate passes if other rules bring the count to K.

The attribute list is naturally scrollable/searchable. When item names/slots are known, annotate or hide attributes impossible for all selected items. Do not prevent a user from retaining a rule that is impossible for only some selected items; its false result is part of K-of-N semantics.

Range input behavior:

- blank min/max means unbounded;
- min and max are inclusive;
- decimals and signed primary values are supported;
- display a `%` suffix for percentage attributes but store normalized numeric values;
- reject NaN and min > max inline;
- show the possible natural range for the active item context;
- if selected items have different ranges, show the union range plus a “varies by item” indicator.

### 5.3 Active-filter summary

Below the filter header, render removable chips grouped by Class, Category, Slot, Rarity, Item, Price, and Attribute. The K chip reads, for example, “2 of 4 attributes.” Removing a chip changes the draft; server-impacting changes require Search, while local-only changes can Apply locally.

Always show a short semantic sentence:

> Classes/items/rarities within each group use OR; groups use AND; at least K attribute rules must match.

### 5.4 Results

Desktop should use a compact table with an expandable details row. Narrow widths should use cards.

Minimum visible fields:

- icon and localized item name;
- rarity and item category/slot;
- class usability;
- quantity;
- total price;
- unit price when quantity > 1;
- matching attribute chips with values;
- `K/N` matched indicator;
- listing age/created time;
- freshness state;
- expand action for all primary/secondary attributes and canonical ID.

Do not expose seller/player identity in the companion.

Count header:

- `M matches / E evaluated`;
- when incomplete: `R retrieved / T server-reported`;
- if reported total is unavailable: `R retrieved / total unavailable`;
- if total may be estimated: label it “server-reported/estimated”;
- per selected item family, an optional diagnostics disclosure lists retrieved, total, completeness, freshness, and errors.

### 5.5 UI states

| State | Required behavior |
| --- | --- |
| Initial | Explain how to choose filters; no fake results/counts |
| Loading first page | Keep filter draft editable; skeleton result rows; Search becomes Cancel |
| Loading more | Keep existing rows; inline progress and Cancel |
| Empty authoritative | “No active listings match” only if the relevant exact-family freshness is fresh or the complete query was retrieved |
| Empty stale | “No retrieved listings; source is stale, so absence is not authoritative” with Refresh |
| Empty local | Explain that server candidates were retrieved but none passed local K-of-N |
| Incomplete | Persistent banner and retrieved/reported counts; never phrase matches as the full market |
| Stale | Show age and last scan completion; results remain usable with warning |
| Rate limited | Show wait duration from headers/Retry-After; preserve draft and prior results |
| Auth/version error | Distinct configuration/contract message; never render as empty |
| Partial family error | Show successful families plus a partial-error banner and per-family diagnostics |
| Fatal error | Preserve prior successful results as stale-on-screen if available; provide Retry |
| Cancelled/superseded | Silent transition to the newer query; cancelled results never commit to UI |

## 6. Data and API mapping

| Feature/filter | Source | Server or local | Normalization | Failure/fallback | Limitation |
| --- | --- | --- | --- | --- | --- |
| Item display name | Items in `en` and `zh-Hans` | Local display | Join by canonical ID; app locale `zh-CN` maps to API `zh-Hans` | English, then canonical ID | Never join by name |
| Item family/name selector | Items `archetypes=1` or complete pinned catalog | Local selection | Family/archetype ID to concrete rarity IDs | Disable missing catalog row with diagnostic | Items name filter is not multi-value |
| Rarity | Facet + item concrete ID + Market `rarity` | Server when one value/query; local verification | Facet slug | Split multiple rarities; never comma-join | Market comma rarity is not union |
| Item category | Items `item_type` | Catalog server, listing local | Facet slug | Unknown category retained as diagnostic | Market lacks `item_type` filter |
| Equipment slot | Items/Market `slot_type` | Server | Validated facet values; comma union | 400 is query error | Unknown slots are rejected |
| Armor/weapon/hand type | Items catalog | Catalog server, listing local | Facet slug | Missing means not applicable | Not available as Market filters |
| Class | Items `required_class`; Classes endpoint | Catalog server, listing local | class slug ↔ canonical `id.class.*` | Unrestricted item matches | Market lacks class filter |
| Dimensions | Items width/height | Local metadata | Positive integers | Not relevant to search row if absent | Useful for stash, not a market constraint |
| Natural possible attributes | Price Check available attributes or normalized item detail | Local | canonical `id.attribute.*`; percent unit normalization | Unknown means “possibility unknown,” not impossible | Must be per concrete item ID |
| Attribute labels | Attributes endpoint | Local display | canonical ID; percent flag | English/canonical ID | Live effective page limit may be 50 |
| Attribute min/max search | Market `secondary[slug]` | Server only when logically mandatory; otherwise local | inclusive range syntax; normalized units | Local K-of-N remains authoritative | Multiple server attributes AND |
| K-of-N | Companion evaluator | Local | rule IDs stable; dedupe by listing ID | No enabled rules = pass-through | API has no K operator |
| Active listing state | Market `listing_state=active` | Server | fixed for this workflow | Error is not empty | Search and listing automation remain separate |
| Total/unit price | Market price fields | Server range + local display | quantity > 0; unit/total labeled | Invalid rows rejected by schema | Total may be estimated on huge queries |
| Quantity/stack | Market `quantity` | Server/local | positive integer | Reject malformed row | Non-stack items normally quantity 1 |
| Result sort | Market sort plus local stable merge | Both | append `id` tie-break; stable comparator | Deterministic local fallback | Merging query families requires re-sort |
| Paging/counts | Market pagination | Server/bounded local | retrieved raw, evaluated deduped, reported optional | Incomplete stays visible | >50k totals may be estimates |
| Freshness | Market pagination freshness | Server metadata/UI | age seconds and timestamps | Stale warning; no empty certainty | Only exact item/archetype queries guarantee family freshness |
| Price Check detail | Price Check | On-demand | selection object/array compatibility; range units | No automatic valuation fallback | Live scope 60/min; not per row |
| Recent-sale reference | Market missing records or Price Check similar sales | Local pricing | unit price; confirmation preserved | Price unknown | Missing is inferred, not game-confirmed |
| API version | Header/envelope | Adapter | pin dated contract | Block incompatible contract | Contract still needs live fixtures |
| Rate budget | Response headers | Adapter/orchestrator | remaining/limit/credits | bounded wait/retry | Current client discards headers |

## 7. UI/design requirements

### 7.1 Layout

Desktop (`>= 1100px`):

- top status strip remains;
- page header with Search, Refresh, Reset, and count/completeness;
- left filter column, 320–380px, sticky within the workspace;
- right results area with active-filter summary and table;
- Activity panel remains global.

Tablet (`700–1099px`):

- filters in a dismissible side sheet;
- active chips and counts remain above results;
- table drops lower-priority columns into expansion.

Phone/narrow window (`< 700px`):

- no current `min-width: 920px`;
- full-screen filter sheet;
- result cards;
- sticky bottom Apply/Search bar that does not cover content.

### 7.2 Multi-selects

Use an accessible combobox + listbox pattern:

- typing filters localized display names and canonical aliases;
- selected options remain visible as chips;
- “select all visible” applies only to current filtered options and states its scope;
- virtualize long item/attribute lists;
- preserve selection while changing language because identity is canonical;
- show option metadata such as category, slot, possible rarity, or percent unit;
- keyboard support: arrows, Enter, Escape, Backspace chip removal.

### 7.3 Attribute rule editor

Each rule is a row/card:

- enable checkbox;
- searchable attribute combobox;
- min input;
- max input;
- unit/percentage indicator;
- possible-range hint;
- remove button with accessible name.

K-of-N belongs above the rule list and updates its valid bounds as rules are enabled/disabled. Duplicate attributes should be prevented or merged; two rules for the same attribute would be misleading because one item cannot roll the same modifier twice.

### 7.4 Editing and reset behavior

- Filter controls edit a draft.
- Server-impacting draft changes display “Search to apply.”
- K/min/max/local sort changes may display “Apply locally” if the cached superset is valid.
- Removing a server chip invalidates neither current results nor prior query; it creates a draft until Search.
- Reset all returns to a safe initial query and clears results only after the user starts the reset query.
- Browser/window focus changes do not trigger requests.

### 7.5 Accessibility

- Visible labels for every control; placeholders are not labels.
- Programmatic grouping with `fieldset`/`legend` or equivalent.
- `aria-live=polite` for counts, load completion, incomplete/stale notices.
- Errors linked to their inputs.
- Color is not the only rarity/freshness/error signal.
- Minimum 44px primary touch targets.
- Focus returns to the triggering control when sheets/dialogs close.
- Result expansion and chip removal are keyboard operable.
- English and Chinese layouts must tolerate longer/denser strings without truncating identity.

## 8. Technical design

### 8.1 Normalized query model

Replace the unused narrow `SearchQuery` with a versioned immutable specification containing:

- canonical class IDs;
- canonical item-family IDs;
- category/slot/armor/weapon/hand facet slugs;
- rarities;
- total or unit price range;
- attribute rules and K;
- active-only listing state;
- sort;
- retrieval budget;
- locale for display only.

Build a canonical query fingerprint from sorted IDs/slugs and normalized ranges. Locale must not change identity filters, but it can be part of the presentation-cache key.

### 8.2 Catalog resolution

At startup or first Gear Search:

1. load cached facets, Classes, Attributes, and Items catalogs;
2. validate API version, build, patch, canonical IDs, duplicates, and pagination completion;
3. fetch `en` and `zh-Hans`, then join by ID;
4. index concrete items by family/archetype, rarity, class, type, and slot;
5. index possible attributes/ranges by concrete item ID;
6. mark the catalog stale when build/patch differs, but retain the previous validated catalog until replacement completes.

Specific item selection stores a family ID. Rarity selection resolves it to concrete variant IDs. This prevents display-name joins and avoids ambiguous same-name variants.

### 8.3 Query planning and server/local split

Planning order:

1. Validate ranges and K.
2. Resolve catalog filters (class/category/type/name/rarity/slot) to an allowed concrete-item set.
3. If the set is empty, return a local authoritative empty result without a Market request.
4. Choose the smallest safe Market family:
   - exact concrete `item_id` when names are selected;
   - otherwise one query per selected rarity, using comma-union slots;
   - never comma-union rarities.
5. Push price and active-state filters.
6. Push all secondary rules only when K equals N. For K < N, do not push an attribute that is not logically mandatory.
7. Execute within one overall request/page/candidate budget.
8. Merge, dedupe by listing ID, re-check catalog constraints locally, then run local K-of-N.
9. Stable-sort merged results and publish counts/completeness.

Do not generate every K-combination of N attributes as separate Market queries in v1. That creates combinatorial request fan-out and complicates completeness.

### 8.4 Bounded pagination

Replace the current “20 pages per item” default with one overall search budget. Recommended starting default:

- 50 rows per Market page;
- maximum 20 live requests per user search;
- maximum 1,000 retrieved rows across all families;
- fair round-robin paging across families so the first large family cannot consume the whole budget;
- stop when every family completes, the user cancels, rate budget blocks, or either cap is reached.

Record per-family and aggregate `retrieved`, `reportedTotal`, `complete`, `freshness`, pages, and error. Aggregate completeness is true only if every planned family completed.

### 8.5 Local pipeline

Pure deterministic stages:

1. schema validation;
2. listing-ID dedupe;
3. canonical item metadata join;
4. category/class/type/rarity/slot verification;
5. normalized price/quantity validation;
6. per-item possible-attribute lookup;
7. K-of-N evaluation with exact reason per rule;
8. deterministic sort;
9. count/completeness aggregation;
10. localized view-model mapping.

`evaluatedCount` is deduped candidates that reached rule evaluation. `retrievedCount` is raw successfully parsed rows before dedupe. `matchCount` is passing deduped candidates.

### 8.6 Cache policy

- Facets/classes/attributes/items: persistent patch/version-keyed cache; revalidate after five minutes or build/patch change.
- Market pages: memory cache for 15 seconds by canonical query/page; stale-while-refresh only when clearly labeled.
- Price Check: memory cache for 15 seconds by concrete item + normalized rolls + locale.
- Local filter results: memory cache by candidate-set fingerprint + rule fingerprint.
- Never cache auth errors as empty data.
- Do not persist seller identity or the API key.

### 8.7 Cancellation and stale-request protection

Every client method accepts `AbortSignal`. The orchestrator assigns a monotonic request generation and canonical fingerprint. Only the latest generation may publish results. Starting a new Search cancels all pages and Price Check metadata loads from the old generation. Local filtering runs against an immutable candidate snapshot.

Idempotent read requests may honor `Retry-After` once for transient 429/5xx errors within the user-visible search task. Listing submission retry rules are unrelated and remain unchanged.

### 8.8 Localization

- UI resources: `en-US` and `zh-CN` with equal-key CI gate.
- DarkerDB locales: `en` and `zh-Hans`.
- Canonical IDs and facet slugs are storage/query identity.
- Localized names/labels are presentation and search aliases only.
- Missing Chinese falls back to English; missing both displays canonical ID.
- Language switching re-renders current results without re-querying Market.

### 8.9 Deterministic ordering

Request server sort with an explicit ID tie-break where supported. After merging families, apply the equivalent local comparator:

1. selected price basis/direction;
2. created time descending;
3. canonical item ID ascending;
4. numeric/string listing ID ascending.

Do not rely on arrival order or JavaScript object iteration for final ordering.

## 9. Tests and fixtures

### 9.1 Contract tests

- current Items list/detail, Attributes, Classes, Facets, Market, and Price Check sanitized fixtures;
- Price Check `selection.attributes` object and backward-compatible array if the pinned contract can produce both;
- percentage range normalization between item detail, Price Check, and Market;
- rarity comma regression: planner must split rarities;
- Market slot comma union;
- cursor response with optional total and an effective limit lower than requested;
- freshness fresh/stale/missing;
- 401/403/429/5xx distinct from empty;
- API version/build/patch and rate headers.

### 9.2 Query-planner tests

- multi-name × multi-rarity resolution to concrete IDs;
- class union with unrestricted items;
- AND across groups, OR within groups;
- K=N pushes all rules;
- K<N pushes no non-mandatory rule;
- no combinatorial fan-out;
- empty catalog resolution makes no Market call;
- overall budget round-robin fairness;
- per-family partial errors and aggregate completeness;
- duplicate listing across families is evaluated once.

### 9.3 Local-filter tests

Retain existing boundaries and add:

- zero enabled rules pass-through;
- exact min/max inclusivity;
- decimal percentages;
- signed primary values where displayed;
- per-item naturally impossible lookup;
- mixed item families with different possible rolls;
- missing possibility metadata distinguished from naturally impossible;
- disabled rules and duplicate-rule prevention;
- stable ordering independent of response arrival;
- retrieved/evaluated/matched count definitions.

### 9.4 UI tests

- every control is labeled and keyboard operable;
- localized multi-select identity survives language switch;
- Search versus Apply locally state;
- initial/loading/load-more/empty/incomplete/stale/rate/auth/partial/fatal states;
- count announcements;
- result table/card breakpoints;
- filter-sheet focus management;
- reset/remove/edit behavior;
- no hard-coded placeholder results.

Fixtures must be sanitized, version/build/patch stamped, and contain no key, request ID, or player identity.

## 10. Genuine product decisions for review

These require the user's decision; the remaining uncertainties are research or implementation questions.

1. **Multi-class meaning.** Recommended: “usable by any selected class” (OR), matching DarkerDB's class-union behavior and unrestricted-item inclusion. Alternative: require usability by every selected class.
2. **Item-name granularity.** Recommended: users select a family name such as Arcane Garb; rarity remains a separate filter that resolves concrete IDs. Alternative: expose every rarity variant as a separate name option.
3. **Default retrieval budget.** Recommended: 20 requests / 1,000 retrieved listings overall, with “Load more” consuming another explicit bounded batch. A larger default increases latency and can exhaust the 60/min live scope.
4. **Price Check density in results.** Recommended: show active total/unit prices for every row, but fetch valuation/recent comparables only when a user expands one row. Alternative: prefetch Price Check for the first few matches at significant request cost.
5. **Default price sort.** Recommended: unit price ascending, then newest, then listing ID. Alternative: total price ascending, which is simpler but mixes stack quantities.
6. **Server-impacting edits.** Recommended: explicit Search; only K/range/local-sort refinements use Apply locally. Alternative: debounce every edit into live requests, which is less predictable under the rate cap.

### Questions that do not require a product decision

Answer through code/live evidence instead:

- actual in-game fixed page size;
- exact current game filter string serialization and per-filter OR/AND behavior;
- current sort-field codes in the game request;
- current Price Check object/array compatibility;
- percentage normalization scale across endpoints;
- whether cursor totals and advertised limits remain stable;
- exact current listability behavior for every special item.

## 11. Recommended implementation phases and acceptance criteria

### Phase M1 — current contracts and catalog

Work:

- add Facets and Classes adapters;
- validate full Items/Attributes catalog and item detail;
- fix Price Check schema drift;
- add rate/version/build/patch headers;
- normalize percentage ranges;
- refresh bilingual catalog.

Acceptance:

- live sanitized fixtures from build `0.17.151.9472`, patch 132 pass;
- no key/player identity in fixtures;
- comma rarity regression fails before/fixes after;
- every UI option comes from canonical catalog/facets;
- English/Chinese key and canonical-ID coverage gates pass.

### Phase M2 — normalized search/query planner

Work:

- new SearchSpec;
- catalog resolver;
- semantics-safe server/local planner;
- overall budget and round-robin pagination;
- cancellation, rate handling, caching, deterministic merge.

Acceptance:

- AND/OR/K semantics pass pure tests;
- multi-name/multi-rarity produces correct split requests;
- K<N never becomes server AND;
- superseded requests cannot publish;
- counts and per-family completeness are exact by defined terms.

### Phase M3 — filter UI

Work:

- responsive filter layout;
- canonical searchable multi-selects;
- attribute rule editor and K control;
- draft/Search/Apply locally/Reset behavior;
- active chips and accessibility.

Acceptance:

- all controls keyboard accessible in both languages;
- language switch preserves selections;
- no hard-coded Marketplace choices/results;
- invalid ranges cannot issue a request;
- narrow layout works without horizontal shell overflow.

### Phase M4 — results and state UX

Work:

- table/cards and expandable details;
- counts/completeness/freshness;
- loading, empty, stale, incomplete, rate, auth, partial, fatal states;
- on-demand Price Check detail.

Acceptance:

- every state has fixture-driven UI coverage;
- stale empty never claims authoritative absence;
- incomplete always shows retrieved/reported;
- merged order is deterministic;
- stack rows label total and unit price.

### Phase M5 — live read-only acceptance

Work:

- run representative DarkerDB searches;
- optional short passive Marketplace request capture to answer game UI/page-code questions;
- no listing submission.

Acceptance:

- one single-name/multi-rarity query;
- one multi-name query;
- one class/category/slot query;
- one K=N and one K<N attribute query;
- one stale and one intentionally incomplete case;
- observed UI counts match adapter diagnostics;
- no game input or listing automation is added.

Automatic listing remains a later, separate phase requiring its existing human checkpoints.

## 12. Completion estimate

| Subsystem | Current readiness | Remaining |
| --- | ---: | ---: |
| Product rules and semantics | 85% | 15% |
| Canonical bilingual catalog | 70% | 30% |
| DarkerDB static adapters | 45% | 55% |
| Market/Price Check contracts | 45% | 55% |
| Query planning/pagination/cancellation/cache | 20% | 80% |
| Local K-of-N core | 80% | 20% |
| Search controls | 5% | 95% |
| Results and state UX | 5% | 95% |
| Accessibility/responsive behavior | 5% | 95% |
| Live read-only acceptance | 15% | 85% |

Overall engineering-weighted estimate: **about 30% exists and 70% remains**.

The existing 30% is meaningful foundation, not a usable feature. The largest remaining work is not the predicate itself; it is current API-contract repair, canonical query planning, bounded multi-family retrieval, cancellation/cache/rate behavior, and the complete bilingual UI/state surface.
