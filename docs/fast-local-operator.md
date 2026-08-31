# Fast local operator loop

The local operator removes the repeated PowerShell/chat round trip from Windows game testing. It is intentionally a small test surface; the product tabs remain a separate UI milestone.

## Start once

From Windows, double-click `Start-Companion-Dev.cmd` or run this once in PowerShell:

```powershell
npm run operator -- --private-directory fixtures-private/runtime/move-003
```

The server binds only to `127.0.0.1`, opens `http://127.0.0.1:4317`, finds the newest nested directory containing both `plan.private.json` and `calibration.private.json`, fixes that directory for the process lifetime, and uses a per-process token for action requests. Routine event output stays under the selected gitignored private runtime directory.

Every startup failure and run event is also mirrored to `fixtures-private/runtime/operator-latest.private.jsonl`. This stable gitignored path lets Codex inspect the latest result directly without requiring pasted logs.

For the first cross-tab checkpoint, the operator upgrades a stale mapping from the verified canonical page order using the saved visible-tab count. It selects exactly one spatially safe transfer without applying category policies. The preview includes source tab/cell, footprint and quantity, bag capacity and temporary cell, target tab/cell, and both drag paths.

## Test loop

1. Review the prepared item and complete two-leg path. No input has been dispatched.
2. Select **Bring game to front** to test foreground restoration without mouse-button input.
3. Select **Run one prepared move** only when one live run is intended. The button itself is the sole confirmation; there is no fingerprint or second dialog.
4. The operator selects the source tab, drags stash to bag, selects the target tab, and drags bag to stash.
5. It automatically performs the established character-reselection refresh. A newer complete command-44 state must show the same opaque identity, quantity and footprint at the exact target inventory and slot.
6. Return to the browser at any time; it polls state once per second and shows the latest events and terminal result.

Each press is a distinct human request. The operator never repeats a failed action automatically and rejects concurrent runs.

## Foreground and multiple monitors

Both navigation and supervised drag helpers restore the bound DungeonCrawler window using `ShowWindowAsync`, `AttachThreadInput`, `BringWindowToTop`, and `SetForegroundWindow`, then positively verify the foreground handle before input. Failure to obtain foreground stops before mouse input.

Absolute pointer coordinates are mapped across the complete Windows virtual desktop with `MOUSEEVENTF_VIRTUALDESK`. Negative coordinates and secondary monitors are therefore supported. Window identity, bounds, and virtual-display geometry remain bound and rechecked.

The implementation deliberately does not send background-window messages. Ordinary foreground `SendInput` remains the only input mechanism.

## Cross-tab checkpoint result

The Windows cross-tab checkpoint was completed successfully on 2026-08-31. The local operator log recorded exactly one transfer and two completed drags: source stash to the temporary character-bag rectangle, followed by the same bag item to the target stash page. No automatic retry or second-item transfer occurred.

After the move, the established refresh route automatically returned through character selection and back to Stash. A newer complete protocol state confirmed the same opaque item identity, quantity and verified footprint at the planned target inventory and slot. Private aliases, coordinates, layouts, capture files and evidence hashes remain only below `fixtures-private`.

Two integration defects found before the successful run are covered by regression tests: the navigation helper now separates PowerShell `return` from its `[IntPtr]` cast, and a Stash screen template captured on tab 0 is no longer treated as proof of the currently selected tab. Foreground rebinding updates only the transient window handle after bounds, display geometry and build checks pass.
