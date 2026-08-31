import { describe, expect, it } from "vitest";
import type { CrossTabScreenTransfer } from "../src/domain/crossTabScreenPlan";
import type { SpatialProjection } from "../src/domain/inventoryGeometry";
import type { CrossTabSortPlan } from "../src/domain/stashRouting";
import { CrossTabOperatorController } from "../src/tasks/crossTabOperatorController";
import { CrossTabSortExecutionRunner } from "../src/tasks/crossTabSortExecution";
import { GameInteractionLease } from "../src/tasks/taskMachine";

const transfer = {
  transferId: "cross-tab-001",
  itemAlias: "item-001",
  category: "gear" as const,
  width: 1,
  height: 1,
  sourceInventoryId: 4,
  sourceTabIndex: 0,
  bagSlotId: 0,
  targetInventoryId: 20,
  targetTabIndex: 1,
  targetSlotId: 0,
  actions: [
    { kind: "select-stash-tab" as const, tabIndex: 0, inventoryId: 4 },
    {
      kind: "drag-stash-to-bag" as const,
      itemAlias: "item-001",
      source: { inventoryId: 4, slotId: 0, point: { x: 0, y: 0 } },
      destination: { inventoryId: 2 as const, slotId: 0, point: { x: 0, y: 0 } }
    },
    { kind: "select-stash-tab" as const, tabIndex: 1, inventoryId: 20 },
    {
      kind: "drag-bag-to-stash" as const,
      itemAlias: "item-001",
      source: { inventoryId: 2 as const, slotId: 0, point: { x: 0, y: 0 } },
      destination: { inventoryId: 20, slotId: 0, point: { x: 0, y: 0 } }
    }
  ]
};

const plan: Extract<CrossTabSortPlan, { status: "ready" }> = {
  status: "ready",
  sourceSnapshotHash: "before",
  sourceSnapshotVersion: 1,
  bag: {
    inventoryId: 2,
    itemCount: 3,
    occupiedCellCount: 5,
    freeCellCount: 45,
    largestFreeRectangleCellCount: 30
  },
  transfers: [transfer],
  diagnostics: [],
  maximumTransfers: 1,
  independentTransfersOnly: true
};

const screen: CrossTabScreenTransfer = {
  transferId: "cross-tab-001",
  itemAlias: "item-001",
  sourceTab: { tabIndex: 0, point: { x: 1328, y: 211 } },
  stashToBag: {
    source: { x: 1398, y: 219 },
    destination: { x: 708, y: 645 }
  },
  targetTab: { tabIndex: 1, point: { x: 1328, y: 256 } },
  bagToStash: {
    source: { x: 708, y: 645 },
    destination: { x: 1398, y: 219 }
  }
};

function setup(resumeItemFromBag = false) {
  const calls: string[] = [];
  const post: SpatialProjection = {
    sourceSnapshotHash: "after",
    sourceVersion: 2,
    ready: true,
    containers: [{
      inventoryId: 20,
      status: "ready",
      geometry: { kind: "rectangular", columns: 12, rows: 20 },
      placements: [{
        alias: "item-001",
        inventoryId: 20,
        slotId: 0,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        stackQuantity: 1,
        metadata: {
          id: "id.item.test",
          rarity: "Common",
          inventoryWidth: 1,
          inventoryHeight: 1,
          maxStackSize: 1
        }
      }],
      diagnostics: []
    }]
  };
  const runtime = {
    async preflight() { calls.push("preflight"); return undefined; },
    async selectStashTab(tabIndex: number) {
      calls.push(`tab:${tabIndex}`);
      return { status: "completed" as const };
    },
    async dragStashToBag() {
      calls.push("to-bag");
      return { status: "completed" as const };
    },
    async dragBagToStash() {
      calls.push("to-stash");
      return { status: "completed" as const };
    },
    async refreshCompletePostState() {
      calls.push("refresh");
      return post;
    }
  };
  const runner = new CrossTabSortExecutionRunner(
    new GameInteractionLease(),
    runtime
  );
  return {
    calls,
    controller: new CrossTabOperatorController(plan, [screen], runner, resumeItemFromBag)
  };
}

describe("cross-tab operator controller", () => {
  it("shows the two-drag plan and bag capacity without input", () => {
    const { calls, controller } = setup();
    expect(controller.snapshot()).toMatchObject({
      phase: "ready",
      plan: {
        transferCount: 1,
        dragCount: 2,
        bagItemCount: 3,
        bagFreeCells: 45
      }
    });
    expect(controller.preview()).toEqual({
      status: "dry-run",
      transferCount: 1,
      dragCount: 0
    });
    expect(calls).toEqual([]);
  });

  it("turns one local button action into process-local approval and execution", async () => {
    const { calls, controller } = setup();
    await expect(controller.run()).resolves.toMatchObject({
      phase: "confirmed",
      lastResult: {
        status: "confirmed",
        transferCount: 1,
        dragCount: 2
      }
    });
    expect(calls).toEqual([
      "preflight",
      "tab:0",
      "to-bag",
      "tab:1",
      "to-stash",
      "refresh"
    ]);
  });

  it("resumes the same item from the bag without touching the old source cell", async () => {
    const { calls, controller } = setup(true);
    expect(controller.snapshot().phase).toBe("ambiguous");
    await expect(controller.run()).resolves.toMatchObject({
      phase: "confirmed",
      lastResult: { status: "confirmed", transferCount: 1, dragCount: 1 }
    });
    expect(calls).toEqual(["preflight", "tab:1", "to-stash", "refresh"]);
  });
});
