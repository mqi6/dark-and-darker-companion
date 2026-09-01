import type { GameplayItemMetadata } from "./gameplayCatalog";
import {
  CHARACTER_BAG_INVENTORY_ID,
  type GridPoint,
  type SpatialContainer,
  type SpatialPlacement,
  type SpatialProjection
} from "./inventoryGeometry";
import { validateReservedRegions, type GridRectangle } from "./stash";
import type { StashTabMapping } from "./stashTabMapping";

export const STASH_ITEM_CATEGORIES = [
  "gear",
  "weapon",
  "jewelry",
  "currency",
  "currency-container",
  "utility",
  "misc"
] as const;

export type StashItemCategory = typeof STASH_ITEM_CATEGORIES[number];

type ReadyStashContainer = SpatialContainer & {
  geometry: { kind: "rectangular"; columns: number; rows: number };
};

export interface StashTabItemPolicy {
  inventoryId: number;
  enabled: boolean;
  allowedCategories: readonly StashItemCategory[];
  allowedItemIds?: readonly GameplayItemMetadata["id"][];
  deniedItemIds?: readonly GameplayItemMetadata["id"][];
  reservedRegions?: readonly GridRectangle[];
}

export interface CharacterBagCapacity {
  inventoryId: typeof CHARACTER_BAG_INVENTORY_ID;
  itemCount: number;
  occupiedCellCount: number;
  freeCellCount: number;
  largestFreeRectangleCellCount: number;
}

export type CrossTabPlanDiagnosticCode =
  | "bag-not-ready"
  | "tab-policy-duplicate"
  | "tab-policy-missing"
  | "tab-mapping-missing"
  | "reserved-regions-invalid"
  | "no-allowed-target-tab"
  | "target-tab-full"
  | "bag-has-no-fitting-space";

export interface CrossTabPlanDiagnostic {
  code: CrossTabPlanDiagnosticCode;
  itemAlias?: string;
  inventoryId?: number;
  detail: string;
}

export type CrossTabLogicalAction =
  | { kind: "select-stash-tab"; tabIndex: number; inventoryId: number }
  | {
      kind: "drag-stash-to-bag";
      itemAlias: string;
      source: { inventoryId: number; slotId: number; point: GridPoint };
      destination: { inventoryId: typeof CHARACTER_BAG_INVENTORY_ID; slotId: number; point: GridPoint };
    }
  | {
      kind: "drag-bag-to-stash";
      itemAlias: string;
      source: { inventoryId: typeof CHARACTER_BAG_INVENTORY_ID; slotId: number; point: GridPoint };
      destination: { inventoryId: number; slotId: number; point: GridPoint };
    };

export interface CrossTabTransfer {
  transferId: string;
  itemAlias: string;
  category: StashItemCategory;
  width: number;
  height: number;
  sourceInventoryId: number;
  sourceTabIndex: number;
  bagSlotId: number;
  targetInventoryId: number;
  targetTabIndex: number;
  targetSlotId: number;
  actions: readonly CrossTabLogicalAction[];
}

export type CrossTabSortPlan =
  | {
      status: "ready";
      sourceSnapshotHash: string;
      sourceSnapshotVersion: number;
      bag: CharacterBagCapacity;
      transfers: readonly CrossTabTransfer[];
      diagnostics: readonly CrossTabPlanDiagnostic[];
      maximumTransfers: number;
      independentTransfersOnly: true;
    }
  | {
      status: "blocked";
      reason: CrossTabPlanDiagnosticCode;
      detail: string;
      diagnostics: readonly CrossTabPlanDiagnostic[];
    };

const currencyItemIds = new Set<GameplayItemMetadata["id"]>([
  "id.item.gold_coins"
]);

const currencyContainerItemIds = new Set<GameplayItemMetadata["id"]>([
  "id.item.gold_coin_bag",
  "id.item.gold_coin_chest",
  "id.item.gold_coin_pouch",
  "id.item.gold_coin_purse",
  "id.item.spectral_coinbag"
]);

