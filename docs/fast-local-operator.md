# Fast local operator loop

The local operator removes the repeated PowerShell/chat round trip from Windows game testing. It is intentionally a small test surface; the product tabs remain a separate UI milestone.

## Start once

From Windows, double-click `Start-Companion-Dev.cmd` or run this once in PowerShell:

```powershell
npm run operator -- --private-directory fixtures-private/runtime/move-003
```

The server binds only to `127.0.0.1`, opens `http://127.0.0.1:4317`, finds the newest nested directory containing both `plan.private.json` and `calibration.private.json`, fixes that directory for the process lifetime, and uses a per-process token for action requests. Routine event output stays under the selected gitignored private runtime directory.

## Test loop

1. Review the prepared item, source cell, destination cell, one-drag count, and no-retry statement.
2. Select **Bring game to front** to test foreground restoration without mouse-button input.
3. Select **Run one prepared move** only when one live run is intended.
4. The operator restores and verifies DungeonCrawler as foreground, then runs the existing supervised countdown, dispatch, and verification path.
5. Return to the browser at any time; it polls state once per second and shows the latest events and terminal result.

Each press is a distinct human request. The operator never repeats a failed action automatically and rejects concurrent runs.

## Foreground and multiple monitors

Both navigation and supervised drag helpers restore the bound DungeonCrawler window using `ShowWindowAsync`, `AttachThreadInput`, `BringWindowToTop`, and `SetForegroundWindow`, then positively verify the foreground handle before input. Failure to obtain foreground stops before mouse input.

Absolute pointer coordinates are mapped across the complete Windows virtual desktop with `MOUSEEVENTF_VIRTUALDESK`. Negative coordinates and secondary monitors are therefore supported. Window identity, bounds, and virtual-display geometry remain bound and rechecked.

The implementation deliberately does not send background-window messages. Ordinary foreground `SendInput` remains the only input mechanism.
