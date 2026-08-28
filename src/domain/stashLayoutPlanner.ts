import type { SpatialContainer, SpatialPlacement } from "./inventoryGeometry";
import {
  itemTouchesReservedRegion,
  validateReservedRegions,
  type GridRectangle
} from "./stash";

export interface PlannedStashPlacement {
  alias: string;
  sourceSlotId: number;
  destinationSlotId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  locked: boolean;
  moved: boolean;
}

export type OnePageLayoutPlan =
  | {
      status: "ready";
      inventoryId: number;
      placements: readonly PlannedStashPlacement[];
      lockedAliases: readonly string[];
      movedAliases: readonly string[];
    }
  | {
      status: "blocked";
      inventoryId: number;
      reason: "container-not-ready" | "reserved-regions-invalid" | "item-order-invalid" | "no-legal-layout";
      detail: string;
    };

/**
 * Produces a deterministic target layout only. It intentionally does not claim
 * that the targets form an executable UI move sequence; cycle resolution and
 * per-move protocol confirmation are separate gates.
 */
export function planOnePageLayout(
  container: SpatialContainer,
  orderedAliases: readonly string[],
  reservedRegions: readonly GridRectangle[] = []
): OnePageLayoutPlan {
  if (container.status !== "ready" || container.geometry.kind !== "rectangular") {
    return {
      status: "blocked",
      inventoryId: container.inventoryId,
      reason: "container-not-ready",
      detail: `Inventory ${container.inventoryId} has not passed spatial validation.`
    };
  }

  const grid = { columns: container.geometry.columns, rows: container.geometry.rows };
  const reservedValidation = validateReservedRegions(grid, reservedRegions);
  if (!reservedValidation.valid) {
    return {
      status: "blocked",
      inventoryId: container.inventoryId,
      reason: "reserved-regions-invalid",
      detail: reservedValidation.errors.join(" ")
    };
  }

  const byAlias = new Map(container.placements.map((placement) => [placement.alias, placement]));
  const orderSet = new Set(orderedAliases);
  const duplicate = orderedAliases.find((alias, index) => orderedAliases.indexOf(alias) !== index);
  const unknown = orderedAliases.find((alias) => !byAlias.has(alias));
  const missing = container.placements.find((placement) => !orderSet.has(placement.alias));
  if (duplicate || unknown || missing || orderedAliases.length !== container.placements.length) {
    return {
      status: "blocked",
      inventoryId: container.inventoryId,
      reason: "item-order-invalid",
      detail: duplicate
        ? `Item order contains duplicate alias ${duplicate}.`
        : unknown
          ? `Item order contains unknown alias ${unknown}.`
          : `Item order is missing alias ${missing?.alias ?? "unknown"}.`
    };
  }

  const locked = container.placements.filter((placement) =>
    itemTouchesReservedRegion(toPositionedItem(placement), reservedRegions)
  );
  const lockedAliases = new Set(locked.map((placement) => placement.alias));
  const occupied = new Set<string>();
  for (const region of reservedRegions) occupy(occupied, region);
  for (const placement of locked) occupy(occupied, placement);

  const targets = new Map<string, PlannedStashPlacement>();
  for (const placement of locked) {
    targets.set(placement.alias, targetFor(placement, placement.x, placement.y, true, grid.columns));
  }

  for (const alias of orderedAliases) {
    if (lockedAliases.has(alias)) continue;
    const placement = byAlias.get(alias)!;
    const point = firstAvailablePoint(placement, grid, occupied);
    if (!point) {
      return {
        status: "blocked",
        inventoryId: container.inventoryId,
        reason: "no-legal-layout",
        detail: `No legal target is available for ${alias} using the requested deterministic order.`
      };
    }
    const target = targetFor(placement, point.x, point.y, false, grid.columns);
    targets.set(alias, target);
    occupy(occupied, { ...point, width: placement.width, height: placement.height });
  }

  const placements = orderedAliases.map((alias) => targets.get(alias)!);
  return {
    status: "ready",
    inventoryId: container.inventoryId,
    placements,
    lockedAliases: placements.filter((placement) => placement.locked).map((placement) => placement.alias),
    movedAliases: placements.filter((placement) => placement.moved).map((placement) => placement.alias)
  };
}

function toPositionedItem(placement: SpatialPlacement) {
  return {
    instanceKey: placement.alias,
    bounds: {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height
    }
  };
}

function firstAvailablePoint(
  placement: SpatialPlacement,
  grid: { columns: number; rows: number },
  occupied: ReadonlySet<string>
): { x: number; y: number } | undefined {
  for (let y = 0; y <= grid.rows - placement.height; y += 1) {
    for (let x = 0; x <= grid.columns - placement.width; x += 1) {
      if (rectangleIsFree({ x, y, width: placement.width, height: placement.height }, occupied)) {
        return { x, y };
      }
    }
  }
  return undefined;
}

function rectangleIsFree(rectangle: GridRectangle, occupied: ReadonlySet<string>): boolean {
  for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
    for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
      if (occupied.has(`${x},${y}`)) return false;
    }
  }
  return true;
}

function occupy(occupied: Set<string>, rectangle: GridRectangle): void {
  for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
    for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
      occupied.add(`${x},${y}`);
    }
  }
}

function targetFor(
  placement: SpatialPlacement,
  x: number,
  y: number,
  locked: boolean,
  columns: number
): PlannedStashPlacement {
  const destinationSlotId = y * columns + x;
  return {
    alias: placement.alias,
    sourceSlotId: placement.slotId,
    destinationSlotId,
    x,
    y,
    width: placement.width,
    height: placement.height,
    locked,
    moved: destinationSlotId !== placement.slotId
  };
}
