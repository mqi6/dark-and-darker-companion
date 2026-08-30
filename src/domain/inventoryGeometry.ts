import type { ReducedGameState } from "./gameStateReducer";
import {
  indexGameplayCatalog,
  type GameplayCatalog,
  type GameplayItemMetadata
} from "./gameplayCatalog";

export const STORAGE_GRID = Object.freeze({ columns: 12, rows: 20 });
export const CHARACTER_BAG_INVENTORY_ID = 2 as const;
export const CHARACTER_BAG_GRID = Object.freeze({ columns: 10, rows: 5 });
export const RECTANGULAR_STORAGE_INVENTORY_IDS = Object.freeze([
  4, 5, 6, 7, 8, 9, 20, 21, 30, 200
] as const);

export type InventoryGeometry =
  | { kind: "rectangular"; columns: number; rows: number }
  | { kind: "bag"; columns: number; rows: number }
  | { kind: "equipment" }
  | { kind: "unverified" };

export interface GridPoint { x: number; y: number }
export interface SpatialPlacement extends GridPoint {
  alias: string;
  inventoryId: number;
  slotId: number;
  width: number;
  height: number;
  stackQuantity: number;
  metadata: GameplayItemMetadata;
}

export interface SpatialDiagnostic {
  code:
    | "inventory-geometry-unverified"
    | "item-id-unmapped"
    | "item-metadata-missing"
    | "slot-out-of-bounds"
    | "stack-invalid"
    | "item-out-of-bounds"
    | "item-overlap";
  inventoryId: number;
  alias?: string;
  message: string;
}

export interface SpatialContainer {
  inventoryId: number;
  status: "ready" | "blocked" | "not-applicable";
  geometry: InventoryGeometry;
  placements: readonly SpatialPlacement[];
  diagnostics: readonly SpatialDiagnostic[];
}

export interface SpatialProjection {
  sourceSnapshotHash: string;
  sourceVersion: number;
  containers: readonly SpatialContainer[];
  ready: boolean;
}

const rectangularInventoryIds = new Set<number>(RECTANGULAR_STORAGE_INVENTORY_IDS);

export function geometryForInventoryId(inventoryId: number): InventoryGeometry {
  if (inventoryId === CHARACTER_BAG_INVENTORY_ID) return { kind: "bag", ...CHARACTER_BAG_GRID };
  if (rectangularInventoryIds.has(inventoryId)) return { kind: "rectangular", ...STORAGE_GRID };
  if (inventoryId === 3) return { kind: "equipment" };
  return { kind: "unverified" };
}

export function slotToPoint(slotId: number, columns: number): GridPoint {
  if (!Number.isInteger(slotId) || slotId < 0) throw new RangeError("slotId must be non-negative");
  if (!Number.isInteger(columns) || columns <= 0) throw new RangeError("columns must be positive");
  return { x: slotId % columns, y: Math.floor(slotId / columns) };
}

