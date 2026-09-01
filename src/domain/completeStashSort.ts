import type { GridPoint } from "./inventoryGeometry";
import {
  CHARACTER_BAG_INVENTORY_ID,
  type SpatialContainer,
  type SpatialPlacement,
  type SpatialProjection
} from "./inventoryGeometry";
import {
  packStash,
  type StashPackedPlacement,
  type StashPackingMode
} from "./stashPacking";
import {
  STASH_ITEM_CATEGORIES,
  classifyStashItem,
  tabPolicyAllowsItem,
  type StashItemCategory,
  type StashTabItemPolicy
} from "./stashRouting";
import { rectanglesIntersect, type GridRectangle } from "./stash";
import type { StashTabMapping } from "./stashTabMapping";

export interface CompleteStashSortMove {
  alias: string;
  category: StashItemCategory;
  width: number;
  height: number;
  route: "same-tab" | "via-character-bag";
  source: {
    inventoryId: number;
    tabIndex: number;
    slotId: number;
    point: GridPoint;
  };
  destination: {
    inventoryId: number;
    tabIndex: number;
    slotId: number;
    point: GridPoint;
  };
  bagPoint?: GridPoint;
  bagSlotId?: number;
}

export interface CompleteStashSortPage {
  inventoryId: number;
  tabIndex: number;
  placements: readonly StashPackedPlacement[];
  pinnedAliases: readonly string[];
}

export interface CompleteStashSortDiagnostic {
  code:
    | "visible-page-not-ready"
    | "visible-page-policy-missing"
    | "item-has-no-allowed-page"
    | "item-has-no-fitting-page"
    | "bag-has-no-fitting-space";
  alias?: string;
  inventoryId?: number;
  detail: string;
}

export type CompleteStashSortPlan =
  | {
      status: "ready";
      mode: StashPackingMode;
      sourceSnapshotHash: string;
      sourceSnapshotVersion: number;
      pages: readonly CompleteStashSortPage[];
      moves: readonly CompleteStashSortMove[];
      skippedAliases: readonly string[];
      diagnostics: readonly CompleteStashSortDiagnostic[];
      verification: "single-final-complete-refresh";
    }
  | {
      status: "blocked";
      mode: StashPackingMode;
      reason: CompleteStashSortDiagnostic["code"];
      diagnostics: readonly CompleteStashSortDiagnostic[];
    };

interface ReadyPage {
  container: SpatialContainer & {
    geometry: { kind: "rectangular"; columns: number; rows: number };
  };
  policy: StashTabItemPolicy;
  tabIndex: number;
  pinned: SpatialPlacement[];
  assigned: SpatialPlacement[];
}

