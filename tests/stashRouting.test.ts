import { describe, expect, it } from "vitest";
import type { GameplayItemMetadata } from "../src/domain/gameplayCatalog";
import {
  CHARACTER_BAG_INVENTORY_ID,
  type SpatialContainer,
  type SpatialPlacement,
  type SpatialProjection
} from "../src/domain/inventoryGeometry";
import {
  analyzeCharacterBag,
  classifyStashItem,
  planCrossTabSmokeTransfer,
  planCrossTabTransfers,
  tabPolicyAllowsItem,
  type StashTabItemPolicy
} from "../src/domain/stashRouting";
import { createStashTabMapping } from "../src/domain/stashTabMapping";

const metadata = (
  id: GameplayItemMetadata["id"],
  itemType: string,
  slotType?: string,
  width = 1,
  height = 1
): GameplayItemMetadata => ({
  id,
  rarity: "Common",
  inventoryWidth: width,
  inventoryHeight: height,
  maxStackSize: 1,
  itemType,
  ...(slotType ? { slotType } : {})
});

function placement(
  alias: string,
  inventoryId: number,
  slotId: number,
  itemMetadata: GameplayItemMetadata,
  columns: number
): SpatialPlacement {
  return {
    alias,
    inventoryId,
    slotId,
    x: slotId % columns,
    y: Math.floor(slotId / columns),
    width: itemMetadata.inventoryWidth,
    height: itemMetadata.inventoryHeight,
    stackQuantity: 1,
    metadata: itemMetadata
  };
}

function stash(inventoryId: number, placements: SpatialPlacement[]): SpatialContainer {
  return {
    inventoryId,
    status: "ready",
    geometry: { kind: "rectangular", columns: 12, rows: 20 },
    placements,
    diagnostics: []
  };
}

function bag(placements: SpatialPlacement[] = []): SpatialContainer {
  return {
    inventoryId: CHARACTER_BAG_INVENTORY_ID,
    status: "ready",
    geometry: { kind: "bag", columns: 10, rows: 5 },
    placements,
    diagnostics: []
  };
}

const mapping = createStashTabMapping({
  runtimeProfileKey: "opaque-character",
  gameBuildFingerprint: "build",
  availableInventoryIds: [4, 20, 21],
  entries: [
    { tabIndex: 0, inventoryId: 4 },
    { tabIndex: 1, inventoryId: 20 },
    { tabIndex: 2, inventoryId: 21 }
  ]
});

const projection = (containers: SpatialContainer[]): SpatialProjection => ({
  sourceSnapshotHash: "snapshot",
  sourceVersion: 7,
  containers,
  ready: containers.every(container => container.status !== "blocked")
});

const policies: StashTabItemPolicy[] = [
  { inventoryId: 4, enabled: true, allowedCategories: ["misc"] },
  { inventoryId: 20, enabled: true, allowedCategories: ["gear"] },
  { inventoryId: 21, enabled: true, allowedCategories: ["weapon", "jewelry", "currency", "currency-container"] }
];

describe("stash item categories and tab policies", () => {
  it("separates gear, weapons, jewelry, money, and money containers", () => {
    expect(classifyStashItem(metadata("id.item.armor", "armor", "Chest"))).toBe("gear");
    expect(classifyStashItem(metadata("id.item.sword", "weapon", "Primary"))).toBe("weapon");
    expect(classifyStashItem(metadata("id.item.ring", "accessory", "Ring"))).toBe("jewelry");
    expect(classifyStashItem(metadata("id.item.gold_coins", "misc"))).toBe("currency");
    expect(classifyStashItem(metadata("id.item.gold_coin_bag", "misc"))).toBe("currency-container");
  });

  it("applies explicit allow and deny IDs around category rules", () => {
    const item = placement("gear", 4, 0, metadata("id.item.armor", "armor"), 12);
    expect(tabPolicyAllowsItem(policies[1]!, item)).toBe(true);
    expect(tabPolicyAllowsItem({
      ...policies[1]!,
      deniedItemIds: ["id.item.armor"]
    }, item)).toBe(false);
    expect(tabPolicyAllowsItem({
      inventoryId: 20,
      enabled: true,
      allowedCategories: [],
      allowedItemIds: ["id.item.armor"]
    }, item)).toBe(true);
  });
});

