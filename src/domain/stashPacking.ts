import type { GridPoint } from "./inventoryGeometry";
import type { GridRectangle, GridSize } from "./stash";

export const STASH_PACKING_MODES = [
  "compact-top-left",
  "category-rows"
] as const;

export type StashPackingMode = typeof STASH_PACKING_MODES[number];

export interface StashPackingItem {
  alias: string;
  width: number;
  height: number;
  category: string;
}

export interface StashPackedPlacement extends GridPoint {
  alias: string;
  width: number;
  height: number;
  category: string;
  slotId: number;
}

export interface StashPackingFailure {
  alias: string;
  code: "invalid-item-footprint" | "no-fitting-space";
  detail: string;
}

export interface StashPackingResult {
  mode: StashPackingMode;
  placements: readonly StashPackedPlacement[];
  failures: readonly StashPackingFailure[];
  complete: boolean;
}

/**
 * Deterministic two-dimensional stash packing.
 *
 * compact-top-left uses first-fit decreasing over the whole available grid.
 * category-rows starts every category on a fresh row band, intentionally
 * leaving the remainder of the previous category's last row unused.
 */
export function packStash(parameters: {
  grid: GridSize;
  items: readonly StashPackingItem[];
  mode: StashPackingMode;
  reservedRegions?: readonly GridRectangle[];
  categoryOrder?: readonly string[];
}): StashPackingResult {
  validateGrid(parameters.grid);
  const reserved = parameters.reservedRegions ?? [];
  validateReserved(parameters.grid, reserved);

  const failures: StashPackingFailure[] = [];
  const validItems = parameters.items.filter((item) => {
    const valid = Number.isInteger(item.width) && Number.isInteger(item.height) &&
      item.width > 0 && item.height > 0 &&
      item.width <= parameters.grid.columns &&
      item.height <= parameters.grid.rows;
    if (!valid) {
      failures.push({
        alias: item.alias,
        code: "invalid-item-footprint",
        detail: `${item.alias} has an invalid ${item.width}x${item.height} footprint.`
      });
    }
    return valid;
  });

  const packed = parameters.mode === "compact-top-left"
    ? packCompact(parameters.grid, validItems, reserved, failures)
    : packCategoryRows(
        parameters.grid,
        validItems,
        reserved,
        parameters.categoryOrder ?? [],
        failures
      );

  return {
    mode: parameters.mode,
    placements: packed,
    failures,
    complete: failures.length === 0
  };
}

function packCompact(
  grid: GridSize,
  items: readonly StashPackingItem[],
  reserved: readonly GridRectangle[],
  failures: StashPackingFailure[]
): StashPackedPlacement[] {
  const occupied = occupiedFromReserved(reserved);
  const placements: StashPackedPlacement[] = [];
  for (const item of [...items].sort(comparePackingItems)) {
    const point = firstFreePoint(grid, item, occupied, 0);
    if (!point) {
      failures.push(noSpaceFailure(item));
      continue;
    }
    occupy(occupied, { ...point, width: item.width, height: item.height });
    placements.push(toPlacement(item, point, grid.columns));
  }
  return placements.sort(comparePlacements);
}

function packCategoryRows(
  grid: GridSize,
  items: readonly StashPackingItem[],
  reserved: readonly GridRectangle[],
  requestedOrder: readonly string[],
  failures: StashPackingFailure[]
): StashPackedPlacement[] {
  const occupied = occupiedFromReserved(reserved);
  const placements: StashPackedPlacement[] = [];
  const groups = new Map<string, StashPackingItem[]>();
  for (const item of items) {
    const group = groups.get(item.category) ?? [];
    group.push(item);
    groups.set(item.category, group);
  }
  const categories = orderedCategories(groups.keys(), requestedOrder);
  let categoryTop = 0;

  for (const category of categories) {
    const group = [...(groups.get(category) ?? [])].sort(comparePackingItems);
    if (group.length === 0) continue;
    let rowTop = categoryTop;
    let rowHeight = 0;
    let rowCursorX = 0;
    let categoryBottom = categoryTop;

    for (const item of group) {
      let point = firstShelfPoint(
        grid,
        item,
        occupied,
        rowTop,
        rowCursorX,
        Math.max(rowHeight, item.height)
      );

      if (!point) {
        rowTop += Math.max(1, rowHeight);
        rowHeight = 0;
        rowCursorX = 0;
        point = firstShelfPoint(grid, item, occupied, rowTop, 0, item.height);
      }

      while (!point && rowTop + item.height < grid.rows) {
        rowTop += 1;
        rowHeight = 0;
        rowCursorX = 0;
        point = firstShelfPoint(grid, item, occupied, rowTop, 0, item.height);
      }

      if (!point) {
        failures.push(noSpaceFailure(item));
        continue;
      }

      occupy(occupied, { ...point, width: item.width, height: item.height });
      placements.push(toPlacement(item, point, grid.columns));
      rowHeight = Math.max(rowHeight, item.height);
      rowCursorX = point.x + item.width;
      categoryBottom = Math.max(categoryBottom, point.y + item.height);
    }

    // The next category always begins below the current category, even when
    // horizontal cells remain unused in its last row.
    categoryTop = Math.max(categoryTop, categoryBottom);
  }

  return placements.sort(comparePlacements);
}

