# MOVE-002 handoff

MOVE-002 is **confirmed** from protocol evidence. The pinned game version and executable SHA-256 matched, and the passive capture was bidirectional with no discarded framing bytes.

Exactly one `C2S_INVENTORY_MOVE_REQ` occurred strictly inside the marked action window. A complete authoritative pre-state occurred after `READY` and before the request. A complete newer post-state occurred after `ACTION_END` and before `STOP`. The same deterministic alias, `item-001`, left the requested source and appeared exactly once at the requested destination with its game-design identity and quantity unchanged. Both states contained the same verified ten-storage-container set and passed storage metadata, footprint, bounds, stack, overlap, identity, and freshness validation.

The recorder reached its 600-second duration boundary as the operator supplied `STOP`; its single automatic `STOP` marker closed the window cleanly after the complete post-state. No retry or second move occurred.

## Analyzer correction

The first analysis was incorrectly downgraded because the spatial gate included an unrelated non-stash inventory container whose geometry is intentionally unverified. MOVE-002 requires validation of the verified ten storage containers. The analyzer now selects exactly that required container set, rejects missing, duplicate, or blocked required containers, and ignores unrelated inventory geometry. Regression coverage verifies those boundaries.

## Privacy and execution boundary

The tracked review contains aggregate evidence only. The PCAP, full decoded states, raw identity, coordinates, item name, complete layouts, account/character identifiers, network addresses, absolute timestamps, and private filesystem paths remain gitignored under `fixtures-private/`.

The move was performed exactly once by the human through the normal game UI. Codex did not launch the game, generate input, inject packets, read process memory, modify game files, sort a page, or access the marketplace. This result does not authorize a Codex-generated move or automatic sorting; those remain separate explicit human checkpoints.