describe("character bag capacity", () => {
  it("reports item count and spatial free capacity instead of treating every item as 1x1", () => {
    const large = metadata("id.item.large", "misc", undefined, 2, 2);
    const small = metadata("id.item.small", "misc");
    const capacity = analyzeCharacterBag(bag([
      placement("large", 2, 0, large, 10),
      placement("small", 2, 12, small, 10)
    ]));
    expect(capacity).toMatchObject({
      itemCount: 2,
      occupiedCellCount: 5,
      freeCellCount: 45
    });
    expect(capacity.largestFreeRectangleCellCount).toBeGreaterThan(0);
  });
});

describe("bag-backed cross-tab planner", () => {
  it("prepares exactly one policy-free smoke transfer through the bag", () => {
    const item = placement("smoke", 4, 0, metadata("id.item.smoke", "armor", undefined, 2, 2), 12);
    const result = planCrossTabSmokeTransfer({
      projection: projection([stash(4, [item]), stash(20, []), stash(21, []), bag()]),
      mapping
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0]).toMatchObject({
      itemAlias: "smoke",
      quantity: 1,
      sourceInventoryId: 4,
      targetInventoryId: 20
    });
    expect(result.transfers[0]!.actions.map(action => action.kind)).toEqual([
      "select-stash-tab", "drag-stash-to-bag", "select-stash-tab", "drag-bag-to-stash"
    ]);
  });

  it("routes a disallowed stash item through one reusable bag slot", () => {
    const armor = metadata("id.item.armor", "armor", "Chest", 2, 2);
    const result = planCrossTabTransfers({
      projection: projection([
        stash(4, [placement("armor-1", 4, 0, armor, 12)]),
        stash(20, []),
        stash(21, []),
        bag()
      ]),
      mapping,
      policies
    });
    expect(result).toMatchObject({
      status: "ready",
      bag: { itemCount: 0, freeCellCount: 50 },
      independentTransfersOnly: true,
      transfers: [{
        itemAlias: "armor-1",
        category: "gear",
        sourceInventoryId: 4,
        sourceTabIndex: 0,
        targetInventoryId: 20,
        targetTabIndex: 1,
        actions: [
          { kind: "select-stash-tab", tabIndex: 0 },
          { kind: "drag-stash-to-bag", destination: { inventoryId: 2, slotId: 0 } },
          { kind: "select-stash-tab", tabIndex: 1 },
          { kind: "drag-bag-to-stash", source: { inventoryId: 2, slotId: 0 } }
        ]
      }]
    });
  });

  it("never moves items out of a user-disabled source page", () => {
    const armor = metadata("id.item.armor", "armor");
    const result = planCrossTabTransfers({
      projection: projection([
        stash(4, [placement("armor-1", 4, 0, armor, 12)]),
        stash(20, []),
        stash(21, []),
        bag()
      ]),
      mapping,
      policies: [{ ...policies[0]!, enabled: false }, policies[1]!, policies[2]!]
    });
    expect(result.status).toBe("ready");
    if (result.status === "ready") expect(result.transfers).toHaveLength(0);
  });

  it("blocks a transfer when the real bag occupancy has no fitting rectangle", () => {
    const filler = metadata("id.item.filler", "misc");
    const fullBag = Array.from({ length: 50 }, (_, slotId) =>
      placement(`bag-${slotId}`, 2, slotId, filler, 10)
    );
    const armor = metadata("id.item.armor", "armor", "Chest", 2, 2);
    const result = planCrossTabTransfers({
      projection: projection([
        stash(4, [placement("armor-1", 4, 0, armor, 12)]),
        stash(20, []),
        stash(21, []),
        bag(fullBag)
      ]),
      mapping,
      policies
    });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.transfers).toHaveLength(0);
      expect(result.diagnostics).toContainEqual(expect.objectContaining({
        code: "bag-has-no-fitting-space",
        itemAlias: "armor-1"
      }));
    }
  });

  it("limits the first live batch to three independent transfers", () => {
    const armor = metadata("id.item.armor", "armor");
    const result = planCrossTabTransfers({
      projection: projection([
        stash(4, Array.from({ length: 5 }, (_, slotId) =>
          placement(`armor-${slotId}`, 4, slotId, armor, 12)
        )),
        stash(20, []),
        stash(21, []),
        bag()
      ]),
      mapping,
      policies,
      maximumTransfers: 3
    });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.transfers).toHaveLength(3);
      expect(new Set(result.transfers.map(transfer => transfer.targetSlotId)).size).toBe(3);
    }
  });
});
