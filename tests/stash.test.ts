import { describe, expect, it } from "vitest";
import {
  isCellAvailable,
  itemTouchesReservedRegion,
  validateReservedRegions
} from "../src/domain/stash";

describe("reserved stash regions", () => {
  const regions = [{ x: 2, y: 1, width: 3, height: 2 }];

  it("validates a rectangular fixed area inside the grid", () => {
    expect(validateReservedRegions({ columns: 10, rows: 5 }, regions)).toEqual({
      valid: true,
      errors: []
    });
  });

  it("makes every reserved cell unavailable to the planner", () => {
    expect(isCellAvailable(2, 1, regions)).toBe(false);
    expect(isCellAvailable(4, 2, regions)).toBe(false);
    expect(isCellAvailable(5, 2, regions)).toBe(true);
  });

  it("locks any item whose footprint touches a reserved region", () => {
    expect(
      itemTouchesReservedRegion({ instanceKey: "item", bounds: { x: 1, y: 1, width: 2, height: 1 } }, regions)
    ).toBe(true);
  });
});
