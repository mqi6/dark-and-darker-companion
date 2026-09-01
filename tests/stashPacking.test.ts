import { describe, expect, it } from "vitest";
import { packStash, type StashPackingItem } from "../src/domain/stashPacking";

const items: StashPackingItem[] = [
  { alias: "gear-large", width: 2, height: 2, category: "gear" },
  { alias: "weapon-tall", width: 1, height: 3, category: "weapon" },
  { alias: "gear-small", width: 1, height: 1, category: "gear" },
  { alias: "money-a", width: 1, height: 1, category: "currency" },
  { alias: "money-b", width: 1, height: 1, category: "currency" }
];

describe("stash packing", () => {
  it("packs large items deterministically from the top-left in compact mode", () => {
    const first = packStash({
      grid: { columns: 4, rows: 6 },
      items,
      mode: "compact-top-left"
    });
    const second = packStash({
      grid: { columns: 4, rows: 6 },
      items: [...items].reverse(),
      mode: "compact-top-left"
    });

    expect(first.complete).toBe(true);
    expect(first.placements).toEqual(second.placements);
    expect(first.placements.find((item) => item.alias === "gear-large"))
      .toMatchObject({ x: 0, y: 0, width: 2, height: 2 });
    expect(noOverlaps(first.placements)).toBe(true);
  });

  it("starts each category on a new row and leaves the preceding row remainder empty", () => {
    const result = packStash({
      grid: { columns: 6, rows: 6 },
      items: [
        { alias: "gear-a", width: 2, height: 1, category: "gear" },
        { alias: "gear-b", width: 2, height: 1, category: "gear" },
        { alias: "weapon-a", width: 1, height: 1, category: "weapon" }
      ],
      mode: "category-rows",
      categoryOrder: ["gear", "weapon"]
    });

    expect(result.complete).toBe(true);
    expect(result.placements).toEqual([
      expect.objectContaining({ alias: "gear-a", x: 0, y: 0 }),
      expect.objectContaining({ alias: "gear-b", x: 2, y: 0 }),
      expect.objectContaining({ alias: "weapon-a", x: 0, y: 1 })
    ]);
    expect(result.placements.some((item) => item.category === "weapon" && item.y === 0))
      .toBe(false);
  });

  it("keeps all rows for one category contiguous before starting the next category", () => {
    const result = packStash({
      grid: { columns: 4, rows: 5 },
      items: [
        { alias: "gear-a", width: 3, height: 1, category: "gear" },
        { alias: "gear-b", width: 3, height: 1, category: "gear" },
        { alias: "money", width: 1, height: 1, category: "currency" }
      ],
      mode: "category-rows",
      categoryOrder: ["gear", "currency"]
    });

    expect(result.placements.find((item) => item.alias === "gear-a")?.y).toBe(0);
    expect(result.placements.find((item) => item.alias === "gear-b")?.y).toBe(1);
    expect(result.placements.find((item) => item.alias === "money")?.y).toBe(2);
  });

  it("treats reserved rectangles as occupied in both modes", () => {
    for (const mode of ["compact-top-left", "category-rows"] as const) {
      const result = packStash({
        grid: { columns: 4, rows: 4 },
        items: [{ alias: "item", width: 2, height: 2, category: "gear" }],
        mode,
        reservedRegions: [{ x: 0, y: 0, width: 2, height: 2 }]
      });
      expect(result.placements[0]).toMatchObject({ x: 2, y: 0 });
    }
  });

  it("reports items that cannot fit without inventing a footprint", () => {
    const result = packStash({
      grid: { columns: 2, rows: 2 },
      items: [
        { alias: "valid", width: 2, height: 2, category: "gear" },
        { alias: "overflow", width: 1, height: 1, category: "gear" },
        { alias: "invalid", width: 0, height: 1, category: "gear" }
      ],
      mode: "compact-top-left"
    });

    expect(result.complete).toBe(false);
    expect(result.placements.map((item) => item.alias)).toEqual(["valid"]);
    expect(result.failures).toEqual([
      expect.objectContaining({ alias: "invalid", code: "invalid-item-footprint" }),
      expect.objectContaining({ alias: "overflow", code: "no-fitting-space" })
    ]);
  });
});

function noOverlaps(
  placements: readonly { x: number; y: number; width: number; height: number }[]
): boolean {
  const occupied = new Set<string>();
  for (const placement of placements) {
    for (let y = placement.y; y < placement.y + placement.height; y += 1) {
      for (let x = placement.x; x < placement.x + placement.width; x += 1) {
        const key = `${x},${y}`;
        if (occupied.has(key)) return false;
        occupied.add(key);
      }
    }
  }
  return true;
}