export function classifyStashItem(metadata: GameplayItemMetadata): StashItemCategory {
  if (currencyContainerItemIds.has(metadata.id)) return "currency-container";
  if (currencyItemIds.has(metadata.id)) return "currency";
  if (metadata.slotType === "Necklace" || metadata.slotType === "Ring" ||
      metadata.itemType === "accessory") return "jewelry";
  if (metadata.itemType === "weapon") return "weapon";
  if (metadata.itemType === "armor") return "gear";
  if (metadata.itemType === "utility") return "utility";
  return "misc";
}

export function tabPolicyAllowsItem(
  policy: StashTabItemPolicy,
  placement: SpatialPlacement
): boolean {
  if (policy.deniedItemIds?.includes(placement.metadata.id)) return false;
  if (policy.allowedItemIds?.includes(placement.metadata.id)) return true;
  return policy.allowedCategories.includes(classifyStashItem(placement.metadata));
}

export function analyzeCharacterBag(container: SpatialContainer): CharacterBagCapacity {
  if (container.inventoryId !== CHARACTER_BAG_INVENTORY_ID ||
      container.status !== "ready" || container.geometry.kind !== "bag") {
    throw new Error("Character bag has not passed spatial validation.");
  }
  const occupied = occupiedCells(container.placements);
  return {
    inventoryId: CHARACTER_BAG_INVENTORY_ID,
    itemCount: container.placements.length,
    occupiedCellCount: occupied.size,
    freeCellCount: container.geometry.columns * container.geometry.rows - occupied.size,
    largestFreeRectangleCellCount: largestFreeRectangle(
      container.geometry.columns,
      container.geometry.rows,
      occupied
    )
  };
}