export function projectSpatialState(
  state: ReducedGameState,
  catalog: GameplayCatalog
): SpatialProjection {
  const metadataById = indexGameplayCatalog(catalog);
  const protocolContainers = [...state.protocol.containers];
  if (!protocolContainers.some((container) =>
    container.kind === "inventory" && container.inventoryId === CHARACTER_BAG_INVENTORY_ID
  )) {
    // A successful command-44 character baseline contains the complete
    // characterItemList. No inventory-2 rows therefore means an empty bag.
    protocolContainers.push({
      inventoryId: CHARACTER_BAG_INVENTORY_ID,
      kind: "inventory",
      items: []
    });
  }
  const containers = protocolContainers.map((protocolContainer): SpatialContainer => {
    const geometry = geometryForInventoryId(protocolContainer.inventoryId);
    if (geometry.kind === "equipment") {
      return {
        inventoryId: protocolContainer.inventoryId,
        status: "not-applicable",
        geometry,
        placements: [],
        diagnostics: []
      };
    }
    if (geometry.kind === "unverified") {
      return {
        inventoryId: protocolContainer.inventoryId,
        status: "blocked",
        geometry,
        placements: [],
        diagnostics: [{
          code: "inventory-geometry-unverified",
          inventoryId: protocolContainer.inventoryId,
          message: `Inventory ${protocolContainer.inventoryId} has no verified rectangular geometry.`
        }]
      };
    }

    const diagnostics: SpatialDiagnostic[] = [];
    const placements: SpatialPlacement[] = [];
    const occupied = new Map<string, string>();
    const items = state.items.filter((item) => item.inventoryId === protocolContainer.inventoryId);
    for (const item of items) {
      if (!item.darkerDbCanonicalItemId) {
        diagnostics.push({
          code: "item-id-unmapped",
          inventoryId: item.inventoryId,
          alias: item.alias,
          message: `${item.alias} has no verified DarkerDB ID mapping.`
        });
        continue;
      }
      const metadata = metadataById.get(item.darkerDbCanonicalItemId);
      if (!metadata) {
        diagnostics.push({
          code: "item-metadata-missing",
          inventoryId: item.inventoryId,
          alias: item.alias,
          message: `${item.alias} has no verified gameplay metadata.`
        });
        continue;
      }
      if (item.stackQuantity < 1 || item.stackQuantity > metadata.maxStackSize) {
        diagnostics.push({
          code: "stack-invalid",
          inventoryId: item.inventoryId,
          alias: item.alias,
          message: `${item.alias} quantity ${item.stackQuantity} is outside 1-${metadata.maxStackSize}.`
        });
        continue;
      }

      const point = slotToPoint(item.slotId, geometry.columns);
      if (point.y >= geometry.rows) {
        diagnostics.push({
          code: "slot-out-of-bounds",
          inventoryId: item.inventoryId,
          alias: item.alias,
          message: `${item.alias} slot ${item.slotId} is outside the ${geometry.columns}x${geometry.rows} grid.`
        });
        continue;
      }
      if (
        point.x + metadata.inventoryWidth > geometry.columns ||
        point.y + metadata.inventoryHeight > geometry.rows
      ) {
        diagnostics.push({
          code: "item-out-of-bounds",
          inventoryId: item.inventoryId,
          alias: item.alias,
          message: `${item.alias} footprint extends outside the inventory grid.`
        });
        continue;
      }

      let overlaps: string | undefined;
      for (let y = point.y; y < point.y + metadata.inventoryHeight && !overlaps; y += 1) {
        for (let x = point.x; x < point.x + metadata.inventoryWidth; x += 1) {
          const existing = occupied.get(`${x},${y}`);
          if (existing) { overlaps = existing; break; }
        }
      }
      if (overlaps) {
        diagnostics.push({
          code: "item-overlap",
          inventoryId: item.inventoryId,
          alias: item.alias,
          message: `${item.alias} overlaps ${overlaps}.`
        });
        continue;
      }
      for (let y = point.y; y < point.y + metadata.inventoryHeight; y += 1) {
        for (let x = point.x; x < point.x + metadata.inventoryWidth; x += 1) {
          occupied.set(`${x},${y}`, item.alias);
        }
      }
      placements.push({
        alias: item.alias,
        inventoryId: item.inventoryId,
        slotId: item.slotId,
        ...point,
        width: metadata.inventoryWidth,
        height: metadata.inventoryHeight,
        stackQuantity: item.stackQuantity,
        metadata
      });
    }
    return {
      inventoryId: protocolContainer.inventoryId,
      status: diagnostics.length === 0 ? "ready" : "blocked",
      geometry,
      placements,
      diagnostics
    };
  });
  return {
    sourceSnapshotHash: state.protocol.snapshotHash,
    sourceVersion: state.protocol.snapshotVersion,
    containers,
    ready: containers.every((container) => container.status !== "blocked")
  };
}
