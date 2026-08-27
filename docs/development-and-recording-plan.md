# Protocol-First Development and Recording Plan

Status: proposed local-game plan after reviewing `Beelzebub2/DnDTools` at commit `dbbb4d3ed547b510b780edcbfd013b91f25c74ee` (2026-08-24).

This plan replaces a screenshot-only interpretation of CAP-001 through CAP-010. Network evidence is the primary runtime input. Screenshots and short videos are retained only as human-readable ground truth for placement, tooltip text, normal-UI coordinates, and visible confirmation.

## 1. What DnDTools establishes

DnDTools is not reading a WebSocket. Its current implementation:

1. Uses `pyshark`, which launches Wireshark's `tshark`/`dumpcap` helpers.
2. Captures inbound TCP whose server source port is in `20200-20300`.
3. Keeps TCP framing state separately for each `tcp.stream` and uses TCP sequence numbers to handle overlap, retransmission, and out-of-order delivery.
4. Reads an 8-byte little-endian application header:
   - bytes 0-3: total frame length (`uint32`)
   - bytes 4-5: packet command (`uint16`)
   - bytes 6-7: padding (`uint16`, currently accepted as `0` or `256`)
5. Decodes bytes after the header with generated Protobuf message classes selected by `PacketCommand`.
6. Extracts `.proto` schemas from `DungeonCrawler.exe` with an external `protodump.exe`, then generates Python bindings with `protoc.exe`.
7. Builds stash state primarily from `S2C_LOBBY_CHARACTER_INFO_RES`, whose character payload includes inventory and storage data.

Relevant upstream references:

