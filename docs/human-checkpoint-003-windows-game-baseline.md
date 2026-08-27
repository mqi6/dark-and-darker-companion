# Human Checkpoint 003 — Windows Game Baseline and Visual Samples

The DarkerDB integration is now fixture-validated. The next implementation boundary is the actual Windows game: build identification, screen geometry, stash visual recognition, normal-UI movement, and auction confirmation cannot be truthfully validated in the cloud workspace.

Use the Windows machine that has Dark and Darker installed. This checkpoint does not request credentials, process-memory access, packet interception, anti-cheat changes, or automated game input.

## BUILD-001 — exact runtime baseline

From PowerShell in the repository, run:

```powershell
.\tools\collect-windows-baseline.ps1 `
  -GameExecutable "C:\path\to\the\game.exe" `
  -GameBuildLabel "launcher-visible build or patch" `
  -WindowMode borderless `
  -WindowsScalingPercent 100 `
  -GameLanguage en
```

Use your real `WindowMode`, scaling, and language (`en` or `zh-Hans`). The generated file is:

```text
fixtures/game/BUILD-001/build.json
```

It stores the executable filename, SHA-256, size/version metadata, Windows version, primary-screen geometry, scaling, window mode, and language. It deliberately does not store the executable path, account name, or credentials.

## CAP-001 through CAP-010

Capture at native resolution with the whole relevant panel visible. For tooltip samples, include both an unobstructed overview and a tooltip screenshot. Crop or redact character names, account names, chat, friend lists, and notifications. Do not resize the images.

| Sample | Exact setup | Required artifacts |
|---|---|---|
| CAP-001 | Completely empty inventory or stash grid | `overview.png`, `manifest.json` |
| CAP-002 | One 1×1 stackable item with quantity 1 | `overview.png`, `tooltip.png`, `manifest.json` |
| CAP-003 | Partial and full stacks of the same item, with both quantity labels visible | `overview.png`, both tooltips, `manifest.json` |
| CAP-004 | One multi-cell equipment item with no random secondary rolls | `overview.png`, `tooltip.png`, `manifest.json` |
| CAP-005 | One equipment item with at least two random secondary rolls | `overview.png`, `tooltip.png`, `manifest.json` |
| CAP-006 | Mixed page with at least 20 items across sizes, rarities, stacks, and gear | `overview.png`, representative tooltips, `manifest.json` |
| CAP-007 | Nearly full page with fragmented empty spaces | `overview.png`, `manifest.json` |
| CAP-008 | A user-designated rectangular reserved area containing items, with its cell coordinates written in the manifest | `overview.png`, `manifest.json` |
| CAP-009 | One manual normal-UI drag from a known source cell to a known empty target | `before.png`, `after.png`, short cropped recording, `manifest.json` |
| CAP-010 | A cheap disposable no-roll item manually listed through the normal Auction UI | screenshots before submit and after confirmed success, optional cropped recording, `manifest.json` |

CAP-010 is state-changing. Perform it manually only if you are comfortable spending/listing that item. Do not use automation for this checkpoint. If you prefer not to list anything yet, return CAP-001 through CAP-009 and mark CAP-010 deferred.

Each manifest follows the existing `src/fixtures/sampleManifest.ts` contract and must record:

- exact game build label and BUILD-001 hash reference;
- screen resolution, Windows scaling, window mode, and language;
- preconditions and manual actions;
- expected and observed result;
- every attached artifact filename;
- known omissions and `sanitized: true`.

## Recommended local-Codex handoff

Run Codex inside the repository on the Windows game machine and give it this instruction:

```text
Read AGENTS.md and docs/human-checkpoint-003-windows-game-baseline.md completely.
Collect BUILD-001 and CAP-001 through CAP-010 exactly as documented. Keep all game interaction manual, normal-UI, foreground-only, and supervised. Do not add memory access, packet interception, anti-cheat workarounds, or automated input. Validate and sanitize every manifest before returning the fixture folders.
```

## Return

Attach `fixtures/game/BUILD-001/` and the completed `fixtures/game/CAP-*` folders. Do not attach the game executable, installation directory, credentials, or uncropped recordings containing personal information.

## What Codex will do next

1. Validate the exact build and capture manifests.
2. Implement and replay-test the read-only visual capture adapter against CAP-001 through CAP-008.
3. Implement calibration and normal-UI movement planning against CAP-009, still dry-run by default.
4. Model Auction success confirmation from CAP-010 before enabling any controlled submission path.
5. Stop again before the first automated game-changing acceptance run.