export function planCompleteStashSort(parameters: {
  projection: SpatialProjection;
  mapping: StashTabMapping;
  policies: readonly StashTabItemPolicy[];
  mode: StashPackingMode;
  excludedInventoryIds?: readonly number[];
}): CompleteStashSortPlan {
  const diagnostics: CompleteStashSortDiagnostic[] = [];
  const excluded = new Set(parameters.excludedInventoryIds ?? []);
  const policyByInventory = new Map(
    parameters.policies.map((policy) => [policy.inventoryId, policy])
  );
  const containerByInventory = new Map(
    parameters.projection.containers.map((container) => [container.inventoryId, container])
  );

  const pages: ReadyPage[] = [];
  for (const entry of [...parameters.mapping.entries].sort(
    (left, right) => left.tabIndex - right.tabIndex
  )) {
    if (excluded.has(entry.inventoryId)) continue;
    const policy = policyByInventory.get(entry.inventoryId);
    if (!policy) {
      diagnostics.push({
        code: "visible-page-policy-missing",
        inventoryId: entry.inventoryId,
        detail: `Visible inventory ${entry.inventoryId} has no sorting policy.`
      });
      continue;
    }
    if (!policy.enabled) continue;
    const container = containerByInventory.get(entry.inventoryId);
    if (!container || container.status !== "ready" ||
        container.geometry.kind !== "rectangular") {
      diagnostics.push({
        code: "visible-page-not-ready",
        inventoryId: entry.inventoryId,
        detail: `Visible inventory ${entry.inventoryId} is not spatially ready.`
      });
      continue;
    }
    const reserved = policy.reservedRegions ?? [];
    const pinned = container.placements.filter((placement) =>
      reserved.some((region) => rectanglesIntersect(region, placementRectangle(placement)))
    );
    pages.push({
      container: container as ReadyPage["container"],
      policy,
      tabIndex: entry.tabIndex,
      pinned,
      assigned: []
    });
  }

  if (pages.length === 0) {
    const first = diagnostics[0] ?? {
      code: "visible-page-not-ready" as const,
      detail: "No enabled visible stash page is ready."
    };
    return { status: "blocked", mode: parameters.mode, reason: first.code, diagnostics };
  }

  const bag = containerByInventory.get(CHARACTER_BAG_INVENTORY_ID);
  const movable = pages
    .flatMap((page) => page.container.placements
      .filter((placement) => !page.pinned.some((pinned) => pinned.alias === placement.alias)))
    .sort(comparePlacements);

  const skipped = new Set<string>();
  for (const item of movable) {
    const current = pages.find((page) => page.container.inventoryId === item.inventoryId);
    const candidates = pages
      .filter((page) => tabPolicyAllowsItem(page.policy, item))
      .sort((left, right) => {
        const leftCurrent = left.container.inventoryId === item.inventoryId ? 0 : 1;
        const rightCurrent = right.container.inventoryId === item.inventoryId ? 0 : 1;
        return leftCurrent - rightCurrent || left.tabIndex - right.tabIndex;
      });

    if (candidates.length === 0) {
      skipped.add(item.alias);
      current?.pinned.push(item);
      diagnostics.push({
        code: "item-has-no-allowed-page",
        alias: item.alias,
        inventoryId: item.inventoryId,
        detail: `${item.alias} has no enabled page that accepts ${classifyStashItem(item.metadata)}.`
      });
      continue;
    }

    let selected: ReadyPage | undefined;
    for (const candidate of candidates) {
      if (candidate.container.inventoryId !== item.inventoryId &&
          !bagPointFor(item, bag)) {
        continue;
      }
      const result = packingForPage(candidate, [...candidate.assigned, item], parameters.mode);
      if (result.complete) {
        selected = candidate;
        break;
      }
    }

    if (!selected) {
      skipped.add(item.alias);
      current?.pinned.push(item);
      const hasDifferentAllowedPage = candidates.some(
        (candidate) => candidate.container.inventoryId !== item.inventoryId
      );
      const bagFits = bagPointFor(item, bag);
      const code = hasDifferentAllowedPage && !bagFits
        ? "bag-has-no-fitting-space" as const
        : "item-has-no-fitting-page" as const;
      diagnostics.push({
        code,
        alias: item.alias,
        inventoryId: item.inventoryId,
        detail: code === "bag-has-no-fitting-space"
          ? `The character bag has no free ${item.width}x${item.height} rectangle for ${item.alias}.`
          : `No enabled allowed page has space for ${item.alias}.`
      });
      continue;
    }
    selected.assigned.push(item);
  }

  const pageTargets: CompleteStashSortPage[] = [];
  const targetByAlias = new Map<string, { page: ReadyPage; placement: StashPackedPlacement }>();
  for (const page of pages) {
    const result = packingForPage(page, page.assigned, parameters.mode);
    if (!result.complete) {
      for (const failure of result.failures) {
        skipped.add(failure.alias);
        diagnostics.push({
          code: "item-has-no-fitting-page",
          alias: failure.alias,
          inventoryId: page.container.inventoryId,
          detail: failure.detail
        });
      }
    }
    for (const placement of result.placements) {
      targetByAlias.set(placement.alias, { page, placement });
    }
    pageTargets.push({
      inventoryId: page.container.inventoryId,
      tabIndex: page.tabIndex,
      placements: [
        ...page.pinned.map((item) => ({
          alias: item.alias,
          category: classifyStashItem(item.metadata),
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          slotId: item.slotId
        })),
        ...result.placements
      ].sort((left, right) => left.y - right.y || left.x - right.x),
      pinnedAliases: page.pinned.map((item) => item.alias).sort()
    });
  }

  const pageByInventory = new Map(pages.map((page) => [
    page.container.inventoryId,
    page
  ]));
  const moves: CompleteStashSortMove[] = [];
  for (const source of movable) {
    if (skipped.has(source.alias)) continue;
    const target = targetByAlias.get(source.alias);
    const sourcePage = pageByInventory.get(source.inventoryId);
    if (!target || !sourcePage) continue;
    if (source.inventoryId === target.page.container.inventoryId &&
        source.slotId === target.placement.slotId) continue;
    const crossTab = source.inventoryId !== target.page.container.inventoryId;
    const bagPoint = crossTab ? bagPointFor(source, bag) : undefined;
    moves.push({
      alias: source.alias,
      category: classifyStashItem(source.metadata),
      width: source.width,
      height: source.height,
      route: crossTab ? "via-character-bag" : "same-tab",
      source: {
        inventoryId: source.inventoryId,
        tabIndex: sourcePage.tabIndex,
        slotId: source.slotId,
        point: { x: source.x, y: source.y }
      },
      destination: {
        inventoryId: target.page.container.inventoryId,
        tabIndex: target.page.tabIndex,
        slotId: target.placement.slotId,
        point: { x: target.placement.x, y: target.placement.y }
      },
      ...(bagPoint ? {
        bagPoint,
        bagSlotId: bagPoint.y * 10 + bagPoint.x
      } : {})
    });
  }

  return {
    status: "ready",
    mode: parameters.mode,
    sourceSnapshotHash: parameters.projection.sourceSnapshotHash,
    sourceSnapshotVersion: parameters.projection.sourceVersion,
    pages: pageTargets,
    moves: moves.sort(compareMoves),
    skippedAliases: [...skipped].sort(),
    diagnostics,
    verification: "single-final-complete-refresh"
  };
}

