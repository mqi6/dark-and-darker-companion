import { describe, expect, it } from "vitest";
import type { CompleteStashSortPlan } from "../src/domain/completeStashSort";
import type { ScheduledStashSortScreenAction } from "../src/domain/completeStashScreenPlan";
import type {
  SpatialPlacement,
  SpatialProjection
} from "../src/domain/inventoryGeometry";
import type { ScheduledStashSort } from "../src/domain/stashMoveScheduler";
import {
  CompleteStashSortExecutionRunner,
  issueCompleteSortLocalApproval,
  reconcileCompleteStashSort,
  type CompleteStashSortRuntime
} from "../src/tasks/completeStashSortExecution";
import { GameInteractionLease } from "../src/tasks/taskMachine";

const metadata = {
  id: "id.item.test" as const,
  rarity: "Common",
  inventoryWidth: 1,
  inventoryHeight: 1,
  maxStackSize: 1,
  itemType: "armor"
};

function item(alias: string, inventoryId: number, slotId: number): SpatialPlacement {
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

function projection(version: number, pageSlot: number, bagItems: SpatialPlacement[] = []): SpatialProjection {
  return {
    sourceSnapshotHash: version === 1 ? "before" : "after",
    sourceVersion: version,
    ready: true,
    containers: [
      {
        inventoryId: 2,
        status: "ready",
        geometry: { kind: "bag", columns: 10, rows: 5 },
        placements: bagItems,
        diagnostics: []
      },
      {
        inventoryId: 4,
        status: "ready",
        geometry: { kind: "rectangular", columns: 12, rows: 20 },
        placements: [item("a", 4, pageSlot)],
        diagnostics: []
      }
    ]
  };
}

const plan: Extract<CompleteStashSortPlan, { status: "ready" }> = {
  status: "ready",
  mode: "compact-top-left",
  sourceSnapshotHash: "before",
  sourceSnapshotVersion: 1,
  pages: [{
    inventoryId: 4,
    tabIndex: 0,
    placements: [{
      alias: "a",
      category: "gear",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      slotId: 0
    }],
    pinnedAliases: []
  }],
  moves: [{
    alias: "a",
    category: "gear",
    width: 1,
    height: 1,
    route: "same-tab",
    source: {
      inventoryId: 4,
      tabIndex: 0,
      slotId: 5,
      point: { x: 5, y: 0 }
    },
    destination: {
      inventoryId: 4,
      tabIndex: 0,
      slotId: 0,
      point: { x: 0, y: 0 }
    }
  }],
  skippedAliases: [],
  diagnostics: [],
  verification: "single-final-complete-refresh"
};

const schedule: Extract<ScheduledStashSort, { status: "ready" }> = {
  status: "ready",
  actions: [
    { kind: "select-stash-tab", tabIndex: 0, inventoryId: 4 },
    {
      kind: "drag-stash-to-stash",
      itemAlias: "a",
      width: 1,
      height: 1,
      source: { inventoryId: 4, point: { x: 5, y: 0 }, slotId: 5 },
      destination: { inventoryId: 4, point: { x: 0, y: 0 }, slotId: 0 }
    }
  ],
  itemMoveCount: 1,
  dragCount: 1,
  temporaryBufferCount: 0,
  usesSingleInitialSnapshot: true
};

const screenActions: ScheduledStashSortScreenAction[] = [
  { kind: "select-stash-tab", tabIndex: 0, inventoryId: 4, point: { x: 1, y: 1 } },
  {
    kind: "drag-stash-to-stash",
    itemAlias: "a",
    source: { x: 2, y: 2 },
    destination: { x: 3, y: 3 }
  }
];

function fakeRuntime(postState = projection(2, 0)) {
  const calls: string[] = [];
  const runtime: CompleteStashSortRuntime = {
    async preflightScheduledScreenActions() {
      calls.push("preflight");
      return undefined;
    },
    async runScheduledScreenAction(action) {
      calls.push(action.kind);
      return { status: "completed" };
    },
    async refreshCompletePostState() {
      calls.push("refresh");
      return postState;
    }
  };
  return { calls, runtime };
}

describe("complete stash sort execution", () => {
  it("executes every action from the initial plan and refreshes exactly once at the end", async () => {
    const before = projection(1, 5);
    const { calls, runtime } = fakeRuntime();
    const lease = new GameInteractionLease();
    const runner = new CompleteStashSortExecutionRunner(lease, runtime);
    const result = await runner.execute({
      plan,
      schedule,
      screenActions,
      initialProjection: before,
      approval: issueCompleteSortLocalApproval(plan, schedule, 1)
    });

    expect(calls).toEqual([
      "preflight",
      "select-stash-tab",
      "drag-stash-to-stash",
      "refresh"
    ]);
    expect(result).toMatchObject({
      status: "confirmed",
      actionCount: 2,
      dragCount: 1
    });
    expect(lease.currentOwner()).toBeUndefined();
  });

  it("does not accept an approval for a different action sequence", async () => {
    const changed = {
      ...schedule,
      actions: [...schedule.actions].reverse()
    } satisfies Extract<ScheduledStashSort, { status: "ready" }>;
    const { calls, runtime } = fakeRuntime();
    const result = await new CompleteStashSortExecutionRunner(
      new GameInteractionLease(),
      runtime
    ).execute({
      plan,
      schedule: changed,
      screenActions: [...screenActions].reverse(),
      initialProjection: projection(1, 5),
      approval: issueCompleteSortLocalApproval(plan, schedule, 1)
    });
    expect(result).toMatchObject({
      status: "blocked",
      diagnosticCode: "local-approval-missing-or-stale"
    });
    expect(calls).toEqual([]);
  });

  it("requires the final bag to match the initial bag", () => {
    expect(reconcileCompleteStashSort(
      plan,
      projection(1, 5),
      projection(2, 0, [item("left-in-bag", 2, 0)])
    )).toBe("post-state-bag-not-restored");
  });

  it("reports final page disagreement without dispatching a retry", async () => {
    const { calls, runtime } = fakeRuntime(projection(2, 1));
    const result = await new CompleteStashSortExecutionRunner(
      new GameInteractionLease(),
      runtime
    ).execute({
      plan,
      schedule,
      screenActions,
      initialProjection: projection(1, 5),
      approval: issueCompleteSortLocalApproval(plan, schedule, 1)
    });
    expect(result).toMatchObject({
      status: "ambiguous",
      diagnosticCode: "post-state-layout-mismatch"
    });
    expect(calls.filter((call) => call === "refresh")).toHaveLength(1);
  });
});
