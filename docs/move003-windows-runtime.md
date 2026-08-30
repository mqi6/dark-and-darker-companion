# MOVE-003 local Windows runtime

This runtime supports one supervised, human-approved, foreground-only stash drag. It does not focus, launch, or close the game; send background input; read process memory; inject packets; retry a drag; or treat dispatch as success.

## Private calibration

With the pinned build open on the intended character and stash tab, keep the game window stationary and run:

```powershell
npm run move003:calibrate -- --profile-id "<private-profile-id>" --build-fingerprint "<verified-build-fingerprint>"
```

The tool inspects the current foreground window and exact bounds, requires `DungeonCrawler` to be foreground, and asks for the outer top-left and outer bottom-right edges of the complete 12-column by 20-row grid. It writes the calibration and a non-clicking HTML preview only below `fixtures-private/runtime/move-003/`.

When an operator must switch from the command terminal back to the game, add `--inspect-delay-seconds 5`. Add `--capture-cursor true` to sample each outer grid corner after a separate five-second delay. Position the cursor only; do not click. These modes generate no input.

Calibration is invalid if the foreground window identity, bounds, virtual-display geometry, game build, or profile changes. Calibration and preview perform no input.

## Dry-run and exact approval

The private preparation workflow writes `plan.private.json`, `live-environment.private.json`, and the matching calibration profile into one private runtime directory. Run the preview first:

```powershell
npm run move003:run -- --private-directory "<private-runtime-directory>"
```

Dry-run reports `mouseButtonEvents: 0`. The operator must verify the private overlay and provide the exact full confirmation phrase printed for that plan. Execution refuses `yes`, generic confirmation, shortened fingerprints, and stale fingerprints.

The displayed `move003-<32 hex characters>` fingerprint is a deterministic compact binding of the complete logical and screen plan; it avoids line-wrapping ambiguity while still changing whenever a bound plan field changes.

Only after the private capture and action window are ready may the local operator run:

```powershell
npm run move003:run -- --private-directory "<private-runtime-directory>" --execute --confirmation "CONFIRM MOVE-003 <complete-planFingerprint>"
```

The runner checks the foreground window, bounds, display, build, snapshot hash/version/age, calibration profile, visible tab, and inventory both before and after a cancellable countdown. The PowerShell helper then sends one left-button down/up drag through ordinary foreground `SendInput`. It never retries. Rejected input stops. Any failure after a possible button event is ambiguous.

The authoritative planning snapshot expires after five minutes. Expiry blocks before input and requires a newly prepared plan and fingerprint.

After dispatch, confirmation still requires a matching private passive-protocol verification result produced from a complete newer state. Missing or conflicting post-state evidence is ambiguous.

