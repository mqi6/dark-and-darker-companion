# Human Checkpoint 003 — Windows Game Baseline and Visual Samples

The DarkerDB integration is fixture-validated. The next boundary is the installed Windows game: build identification, screen geometry, stash recognition, normal-UI movement, and Auction confirmation cannot be truthfully validated in the cloud workspace.

This is a manual evidence-collection checkpoint. It does not request credentials, process-memory access, packet interception, anti-cheat changes, or automated game input.

## Who does what

- **You:** launch the game through Steam, arrange items, hover tooltips, perform the one manual drag, optionally perform the one manual Auction listing, and save screenshots/recordings.
- **Local Codex:** run repository scripts, create folders and manifests, inspect the files after you save them, check redaction/coverage, and validate the fixture set. A normal Codex terminal session does not see or control the desktop by itself.
- **Cloud ChatGPT/Codex:** consume the sanitized files after upload and implement/replay-test the adapters. It cannot launch or operate your installed game.
- **Steam:** launch the game normally. Do not try to start `game.exe` directly if it says to use the launcher.

If your local Codex environment explicitly has a desktop screenshot/control tool, it may help take screenshots only while you supervise it. Do not assume this capability exists, and do not authorize automated game input for this checkpoint.

## Before capturing

1. Pull the latest private `main` branch on the Windows game computer.
2. Launch Dark and Darker from the Steam Library and sign in normally.
3. Use borderless mode if possible; fullscreen capture can produce black frames.
4. Choose one stash page that you can temporarily rearrange. Use this same page for CAP-001 through CAP-009 and call it `stash-test-page` in every manifest.
5. Define coordinates with the top-left stash cell as `(0,0)`, columns increasing rightward, and rows increasing downward. Coordinates always refer to the item's top-left cell.
6. Run the folder scaffold:

```powershell
.\tools\scaffold-game-captures.ps1
```

This command only creates the ten folders and a short `CAPTURE.md` reminder inside each folder. It does not launch Steam, control the game, or take screenshots.

7. Use `Win+PrtScn` or full-screen Snipping Tool capture for PNG screenshots. Use Xbox Game Bar (`Win+Alt+R`) or OBS for the two optional/required short recordings. Keep native resolution and do not resize.

After each screenshot, place it directly into the matching folder under `fixtures/game/` using the exact filename below. Local Codex can fill `manifest.json` after the artifacts are present.

## BUILD-001 — do not launch the executable directly

First launch the game through Steam. While it is running:

1. Open Windows Task Manager.
2. Open **Details**.
3. Find the Dark and Darker process.
4. Right-click it and choose **Open file location**.
5. Copy the path of the running executable. This path is used only by the local hashing script and is not written to the output.
6. Run:

```powershell
.\tools\collect-windows-baseline.ps1 `
  -GameExecutable "C:\actual\path\from\task-manager\game.exe" `
  -GameBuildLabel "launcher-visible build or patch" `
  -WindowMode borderless `
  -WindowsScalingPercent 100 `
  -GameLanguage en
