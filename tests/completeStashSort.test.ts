import { describe, expect, it } from "vitest";
import {
  planCompleteStashSort
} from "../src/domain/completeStashSort";
import type {
  SpatialContainer,
  SpatialPlacement,
  SpatialProjection
} from "../src/domain/inventoryGeometry";
import type { StashTabItemPolicy } from "../src/domain/stashRouting";
import { createCanonicalStashTabMapping } from "../src/domain/stashTabMapping";

const metadata = {
  gear: {
    id: "id.item.test_gear" as const,
    rarity: "Common",
    inventoryWidth: 2,
    inventoryHeight: 2,
    maxStackSize: 1,
    itemType: "armor"
  },
  weapon: {
    id: "id.item.test_weapon" as const,
    rarity: "Common",
    inventoryWidth: 1,
    inventoryHeight: 3,
    maxStackSize: 1,
    itemType: "weapon"
  },
  money: {
    id: "id.item.gold_coins" as const,
    rarity: "Common",
    inventoryWidth: 1,
    inventoryHeight: 1,
    maxStackSize: 10
  }
};

function item(
  alias: string,
  inventoryId: number,
  slotId: number,
  kind: keyof typeof metadata
): SpatialPlacement {
  const value = metadata[kind];
  return {
    alias,
    inventoryId,
    slotId,
    x: slotId % 12,
    y: Math.floor(slotId / 12),
    width: value.inventoryWidth,
    height: value.inventoryHeight,
    stackQuantity: 1,
    metadata: value
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

function projection(bagPlacements: SpatialPlacement[] = []): SpatialProjection {
  return {
    sourceSnapshotHash: "initial-hash",
    sourceVersion: 7,
    ready: true,
    containers: [
      {
        inventoryId: 2,
        status: "ready",
        geometry: { kind: "bag", columns: 10, rows: 5 },
        placements: bagPlacements.map((value) => ({
          ...value,
          inventoryId: 2,
          x: value.slotId % 10,
          y: Math.floor(value.slotId / 10)
        })),
        diagnostics: []
      },
      stash(4, [
        item("weapon-wrong-page", 4, 120, "weapon"),
        item("gear-a", 4, 180, "gear"),
        item("money-pinned", 4, 238, "money")
      ]),
      stash(20, [
        item("weapon-existing", 20, 100, "weapon")
      ])
    ]
  };
}

const mapping = createCanonicalStashTabMapping({
  runtimeProfileKey: "character",
  gameBuildFingerprint: "build",
  visibleInventoryIds: [4, 20]
});

const policies: StashTabItemPolicy[] = [
  {
    inventoryId: 4,
    enabled: true,
    allowedCategories: ["gear", "currency"],
    reservedRegions: [{ x: 10, y: 19, width: 2, height: 1 }]
  },
  {
    inventoryId: 20,
    enabled: true,
    allowedCategories: ["weapon"]
  }
];

describe("complete stash sort planning", () => {
  it("uses one initial snapshot and requests one final complete refresh", () => {
    const plan = planCompleteStashSort({
      projection: projection(),
      mapping,
      policies,
      mode: "compact-top-left"
    });
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.sourceSnapshotHash).toBe("initial-hash");
    expect(plan.sourceSnapshotVersion).toBe(7);
    expect(plan.verification).toBe("single-final-complete-refresh");
    expect(plan.moves.some((move) =>
      move.alias === "weapon-wrong-page" &&
      move.route === "via-character-bag" &&
      move.source.inventoryId === 4 &&
      move.destination.inventoryId === 20
    )).toBe(true);
  });

  it("supports category rows while keeping each next category below the previous one", () => {
    const allCategories: StashTabItemPolicy[] = [
      {
        inventoryId: 4,
        enabled: true,
        allowedCategories: ["gear", "weapon", "currency"]
      },
      {
        inventoryId: 20,
        enabled: false,
        allowedCategories: ["weapon"]
      }
    ];
    const plan = planCompleteStashSort({
      projection: projection(),
      mapping,
      policies: allCategories,
      mode: "category-rows"
    });
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    const page = plan.pages.find((candidate) => candidate.inventoryId === 4)!;
    const movable = page.placements.filter((placement) =>
      !page.pinnedAliases.includes(placement.alias)
    );
    const categoryMinimumY = new Map<string, number>();
    for (const placement of movable) {
      categoryMinimumY.set(
        placement.category,
        Math.min(categoryMinimumY.get(placement.category) ?? Infinity, placement.y)
      );
    }
    expect(categoryMinimumY.get("gear")).toBeLessThan(categoryMinimumY.get("weapon")!);
    expect(categoryMinimumY.get("weapon")).toBeLessThan(categoryMinimumY.get("currency")!);
  });

  it("pins items touching a reserved region and does not generate a move for them", () => {
    const plan = planCompleteStashSort({
      projection: projection(),
      mapping,
      policies,
      mode: "compact-top-left"
    });
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    const page = plan.pages.find((candidate) => candidate.inventoryId === 4)!;
    expect(page.pinnedAliases).toContain("money-pinned");
    expect(page.placements.find((placement) => placement.alias === "money-pinned"))
      .toMatchObject({ x: 10, y: 19, slotId: 238 });
    expect(plan.moves.some((move) => move.alias === "money-pinned")).toBe(false);
  });

  it("leaves disabled pages completely outside the plan", () => {
    const plan = planCompleteStashSort({
      projection: projection(),
      mapping,
      policies,
      excludedInventoryIds: [20],
      mode: "compact-top-left"
    });
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.pages.some((page) => page.inventoryId === 20)).toBe(false);
    expect(plan.moves.some((move) =>
      move.source.inventoryId === 20 || move.destination.inventoryId === 20
    )).toBe(false);
    expect(plan.skippedAliases).toContain("weapon-wrong-page");
  });

  it("skips a cross-tab item when the initial bag has no fitting rectangle", () => {
    const blockers: SpatialPlacement[] = Array.from({ length: 50 }, (_, index) => ({
      alias: `bag-${index}`,
      inventoryId: 2,
      slotId: index,
      x: index % 10,
      y: Math.floor(index / 10),
      width: 1,
      height: 1,
      stackQuantity: 1,
      metadata: metadata.money
    }));
    const plan = planCompleteStashSort({
      projection: projection(blockers),
      mapping,
      policies,
      mode: "compact-top-left"
    });
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") return;
    expect(plan.skippedAliases).toContain("weapon-wrong-page");
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      alias: "weapon-wrong-page",
      code: "bag-has-no-fitting-space"
    }));
  });
});