export function planCrossTabTransfers(parameters: {
  projection: SpatialProjection;
  mapping: StashTabMapping;
  policies: readonly StashTabItemPolicy[];
  maximumTransfers?: number;
}): CrossTabSortPlan {
  const maximumTransfers = parameters.maximumTransfers ?? 2400;
  if (!Number.isInteger(maximumTransfers) || maximumTransfers < 1 || maximumTransfers > 2400) {
    throw new RangeError("A complete sort may contain between one and 2400 cross-tab transfers.");
  }

  const diagnostics: CrossTabPlanDiagnostic[] = [];
  const policyByInventory = new Map<number, StashTabItemPolicy>();
  for (const policy of parameters.policies) {
    if (policyByInventory.has(policy.inventoryId)) {
      const diagnostic = {
        code: "tab-policy-duplicate" as const,
        inventoryId: policy.inventoryId,
        detail: `Inventory ${policy.inventoryId} has more than one tab policy.`
      };
      return { status: "blocked", reason: diagnostic.code, detail: diagnostic.detail, diagnostics: [diagnostic] };
    }
    policyByInventory.set(policy.inventoryId, policy);
  }

  const tabByInventory = new Map(
    parameters.mapping.entries.map((entry) => [entry.inventoryId, entry.tabIndex])
  );
  const bag = parameters.projection.containers.find(
    (container) => container.inventoryId === CHARACTER_BAG_INVENTORY_ID
  );
  if (!bag || bag.status !== "ready" || bag.geometry.kind !== "bag") {
    const diagnostic = {
      code: "bag-not-ready" as const,
      detail: "The complete character bag is missing or spatially blocked."
    };
    return { status: "blocked", reason: diagnostic.code, detail: diagnostic.detail, diagnostics: [diagnostic] };
  }
  const bagCapacity = analyzeCharacterBag(bag);
  const bagOccupied = occupiedCells(bag.placements);

  const targetOccupancy = new Map<number, Set<string>>();
  for (const container of parameters.projection.containers) {
    if (container.status !== "ready" || container.geometry.kind !== "rectangular") continue;
    const policy = policyByInventory.get(container.inventoryId);
    const occupied = occupiedCells(container.placements);
    if (policy?.reservedRegions) {
      const validation = validateReservedRegions(container.geometry, policy.reservedRegions);
      if (!validation.valid) {
        diagnostics.push({
          code: "reserved-regions-invalid",
          inventoryId: container.inventoryId,
          detail: validation.errors.join(" ")
        });
        continue;
      }
      for (const region of policy.reservedRegions) occupy(occupied, region);
    }
    targetOccupancy.set(container.inventoryId, occupied);
  }

  const sourceContainers = parameters.projection.containers
    .filter((container): container is ReadyStashContainer =>
      container.status === "ready" && container.geometry.kind === "rectangular")
    .sort((left, right) =>
      (tabByInventory.get(left.inventoryId) ?? Number.MAX_SAFE_INTEGER) -
      (tabByInventory.get(right.inventoryId) ?? Number.MAX_SAFE_INTEGER)
    );

  const transfers: CrossTabTransfer[] = [];
  for (const source of sourceContainers) {
    if (transfers.length >= maximumTransfers) break;
    const sourcePolicy = policyByInventory.get(source.inventoryId);
    if (!sourcePolicy) {
      diagnostics.push({
        code: "tab-policy-missing",
        inventoryId: source.inventoryId,
        detail: `Inventory ${source.inventoryId} has no item-routing policy.`
      });
      continue;
    }
    if (!sourcePolicy.enabled) continue;
    const sourceTabIndex = tabByInventory.get(source.inventoryId);
    if (sourceTabIndex === undefined) {
      diagnostics.push({
        code: "tab-mapping-missing",
        inventoryId: source.inventoryId,
        detail: `Inventory ${source.inventoryId} has no visible-tab mapping.`
      });
      continue;
    }

    for (const item of [...source.placements].sort((a, b) => a.slotId - b.slotId || a.alias.localeCompare(b.alias))) {
      if (transfers.length >= maximumTransfers) break;
      if (tabPolicyAllowsItem(sourcePolicy, item)) continue;

      const targets = sourceContainers
        .filter((container) => container.inventoryId !== source.inventoryId)
        .map((container) => ({
          container,
          policy: policyByInventory.get(container.inventoryId),
          tabIndex: tabByInventory.get(container.inventoryId)
        }))
        .filter((value): value is {
          container: ReadyStashContainer;
          policy: StashTabItemPolicy;
          tabIndex: number;
        } => value.policy !== undefined && value.policy.enabled &&
          value.tabIndex !== undefined && tabPolicyAllowsItem(value.policy, item))
        .sort((left, right) => left.tabIndex - right.tabIndex);

      if (targets.length === 0) {
        diagnostics.push({
          code: "no-allowed-target-tab",
          itemAlias: item.alias,
          inventoryId: source.inventoryId,
          detail: `${item.alias} is not allowed on its current page and no enabled target page accepts ${classifyStashItem(item.metadata)}.`
        });
        continue;
      }

      const bagPoint = firstFreePoint(
        bag.geometry.columns,
        bag.geometry.rows,
        item.width,
        item.height,
        bagOccupied
      );
      if (!bagPoint) {
        diagnostics.push({
          code: "bag-has-no-fitting-space",
          itemAlias: item.alias,
          inventoryId: source.inventoryId,
          detail: `The character bag has no free ${item.width}x${item.height} rectangle for ${item.alias}.`
        });
        continue;
      }

      let selected: { container: ReadyStashContainer; tabIndex: number; point: GridPoint } | undefined;
      for (const target of targets) {
        const occupied = targetOccupancy.get(target.container.inventoryId);
        if (!occupied) continue;
        const point = firstFreePoint(
          target.container.geometry.columns,
          target.container.geometry.rows,
          item.width,
          item.height,
          occupied
        );
        if (point) {
          selected = { container: target.container, tabIndex: target.tabIndex, point };
          break;
        }
      }
      if (!selected) {
        diagnostics.push({
          code: "target-tab-full",
          itemAlias: item.alias,
          inventoryId: source.inventoryId,
          detail: `Every enabled target page that accepts ${item.alias} is full.`
        });
        continue;
      }

      const bagSlotId = bagPoint.y * bag.geometry.columns + bagPoint.x;
      const targetSlotId = selected.point.y * selected.container.geometry.columns + selected.point.x;
      occupy(targetOccupancy.get(selected.container.inventoryId)!, {
        ...selected.point,
        width: item.width,
        height: item.height
      });
      const actions: CrossTabLogicalAction[] = [
        { kind: "select-stash-tab", tabIndex: sourceTabIndex, inventoryId: source.inventoryId },
        {
          kind: "drag-stash-to-bag",
          itemAlias: item.alias,
          source: {
            inventoryId: source.inventoryId,
            slotId: item.slotId,
            point: { x: item.x, y: item.y }
          },
          destination: {
            inventoryId: CHARACTER_BAG_INVENTORY_ID,
            slotId: bagSlotId,
            point: bagPoint
          }
        },
        {
          kind: "select-stash-tab",
          tabIndex: selected.tabIndex,
          inventoryId: selected.container.inventoryId
        },
        {
          kind: "drag-bag-to-stash",
          itemAlias: item.alias,
          source: {
            inventoryId: CHARACTER_BAG_INVENTORY_ID,
            slotId: bagSlotId,
            point: bagPoint
          },
          destination: {
            inventoryId: selected.container.inventoryId,
            slotId: targetSlotId,
            point: selected.point
          }
        }
      ];
      transfers.push({
        transferId: `cross-tab-${String(transfers.length + 1).padStart(3, "0")}`,
        itemAlias: item.alias,
        category: classifyStashItem(item.metadata),
        width: item.width,
        height: item.height,
        sourceInventoryId: source.inventoryId,
        sourceTabIndex,
        bagSlotId,
        targetInventoryId: selected.container.inventoryId,
        targetTabIndex: selected.tabIndex,
        targetSlotId,
        actions
      });
    }
  }

  return {
    status: "ready",
    sourceSnapshotHash: parameters.projection.sourceSnapshotHash,
    sourceSnapshotVersion: parameters.projection.sourceVersion,
    bag: bagCapacity,
    transfers,
    diagnostics,
    maximumTransfers,
    independentTransfersOnly: true
  };
}