- [DnDTools README and capture boundary](https://github.com/Beelzebub2/DnDTools/blob/dbbb4d3ed547b510b780edcbfd013b91f25c74ee/README.md)
- [Wireshark capture and TCP payload ingestion](https://github.com/Beelzebub2/DnDTools/blob/dbbb4d3ed547b510b780edcbfd013b91f25c74ee/UI/src/models/capture.py#L714-L778)
- [TCP reassembly and 8-byte frame parser](https://github.com/Beelzebub2/DnDTools/blob/dbbb4d3ed547b510b780edcbfd013b91f25c74ee/UI/src/models/packet_buffers.py#L160-L472)
- [Protobuf extraction workflow](https://github.com/Beelzebub2/DnDTools/blob/dbbb4d3ed547b510b780edcbfd013b91f25c74ee/UI/networking/extract.bat)
- [Inventory and storage schemas](https://github.com/Beelzebub2/DnDTools/blob/dbbb4d3ed547b510b780edcbfd013b91f25c74ee/UI/networking/protos/Inventory.proto)
- [Marketplace request/response schemas](https://github.com/Beelzebub2/DnDTools/blob/dbbb4d3ed547b510b780edcbfd013b91f25c74ee/UI/networking/protos/MarketPlace.proto)
- [MIT license](https://github.com/Beelzebub2/DnDTools/blob/dbbb4d3ed547b510b780edcbfd013b91f25c74ee/LICENSE)

### Differences required for this companion

DnDTools's current display filter is inbound-only. That is enough for reading character snapshots, but not enough to correlate a user action with both its client request and server response. Our recorder must capture both directions on the target port range. It must still be passive: it must not inject into the game, read process memory, modify files, bypass anti-cheat, or generate game input.

DnDTools's MIT license permits reuse if its copyright and permission notice are retained in copies or substantial portions. Before copying implementation code, add the upstream notice to `THIRD_PARTY_NOTICES.md`. Prefer an independently tested TypeScript framing implementation using the documented behavior and upstream fixtures rather than copying the complete Python application.

## 2. Target architecture

```text
Local packet source
  -> TCP segment normalizer
  -> per-direction stream reassembler
  -> 8-byte frame decoder
  -> PacketCommand/Protobuf decoder
  -> allowlisted event sanitizer
  -> snapshot and action reducers
  -> CaptureAdapter
```

Keep these responsibilities separate:

- `PacketSourceAdapter`: supplies timestamped TCP payload segments from live `tshark` or a replay file.
- `StreamReassembler`: handles streams, TCP sequence ordering, overlap, gaps, memory limits, and resynchronization.
- `FrameDecoder`: validates `<IHH>` headers and emits exact application frames.
- `ProtocolDecoder`: maps command IDs to generated Protobuf messages and version metadata.
- `EventSanitizer`: removes account IDs, character names, IP addresses, chat, friend data, and raw unique IDs before a fixture can be committed.
- `GameStateReducer`: converts decoded storage/inventory messages into versioned companion snapshots.
- `ActionCorrelator`: groups a marked manual action with its outbound request, inbound response, subsequent state delta, and visible evidence.
- `GameInteractionAdapter`: remains separate and dry-run by default. Recording traffic does not authorize automated input.

## 3. Storage and privacy rules

Raw captures are sensitive and local-only. They can contain identifiers that are not visible on screen.

```text
fixtures-private/game/<session-id>/       # gitignored; never uploaded by default
  capture.pcapng
  recorder.log
  operator-timeline.ndjson
  decoder-full.ndjson

fixtures/game/<sample-id>/                # sanitized and reviewable
  manifest.json
  events.sanitized.json
  expected-snapshot.json                  # state samples
  expected-action.json                    # transition samples
  overview.png                            # only when visually useful
  tooltip.png                             # only when rolls/text matter
  before.png / after.png                  # action confirmation only
```

Rules:

1. Never commit `.pcap`, `.pcapng`, full decoder output, IP addresses, account IDs, character names, chat, friends, or Steam overlays.
2. Replace game item unique IDs with deterministic per-session aliases such as `item-001` only after decoding.
3. Keep canonical design IDs, inventory IDs, slot IDs, stack counts, properties, command IDs, prices, result codes, timestamps relative to the session, and direction.
4. Generate replayable binary tests from sanitized Protobuf values rather than publishing raw captured payloads.
5. Local Codex must show the sanitized diff and fixture file list before committing.

## 4. Development sequence

Each phase has a gate. Do not advance when the gate fails.

### Phase 0 — source and policy baseline

1. Pin the reviewed DnDTools commit and record its MIT license.
2. Record the installed game executable hash/version using `collect-windows-baseline.ps1`; launch the game through Steam, never by invoking the EXE directly.
3. Confirm the current game rules permit the proposed passive capture on the user's own machine/account.
4. Install Wireshark with its normal capture driver on the Windows game machine if `tshark.exe` is absent.
5. Run `tshark -D` and let the user choose the adapter that carries game traffic. Do not guess when multiple active adapters exist.

Gate P0: `tshark` runs, the selected adapter is explicit, and BUILD-001 exists.

### Phase 1 — recorder shell

1. Add a Windows PowerShell recorder command that:
   - creates a unique private session directory;
   - records both TCP directions for port range `20200-20300` into `capture.pcapng`;
   - writes the game build, interface, local IP hash, recorder version, start/end UTC, and operator notes to a private manifest;
   - supports a fixed time limit and clean Ctrl+C shutdown;
   - never launches or controls the game.
2. Add operator markers: `READY`, `ACTION_START`, `ACTION_END`, and `STOP`. Each marker writes UTC and monotonic time to `operator-timeline.ndjson`.
3. Add cleanup that terminates only the exact `tshark` process started by this recorder.
4. Add `.gitignore` coverage for the private directory and raw capture extensions.

Gate P1: a 60-second non-game capture starts/stops cleanly and no raw capture appears in `git status`.

### Phase 2 — TCP and application framing replay

1. Implement per-stream, per-direction reassembly.
2. Handle split headers, split payloads, multiple frames per segment, retransmissions, overlap, out-of-order packets, sequence wrap, invalid headers, resynchronization, idle streams, and bounded memory.
3. Validate header length from 8 bytes through the configured maximum, command membership, and allowed padding.
4. Port or independently reproduce the upstream reassembly test cases.
5. Add fuzz/property tests asserting that malformed bytes never allocate unbounded memory or crash the recorder.

Gate P2: deterministic unit tests pass for every case above.

### Phase 3 — versioned Protobuf decoder

1. Start with the DnDTools schemas pinned to their recorded game build; do not pretend they match a different build.
2. Generate TypeScript bindings in a reproducible build step or decode through a small isolated Python helper initially. Keep the app-facing event schema language-neutral.
3. Map `PacketCommand` values to message types.
4. Prioritize these messages:
   - `S2C_LOBBY_CHARACTER_INFO_RES`
   - `S2C_INVENTORY_INFO_RES`
   - `S2C_INVENTORY_ALL_UPDATE_RES`
   - `S2C_INVENTORY_SINGLE_UPDATE_RES`
   - `S2C_STORAGE_INFO_RES`
   - inventory move/merge/swap/split request and response pairs
   - `C2S_MARKETPLACE_ENTER_REQ` / `S2C_MARKETPLACE_ENTER_RES`
   - `C2S_MARKETPLACE_MY_ITEM_LIST_REQ` / `S2C_MARKETPLACE_MY_ITEM_LIST_RES`
   - `C2S_MARKETPLACE_ITEM_REGISTER_REQ` / `S2C_MARKETPLACE_ITEM_REGISTER_RES`
   - `S2C_MARKETPLACE_ITEM_HAS_SOLD_NOT`
5. Add an `unknown-command` event and preserve only a bounded hex preview locally; never fail the whole session because one command is unknown.
6. If the local game hash differs from the checked-in schema provenance, stop after the smoke test. Refresh schemas only after reviewing the external extractor and its license; do not upload the game executable.

Gate P3: sanitized generated messages round-trip through encode/decode, and schema provenance matches the live build or the mismatch is explicitly recorded as a blocker.

### Phase 4 — snapshot reducer

1. Normalize character, inventory, storage page, item position, footprint, stack quantity, rarity, tradability, and roll properties by canonical IDs.
2. Treat the full character response as a replaceable baseline snapshot.
3. Apply inventory/storage updates as deltas only when their expected previous snapshot is present.
4. Increment snapshot version monotonically and hash canonical content.
5. Reject overlapping items, out-of-bounds footprints, duplicated unique aliases, impossible stack counts, and deltas against the wrong snapshot.
6. Join bilingual display data from the validated English/Chinese catalog only after canonical state is built.

Gate P4: every sanitized state recording replays to the documented expected snapshot.

### Phase 5 — manual action correlation

1. Correlate the operator marker window with outbound request, inbound response, and resulting state delta.
2. A move is confirmed only when the target item alias leaves the source and appears at the destination in a newer snapshot.
3. A listing is confirmed only when the register response is successful and a newer My Listings/state response identifies the expected item, quantity, and price. A visible UI success screenshot is secondary evidence.
4. A confirmed failure is `failed` and follows the product's Skip rule.
5. Missing response, conflicting state, timeout, duplicate candidate request, or unclear visible result is `ambiguous`; pause and never retry automatically.

Gate P5: ACT-001 and MKT-002 below replay deterministically without automated input.

### Phase 6 — desktop integration

1. Implement a Windows host behind `CaptureAdapter`.
2. Surface capture health: adapter, last packet time, parsed/unknown counts, schema build, dropped/gap count, and privacy mode.
3. Keep capture off by default until the user enables it.
4. Keep all game-changing operations dry-run.
5. Use screenshots only to calibrate window/grid coordinates and visible confirmation detectors.

Gate P6: live read-only stash state matches the manually inspected screen for all required samples.

### Phase 7 — supervised normal-UI execution

1. Add coordinate calibration using the approved visual samples.
2. Execute only through normal foreground mouse/keyboard UI, under one interaction lease.
3. Require the user to start the task while the correct page is visible.
4. Validate pre-state from protocol plus screen evidence before each action.
5. Validate post-state from protocol plus visible evidence after each action.
6. Stop before the first real automated listing and request a separate human acceptance run.

Gate P7: one supervised move succeeds; the first automated listing remains a human checkpoint.

## 5. Recording protocol

For every sample, distinguish setup from recording:

1. **Setup, recorder off:** the user manually arranges the named items at the exact coordinates.
2. **Start:** local Codex starts the recorder and reports the private session directory and capture PID.
3. **Ready:** the user returns to the game, reaches the stated start screen, then returns briefly to the terminal and marks `READY`.
4. **Trigger:** the user performs only the listed manual trigger. For a state sample, this is usually switching away and back or reopening Stash so the game sends a fresh response.
5. **Mark:** the user marks `ACTION_START` immediately before and `ACTION_END` immediately after a transition. State-only samples need only `READY` and `STOP`.
6. **Evidence:** the user takes only the screenshots named by the sample.
7. **Stop:** local Codex stops capture, decodes the marker window, reports target message counts, and leaves raw files private.
8. **Review:** local Codex creates sanitized events and expected state/action files, inspects screenshots, validates redaction, runs tests, and shows the diff before commit.

If the terminal cannot receive a marker while the game is foregrounded, use timestamps from a short recording and add markers immediately before and after the action. Sub-second precision is useful but not required when only one action occurs in the window.

## 6. Exact recording matrix

Coordinates use the top-left stash cell as `(0,0)`, x increasing right and y increasing down. Use one disposable test page called `stash-test-page` throughout. Do not buy items solely to satisfy a sample; record substitutions in the manifest.

### NET-000 — transport smoke

- Setup: launch through Steam; remain at character selection.
- Record: start capture, select one character, open Stash, wait 10 seconds, stop.
- Required network evidence: at least one valid framed packet and preferably `S2C_LOBBY_CHARACTER_INFO_RES`.
- Visual evidence: one redacted full-window `overview.png` showing the open stash.
- Purpose: determine adapter, port range, framing, schema compatibility, and whether opening Stash produces a full snapshot on this build.
- Stop condition: if no target traffic or all target messages fail to decode, do not collect the rest of the matrix.

### NET-001 — empty page

- Setup: move all items off `stash-test-page` before capture.
- Placement: none.
- Trigger: switch to another stash page and back to `stash-test-page`, or close/reopen Stash if page switching emits no snapshot.
- Required expected state: selected storage page contains zero items.
- Visual evidence: `overview.png`, no tooltip.

### NET-002 — one 1x1 quantity-one item

- Setup: place one 1x1 stackable item with quantity `1` at `(0,0)`.
- Trigger: refresh the page state as established by NET-000.
- Required expected state: exact canonical item ID, quantity `1`, slot/coordinate `(0,0)`, footprint `1x1`.
- Visual evidence: `overview.png` and `tooltip.png`.

### NET-003 — partial and full stacks

- Setup: same canonical stackable item twice; partial stack at `(0,0)`, full stack at `(2,0)`, `(1,0)` empty.
- Trigger: refresh page state.
- Required expected state: two distinct item aliases, exact partial/full quantities, both positions.
- Visual evidence: `overview.png`, `tooltip-partial.png`, and `tooltip-full.png`.

### NET-004 — multi-cell gear without random rolls

- Setup: one item larger than `1x1` at `(0,0)` whose tooltip has no random secondary-roll section.
- Trigger: refresh page state.
- Required expected state: canonical ID, exact width/height, rarity, position, empty secondary-roll list.
- Visual evidence: `overview.png` and full `tooltip.png`.

### NET-005 — rolled gear

- Setup: one gear item with at least two random secondary rolls at `(0,0)`.
- Trigger: refresh page state.
- Required expected state: canonical ID, rarity, position, every property canonical ID/value in packet order and normalized order.
- Visual evidence: `overview.png` and full `tooltip.png`.

### NET-006 — mixed realistic page

- Required placement:
  - 1x1 stack at `(0,0)`;
  - second stack at `(2,0)`;
  - multi-cell no-roll item at `(0,2)`;
  - rolled gear at `(4,2)`;
  - at least 16 more owned items from row 6 downward, left-to-right without overlap.
- If an item cannot fit at a prescribed coordinate, use the next free coordinate and record it before capture.
- Trigger: refresh page state.
- Required expected state: at least 20 items spanning available categories, rarities, footprints, and stack counts.
- Visual evidence: `overview.png` plus representative stack/no-roll/rolled tooltips.

### NET-007 — fragmented page and reserved rectangle

- Setup: approximately 85% occupied, with at least three separated holes. Define the companion reserved rectangle as `x=0, y=0, width=3, height=2`; this rectangle is metadata and is not expected to appear in game.
- Placement: at least one item completely inside the rectangle and at least two outside it.
- Trigger: refresh page state.
- Required expected state: exact occupied cells, intentional hole coordinates, occupancy estimate, reserved-region metadata.
- Visual evidence: `overview.png` only.

### ACT-001 — one manual move

- Setup: one 1x1 item at `(0,0)` and empty destination `(3,0)`.
- Start state: Stash open with the test page selected.
- Mark `ACTION_START`.
- User action: manually drag exactly once from `(0,0)` to `(3,0)` through the normal game UI.
- Mark `ACTION_END` after the item is visibly placed.
- Required network evidence: relevant outbound move request if available, inbound response, and/or a newer state delta showing the same aliased item at `(3,0)`.
- Visual evidence: `before.png`, `after.png`; short `manual-drag.mp4` only if the delta is unclear.
- No Codex-generated mouse or keyboard input.

### MKT-001 — navigation and My Listings read

- Setup: start in Stash; do not select or list an item.
- Mark `ACTION_START`.
- User actions: click `Trade` -> `Market Place` -> `My Listings`.
- Mark `ACTION_END` once My Listings is stable.
- Required network evidence: marketplace enter and My Listings request/response pairs when emitted by this build.
- Visual evidence: one redacted `my-listings.png`.
- Purpose: validate navigation timing and the read-only listing state without changing game state.

### MKT-002 — one manual listing

This is the revised CAP-010. It is state-changing and remains optional until the user explicitly approves the item and price.

- Setup: choose one cheap disposable quantity-one item with no random secondary rolls. Record its canonical item ID, aliased unique ID, inventory/storage position, intended quantity, price, and visible fee.
- Start screen: `Stash` tab with the target item visible.
- Start capture, mark `READY`, then mark `ACTION_START`.
- User actions, exactly once:
  1. click `Trade`;
  2. click `Market Place`;
  3. click `My Listings`;
  4. left-click the item to sell;
  5. click the value field;
  6. enter the approved value;
  7. save `before-submit.png`;
  8. click `Create Listing` once;
  9. wait for a visible result without retrying;
  10. save `after-success.png` or `after-ambiguous.png`;
  11. mark `ACTION_END` and stop capture.
- Required network evidence:
  - one outbound `C2S_MARKETPLACE_ITEM_REGISTER_REQ` matching item, quantity, and entered price;
  - one inbound `S2C_MARKETPLACE_ITEM_REGISTER_RES` result;
  - preferably a subsequent My Listings response containing the new listing.
- Confirmation:
  - `succeeded`: successful register response plus expected listing/state evidence;
  - `failed`: explicit failure result; queue behavior is Skip;
  - `ambiguous`: missing/duplicate/conflicting evidence or only a UI transition; pause and do not retry.
- The user performs every click and keystroke in this recording. Local Codex only records, marks, decodes, and validates.

## 7. Local Codex operating handoff

Use this prompt on the Windows game machine after the recorder work from Phases 1-3 is present:

```text
Read AGENTS.md and docs/development-and-recording-plan.md completely.
Work in English. Do not launch DungeonCrawler.exe directly; I will launch Dark and Darker through Steam.
Do not inject into the game, read process memory, modify game files, bypass anti-cheat, or generate game input.
Use only the repository's passive tshark recorder. Raw PCAP and full decoder output must remain under the gitignored fixtures-private directory.

First run the Phase 0/1 checks and show me the available tshark interfaces. Ask me to select the active game adapter if it is ambiguous. Then guide me through NET-000 only. You start and stop the recorder; I will select the character and open Stash manually. Decode and report target packet counts, schema provenance, framing errors, and whether S2C_LOBBY_CHARACTER_INFO_RES or another storage message produced a valid snapshot.

Do not proceed to NET-001 until NET-000 passes. When it passes, guide me through one sample at a time. Before each sample, print the exact setup and coordinates, wait for me to confirm setup, then record only the documented trigger/action. Sanitize identifiers, inspect visual redaction, validate fixtures, and show the git diff before committing. Never commit raw captures.

Stop for human input only at: interface selection; game-rule confirmation; item substitutions; any schema mismatch that requires extraction; approval of the MKT-002 item/price; or the first automated state-changing acceptance run.
```

## 8. Human checkpoints

- H1 now: on the Windows machine, confirm current game rules, install/locate Wireshark `tshark`, launch via Steam, and let local Codex run NET-000.
- H2 only if necessary: approve a schema refresh when the live executable hash differs and the current checked-in schema cannot decode target packets.
- H3: approve the exact cheap item and price for MKT-002.
- H4: approve the first supervised automated move after all read-only replay gates pass.
- H5: separately approve the first automated listing; it is not authorized by recording MKT-002.

No full CAP/NET matrix should be collected before NET-000 proves the packet path on the current build.
