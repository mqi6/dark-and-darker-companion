# Human Checkpoint 002 — DarkerDB Market and Price Check Samples

**Status: completed on 2026-08-27.** The three sanitized fixtures validate five active listings, five recent inferred-sale listings, twelve Price Check sales, and twelve Price Check asks. Continue with `human-checkpoint-003-windows-game-baseline.md`.

The uploaded localization catalog validates the merged bilingual artifact, but it does not expose the raw response records returned by Market or Price Check. Those record shapes are required before mapping live data into auction pricing and Gear Search domain models.

No game installation or game capture is needed for this checkpoint.

## What the developer must do

1. Pull the latest private repository revision.
2. Run `npm install` if dependencies are not already installed.
3. Create or reuse a DarkerDB key with Market and Price Check access. Do not paste it into chat or save it in a file.
4. In PowerShell, from the project directory:

```powershell
$env:DARKERDB_API_KEY = "YOUR_KEY_HERE"
npm run darkerdb:samples
Remove-Item Env:DARKERDB_API_KEY
```

The command pins API contract `2026-08-03` and queries `id.item.occultist_robe_4001` by default. To use another canonical item ID:

```powershell
$env:DARKERDB_API_KEY = "YOUR_KEY_HERE"
$env:DARKERDB_SAMPLE_ITEM_ID = "id.item.YOUR_ITEM_ID"
npm run darkerdb:samples
Remove-Item Env:DARKERDB_API_KEY
Remove-Item Env:DARKERDB_SAMPLE_ITEM_ID
```

## Safety behavior

The command:

- sends the key only as the `X-API-Key` request header;
- never stores request headers;
- replaces request IDs and likely account, character, finder, seller, or user fields with `[redacted]`;
- refuses to write a response if the serialized output somehow contains the API key.

Review the three files before sharing. They should contain only public market/game data and redaction markers.

## Return these artifacts

Attach only:

```text
fixtures/darkerdb/live-samples/market-active.json
fixtures/darkerdb/live-samples/market-recent-missing.json
fixtures/darkerdb/live-samples/price-check.json
```

If any command returns 401 or 403, verify the key and its live-data scope locally. Do not share the key or an authorization screenshot.

## What Codex will do next

1. Lock the real Market and Price Check response records into Zod schemas and contract tests.
2. Map live asks and recent inferred/confirmed disappearance records into domain comparables.
3. Connect recent-K arithmetic-mean pricing and incomplete-result metadata to the adapters.
4. Continue offline integration until BUILD-001 and game capture evidence become necessary.
