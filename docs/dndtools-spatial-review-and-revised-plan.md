# DnDTools Spatial Model Review and Revised Development Plan

Status: cloud source review complete against `Beelzebub2/DnDTools` commit
`dbbb4d3ed547b510b780edcbfd013b91f25c74ee` and accepted private NET-000 replay
for game build `0.17.151.9472`.

This document supersedes the assumption that NET-001 through NET-007 must be
recorded in sequence. Those recordings are now optional diagnostic fallbacks.
The next required human checkpoint is a read-only visual mapping confirmation;
it does not require packet capture or rearranging items.

## 1. Executive decision

Use DnDTools as evidence for the packet fields and as a hypothesis for spatial
derivation, but do not copy its runtime assumptions without validation.

The accepted NET-000 capture already covers four storage containers, 384 stash
items, 112 distinct item designs, multiple footprints, stacks, and rolled gear.
When the pinned DnDTools item catalog and its row-major slot calculation are
applied to that snapshot, all storage items fit a 12 by 20 grid with no overlap
or out-of-bounds placement. This makes the old synthetic live-capture matrix
redundant.

Continue offline with catalog and spatial-model implementation. Stop only for
the small visual checkpoint in section 8, then retain ACT-001 and marketplace
recordings for behaviors that NET-000 cannot establish.

## 2. Provenance table

| Value | Actual source in DnDTools | Confidence and companion policy |
| --- | --- | --- |
| Item design ID, quantity, inventory ID, slot ID, properties, tradability | `SItem` fields in `_Item.proto` | Wire-proven. Decode directly and preserve the game ID. |
| Inventory type numbers | `Define_Item.InventoryId` in `_Defins.proto` | Schema-proven for the pinned build. Generate or pin an enum; do not reproduce DnDTools's incomplete handwritten enum. |
| Full inventory/storage lists | `S2C_LOBBY_CHARACTER_INFO_RES`, `S2C_INVENTORY_INFO_RES`, `S2C_STORAGE_INFO_RES` | Wire-proven message shapes. Runtime semantics still depend on result codes and ordering. |
| Move, merge, split, swap requests | `Inventory.proto` request fields | Schema-proven shapes. Actual post-state confirmation still requires ACT-001. |
| Grid coordinate | `x = slotId % gridWidth`, `y = floor(slotId / gridWidth)` in `storage.py` and `stash_preview.py` | DnDTools derivation, not a wire field. Strongly supported by NET-000 consistency; one visual orientation check remains. |
| Storage grid size | Hardcoded `12 x 20` in `storage.py` and `stash_preview.py` | DnDTools assumption. Strongly supported by NET-000, including valid slot 239; keep versioned and fail closed for unknown inventory types. |
| Bag grid size | Hardcoded `10 x 5` | DnDTools assumption, not validated by NET-000 because inventory 3 is equipment. Do not claim live bag geometry yet. |
| Equipment layout | Protobuf equipment slot enum plus DnDTools `equipment_slots.json` | Slot identity is schema-proven; screen layout is a UI asset/assumption. Keep equipment separate from rectangular stash planning. |
| Item width, height, rarity, maximum stack and slot type | DnDTools `UI/assets/items.json`, generated from DarkerDB `/v2/items` | External catalog data, not packets. Sync into a versioned product-data catalog and never silently default a missing footprint to 1x1. |
| Visible stash-tab order | DnDTools default mapping plus a user-editable `stashTabMapping` setting | Not protocol-proven. Must be calibrated per current account/UI; never infer from enum order. |
| Grid-to-screen pixel coordinates | DnDTools 1920x1080 baseline, resolution scaling, manual overrides and calibration | UI calibration only. Treat separately from logical grid coordinates. |
| Move success | DnDTools considers a pixel change at either source or destination sufficient | Too weak for this companion. Require protocol identity/post-state confirmation; pixel evidence is secondary. |

## 3. Important upstream inconsistencies

Do not port these behaviors unchanged:

1. DnDTools's handwritten `StashType` names 20 as seasonal and 30 as shared,
   while its pinned `_Defins.proto` defines 20 and 21 as shared stashes and 30
   as seasonal. NET-000 contains all of 20, 21 and 30.
2. Its default tab mapping omits inventory ID 21 even though the pinned schema
   and NET-000 both contain it.
3. Unknown item metadata defaults to footprint 1x1, rarity Common and stack size
   1. These fallbacks can create a dangerous sort plan. The companion must block
   spatial planning for unknown metadata.
4. Items without a slot are assigned slot zero for previews. The companion must
   keep `slotId` unknown and issue a diagnostic instead.
