# Navigation screen classifier v2

## Why this change exists

NAV-002 confirmed the DnDTools-compatible `SendInput` path and the character-reselection refresh. The first three transitions were visually confirmed, and a complete command-44 storage state arrived 759 ms after `enter-lobby`. The run stopped because the old classifier did not recognize the resulting Lobby screen within ten seconds.

The old classifier sampled a single 12 by 8 grayscale grid across the entire client and kept one reference per screen. Lobby animation, the character model, particles, and other changing content could dominate that signature.

## Version 2 contract

Version 2 samples normalized, resolution-relative regions that contain stable navigation chrome:

- top navigation bar;
- upper-right page chrome;
- bottom-center primary action area;
- Stash header area;
- lower-right page controls.

Each region is mean-normalized independently, reducing sensitivity to global brightness changes. The classifier keeps the best score per distinct screen before applying its ambiguity margin. This allows up to four animation samples for one screen without treating two samples of the same screen as competing classifications.

Profiles and features are explicitly versioned. Version 1 profiles fail closed until they are migrated from their existing private screenshots. Migration generates no mouse or keyboard input and preserves a private backup.

## Private migration

From the existing Windows worktree that contains the private NAV reference screenshots:

```powershell
npm run nav001:operator -- `
  --mode migrate-references `
  --directory fixtures-private/runtime/nav-001
```

The command reads only `reference-*.private.png`, creates version 2 features, writes `profile.private.json`, and saves `profile-v1-backup.private.json`. All of those files remain gitignored.

## Next checkpoint

The next local checkpoint is read-only:

1. migrate the existing references;
2. leave the game stationary on Lobby in the foreground;
3. run `prepare` to capture and classify one current frame;
4. inspect the non-clicking preview and compact fingerprint;
5. stop before `execute`.

No packet capture, game click, item movement, or repeated manual route is needed for this checkpoint. A later execution still requires a new exact fingerprint approval and retains the existing stop-on-first-mismatch and zero-retry behavior.
