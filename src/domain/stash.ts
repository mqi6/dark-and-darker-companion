export interface GridSize {
  columns: number;
  rows: number;
}

export interface GridRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedItem {
  instanceKey: string;
  bounds: GridRectangle;
}

export interface ReservedRegionValidation {
  valid: boolean;
  errors: readonly string[];
}

export function validateReservedRegions(
  grid: GridSize,
  regions: readonly GridRectangle[]
): ReservedRegionValidation {
  const errors: string[] = [];
  if (!Number.isInteger(grid.columns) || grid.columns < 1) {
    errors.push("Grid columns must be a positive integer.");
  }
  if (!Number.isInteger(grid.rows) || grid.rows < 1) {
    errors.push("Grid rows must be a positive integer.");
  }

  regions.forEach((region, index) => {
    if (![region.x, region.y, region.width, region.height].every(Number.isInteger)) {
      errors.push(`Reserved region ${index} must use integer coordinates and dimensions.`);
      return;
    }
    if (region.x < 0 || region.y < 0 || region.width < 1 || region.height < 1) {
      errors.push(`Reserved region ${index} has invalid coordinates or dimensions.`);
      return;
    }
    if (region.x + region.width > grid.columns || region.y + region.height > grid.rows) {
      errors.push(`Reserved region ${index} extends outside the storage grid.`);
    }
  });

  return { valid: errors.length === 0, errors };
}

export function rectanglesIntersect(left: GridRectangle, right: GridRectangle): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

export function itemTouchesReservedRegion(
  item: PositionedItem,
  regions: readonly GridRectangle[]
): boolean {
  return regions.some((region) => rectanglesIntersect(item.bounds, region));
}

export function isCellAvailable(
  x: number,
  y: number,
  regions: readonly GridRectangle[]
): boolean {
  return !regions.some(
    (region) =>
      x >= region.x &&
      x < region.x + region.width &&
      y >= region.y &&
      y < region.y + region.height
  );
}