function firstShelfPoint(
  grid: GridSize,
  item: StashPackingItem,
  occupied: ReadonlySet<string>,
  rowTop: number,
  startX: number,
  rowBandHeight: number
): GridPoint | undefined {
  if (rowTop < 0 || rowTop + item.height > grid.rows ||
      item.height > rowBandHeight) return undefined;
  for (let x = startX; x <= grid.columns - item.width; x += 1) {
    const candidate = { x, y: rowTop, width: item.width, height: item.height };
    if (rectangleFree(candidate, occupied)) return { x, y: rowTop };
  }
  return undefined;
}

function firstFreePoint(
  grid: GridSize,
  item: StashPackingItem,
  occupied: ReadonlySet<string>,
  minimumY: number
): GridPoint | undefined {
  for (let y = minimumY; y <= grid.rows - item.height; y += 1) {
    for (let x = 0; x <= grid.columns - item.width; x += 1) {
      const candidate = { x, y, width: item.width, height: item.height };
      if (rectangleFree(candidate, occupied)) return { x, y };
    }
  }
  return undefined;
}

function orderedCategories(
  values: Iterable<string>,
  requestedOrder: readonly string[]
): string[] {
  const present = new Set(values);
  const ordered = requestedOrder.filter((category, index) =>
    present.has(category) && requestedOrder.indexOf(category) === index
  );
  const requested = new Set(ordered);
  return [
    ...ordered,
    ...[...present].filter((category) => !requested.has(category)).sort()
  ];
}

function comparePackingItems(left: StashPackingItem, right: StashPackingItem): number {
  return right.width * right.height - left.width * left.height ||
    right.height - left.height ||
    right.width - left.width ||
    left.category.localeCompare(right.category) ||
    left.alias.localeCompare(right.alias);
}

function comparePlacements(left: StashPackedPlacement, right: StashPackedPlacement): number {
  return left.y - right.y || left.x - right.x || left.alias.localeCompare(right.alias);
}

function toPlacement(
  item: StashPackingItem,
  point: GridPoint,
  columns: number
): StashPackedPlacement {
  return {
    ...point,
    alias: item.alias,
    width: item.width,
    height: item.height,
    category: item.category,
    slotId: point.y * columns + point.x
  };
}

function occupiedFromReserved(regions: readonly GridRectangle[]): Set<string> {
  const occupied = new Set<string>();
  for (const region of regions) occupy(occupied, region);
  return occupied;
}

function occupy(occupied: Set<string>, rectangle: GridRectangle): void {
  for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
    for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
      occupied.add(`${x},${y}`);
    }
  }
}

function rectangleFree(
  rectangle: GridRectangle,
  occupied: ReadonlySet<string>
): boolean {
  for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
    for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
      if (occupied.has(`${x},${y}`)) return false;
    }
  }
  return true;
}

function noSpaceFailure(item: StashPackingItem): StashPackingFailure {
  return {
    alias: item.alias,
    code: "no-fitting-space",
    detail: `No verified free rectangle can fit ${item.alias}.`
  };
}

function validateGrid(grid: GridSize): void {
  if (!Number.isInteger(grid.columns) || !Number.isInteger(grid.rows) ||
      grid.columns < 1 || grid.rows < 1) {
    throw new RangeError("Packing grid must use positive integer dimensions.");
  }
}

function validateReserved(grid: GridSize, regions: readonly GridRectangle[]): void {
  for (const region of regions) {
    if (![region.x, region.y, region.width, region.height].every(Number.isInteger) ||
        region.x < 0 || region.y < 0 || region.width < 1 || region.height < 1 ||
        region.x + region.width > grid.columns ||
        region.y + region.height > grid.rows) {
      throw new RangeError("Reserved region is outside the packing grid.");
    }
  }
}
