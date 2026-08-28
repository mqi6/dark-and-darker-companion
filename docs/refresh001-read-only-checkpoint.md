# REFRESH-001 read-only state-refresh checkpoint

Status: required only after the offline identity, causality, and layout-planning
work is merged. This checkpoint does not move an item and does not authorize
sorting.

## Why this checkpoint remains necessary

ACT-001 proved that the pinned decoder can identify one outbound
`C2S_INVENTORY_MOVE_REQ`, but the recording contained neither a complete
pre-action state nor a newer post-action state. An empty move response cannot
prove that the server accepted and persisted a move.

DnDTools does not close this gap. Its pinned protobuf schema describes
`C2S_STORAGE_INFO_REQ`/`S2C_STORAGE_INFO_RES`, but its runtime passively consumes
`S2C_LOBBY_CHARACTER_INFO_RES` and tells the operator to switch tabs (or move an
item and switch tabs) to refresh after sorting. It does not demonstrate a
reliable complete post-move reducer or protocol-confirmed move success.

The companion therefore needs to observe which normal, read-only game UI action
elicits a fresh complete storage state. It will not synthesize or inject game
packets.

## Operator actions

Use the character that can display all ten stash tabs if available. Do not drag,
split, merge, sell, equip, or otherwise move any item.

Perform these samples separately so each recording has exactly one marked UI
action:

1. `REF-001` — begin in Stash tab 0, mark `ACTION_START`, click tab 1, wait five
   seconds, mark `ACTION_END`, then stop.
2. `REF-002` — begin in Stash tab 1, mark `ACTION_START`, click tab 0, wait five
   seconds, mark `ACTION_END`, then stop.
3. `REF-003` — begin in Stash tab 0, mark `ACTION_START`, leave Stash for another
   lobby page and reopen Stash without changing character, wait five seconds,
   mark `ACTION_END`, then stop.
4. Only if none of the above produces a complete newer state: `REF-004` — begin
   outside Stash, mark `ACTION_START`, reselect the same character through the
   normal character-selection UI and open Stash, wait five seconds, mark
   `ACTION_END`, then stop.

While performing the first useful sample, record the ten visible tab indices
and icons in a private note. The analyzer will derive protocol inventory IDs;
do not guess the third shared-tab ID from the pinned enum.

## Local Codex work

Local Codex will:

1. verify the pinned game version and executable SHA before analysis;
2. run the existing recorder with the normal bidirectional 20200-20300 filter;
3. keep PCAPs, full snapshots, raw item IDs, account IDs, character IDs, and
   network addresses under `fixtures-private/`;
4. locate complete state messages (`44` and `552`) strictly after the exact
   marked action time;
5. report request/response command counts, result codes, container inventory
   IDs, item counts, freshness timestamps, and omissions in a sanitized review;
6. stop after the first method that reliably produces a complete newer state;
7. make no game-state-changing action and push no private capture data.

## Pass/fail gate

Pass only when a normal read-only UI action repeatedly yields a successful,
complete state whose timestamp is newer than the action boundary and whose
containers can be reduced without overlap, unknown geometry, or identity
collision.

If the result is only `OK_NOT_CHANGE`, an acknowledgement, a partial update, or
an older cached snapshot, classify it as ambiguous. Do not enable execution.

After this passes, one new explicitly approved manual move is still required to
prove that the same stable alias appears at the expected destination in a
post-request state. That later action is not part of REFRESH-001.
