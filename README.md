# Dark and Darker Companion

Early contract-first implementation of the v1 companion tool.

The current repository contains the platform-independent domain core and a React development shell. Capture, Windows targeting, and game-changing automation remain behind adapters until real local evidence is supplied.

## Development

```bash
npm install
npm run dev
npm run check
```

## Current validation boundary

Pricing, K-of-N filtering, localization fallback, task transitions, and shell behavior can be tested offline. Game build detection, capture decoding, calibration, item movement, and auction submission require controlled validation on the Windows game machine.

See `docs/product-decisions.md`, `docs/architecture.md`, and `docs/localization.md`.

The completed DarkerDB handoffs are documented in checkpoints 001 and 002. The next local-game handoff is `docs/human-checkpoint-003-windows-game-baseline.md`. Current implementation status is in `docs/progress.md`.
