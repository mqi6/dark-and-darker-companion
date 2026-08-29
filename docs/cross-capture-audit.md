# Cross-capture ACT-001 audit

This audit is a read-only alternative check before repeating a manual move. It compares the private NET-000 pre-state, the ACT-001 move request, and the REF-004 post-state by raw item identity entirely on the Windows machine.

Raw identities never leave process memory. The output contains only booleans, aggregate framing counts, build compatibility, and a bounded classification. It omits raw IDs, item design, coordinates, layouts, paths, network addresses, accounts, and capture timestamps.

## Interpretation

- `cross-capture-consistent`: every observable identity, location, item-property, build, temporal, and spatial check passes.
- `inconsistent`: available evidence directly contradicts the requested transition.
- `insufficient`: a request, complete state, identity, compatible build, temporal order, or spatial gate is missing.

All results have `protocolConfirmed: false`. Separate captures cannot prove that no unrecorded action occurred between them.

## Local command

After pulling the branch containing this tool, identify the private directories for:

1. the accepted NET-000 capture that predates ACT-001;
2. ACT-001;
3. REF-004.

Run:

```powershell
npm run protocol:audit-cross-capture -- `
  --pre "<private-NET-000-directory>" `
  --act "<private-ACT-001-directory>" `
  --post "<private-REF-004-directory>"
```

The output is written to:

`fixtures-private/cross-capture-audit.sanitized.json`

Inspect it before upload. It must contain the documented `intentionallyOmitted` list and must not contain raw IDs, exact coordinates, filesystem paths, or layouts. Upload only this single JSON file for cloud review. Do not upload PCAPs or the three private directories.

No game launch, recording, item move, or new human action is required.

## Completed audit result

The accepted sanitized NET-000 / ACT-001 / REF-004 audit returned `insufficient / identity-missing`. Exactly one ACT request, compatible builds, temporal order, complete pre/post states, and spatial validation passed. The ACT request identity was found in neither comparison state, so source, destination, design, and quantity continuity could not be established.

This is not evidence that the move failed. It means the available separate captures cannot identify the requested item on both sides. MOVE-002 remains the next human checkpoint.
