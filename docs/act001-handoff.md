# ACT-001 handoff

ACT-001 recorded one human-performed, same-page stash move through the normal game UI. The pinned build version and SHA-256 matched. Capture was bidirectional and produced 48 valid application frames with no discarded bytes.

The protocol proves that exactly one `C2S_INVENTORY_MOVE_REQ` was sent. Its source and destination were on inventory 4 and matched the operator's prepared cells under the observed slot numbering. The repository-visible review intentionally omits those locations and the real item design ID to avoid publishing even a partial personal layout.

ACT-001 is **ambiguous**. No `S2C_INVENTORY_MOVE_RES`, complete protocol pre-state, or newer storage/inventory post-state was present. The operator observed the item remain at its destination, but visual evidence is secondary and an acknowledgement or screen change cannot establish success.

The private PCAP, recorder files, full decoded details, deterministic unique-ID alias, and any complete snapshot remain under `fixtures-private/game/` and are gitignored. The committed fixture is synthetic and cannot reconstruct the real stash.

The next checkpoint should first establish a method that causes complete pre- and post-action storage state messages to be emitted during capture. A second move requires fresh human approval and must not be attempted merely to retry ACT-001.