```

Use your real window mode, scaling, and language (`en` or `zh-Hans`). The script only reads file metadata/hash; it does not execute or modify the game. It creates:

```text
fixtures/game/BUILD-001/build.json
```

## Exact capture procedure

An “overview” means the whole selected stash page is visible with no tooltip. A “tooltip” means the cursor is hovering the target item and the complete tooltip is visible. If the tooltip hides much of the grid, that is fine because the paired overview records placement.

### CAP-001 — empty stash baseline

Folder: `fixtures/game/CAP-001-empty-stash/`

1. Move every item off `stash-test-page` manually to another page or inventory.
2. Leave the selected page open, with the entire empty grid visible.
3. Take one static screenshot and save it as `overview.png`.

This is a final-state capture, not a recording of emptying the page.

### CAP-002 — one 1×1 quantity-one item

Folder: `fixtures/game/CAP-002-single-item/`

1. Start from the empty test page.
2. Put one 1×1 stackable item with quantity exactly `1` at `(0,0)`.
3. Move the cursor away and save `overview.png`.
4. Hover that item until its complete tooltip appears and save `tooltip.png`.

### CAP-003 — partial and full stack labels

Folder: `fixtures/game/CAP-003-stack-quantities/`

1. Start from the empty test page.
2. Put a partial stack at `(0,0)`.
3. Put a full stack of the same item at `(2,0)`, leaving `(1,0)` empty.
4. Save the unobstructed `overview.png` with both quantity labels visible.
5. Hover the partial stack and save `tooltip-partial.png`.
6. Hover the full stack and save `tooltip-full.png`.
7. Record both exact quantities in the manifest.

### CAP-004 — multi-cell gear with no random rolls

Folder: `fixtures/game/CAP-004-multicell-no-roll/`

1. Start from the empty test page.
2. Put one item larger than 1×1 at top-left coordinate `(0,0)`.
3. Use an item whose tooltip has no random secondary-roll section. Base/primary stats are allowed.
4. Save `overview.png` and `tooltip.png`.
5. Record the visible width and height in grid cells.

### CAP-005 — rolled gear

Folder: `fixtures/game/CAP-005-rolled-gear/`

1. Start from the empty test page.
2. Put one gear item with at least two random secondary rolls at `(0,0)`.
3. Save `overview.png` and `tooltip.png` with every roll visible.
4. Record item rarity and the visible roll text in the manifest.

### CAP-006 — mixed realistic stash

Folder: `fixtures/game/CAP-006-mixed-stash/`

1. Put a 1×1 stack at `(0,0)` and another stack at `(2,0)`.
2. Put one multi-cell no-roll item with its top-left at `(0,2)`.
3. Put one rolled gear item with its top-left at `(4,2)`.
4. Add other available items from row 6 downward, left-to-right without overlap, until at least 20 items are present.
5. If an exact coordinate does not fit the item's footprint, use the next free location and record the actual top-left coordinate.
6. Include as many different rarities, footprints, stack quantities, and item categories as you reasonably own; do not buy items only for this fixture.
7. Save `overview.png`, plus `tooltip-stack.png`, `tooltip-no-roll.png`, and `tooltip-rolled.png` for representative items.

### CAP-007 — nearly full fragmented stash

Folder: `fixtures/game/CAP-007-fragmented-stash/`

1. Fill the test page manually until roughly 85% or more cells are occupied.
2. Preserve at least three separated empty holes rather than one large empty block.
3. Save only the final state as `overview.png`.
4. Record the approximate occupancy and the coordinates/sizes of the intentional holes in the manifest.

This is also a final-state capture; no recording of the filling process is needed.

### CAP-008 — reserved rectangle

Folder: `fixtures/game/CAP-008-reserved-region/`

The game does not display the companion's reserved-area overlay yet. This sample records the underlying stash image plus the intended coordinates.

1. Use rectangle `x=0, y=0, width=3, height=2`, covering cells `(0,0)` through `(2,1)`.
2. Place at least one item completely inside that rectangle.
3. Place at least two other items outside it.
4. Save `overview.png`.
5. Put the exact rectangle and which items are inside/outside in `manifest.json` notes.

### CAP-009 — one manual drag sequence

Folder: `fixtures/game/CAP-009-manual-drag/`

1. Start with a 1×1 item at `(0,0)` and ensure `(3,0)` is empty.
2. With the cursor away from the item, save `before.png`.
3. Start a short recording and save it as `manual-drag.mp4`.
4. Manually drag the item through the normal game UI from `(0,0)` to `(3,0)` exactly once.
5. Stop recording.
6. With the cursor away, save `after.png`.
7. Record source `(0,0)`, destination `(3,0)`, and whether the move visibly succeeded.

Codex does not perform this drag. The recording is evidence for later calibration and confirmation logic.

### CAP-010 — one manual Auction listing sequence

Folder: `fixtures/game/CAP-010-manual-auction/`

This is state-changing and optional until you are comfortable doing it.

1. Choose a cheap disposable quantity-one item with no random secondary rolls.
2. Keep it at inventory coordinate `(0,0)` before opening Auction.
3. Open Auction through the normal game UI and select the item for sale manually.
4. Enter a reasonable price manually.
5. Before clicking the final submit/list button, save `before-submit.png` with the item and entered price visible.
6. Optionally start `manual-listing.mp4`.
7. Click submit manually once.
8. Wait for an unambiguous success message or visible active listing.
9. Save `after-success.png`; stop the recording if used.
10. Record item, quantity, price, fee, and the exact visible success evidence in the manifest.

Do not use automated input. If the result is ambiguous, save `after-ambiguous.png`, stop, and do not retry for the fixture. If you prefer not to list anything, omit CAP-010 and mark it deferred.

## Sanitize and create manifests

Crop or redact character names, account names, chat, friend lists, notifications, and Steam overlays. Do not resize the game area. Each folder needs a `manifest.json` following `src/fixtures/sampleManifest.ts` and listing every artifact filename.

Use an anonymous stable alias such as `sample-character` for `characterId`; do not store the actual character/account name. For example, CAP-002 should end with a manifest shaped like:

```json
{
  "schemaVersion": 1,
  "sampleId": "CAP-002-single-item",
  "purpose": "Validate one 1x1 quantity-one item at stash cell (0,0).",
  "capturedAt": "2026-08-27T12:00:00.000Z",
  "gameVersion": "YOUR_BUILD_LABEL",
  "executableFingerprint": "SHA256_FROM_BUILD_001",
  "companionVersion": "0.1.0",
  "captureSchemaVersion": 1,
  "characterId": "sample-character",
  "screen": {
    "width": 2560,
    "height": 1440,
    "windowsScalingPercent": 100,
    "windowMode": "borderless"
  },
  "storageId": "stash-test-page",
  "captureSource": "manual-screenshot",
  "preconditions": ["The selected stash page was empty."],
  "actions": ["Placed one 1x1 quantity-one item at (0,0).", "Captured overview and tooltip."],
  "expectedResult": "The item footprint, quantity, and tooltip can be identified.",
  "observedResult": "Describe what is actually visible in the saved files.",
  "artifacts": ["overview.png", "tooltip.png"],
  "knownOmissions": [],
  "sanitized": true
}
```

After you save the images, ask local Codex:

```text
Read AGENTS.md and docs/human-checkpoint-003-windows-game-baseline.md completely.
Do not launch game.exe or control the game. The game was launched manually through Steam.
Inspect the existing BUILD-001 and CAP-* artifacts, create each manifest.json from the documented setup and observed images, check that personal information is redacted, and run fixture validation. Do not add memory access, packet interception, anti-cheat workarounds, or automated input.
```

## Return

Attach `fixtures/game/BUILD-001/` and the completed `fixtures/game/CAP-*` folders. Do not attach the executable, installation path, credentials, or unredacted recordings.

## What cloud Codex will do next

1. Validate the build and capture manifests.
2. Implement and replay-test read-only visual recognition against CAP-001 through CAP-008.
3. Implement calibration and dry-run normal-UI movement planning against CAP-009.
4. Model Auction success/ambiguity confirmation from CAP-010 before enabling any controlled submission path.
5. Stop again before the first automated game-changing acceptance run.
