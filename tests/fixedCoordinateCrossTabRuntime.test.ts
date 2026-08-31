import { describe, expect, it } from "vitest";
import { SORT_INPUT_TIMING_PRESETS } from "../src/domain/automationTiming";
import type { SpatialProjection } from "../src/domain/inventoryGeometry";
import type { CrossTabSortPlan, CrossTabTransfer } from "../src/domain/stashRouting";
import {
  FixedCoordinateCrossTabRuntime,
  type FixedCoordinateCrossTabAdapter
} from "../src/tasks/fixedCoordinateCrossTabRuntime";
import type { NavigationWindowState } from "../src/tasks/windowsNavigationRuntime";

const windowState: NavigationWindowState = {
  windowHandle: "0x1",
  processName: "DungeonCrawler",
  clientBounds: { left: 0, top: 0, width: 1920, height: 1080 },
  display: { left: 0, top: 0, width: 1920, height: 1080 },
  primaryDisplay: { left: 0, top: 0, width: 1920, height: 1080 },
  gameBuildFingerprint: "build"
};

const transfer: CrossTabTransfer = {
  transferId: "cross-tab-001",
  itemAlias: "item-001",
  category: "gear",
  width: 1,
  height: 1,
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

const plan: Extract<CrossTabSortPlan, { status: "ready" }> = {
  status: "ready",
  sourceSnapshotHash: "before",
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
  independentTransfersOnly: true
};

function setup(options: {
  window?: NavigationWindowState;
  screen?: "stash" | "lobby";
  observedTab?: number;
} = {}) {
  const calls: Array<{ kind: string; value?: unknown }> = [];
  const adapter: FixedCoordinateCrossTabAdapter = {
    async inspectWindow() {
      calls.push({ kind: "inspect" });
      return options.window ?? windowState;
    },
    async classifyScreen() {
      calls.push({ kind: "classify" });
      return {
        status: "classified",
        observation: {
          screen: options.screen ?? "stash",
          ...(options.observedTab === undefined
            ? {}
            : { selectedStashTabIndex: options.observedTab })
        }
      };
    },
    async clickForeground(point) {
      calls.push({ kind: "click", value: point });
      return { status: "clicked" };
    },
    async dragForeground(drag) {
      calls.push({ kind: "drag", value: drag });
      return { status: "completed" };
    }
  };
  const projection = {
    sourceSnapshotHash: "after",
    sourceVersion: 2,
    containers: [],
    ready: true
  } satisfies SpatialProjection;
  const runtime = new FixedCoordinateCrossTabRuntime(
    adapter,
    {
      async refreshCompleteProjection() {
        calls.push({ kind: "refresh" });
        return projection;
      }
    },
    windowState,
    4,
    SORT_INPUT_TIMING_PRESETS.fast
  );
  return { calls, projection, runtime };
}

describe("fixed-coordinate cross-tab runtime", () => {
  it("passes preflight from the known Stash screen without calibration", async () => {
    const { calls, runtime } = setup();
    await expect(runtime.preflight(plan)).resolves.toBeUndefined();
    expect(calls.map((call) => call.kind)).toEqual(["inspect", "classify"]);
    expect(runtime.layout.stash.playerBagGridTopLeft).toEqual({ x: 688, y: 625 });
  });

  it("selects a tab and dispatches fixed-coordinate drags without retry", async () => {
    const { calls, runtime } = setup();
    await expect(runtime.selectStashTab(0, 4)).resolves.toEqual({ status: "completed" });
    await expect(runtime.dragStashToBag(transfer)).resolves.toEqual({ status: "completed" });
    await expect(runtime.selectStashTab(1, 20)).resolves.toEqual({ status: "completed" });
    await expect(runtime.dragBagToStash(transfer)).resolves.toEqual({ status: "completed" });

    expect(calls.filter((call) => call.kind === "click").map((call) => call.value)).toEqual([
      { x: 1328, y: 211 },
      { x: 1328, y: 256 }
    ]);
    expect(calls.filter((call) => call.kind === "drag").map((call) => call.value)).toEqual([
      {
        source: { x: 1398.25, y: 219.25 },
        destination: { x: 708.1, y: 644.8 },
        durationMilliseconds: 160,
        pointerSettleMilliseconds: 20,
        postDragMilliseconds: 60
      },
      {
        source: { x: 708.1, y: 644.8 },
        destination: { x: 1438.75, y: 259.75 },
        durationMilliseconds: 160,
        pointerSettleMilliseconds: 20,
        postDragMilliseconds: 60
      }
    ]);
  });

  it("fails closed when the game window or observed tab does not match", async () => {
    const moved = setup({
      window: {
        ...windowState,
        clientBounds: { ...windowState.clientBounds, left: 1 }
      }
    });
    await expect(moved.runtime.preflight(plan)).resolves.toBe("window-bounds-changed");

    const wrongTab = setup({ observedTab: 2 });
    await expect(wrongTab.runtime.selectStashTab(1, 20)).resolves.toMatchObject({
      status: "failed",
      diagnosticCode: "selected-stash-tab-mismatch"
    });
  });

  it("delegates final verification to the established complete-state refresher", async () => {
    const { calls, projection, runtime } = setup();
    await expect(runtime.refreshCompletePostState()).resolves.toBe(projection);
    expect(calls.at(-1)?.kind).toBe("refresh");
  });
});
