import { describe, expect, it } from "vitest";
import type {
  SpatialContainer,
  SpatialPlacement,
  SpatialProjection
} from "../src/domain/inventoryGeometry";
import type {
  CrossTabSortPlan,
  CrossTabTransfer
} from "../src/domain/stashRouting";
import {
  CrossTabSortExecutionRunner,
  issueCrossTabLocalApproval,
  type CrossTabRuntimeActionResult,
  type CrossTabSortRuntime
} from "../src/tasks/crossTabSortExecution";
import { GameInteractionLease } from "../src/tasks/taskMachine";

const metadata = {
  id: "id.item.test_armor" as const,
  rarity: "Common",
  inventoryWidth: 2,
  inventoryHeight: 2,
  maxStackSize: 1,
  itemType: "armor"
};

const transfer: CrossTabTransfer = {
  transferId: "cross-tab-001",
  itemAlias: "item-001",
  category: "gear",
  width: 2,
  height: 2,
  sourceInventoryId: 4,
  sourceTabIndex: 0,
  bagSlotId: 0,
  targetInventoryId: 20,
  targetTabIndex: 1,
  targetSlotId: 13,
  actions: [
    { kind: "select-stash-tab", tabIndex: 0, inventoryId: 4 },
    {
      kind: "drag-stash-to-bag",
      itemAlias: "item-001",
      source: { inventoryId: 4, slotId: 0, point: { x: 0, y: 0 } },
      destination: { inventoryId: 2, slotId: 0, point: { x: 0, y: 0 } }
    },
    { kind: "select-stash-tab", tabIndex: 1, inventoryId: 20 },
    {
      kind: "drag-bag-to-stash",
      itemAlias: "item-001",
      source: { inventoryId: 2, slotId: 0, point: { x: 0, y: 0 } },
      destination: { inventoryId: 20, slotId: 13, point: { x: 1, y: 1 } }
    }
  ]
};

const readyPlan = (overrides: Partial<Extract<CrossTabSortPlan, { status: "ready" }>> = {}):
Extract<CrossTabSortPlan, { status: "ready" }> => ({
  status: "ready",
  sourceSnapshotHash: "before-hash",
  sourceSnapshotVersion: 1,
  bag: {
    inventoryId: 2,
    itemCount: 0,
    occupiedCellCount: 0,
    freeCellCount: 50,
    largestFreeRectangleCellCount: 50
  },
  transfers: [transfer],
  diagnostics: [],
  maximumTransfers: 1,
  independentTransfersOnly: true,
  ...overrides
});

function postProjection(slotId = 13): SpatialProjection {
  const item: SpatialPlacement = {
    alias: "item-001",
    inventoryId: 20,
    slotId,
    x: slotId % 12,
    y: Math.floor(slotId / 12),
    width: 2,
    height: 2,
    stackQuantity: 1,
    metadata
  };
  const containers: SpatialContainer[] = [
    {
      inventoryId: 2,
      status: "ready",
      geometry: { kind: "bag", columns: 10, rows: 5 },
      placements: [],
      diagnostics: []
    },
    {
      inventoryId: 4,
      status: "ready",
      geometry: { kind: "rectangular", columns: 12, rows: 20 },
      placements: [],
      diagnostics: []
    },
    {
      inventoryId: 20,
      status: "ready",
      geometry: { kind: "rectangular", columns: 12, rows: 20 },
      placements: [item],
      diagnostics: []
    }
  ];
  return {
    sourceSnapshotHash: "after-hash",
    sourceVersion: 2,
    containers,
    ready: true
  };
}

function fakeRuntime(overrides: Partial<CrossTabSortRuntime> = {}) {
  const calls: string[] = [];
  const completed: CrossTabRuntimeActionResult = { status: "completed" };
  const runtime: CrossTabSortRuntime = {
    async preflight() {
      calls.push("preflight");
      return undefined;
    },
    async selectStashTab(tabIndex, inventoryId) {
      calls.push(`select:${tabIndex}:${inventoryId}`);
      return completed;
    },
    async dragStashToBag(value) {
      calls.push(`to-bag:${value.itemAlias}`);
      return completed;
    },
    async dragBagToStash(value) {
      calls.push(`to-stash:${value.itemAlias}`);
      return completed;
    },
    async refreshCompletePostState() {
      calls.push("refresh");
      return postProjection();
    },
    ...overrides
  };
  return { calls, runtime };
}

