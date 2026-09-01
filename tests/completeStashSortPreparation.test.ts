import { describe, expect, it, vi } from "vitest";
import { SORT_INPUT_TIMING_PRESETS } from "../src/domain/automationTiming";
import type { SpatialProjection } from "../src/domain/inventoryGeometry";
import { STASH_ITEM_CATEGORIES } from "../src/domain/stashRouting";
import { createCanonicalStashTabMapping } from "../src/domain/stashTabMapping";
import { CompleteStashSortPreparationController } from "../src/tasks/completeStashSortPreparation";

const projection: SpatialProjection = {
  sourceSnapshotHash: "fresh", sourceVersion: 7, ready: true,
  containers: [
    { inventoryId: 2, status: "ready", geometry: { kind: "bag", columns: 10, rows: 5 }, placements: [], diagnostics: [] },
    { inventoryId: 4, status: "ready", geometry: { kind: "rectangular", columns: 12, rows: 20 }, placements: [], diagnostics: [] },
    { inventoryId: 5, status: "ready", geometry: { kind: "rectangular", columns: 12, rows: 20 }, placements: [], diagnostics: [] }
  ]
};

describe("complete stash sort refresh bridge", () => {
  it("uses exactly one automatic refresh to build one complete preview", async () => {
    const refreshCompleteProjection = vi.fn(async () => projection);
    const mapping = createCanonicalStashTabMapping({
      runtimeProfileKey: "test", gameBuildFingerprint: "build", visibleInventoryIds: [4, 5]
    });
    const controller = new CompleteStashSortPreparationController(
      { refreshCompleteProjection }, mapping,
      { windowHandle: "w", processName: "DungeonCrawler", clientBounds: { left: 0, top: 0, width: 1920, height: 1080 }, display: { left: 0, top: 0, width: 1920, height: 1080 }, primaryDisplay: { left: 0, top: 0, width: 1920, height: 1080 }, gameBuildFingerprint: "build" }
    );
    const result = await controller.refreshAndPreview({
      mode: "compact-top-left", timing: SORT_INPUT_TIMING_PRESETS.balanced,
      policies: [4, 5].map(inventoryId => ({ inventoryId, enabled: true, allowedCategories: STASH_ITEM_CATEGORIES })),
      excludedInventoryIds: []
    });
    expect(refreshCompleteProjection).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "ready", initialProjection: { sourceVersion: 7 } });
    if (result.status === "ready") {
      expect(result.schedule.usesSingleInitialSnapshot).toBe(true);
    }
  });

  it("quarantines an unknown-item page and still plans verified pages", async () => {
    const unknownProjection: SpatialProjection = {
      ...projection,
      ready: false,
      containers: projection.containers.map((container) =>
        container.inventoryId === 5
          ? {
              ...container,
              status: "blocked" as const,
              diagnostics: [{
                code: "item-metadata-missing" as const,
                inventoryId: 5,
                alias: "private-item",
                message: "metadata unavailable"
              }]
            }
          : container)
    };
    const mapping = createCanonicalStashTabMapping({
      runtimeProfileKey: "test", gameBuildFingerprint: "build", visibleInventoryIds: [4, 5]
    });
    const controller = new CompleteStashSortPreparationController(
      { refreshCompleteProjection: vi.fn(async () => unknownProjection) },
      mapping,
      { windowHandle: "w", processName: "DungeonCrawler", clientBounds: { left: 0, top: 0, width: 1920, height: 1080 }, display: { left: 0, top: 0, width: 1920, height: 1080 }, primaryDisplay: { left: 0, top: 0, width: 1920, height: 1080 }, gameBuildFingerprint: "build" }
    );

    const result = await controller.refreshAndPreview({
      mode: "compact-top-left",
      timing: SORT_INPUT_TIMING_PRESETS.balanced,
      policies: [4, 5].map(inventoryId => ({
        inventoryId, enabled: true, allowedCategories: STASH_ITEM_CATEGORIES
      })),
      excludedInventoryIds: []
    });

    expect(result).toMatchObject({
      status: "ready",
      quarantinedInventoryIds: [5],
      unsupportedItemCount: 1
    });
    if (result.status === "ready") {
      expect(result.plan.pages.map((page) => page.inventoryId)).toEqual([4]);
      expect(result.options.excludedInventoryIds).toEqual([5]);
    }
  });
});
