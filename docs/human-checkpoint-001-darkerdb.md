# Human Checkpoint 001 — DarkerDB Data and Localization

**Status: completed on 2026-08-27.** The accepted Simplified Chinese locale is `zh-Hans`. The fixture contains 2,430 items (2,422 translated, 8 missing) and 58 attributes (56 translated, 2 missing). Continue with `human-checkpoint-002-market-price-check.md`.

This is the first point where live credentials are required. The repository can continue using mocks, but real API contracts, Chinese locale coverage, recent-sale records, and current market pagination cannot be validated without a DarkerDB key.

## What the developer must do

1. Sign in to DarkerDB and create an API key at:
   - https://darkerdb.com/dashboard/api-keys
2. Give the key the data scope needed for Items and Attributes.
3. Also give it the live-data scope needed for Market and Price Check if those are separately controlled.
4. Do not paste the key into chat, source files, screenshots, or logs.
5. In PowerShell, from the extracted project directory:

```powershell
npm install
$env:DARKERDB_API_KEY = "YOUR_KEY_HERE"
npm run localization:sync
Remove-Item Env:DARKERDB_API_KEY
```

If `DARKERDB_ZH_LOCALE` is not set, the tool probes `zh-Hans`, `zh-CN`, and `zh`, then selects the candidate that actually returns Han-character attribute names. To force the verified code:

```powershell
$env:DARKERDB_API_KEY = "YOUR_KEY_HERE"
$env:DARKERDB_ZH_LOCALE = "VERIFIED_CODE"
npm run localization:sync
Remove-Item Env:DARKERDB_API_KEY
Remove-Item Env:DARKERDB_ZH_LOCALE
```

## Return this artifact

Attach only:

```text
fixtures/darkerdb/localization/catalog.json
```

It contains public catalog text and translation coverage, not the API key. Before attaching it, search the file for the key as an extra precaution.

## Expected console result

```text
Localization catalog saved. Items: <translated>/<total> translated; attributes: <translated>/<total> translated.
```

## What Codex will do next

1. Validate the actual response shape against the provisional adapter.
2. Lock the accepted Chinese locale code into a recorded fixture.
3. Measure missing Chinese item and attribute names.
4. Add real DarkerDB contract fixtures.
5. Implement current-market retrieval and lowest-3-of-latest-5 same-item pricing from real records.
6. Continue Gear Search API integration before requesting game capture samples.
