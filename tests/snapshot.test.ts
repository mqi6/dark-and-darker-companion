import { describe, expect, it } from "vitest";
import { storageSnapshotSchema } from "../src/domain/snapshot";

const baseSnapshot = {
  schemaVersion: 1 as const,
  snapshotId: "snapshot-test",
  capturedAt: "2026-08-27T00:00:00.000Z",
  gameBuildFingerprint: "fixture",
  characterId: "character-a",
  storageId: "stash-1",
  grid: { columns: 10, rows: 5 },
  warnings: []
};

describe("storage snapshot contract", () => {
  it("accepts a complete empty snapshot", () => {
    expect(storageSnapshotSchema.parse({ ...baseSnapshot, items: [] }).items).toHaveLength(0);
  });

  it("rejects overlapping item footprints", () => {
    const items = [
      {
        instanceKey: "a",
        itemId: "id.item.a",
        quantity: 1,
        location: { x: 0, y: 0, width: 2, height: 1 },
        rolls: []
      },
      {
        instanceKey: "b",
        itemId: "id.item.b",
        quantity: 1,
        location: { x: 1, y: 0, width: 1, height: 1 },
        rolls: []
      }
    ];
    expect(() => storageSnapshotSchema.parse({ ...baseSnapshot, items })).toThrow(/overlaps/);
  });

  it("rejects an item extending outside the grid", () => {
    const items = [
      {
        instanceKey: "edge",
        itemId: "id.item.edge",
        quantity: 1,
        location: { x: 9, y: 4, width: 2, height: 1 },
        rolls: []
      }
    ];
    expect(() => storageSnapshotSchema.parse({ ...baseSnapshot, items })).toThrow(/outside/);
  });
});
