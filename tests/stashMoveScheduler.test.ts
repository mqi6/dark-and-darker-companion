import { describe, expect, it } from "vitest";
import type {
  CompleteStashSortMove,
  CompleteStashSortPlan
} from "../src/domain/completeStashSort";
import type {
  SpatialContainer,
  SpatialPlacement,
  SpatialProjection
} from "../src/domain/inventoryGeometry";
import { scheduleCompleteStashSort } from "../src/domain/stashMoveScheduler";

const metadata = {
  id: "id.item.test" as const,
  rarity: "Common",
  inventoryWidth: 1,
  inventoryHeight: 1,
  maxStackSize: 1,
  itemType: "armor"
};

function placement(alias: string, inventoryId: number, slotId: number): SpatialPlacement {
  const columns = inventoryId === 2 ? 10 : 12;
  return {
    alias,
    inventoryId,
    slotId,
    x: slotId % columns,
    y: Math.floor(slotId / columns),
    width: 1,
    height: 1,
    stackQuantity: 1,
    metadata
  };
}

function initial(items4: SpatialPlacement[], items20: SpatialPlacement[] = []): SpatialProjection {
  const container = (
    inventoryId: number,
    placements: SpatialPlacement[],
    kind: "bag" | "rectangular"
  ): SpatialContainer => ({
    inventoryId,
    status: "ready",
    geometry: kind === "bag"
      ? { kind, columns: 10, rows: 5 }
      : { kind, columns: 12, rows: 20 },
    placements,
    diagnostics: []
  });
  return {
    sourceSnapshotHash: "initial",
    sourceVersion: 1,
    ready: true,
    containers: [
      container(2, [], "bag"),
      container(4, items4, "rectangular"),
      container(20, items20, "rectangular")
    ]
  };
}

function move(parameters: {
  alias: string;
  sourceInventoryId: number;
  sourceTabIndex: number;
  sourceSlotId: number;
  targetInventoryId: number;
  targetTabIndex: number;
  targetSlotId: number;
}): CompleteStashSortMove {
  return {
    alias: parameters.alias,
    category: "gear",
    width: 1,
    height: 1,
    route: parameters.sourceInventoryId === parameters.targetInventoryId
      ? "same-tab"
      : "via-character-bag",
    source: {
      inventoryId: parameters.sourceInventoryId,
      tabIndex: parameters.sourceTabIndex,
      slotId: parameters.sourceSlotId,
      point: {
        x: parameters.sourceSlotId % 12,
        y: Math.floor(parameters.sourceSlotId / 12)
      }
    },
    destination: {
      inventoryId: parameters.targetInventoryId,
      tabIndex: parameters.targetTabIndex,
      slotId: parameters.targetSlotId,
      point: {
        x: parameters.targetSlotId % 12,
        y: Math.floor(parameters.targetSlotId / 12)
      }
    }
  };
}

function plan(moves: CompleteStashSortMove[]): CompleteStashSortPlan {
  return {
    status: "ready",
    mode: "compact-top-left",
    sourceSnapshotHash: "initial",
    sourceSnapshotVersion: 1,
    pages: [
      { inventoryId: 4, tabIndex: 0, placements: [], pinnedAliases: [] },
      { inventoryId: 20, tabIndex: 1, placements: [], pinnedAliases: [] }
    ],
    moves,
    skippedAliases: [],
    diagnostics: [],
    verification: "single-final-complete-refresh"
  };
}

describe("complete stash move scheduler", () => {
  it("routes a cross-tab item through the bag from one initial snapshot", () => {
    const result = scheduleCompleteStashSort(
      plan([
        move({
          alias: "a",
          sourceInventoryId: 4,
          sourceTabIndex: 0,
          sourceSlotId: 0,
          targetInventoryId: 20,
          targetTabIndex: 1,
          targetSlotId: 0
        })
      ]),
      initial([placement("a", 4, 0)])
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.usesSingleInitialSnapshot).toBe(true);
    expect(result.actions.map((action) => action.kind)).toEqual([
      "select-stash-tab",
      "drag-stash-to-bag",
      "select-stash-tab",
      "drag-bag-to-stash"
    ]);
    expect(result.dragCount).toBe(2);
  });

  it("breaks a same-page swap cycle with one temporary bag placement", () => {
    const result = scheduleCompleteStashSort(
      plan([
        move({
          alias: "a",
          sourceInventoryId: 4,
          sourceTabIndex: 0,
          sourceSlotId: 0,
          targetInventoryId: 4,
          targetTabIndex: 0,
          targetSlotId: 1
        }),
        move({
          alias: "b",
          sourceInventoryId: 4,
          sourceTabIndex: 0,
          sourceSlotId: 1,
          targetInventoryId: 4,
          targetTabIndex: 0,
          targetSlotId: 0
        })
      ]),
      initial([placement("a", 4, 0), placement("b", 4, 1)])
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.temporaryBufferCount).toBe(1);
    expect(result.dragCount).toBe(3);
    expect(result.actions.map((action) => action.kind)).toEqual([
      "select-stash-tab",
      "drag-stash-to-bag",
      "drag-stash-to-stash",
      "drag-bag-to-stash"
    ]);
  });

  it("coalesces repeated tab selection while keeping the item action order", () => {
    const result = scheduleCompleteStashSort(
      plan([
        move({
          alias: "a",
          sourceInventoryId: 4,
          sourceTabIndex: 0,
          sourceSlotId: 5,
          targetInventoryId: 4,
          targetTabIndex: 0,
          targetSlotId: 0
        }),
        move({
          alias: "b",
          sourceInventoryId: 4,
          sourceTabIndex: 0,
          sourceSlotId: 6,
          targetInventoryId: 4,
          targetTabIndex: 0,
          targetSlotId: 1
        })
      ]),
      initial([placement("a", 4, 5), placement("b", 4, 6)])
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.actions.filter((action) => action.kind === "select-stash-tab"))
      .toHaveLength(1);
    expect(result.dragCount).toBe(2);
  });

  it("blocks before input when an initial source alias is missing", () => {
    const result = scheduleCompleteStashSort(
      plan([
        move({
          alias: "missing",
          sourceInventoryId: 4,
          sourceTabIndex: 0,
          sourceSlotId: 0,
          targetInventoryId: 4,
          targetTabIndex: 0,
          targetSlotId: 1
        })
      ]),
      initial([])
    );
    expect(result).toMatchObject({
      status: "blocked",
      diagnosticCode: "source-item-missing",
      actions: []
    });
  });
});
