import { describe, expect, it, vi } from "vitest";
import type { CompleteStashSortPlan } from "../src/domain/completeStashSort";
import type { ScheduledStashSortScreenAction } from "../src/domain/completeStashScreenPlan";
import type { SpatialProjection } from "../src/domain/inventoryGeometry";
import type { ScheduledStashSort } from "../src/domain/stashMoveScheduler";
import { CompleteStashSortOperatorController } from "../src/tasks/completeStashSortOperatorController";

const initialProjection: SpatialProjection = {
  sourceSnapshotHash: "before",
  sourceVersion: 1,
  ready: true,
  containers: []
};

const plan: Extract<CompleteStashSortPlan, { status: "ready" }> = {
  status: "ready",
  mode: "category-rows",
  sourceSnapshotHash: "before",
  sourceSnapshotVersion: 1,
  pages: [],
  moves: [{
    alias: "item-001",
    category: "gear",
    width: 1,
    height: 1,
    route: "via-character-bag",
    source: {
      inventoryId: 4,
      tabIndex: 0,
      slotId: 12,
      point: { x: 0, y: 1 }
    },
    destination: {
      inventoryId: 20,
      tabIndex: 6,
      slotId: 0,
      point: { x: 0, y: 0 }
    },
    bagPoint: { x: 0, y: 0 },
    bagSlotId: 0
  }],
  skippedAliases: ["unknown-001"],
  diagnostics: [{
    code: "item-has-no-allowed-page",
    alias: "unknown-001",
    inventoryId: 4,
    detail: "No enabled page accepts this item."
  }],
  verification: "single-final-complete-refresh"
};

const schedule: Extract<ScheduledStashSort, { status: "ready" }> = {
  status: "ready",
  actions: [
    { kind: "select-stash-tab", tabIndex: 0, inventoryId: 4 },
    {
      kind: "drag-stash-to-bag",
      itemAlias: "item-001",
      width: 1,
      height: 1,
      source: { inventoryId: 4, point: { x: 0, y: 1 }, slotId: 12 },
      destination: { inventoryId: 2, point: { x: 0, y: 0 }, slotId: 0 }
    },
    { kind: "select-stash-tab", tabIndex: 6, inventoryId: 20 },
    {
      kind: "drag-bag-to-stash",
      itemAlias: "item-001",
      width: 1,
      height: 1,
      source: { inventoryId: 2, point: { x: 0, y: 0 }, slotId: 0 },
      destination: { inventoryId: 20, point: { x: 0, y: 0 }, slotId: 0 }
    }
  ],
  itemMoveCount: 1,
  dragCount: 2,
  temporaryBufferCount: 0,
  usesSingleInitialSnapshot: true
};

const screenActions: ScheduledStashSortScreenAction[] = [
  { kind: "select-stash-tab", tabIndex: 0, inventoryId: 4, point: { x: 10, y: 10 } },
  {
    kind: "drag-stash-to-bag",
    itemAlias: "item-001",
    source: { x: 20, y: 20 },
    destination: { x: 30, y: 30 }
  },
  { kind: "select-stash-tab", tabIndex: 6, inventoryId: 20, point: { x: 10, y: 60 } },
  {
    kind: "drag-bag-to-stash",
    itemAlias: "item-001",
    source: { x: 30, y: 30 },
    destination: { x: 40, y: 40 }
  }
];

describe("complete stash sort operator controller", () => {
  it("exposes a no-input whole-run preview", () => {
    const execute = vi.fn();
    const controller = new CompleteStashSortOperatorController(
      { plan, schedule, screenActions, initialProjection },
      { execute }
    );

    expect(controller.snapshot()).toMatchObject({
      phase: "ready",
      preview: {
        mode: "category-rows",
        itemMoveCount: 1,
        dragCount: 2,
        actionCount: 4,
        crossTabMoveCount: 1,
        temporaryBufferCount: 0,
        skippedAliases: ["unknown-001"],
        refreshStrategy: "single-final-complete-refresh"
      }
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("turns one local button press into one process-local complete-run approval", async () => {
    const execute = vi.fn(async (_parameters: unknown) => ({
      status: "confirmed" as const,
      actionCount: 4,
      dragCount: 2,
      evidenceId: "stash-sort:2:after"
    }));
    const controller = new CompleteStashSortOperatorController(
      { plan, schedule, screenActions, initialProjection },
      { execute }
    );

    await expect(controller.run()).resolves.toMatchObject({
      phase: "confirmed",
      lastResult: {
        status: "confirmed",
        actionCount: 4,
        dragCount: 2
      }
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      plan,
      schedule,
      screenActions,
      initialProjection,
      approval: expect.objectContaining({
        kind: "local-complete-sort-confirmation"
      })
    }));
  });
});
