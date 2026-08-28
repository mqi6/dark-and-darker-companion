import type { SpatialContainer, SpatialPlacement } from "./inventoryGeometry";

export interface StashPreviewCell {
  x: number;
  y: number;
  alias?: string;
  origin: boolean;
}

export interface StashPreviewModel {
  inventoryId: number;
  columns: number;
  rows: number;
  placements: readonly SpatialPlacement[];
  cells: readonly StashPreviewCell[];
}

export function createStashPreview(container: SpatialContainer): StashPreviewModel {
  if (container.status !== "ready" || container.geometry.kind !== "rectangular") {
    throw new Error(`Inventory ${container.inventoryId} is not ready for preview.`);
  }
  const placementByCell = new Map<string, { alias: string; origin: boolean }>();
  for (const placement of container.placements) {
    for (let y = placement.y; y < placement.y + placement.height; y += 1) {
      for (let x = placement.x; x < placement.x + placement.width; x += 1) {
        placementByCell.set(`${x},${y}`, {
          alias: placement.alias,
          origin: x === placement.x && y === placement.y
        });
      }
    }
  }
  const cells: StashPreviewCell[] = [];
  for (let y = 0; y < container.geometry.rows; y += 1) {
    for (let x = 0; x < container.geometry.columns; x += 1) {
      const occupied = placementByCell.get(`${x},${y}`);
      cells.push({ x, y, ...(occupied ? occupied : { origin: false }) });
    }
  }
  return {
    inventoryId: container.inventoryId,
    columns: container.geometry.columns,
    rows: container.geometry.rows,
    placements: container.placements,
    cells
  };
}
