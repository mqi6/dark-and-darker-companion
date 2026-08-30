import type { SpatialProjection } from "./inventoryGeometry";
import type { GridRectangle } from "./stash";
import { rectanglesIntersect } from "./stash";
import type { StashSortEligibility } from "./stashSortEligibility";
import type { StashTabMapping } from "./stashTabMapping";

export interface Move003Candidate { itemAlias: string; inventoryId: number; tabIndex: number; source: { x: number; y: number }; destination: { x: number; y: number }; quantity: 1; footprint: { width: 1; height: 1 } }

export function selectMove003Candidate(parameters: { projection: SpatialProjection; eligibility: StashSortEligibility; mapping: StashTabMapping; reservedByInventory?: ReadonlyMap<number, readonly GridRectangle[]> }): Move003Candidate | undefined {
  const eligible = new Set(parameters.eligibility.eligibleInventoryIds);
  for (const entry of [...parameters.mapping.entries].sort((a, b) => a.tabIndex - b.tabIndex)) {
    if (!eligible.has(entry.inventoryId)) continue;
    const container = parameters.projection.containers.find(value => value.inventoryId === entry.inventoryId);
    if (!container || container.status !== "ready" || container.geometry.kind !== "rectangular") continue;
    const reserved = parameters.reservedByInventory?.get(entry.inventoryId) ?? [];
    const occupied = new Set<string>();
    for (const placement of container.placements) for (let y = placement.y; y < placement.y + placement.height; y += 1) for (let x = placement.x; x < placement.x + placement.width; x += 1) occupied.add(`${x},${y}`);
    const sources = container.placements.filter(value => value.width === 1 && value.height === 1 && value.stackQuantity === 1 && !reserved.some(region => rectanglesIntersect(value, region))).sort((a, b) => a.slotId - b.slotId || a.alias.localeCompare(b.alias));
    for (const source of sources) for (let y = 0; y < container.geometry.rows; y += 1) for (let x = 0; x < container.geometry.columns; x += 1) {
      if ((x === source.x && y === source.y) || occupied.has(`${x},${y}`) || reserved.some(region => rectanglesIntersect({ x, y, width: 1, height: 1 }, region))) continue;
      return { itemAlias: source.alias, inventoryId: entry.inventoryId, tabIndex: entry.tabIndex, source: { x: source.x, y: source.y }, destination: { x, y }, quantity: 1, footprint: { width: 1, height: 1 } };
    }
  }
  return undefined;
}
