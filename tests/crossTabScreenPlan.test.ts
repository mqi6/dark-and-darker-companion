import { describe, expect, it } from "vitest";
import { buildGameScreenLayout } from "../src/domain/gameScreenLayout";
import {
  prepareCrossTabScreenBatch,
  prepareCrossTabScreenTransfer
} from "../src/domain/crossTabScreenPlan";
import type { CrossTabTransfer } from "../src/domain/stashRouting";

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

const layout = buildGameScreenLayout({
  clientBounds: { left: 0, top: 0, width: 1920, height: 1080 },
  visibleStashTabs: 4
});

describe("fixed cross-tab screen plan", () => {
  it("uses existing stash coordinates and the supplied 10x5 bag bounds", () => {
    expect(prepareCrossTabScreenTransfer(transfer, layout)).toEqual({
      transferId: "cross-tab-001",
      itemAlias: "item-001",
      sourceTab: { tabIndex: 0, point: { x: 1328, y: 211 } },
      stashToBag: {
        source: { x: 1418.5, y: 239.5 },
        destination: { x: 728.2, y: 664.6 }
      },
      targetTab: { tabIndex: 1, point: { x: 1328, y: 256 } },
      bagToStash: {
        source: { x: 728.2, y: 664.6 },
        destination: { x: 1459, y: 280 }
      }
    });
  });

  it("moves the same plan onto a secondary monitor through client-relative scaling", () => {
    const secondary = buildGameScreenLayout({
      clientBounds: { left: 1920, top: 0, width: 1920, height: 1080 },
      visibleStashTabs: 4
    });
    const prepared = prepareCrossTabScreenTransfer(transfer, secondary);
    expect(prepared.stashToBag.source.x).toBe(3338.5);
    expect(prepared.stashToBag.destination.x).toBe(2648.2);
    expect(prepared.targetTab.point.x).toBe(3248);
  });

  it("rejects an unavailable tab and batches larger than three", () => {
    expect(() => prepareCrossTabScreenTransfer({
      ...transfer,
      targetTabIndex: 4
    }, layout)).toThrow(/not visible/);
    expect(() => prepareCrossTabScreenBatch([
      transfer,
      { ...transfer, transferId: "2" },
      { ...transfer, transferId: "3" },
      { ...transfer, transferId: "4" }
    ], layout)).toThrow(/one through three/);
  });
});