function occupiedCells(placements: readonly Pick<SpatialPlacement, "x" | "y" | "width" | "height">[]): Set<string> {
  const occupied = new Set<string>();
  for (const placement of placements) occupy(occupied, placement);
  return occupied;
}

function occupy(occupied: Set<string>, rectangle: GridRectangle): void {
  for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
    for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
      occupied.add(`${x},${y}`);
    }
  }
}

function firstFreePoint(
  columns: number,
  rows: number,
  width: number,
  height: number,
  occupied: ReadonlySet<string>
): GridPoint | undefined {
  for (let y = 0; y <= rows - height; y += 1) {
    for (let x = 0; x <= columns - width; x += 1) {
      const rectangle = { x, y, width, height };
      let blocked = false;
      for (let cellY = y; cellY < y + height && !blocked; cellY += 1) {
        for (let cellX = x; cellX < x + width; cellX += 1) {
          if (occupied.has(`${cellX},${cellY}`)) {
            blocked = true;
            break;
          }
        }
      }
      if (!blocked) return { x, y };
    }
  }
  return undefined;
}

function largestFreeRectangle(
  columns: number,
  rows: number,
  occupied: ReadonlySet<string>
): number {
  let largest = 0;
  for (let top = 0; top < rows; top += 1) {
    for (let left = 0; left < columns; left += 1) {
      for (let bottom = top; bottom < rows; bottom += 1) {
        for (let right = left; right < columns; right += 1) {
          let free = true;
          for (let y = top; y <= bottom && free; y += 1) {
            for (let x = left; x <= right; x += 1) {
              if (occupied.has(`${x},${y}`)) {
                free = false;
                break;
              }
            }
          }
          if (free) largest = Math.max(largest, (right - left + 1) * (bottom - top + 1));
        }
      }
    }
  }
  return largest;
}
