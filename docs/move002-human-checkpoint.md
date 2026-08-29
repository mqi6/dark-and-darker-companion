# MOVE-002 confirmed manual-move checkpoint

Status: offline correlation and capture-window gates are implemented. This is the next human checkpoint. MOVE-002 authorizes one human-performed move for evidence collection; it does not authorize Codex-generated input, automatic sorting, or any marketplace action.

## Purpose

ACT-001 observed exactly one outbound move request but had no complete protocol pre-state or newer post-state. REF-004 later established that reselecting the same character and opening Stash produces complete command-44 state messages. MOVE-002 combines those findings in one capture:

1. obtain a complete pre-state;
2. perform exactly one manual move;
3. obtain a complete post-state through the proven read-only refresh;
4. confirm that the same raw item identity moved from the requested source to destination.

A move response is an informational acknowledgement only. Success requires the same session alias at the expected destination in a complete, newer, spatially valid post-state.

## Item and destination selection

Use the same character whose ten storage containers were verified by REF-004.

Choose:

- one inexpensive, non-equipped, quantity-one, 1x1 item;
- a source and empty destination on the same visible stash page;
- a destination outside every reserved region;
- an item with resolved gameplay metadata;
- a destination that cannot merge, split, swap, equip, or consume the item.

Do not use currency, a stack, gear occupying multiple cells, a quest-critical item, an unsupported item, or an item selected for marketplace sale.

Local Codex must inspect the fresh pre-state and privately verify the proposed source, destination, footprint, occupancy, stack quantity, and page eligibility before starting the action window. It must refer to the item by a deterministic alias and must not print its raw unique ID.

## Recording sequence

1. Pull current `main` and confirm that PR #16 and the MOVE-002 offline-gate branch changes are present.
2. Keep the game at the character-selection/lobby screen before starting the recorder.
3. Start one passive bidirectional recording with sample ID `MOVE-002`.
4. Enter `READY` exactly once.
5. In the game, select the same verified character and open Stash. Wait at least five seconds for the complete pre-state.
6. Return to the terminal. Local Codex verifies that a complete, spatially ready pre-state exists and privately confirms the agreed source and destination are still valid.
7. Enter `ACTION_START` exactly once.
8. Return to the game and manually drag the item exactly once from the approved source cell to the approved destination cell.
9. Wait until the visible UI settles. Do not retry even if the result looks wrong.
10. Return to the terminal and enter `ACTION_END` exactly once.
11. In the game, leave Stash, reselect the same character through the normal character-selection UI, reopen Stash, and wait at least five seconds. Do not move any item during this refresh.
12. Return to the terminal and enter `STOP` exactly once.
13. Run:

   `npm run protocol:analyze-move002 -- "<private-session-directory>"`

14. Keep the PCAP, timeline, complete states, screenshots, identifiers, and generated private review under `fixtures-private/`.

The required marker order is strictly:

`READY < ACTION_START < ACTION_END < STOP`

Exactly one command-507 move request must occur strictly inside the action window. The authoritative pre-state must occur after READY and before that request. The authoritative post-state must occur after ACTION_END and before STOP.

## Classification

`confirmed` requires all of the following:

- pinned game version and executable hash match;
- exactly one move request occurs in the action window;
- a complete pre-state contains the raw request identity at the request source;
- a complete post-state is produced after ACTION_END;
- the same raw identity appears exactly once at the requested destination;
- quantity and game-design ID are unchanged;
- it no longer appears at the source;
- pre-state and post-state contain the same verified ten-container set;
- both states pass metadata, footprint, bounds, stack, overlap, identity, and freshness checks.

`failed` is reserved for an explicit protocol failure when a relevant response provides one.

Everything else is `ambiguous`. An ambiguous result stops the experiment and must never be retried automatically.

## Local Codex boundaries

Local Codex may:

- verify the repository/build/recorder;
- start and stop passive tshark recording;
- instruct the operator and wait at every marker;
- inspect the private pre-state to validate the proposed move;
- run the private analyzer;
- create a sanitized aggregate report and tests;
- commit only non-private code, documentation, and aggregate evidence.

Local Codex must not:

- launch the game directly;
- generate mouse or keyboard input;
- inject or synthesize packets;
- read process memory;
- modify game files;
- expose raw unique IDs or complete layouts;
- perform a second move;
- begin automatic sorting;
- begin marketplace navigation or listing.

## Pass handoff

After a confirmed result, Local Codex should push a branch containing only sanitized aggregate evidence and documentation. The next cloud task is review of MOVE-002 and offline supervised-sort execution design. The first Codex-generated move remains a separate explicit human approval checkpoint.