function packingForPage(
  page: ReadyPage,
  items: readonly SpatialPlacement[],
  mode: StashPackingMode
) {
  return packStash({
    grid: page.container.geometry,
    items: items.map((item) => ({
      alias: item.alias,
      width: item.width,
      height: item.height,
      category: classifyStashItem(item.metadata)
    })),
    mode,
    reservedRegions: [
      ...(page.policy.reservedRegions ?? []),
      ...page.pinned.map(placementRectangle)
    ],
    categoryOrder: STASH_ITEM_CATEGORIES
  });
}

function bagPointFor(
  item: Pick<SpatialPlacement, "width" | "height">,
  bag: SpatialContainer | undefined
): GridPoint | undefined {
  if (!bag || bag.status !== "ready" || bag.geometry.kind !== "bag") return undefined;
  const occupied = new Set<string>();
  for (const placement of bag.placements) {
    for (let y = placement.y; y < placement.y + placement.height; y += 1) {
      for (let x = placement.x; x < placement.x + placement.width; x += 1) {
        occupied.add(`${x},${y}`);
      }
    }
  }
  for (let y = 0; y <= bag.geometry.rows - item.height; y += 1) {
    for (let x = 0; x <= bag.geometry.columns - item.width; x += 1) {
      let free = true;
      for (let cellY = y; cellY < y + item.height && free; cellY += 1) {
        for (let cellX = x; cellX < x + item.width; cellX += 1) {
          if (occupied.has(`${cellX},${cellY}`)) {
            free = false;
            break;
          }
        }
      }
      if (free) return { x, y };
    }
  }
  return undefined;
}

function placementRectangle(
  placement: Pick<SpatialPlacement, "x" | "y" | "width" | "height">
): GridRectangle {
  return {
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height
  };
}

function comparePlacements(left: SpatialPlacement, right: SpatialPlacement): number {
  return left.inventoryId - right.inventoryId ||
    left.slotId - right.slotId ||
    left.alias.localeCompare(right.alias);
}

function compareMoves(left: CompleteStashSortMove, right: CompleteStashSortMove): number {
  return left.source.tabIndex - right.source.tabIndex ||
    left.destination.tabIndex - right.destination.tabIndex ||
    left.source.slotId - right.source.slotId ||
    left.alias.localeCompare(right.alias);
}
