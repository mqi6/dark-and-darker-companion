# Architecture

## Initial stack

- TypeScript domain core.
- React/Vite renderer for rapid fixture-driven UI development.
- Windows desktop host and Windows-native capture/interaction adapter added behind the same contracts.
- Zod schemas at external boundaries.
- Vitest for unit, contract, and fixture replay tests.

This ordering lets cloud development build and verify the product core without pretending to have the game. Windows-only implementation will not leak into pricing, search, state machines, or page state.

## Boundaries

```text
UI pages
  -> application services
    -> domain core
    -> DarkerDbAdapter
    -> CaptureAdapter
    -> GameInteractionAdapter
    -> persistence/localization adapters
```

The UI never performs HTTP, packet capture, process access, or input injection directly.

## Core invariants

- Display strings are not identifiers.
- Plans and queue rows pin a snapshot ID.
- Stash and Auction share one canonical owned-item repository.
- Only one game-changing task may hold the interaction lease.
- Every action has expected pre-state and confirmation evidence.
- Ambiguous state cannot transition to success automatically.
