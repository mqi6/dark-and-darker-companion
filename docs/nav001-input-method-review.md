# NAV-001 input-method review

NAV-001 proved that the fail-closed navigation runtime stops correctly, but its first `Lobby -> Stash` click did not change the game page. Windows reported that the events were inserted; no retry occurred.

## Comparison with DnDTools

Both implementations use the public foreground Windows `SendInput` API. The important difference is the click sequence:

| Stage | NAV-001 attempted method | DnDTools method |
|---|---|---|
| move | `SetCursorPos` | absolute `SendInput(MOVE | ABSOLUTE)` |
| hover dwell | none | 50 ms before button-down for tab clicks |
| press duration | immediate down/up | 30 ms between down and up |
| post-click settle | none in helper | 150 ms after button-up |

DnDTools commit `dbbb4d3ed547b510b780edcbfd013b91f25c74ee` implements this sequence in `UI/src/models/macros.py` (`move_mouse`, `mouse_down`, `mouse_up`, and `click_stash_tab`). This is an ordinary foreground input method, not packet injection, background input, a driver, or an input bypass.

## Decision

Use a DnDTools-parity backend for the next navigation-only checkpoint:

1. emit one absolute `SendInput` move to the approved point;
2. wait 50 ms and verify the cursor reached the point within two pixels;
3. emit one left-button down;
4. wait 30 ms;
5. emit one left-button up;
6. wait 150 ms for UI settlement;
7. require the expected page classifier result;
8. stop on rejection, mismatch, timeout, cancellation, or focus/window changes;
9. never retry a click.

The current implementation restricts this compatibility path to the primary display, matching DnDTools's absolute-coordinate normalization. A later separately validated virtual-desktop mode may be added if the game must run on a non-primary monitor.

## Next human checkpoint

The next run requires a new fingerprint because the input method is part of the reviewed runtime. Reuse the existing private screen templates only if their build, window, display, and client bounds remain current. Show a new non-clicking preview and stop for human authorization before dispatch.

The approved task remains navigation-only. No item movement, marketplace action, packet injection, process-memory access, automatic focus, or retry is permitted.