describe("cross-tab sort execution", () => {
  it("previews without calling the runtime or dispatching a drag", () => {
    const plan = readyPlan();
    const { calls, runtime } = fakeRuntime();
    expect(new CrossTabSortExecutionRunner(new GameInteractionLease(), runtime).preview(plan))
      .toEqual({ status: "dry-run", transferCount: 1, dragCount: 0 });
    expect(calls).toEqual([]);
  });

  it("executes the two-leg route in order and confirms it from a newer complete state", async () => {
    const plan = readyPlan();
    const { calls, runtime } = fakeRuntime();
    const lease = new GameInteractionLease();
    const result = await new CrossTabSortExecutionRunner(lease, runtime).execute({
      plan,
      approval: issueCrossTabLocalApproval(plan, 1)
    });

    expect(calls).toEqual([
      "preflight",
      "select:0:4",
      "to-bag:item-001",
      "select:1:20",
      "to-stash:item-001",
      "refresh"
    ]);
    expect(result).toMatchObject({
      status: "confirmed",
      transferCount: 1,
      dragCount: 2
    });
    expect(lease.currentOwner()).toBeUndefined();
  });

  it("rejects a stale process-local approval before runtime work", async () => {
    const approvedPlan = readyPlan();
    const changedPlan = readyPlan({
      transfers: [{ ...transfer, targetSlotId: 14 }]
    });
    const { calls, runtime } = fakeRuntime();
    const result = await new CrossTabSortExecutionRunner(new GameInteractionLease(), runtime).execute({
      plan: changedPlan,
      approval: issueCrossTabLocalApproval(approvedPlan, 1)
    });
    expect(result).toEqual({
      status: "blocked",
      diagnosticCode: "local-approval-missing-or-stale",
      transferCount: 0,
      dragCount: 0
    });
    expect(calls).toEqual([]);
  });

  it("does not retry when the first drag is rejected", async () => {
    const plan = readyPlan();
    const { calls, runtime } = fakeRuntime({
      async dragStashToBag(value) {
        calls.push(`to-bag:${value.itemAlias}`);
        return { status: "failed", diagnosticCode: "leftdown-rejected" };
      }
    });
    const result = await new CrossTabSortExecutionRunner(new GameInteractionLease(), runtime).execute({
      plan,
      approval: issueCrossTabLocalApproval(plan, 1)
    });
    expect(result).toEqual({
      status: "blocked",
      diagnosticCode: "leftdown-rejected",
      transferCount: 0,
      dragCount: 0
    });
    expect(calls).toEqual(["preflight", "select:0:4", "to-bag:item-001"]);
  });

  it("reports that the item may remain in the bag when the second leg fails", async () => {
    const plan = readyPlan();
    const { runtime } = fakeRuntime({
      async dragBagToStash() {
        return { status: "failed", diagnosticCode: "leftup-rejected", inputMayHaveBeenDispatched: true };
      }
    });
    const result = await new CrossTabSortExecutionRunner(new GameInteractionLease(), runtime).execute({
      plan,
      approval: issueCrossTabLocalApproval(plan, 1)
    });
    expect(result).toEqual({
      status: "ambiguous",
      diagnosticCode: "item-may-remain-in-bag",
      transferCount: 0,
      dragCount: 1
    });
  });

  it("does not confirm when automatic refresh disagrees with the planned destination", async () => {
    const plan = readyPlan();
    const { runtime } = fakeRuntime({
      async refreshCompletePostState() {
        return postProjection(14);
      }
    });
    const result = await new CrossTabSortExecutionRunner(new GameInteractionLease(), runtime).execute({
      plan,
      approval: issueCrossTabLocalApproval(plan, 1)
    });
    expect(result).toMatchObject({
      status: "ambiguous",
      diagnosticCode: "post-state-destination-mismatch",
      transferCount: 1,
      dragCount: 2
    });
  });
});
