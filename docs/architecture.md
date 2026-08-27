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

## DarkerDB data flow

1. Zod validates the live response envelope and Market or Price Check body.
2. Canonical item and attribute IDs map API records into domain candidates and comparables.
3. Price Check supplies recommended valuation and naturally possible roll metadata.
4. Market disappearance records map to recent-sale samples while preserving inferred versus confirmed evidence.
5. Local K-of-N evaluation runs after bounded retrieval and carries retrieved/reported/incomplete metadata to the UI.

Captured fixtures contain public game/market data with player-identifying fields redacted. Live keys remain request-header-only and are never persisted.

## Local game capture data flow

The planned Windows capture path is passive TCP capture through Wireshark/tshark, based on the framing behavior independently verified from the MIT-licensed DnDTools reference implementation. It is not a WebSocket integration.

1. A local-only packet source records both TCP directions for the game service port range.
2. Per-stream, per-direction reassembly normalizes sequence gaps, overlap, retransmission, and out-of-order delivery.
3. An 8-byte little-endian frame header supplies total length, packet command, and padding.
4. Version-pinned Protobuf schemas decode allowlisted storage, inventory, movement, and Marketplace messages.
5. A sanitizer removes player/network identifiers before any fixture becomes repository-visible.
6. State and action reducers feed the existing `CaptureAdapter`; game input remains isolated behind `GameInteractionAdapter` and dry-run by default.

Raw PCAP and unsanitized decoder output stay local and gitignored. Replayable fixtures are regenerated from sanitized Protobuf values rather than published raw payloads.

## Core invariants

- Display strings are not identifiers.
- Plans and queue rows pin a snapshot ID.
- Stash and Auction share one canonical owned-item repository.
- Only one game-changing task may hold the interaction lease.
- Every action has expected pre-state and confirmation evidence.
- Ambiguous state cannot transition to success automatically.