5. DnDTools mutates its in-memory grid before normal-UI movement and its pixel
   verifier accepts a change at either endpoint. The companion must not regard
   that as authoritative success.
6. DnDTools tells the user to refresh/recapture after sorting. It does not prove
   a complete protocol delta reducer or item-identity move confirmation.

## 4. NET-000 spatial cross-check

The following was computed privately from the accepted sanitized snapshot and
the pinned DnDTools `items.json`. No personal layout is committed.

- Pinned DnDTools catalog: 2,430 item records.
- Observed NET-000 designs: 112 distinct IDs; 112 matched exactly after removing
  the protocol `DesignDataItem:Id_Item_` prefix.
- Observed footprint classes:
  - 74 designs at 1x1;
  - 13 at 1x2;
  - 3 at 1x3;
  - 1 at 1x4;
  - 16 at 2x2;
  - 4 at 2x3;
  - 1 at 3x2.
- Storage 4: 35 items, maximum slot ID 138, zero overlaps/out-of-bounds.
- Storage 20: 122 items, maximum slot ID 239, zero overlaps/out-of-bounds.
- Storage 21: 130 items, maximum slot ID 203, zero overlaps/out-of-bounds.
- Storage 30: 97 items, maximum slot ID 239, zero overlaps/out-of-bounds.
- All observed quantities are within the catalog maximum stack size.

This is strong evidence for a 12-column row-major logical grid. It is not proof
of visible tab ordering, screen pixel coordinates, or the direction in which
the game renders increasing row and column indices. Those are the only spatial
facts left for the next visual checkpoint.

## 5. Revised development sequence

### P4A - versioned gameplay metadata catalog

1. Extend the DarkerDB item contract and persisted catalog with:
   - `inventory_width` and `inventory_height`;
   - `max_stack_size`;
   - rarity;
   - slot/item/armor/weapon type where present;
   - patch, API version, generated timestamp and source hash.
2. Fetch English and Simplified Chinese labels by canonical DarkerDB ID and join
   them to the same metadata record.
3. Continue to bridge protocol game IDs to DarkerDB IDs explicitly. Preserve
   both IDs and surface unknown mappings.
4. Validate positive integer dimensions and stack limits. Unknown or malformed
   metadata produces `spatial-metadata-unavailable`; it never receives a 1x1
   fallback.
5. Keep network-dependent refresh in a tool. Runtime reads a pinned validated
   catalog and reports staleness/version instead of silently changing data.

Gate P4A: all 112 NET-000 designs resolve to valid dimensions and stack limits;
malformed/missing records fail closed in tests.

### P4B - logical inventory geometry

1. Generate or pin the schema inventory-ID enum for build `0.17.151.9472`.
2. Model container geometry separately from visible UI tabs:
   - storage-like IDs observed in NET-000: 4, 20, 21, 30 -> 12 by 20;
   - equipment ID 3 -> named equipment slots, not a rectangular stash;
   - bag ID 2 -> pending live/product-data evidence before automation.
3. Implement a pure row-major conversion:
   - `x = slotId % columns`;
   - `y = floor(slotId / columns)`.
4. Enrich protocol items with footprints only after the canonical reducer has
   accepted the packet state.
5. Reject unknown geometry, missing slots, out-of-bounds footprints and overlap.
   Diagnostics must include container ID and deterministic item alias, never raw
   unique IDs.

Gate P4B: private NET-000 replay produces the aggregate results in section 4 and
the committed synthetic suite covers every boundary/error case.

### P4C - tab identity and visual orientation

1. Introduce an explicit `VisibleStashTabMapping` separate from protocol
   inventory IDs.
2. Do not seed it from DnDTools's default order.
3. Let the operator identify each visible page once by matching a few existing
   read-only content anchors. Persist the mapping with game build and account-
   local profile, without account identifiers in shared fixtures.
4. Confirm top-left origin, x direction and y direction from the existing page;
   no item movement or packet recording is required.

Gate P4C: the operator confirms mappings for the storage IDs currently present
and the rendered logical preview matches the visible orientation.

### P4D - snapshot/UI integration

1. Expose per-container metadata status, grid dimensions and occupancy.
2. Render a logical stash preview from the protocol snapshot and product-data
   catalog, independent of screen coordinates.
3. Show blocking diagnostics for missing catalog rows, unknown geometry or
   invalid overlap; never offer Sort when blocked.
4. Keep localization a display-only enrichment.

