import { describe, expect, it } from "vitest";
import type { GameplayItemMetadata } from "../src/domain/gameplayCatalog";
import type { SpatialContainer, SpatialPlacement } from "../src/domain/inventoryGeometry";
import { planOnePageLayout } from "../src/domain/stashLayoutPlanner";

const metadata: GameplayItemMetadata = {
  id: "id.item.test",
  rarity: "common",
  inventoryWidth: 1,
  inventoryHeight: 1,
  maxStackSize: 1
};

function placement(alias: string, x: number, y: number, width: number, height: number): SpatialPlacement {
  return {
    alias,
    inventoryId: 20,
    slotId: y * 6 + x,
    x,
    y,
    width,
    height,
    stackQuantity: 1,
    metadata: { ...metadata, inventoryWidth: width, inventoryHeight: height }
  };
}

function container(placements: SpatialPlacement[]): SpatialContainer {
  return {
    inventoryId: 20,
    status: "ready",
    geometry: { kind: "rectangular", columns: 6, rows: 4 },
    placements,
    diagnostics: []
  };
}

describe("one-page stash layout planner", () => {
  it("packs in the explicit order and leaves reserved-region items untouched", () => {
    const result = planOnePageLayout(
      container([
        placement("locked", 0, 0, 2, 2),
        placement("tall", 2, 0, 1, 2),
        placement("small", 3, 0, 1, 1)
      ]),
      ["small", "tall", "locked"],
      [{ x: 0, y: 0, width: 1, height: 1 }]
    );

    expect(result).toMatchObject({
      status: "ready",
      lockedAliases: ["locked"],
      movedAliases: ["small", "tall"],
      placements: [
        { alias: "small", destinationSlotId: 2, x: 2, y: 0, locked: false },
        { alias: "tall", destinationSlotId: 3, x: 3, y: 0, locked: false },
        { alias: "locked", destinationSlotId: 0, x: 0, y: 0, locked: true }
      ]
    });
  });

  it("is deterministic for the same page, order, and reserved regions", () => {
    const page = container([
      placement("large", 4, 0, 2, 2),
      placement("small", 0, 3, 1, 1)
    ]);
    const first = planOnePageLayout(page, ["large", "small"], [{ x: 2, y: 0, width: 1, height: 2 }]);
    const second = planOnePageLayout(page, ["large", "small"], [{ x: 2, y: 0, width: 1, height: 2 }]);
    expect(second).toEqual(first);
  });

  it("fails closed for incomplete item order or an unready container", () => {
    const page = container([placement("one", 0, 0, 1, 1), placement("two", 1, 0, 1, 1)]);
    expect(planOnePageLayout(page, ["one"])).toMatchObject({ status: "blocked", reason: "item-order-invalid" });
    expect(planOnePageLayout({ ...page, status: "blocked" }, ["one", "two"]))
      .toMatchObject({ status: "blocked", reason: "container-not-ready" });
  });
});
