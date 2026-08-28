# Passive protocol recording runbook

This recorder is Windows-only, passive, and never launches or controls Dark and Darker. It captures both directions of TCP traffic where either endpoint uses port `20200-20300`. Raw output is always written beneath the gitignored `fixtures-private/game` directory.

## Prerequisites

Use an ordinary PowerShell window first. If capture-driver access requires an elevated terminal, stop and obtain operator approval before continuing. Install Wireshark if `tshark.exe` is unavailable. The operator must choose the interface; the recorder does not guess.

List interfaces:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\record-game-traffic.ps1 -ListInterfaces
```

If Wireshark is not on `PATH`, append `-TsharkPath 'C:\Program Files\Wireshark\tshark.exe'`.

## Start NET-000

Use the explicit interface selected from `tshark -D` and the values from the private Windows baseline:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\record-game-traffic.ps1 -Interface '<interface-number-or-name>' -GameVersion '<BUILD-001-version>' -GameSha256 '<64-character-BUILD-001-sha256>' -SampleId NET-000 -DurationSeconds 60 -Notes 'transport smoke'
```

The command prints the private session directory and the exact child `tshark` PID. Enter `READY`, `ACTION_START`, `ACTION_END`, or `STOP` in the recorder terminal. For NET-000, `READY` and `STOP` are sufficient.

To stop safely, enter `STOP` and press Enter. Ctrl+C is also handled by cleanup: a final `STOP` marker is written and only the recorder's own saved PID is terminated. A fixed duration writes `STOP` automatically.

## Decode and fixture boundary

Full decode output belongs at `fixtures-private/game/<session>/decoder-full.ndjson`. Never copy raw PCAP, full decoder output, IP addresses, account IDs, character names, or raw unique IDs into tracked fixtures. Synthetic replay values live under `fixtures/game` and can be checked with:

```powershell
npm run protocol:replay
```

The checked-in decoder schema provenance is DnDTools commit `dbbb4d3ed547b510b780edcbfd013b91f25c74ee`, game version `0.17.151.9472`, SHA-256 `7ef0cbe431ec49f5724b213b629d73aad9f524d7cdc5a43bae1d6307647cfb87`. The decoder maps prioritized commands and performs bounded Protobuf wire decoding. It does not claim field-name compatibility with another build. If BUILD-001 differs, NET-000 is only a framing smoke test; stop before schema extraction and ask the operator to approve a schema decision.