Gate P4D: a fixture-backed read-only preview renders all NET-000 footprint
classes and reserved regions without needing the game.

### P5 - delta and action correlation

1. Finish reducers for inventory/storage full-update and single-update messages.
2. Decode outbound move/merge/split/swap requests and correlate them with inbound
   responses and a newer post-state.
3. Keep deterministic aliases stable across a session so a moved item can be
   identified at its destination.
4. Treat empty response messages as acknowledgements only, not proof of success.
5. Require the expected item identity and quantity at the expected destination.

Gate P5: synthetic action cases pass before one manual ACT-001 recording. ACT-001
replaces the old NET-001 through NET-007 capture sequence as the next required
network recording.

### P6 - screen calibration and supervised sorting

1. Calibrate the foreground game window, stash origin, cell pitch and visible tab
   centers. DnDTools's 1920x1080 values may be offered only as initial hints.
2. Save calibration by resolution/window mode and invalidate it when the window
   geometry changes.
3. Before each move, require matching protocol pre-state and visible page/tab.
4. After each move, require protocol post-state; use small pixel-region changes
   only as secondary evidence.
5. Keep dry-run as default, exclusive execution lease, cancellation, reserved
   regions and bounded retry policy. Ambiguous movement stops.

Gate P6: one explicitly approved supervised move succeeds. No automated listing
is authorized by this gate.

### P7 - marketplace flow

Keep MKT-001 for read-only navigation/message discovery and MKT-002 for one
explicitly approved manual listing. The listing queue remains blocked until the
request/response and post-state semantics are established. The first automated
listing remains a separate human checkpoint.

## 6. Revised evidence matrix

| Evidence | Status | Action |
| --- | --- | --- |
| NET-000 full stash baseline | Complete | Reuse privately. |
| NET-001 empty page | Cancel as mandatory | Use only if an empty-container reducer bug appears. |
| NET-002 1x1 item | Cancel as mandatory | Covered by 74 observed designs plus catalog validation. |
| NET-003 stacks | Cancel as mandatory | Covered by NET-000 quantities and max-stack cross-check. |
| NET-004 multi-cell no-roll | Cancel as mandatory | Covered by NET-000 and product metadata. |
| NET-005 rolled gear | Cancel as mandatory | Covered by 113 observed secondary properties. |
| NET-006 mixed page | Cancel | NET-000 is substantially richer. |
| NET-007 fragmentation/reserved rectangle | Synthetic only | Reserved regions are companion metadata, not a game protocol fact. |
| VIS-001 tab/orientation confirmation | Required next | Read-only visual check; no packet capture. |
| ACT-001 manual move | Required later | Smallest recording that proves transition semantics. |
| MKT-001 My Listings navigation | Required later | Discovers marketplace read flow. |
| MKT-002 manual listing | Explicit approval later | Proves the state-changing listing flow. |

## 7. Test plan

Add tests for:

1. metadata schema, provenance, duplicate IDs and catalog staleness;
2. all observed footprint classes and stack limits;
3. missing metadata failing closed;
4. inventory enum values including 20, 21 and 30;
5. row-major slot boundaries: 0, 11, 12, 239 and invalid 240;
6. overlap and out-of-bounds rejection;
7. equipment slots never entering rectangular stash planning;
8. tab mapping remaining independent of inventory enum order;
9. full replacement versus version-pinned delta application;
10. move acknowledgement without post-state remaining ambiguous;
11. bilingual labels not participating in identity or placement;
12. private NET-000 aggregate geometry replay with no reconstructable fixture.

Every implementation change must pass `npm run typecheck`, `npm test`,
`npm run build` and `git diff --check`.

## 8. Next human checkpoint: VIS-001

No packet capture, tooltip capture, item rearrangement or PowerShell command is
needed.

Cloud Codex has four private page signatures derived from NET-000. The operator
opens Stash and reports the visible top-to-bottom tab/page order by matching:

- the sparse page with a healing-potion stack near the top and two 2x2 scrap
  stacks farther down;
- the page whose top row is filled with lockpick stacks;
- the materials/gems page whose top row includes perfect gems, arcane essence
  and a 100-count silver-coin stack;
- the dense currency page beginning with a 3x2 Gold Coin Chest and multiple coin
  bags.

For each page, the operator confirms only:

1. its visible tab position from top to bottom;
2. whether the described top-row/anchor pattern matches;
3. whether the game grid visibly has 12 columns with top-left origin and rows
   increasing downward.

If the patterns match, no NET-001 through NET-007 recording is needed. If one
does not match, stop and diagnose the smallest mismatch before any item movement.

