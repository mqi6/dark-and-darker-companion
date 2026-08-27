import { describe, expect, it } from "vitest";
import { FixtureCaptureAdapter } from "../src/adapters/capture";
import { DryRunGameInteractionAdapter } from "../src/adapters/gameInteraction";

describe("offline adapters", () => {
  it("does not expose fixture snapshots until capture is started", async () => {
    const snapshot = {
      schemaVersion: 1 as const,
      snapshotId: "snapshot-1",
      capturedAt: "2026-08-27T00:00:00.000Z",
      gameBuildFingerprint: "fixture",
      characterId: "character-a",
      storageId: "stash-1",
      grid: { columns: 10, rows: 5 },
      items: [],
      warnings: []
    };
    const adapter = new FixtureCaptureAdapter([snapshot]);
    expect(await adapter.latestSnapshot("character-a", "stash-1")).toBeUndefined();
    await adapter.start();
    expect(await adapter.latestSnapshot("character-a", "stash-1")).toEqual(snapshot);
  });

  it("records a dry-run listing without changing game state", async () => {
    const adapter = new DryRunGameInteractionAdapter();
    const intent = { actionId: "action-1", itemInstanceKey: "item-1", finalPrice: 475 };
    const result = await adapter.submitListing(
      {
        taskId: "auction-1",
        planId: "queue-1",
        snapshotId: "snapshot-1",
        calibrationProfileId: "calibration-1"
      },
      intent
    );
    expect(result).toEqual({ status: "dry-run", intendedAction: intent });
    expect(adapter.actions).toHaveLength(1);
  });
});
