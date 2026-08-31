import {
  CHARACTER_BAG_INVENTORY_ID,
  type GridPoint,
  type SpatialContainer,
  type SpatialProjection
} from "./inventoryGeometry";
import type {
  CompleteStashSortMove,
  CompleteStashSortPlan
} from "./completeStashSort";

export type ScheduledStashSortAction =
  | {
      kind: "select-stash-tab";
      tabIndex: number;
      inventoryId: number;
    }
  | {
      kind: "drag-stash-to-stash" | "drag-stash-to-bag" | "drag-bag-to-stash";
      itemAlias: string;
      width: number;
      height: number;
      source: {
        inventoryId: number;
        point: GridPoint;
        slotId: number;
      };
      destination: {
        inventoryId: number;
        point: GridPoint;
        slotId: number;
      };
    };

export type ScheduledStashSort =
  | {
      status: "ready";
      actions: readonly ScheduledStashSortAction[];
      itemMoveCount: number;
      dragCount: number;
      temporaryBufferCount: number;
      usesSingleInitialSnapshot: true;
    }
  | {
      status: "blocked";
      diagnosticCode:
        | "sort-plan-not-ready"
        | "initial-container-missing"
        | "source-item-missing"
        | "destination-remains-occupied"
        | "bag-has-no-cycle-buffer";
      detail: string;
      actions: readonly ScheduledStashSortAction[];
    };

interface HeldMove {
  move: CompleteStashSortMove;
  point: GridPoint;
  slotId: number;
}

export function scheduleCompleteStashSort(
  plan: CompleteStashSortPlan,
  initial: SpatialProjection
): ScheduledStashSort {
  if (plan.status !== "ready") {
    return {
      status: "blocked",
      diagnosticCode: "sort-plan-not-ready",
      detail: "A blocked target layout cannot be scheduled.",
      actions: []
    };
  }

  const occupancy = buildOccupancy(initial);
  const geometry = new Map(initial.containers.map((container) => [
    container.inventoryId,
    container
  ]));
  for (const page of plan.pages) {
    if (!geometry.has(page.inventoryId)) {
      return {
        status: "blocked",
        diagnosticCode: "initial-container-missing",
        detail: `Initial inventory ${page.inventoryId} is missing.`,
        actions: []
      };
    }
  }

  const pending = new Map(plan.moves.map((move) => [move.alias, move]));
  for (const move of plan.moves) {
    if (!occupancy.get(move.source.inventoryId)?.has(move.alias)) {
      return {
        status: "blocked",
        diagnosticCode: "source-item-missing",
        detail: `Initial source for ${move.alias} is missing.`,
        actions: []
      };
    }
  }

  const actions: ScheduledStashSortAction[] = [];
  let selectedTabIndex: number | undefined;
  let temporaryBufferCount = 0;
  let held: HeldMove | undefined;

  const select = (tabIndex: number, inventoryId: number) => {
    if (selectedTabIndex === tabIndex) return;
    actions.push({ kind: "select-stash-tab", tabIndex, inventoryId });
    selectedTabIndex = tabIndex;
  };

  while (pending.size > 0) {
    if (held && destinationFree(held.move, occupancy)) {
      select(held.move.destination.tabIndex, held.move.destination.inventoryId);
      actions.push({
        kind: "drag-bag-to-stash",
        itemAlias: held.move.alias,
        width: held.move.width,
        height: held.move.height,
        source: {
          inventoryId: CHARACTER_BAG_INVENTORY_ID,
          point: held.point,
          slotId: held.slotId
        },
        destination: {
          inventoryId: held.move.destination.inventoryId,
          point: held.move.destination.point,
          slotId: held.move.destination.slotId
        }
      });
      removeAlias(occupancy, CHARACTER_BAG_INVENTORY_ID, held.move.alias);
      placeAlias(
        occupancy,
        held.move.destination.inventoryId,
        held.move.alias,
        held.move.destination.point,
        held.move.width,
        held.move.height
      );
      pending.delete(held.move.alias);
      held = undefined;
      continue;
    }

    const executable = [...pending.values()]
      .filter((move) => move.alias !== held?.move.alias)
      .find((move) => destinationFree(move, occupancy) &&
        (move.route === "same-tab" || findBagPoint(move, geometry, occupancy)));

    if (executable) {
      if (executable.route === "same-tab") {
        select(executable.source.tabIndex, executable.source.inventoryId);
        actions.push({
          kind: "drag-stash-to-stash",
          itemAlias: executable.alias,
          width: executable.width,
          height: executable.height,
          source: {
            inventoryId: executable.source.inventoryId,
            point: executable.source.point,
            slotId: executable.source.slotId
          },
          destination: {
            inventoryId: executable.destination.inventoryId,
            point: executable.destination.point,
            slotId: executable.destination.slotId
          }
        });
        removeAlias(occupancy, executable.source.inventoryId, executable.alias);
        placeAlias(
          occupancy,
          executable.destination.inventoryId,
          executable.alias,
          executable.destination.point,
          executable.width,
          executable.height
        );
      } else {
        const bagPoint = findBagPoint(executable, geometry, occupancy)!;
        const bagSlotId = bagPoint.y * bagColumns(geometry) + bagPoint.x;
        select(executable.source.tabIndex, executable.source.inventoryId);
        actions.push({
          kind: "drag-stash-to-bag",
          itemAlias: executable.alias,
          width: executable.width,
          height: executable.height,
          source: {
            inventoryId: executable.source.inventoryId,
            point: executable.source.point,
            slotId: executable.source.slotId
          },
          destination: {
            inventoryId: CHARACTER_BAG_INVENTORY_ID,
            point: bagPoint,
            slotId: bagSlotId
          }
        });
        removeAlias(occupancy, executable.source.inventoryId, executable.alias);
        placeAlias(
          occupancy,
          CHARACTER_BAG_INVENTORY_ID,
          executable.alias,
          bagPoint,
          executable.width,
          executable.height
        );
        select(executable.destination.tabIndex, executable.destination.inventoryId);
        actions.push({
          kind: "drag-bag-to-stash",
          itemAlias: executable.alias,
          width: executable.width,
          height: executable.height,
          source: {
            inventoryId: CHARACTER_BAG_INVENTORY_ID,
            point: bagPoint,
            slotId: bagSlotId
          },
          destination: {
            inventoryId: executable.destination.inventoryId,
            point: executable.destination.point,
            slotId: executable.destination.slotId
          }
        });
        removeAlias(occupancy, CHARACTER_BAG_INVENTORY_ID, executable.alias);
        placeAlias(
          occupancy,
          executable.destination.inventoryId,
          executable.alias,
          executable.destination.point,
          executable.width,
          executable.height
        );
      }
      pending.delete(executable.alias);
      continue;
    }

    if (!held) {
      const cycleMove = [...pending.values()].find((move) =>
        findBagPoint(move, geometry, occupancy)
      );
      if (!cycleMove) {
        return {
          status: "blocked",
          diagnosticCode: "bag-has-no-cycle-buffer",
          detail: "No character-bag rectangle can break the remaining placement cycle.",
          actions
        };
      }
      const bagPoint = findBagPoint(cycleMove, geometry, occupancy)!;
      const bagSlotId = bagPoint.y * bagColumns(geometry) + bagPoint.x;
      select(cycleMove.source.tabIndex, cycleMove.source.inventoryId);
      actions.push({
        kind: "drag-stash-to-bag",
        itemAlias: cycleMove.alias,
        width: cycleMove.width,
        height: cycleMove.height,
        source: {
          inventoryId: cycleMove.source.inventoryId,
          point: cycleMove.source.point,
          slotId: cycleMove.source.slotId
        },
        destination: {
          inventoryId: CHARACTER_BAG_INVENTORY_ID,
          point: bagPoint,
          slotId: bagSlotId
        }
      });
      removeAlias(occupancy, cycleMove.source.inventoryId, cycleMove.alias);
      placeAlias(
        occupancy,
        CHARACTER_BAG_INVENTORY_ID,
        cycleMove.alias,
        bagPoint,
        cycleMove.width,
        cycleMove.height
      );
      held = { move: cycleMove, point: bagPoint, slotId: bagSlotId };
      temporaryBufferCount += 1;
      continue;
    }

    return {
      status: "blocked",
      diagnosticCode: "destination-remains-occupied",
      detail: `The destination for buffered item ${held.move.alias} remains occupied.`,
      actions
    };
  }

  return {
    status: "ready",
    actions,
    itemMoveCount: plan.moves.length,
    dragCount: actions.filter((action) => action.kind.startsWith("drag-")).length,
    temporaryBufferCount,
    usesSingleInitialSnapshot: true
  };
}

function buildOccupancy(
  projection: SpatialProjection
): Map<number, Map<string, string>> {
  const result = new Map<number, Map<string, string>>();
  for (const container of projection.containers) {
    const cells = new Map<string, string>();
    for (const placement of container.placements) {
      for (let y = placement.y; y < placement.y + placement.height; y += 1) {
        for (let x = placement.x; x < placement.x + placement.width; x += 1) {
          cells.set(`${x},${y}`, placement.alias);
        }
      }
    }
    result.set(container.inventoryId, cells);
  }
  return result;
}

function destinationFree(
  move: CompleteStashSortMove,
  occupancy: Map<number, Map<string, string>>
): boolean {
  const cells = occupancy.get(move.destination.inventoryId);
  if (!cells) return false;
  for (let y = move.destination.point.y;
    y < move.destination.point.y + move.height;
    y += 1) {
    for (let x = move.destination.point.x;
      x < move.destination.point.x + move.width;
      x += 1) {
      const alias = cells.get(`${x},${y}`);
      if (alias !== undefined && alias !== move.alias) return false;
    }
  }
  return true;
}

function findBagPoint(
  move: Pick<CompleteStashSortMove, "width" | "height">,
  geometry: Map<number, SpatialContainer>,
  occupancy: Map<number, Map<string, string>>
): GridPoint | undefined {
  const bag = geometry.get(CHARACTER_BAG_INVENTORY_ID);
  const cells = occupancy.get(CHARACTER_BAG_INVENTORY_ID);
  if (!bag || !cells || bag.status !== "ready" || bag.geometry.kind !== "bag") {
    return undefined;
  }
  for (let y = 0; y <= bag.geometry.rows - move.height; y += 1) {
    for (let x = 0; x <= bag.geometry.columns - move.width; x += 1) {
      let free = true;
      for (let cellY = y; cellY < y + move.height && free; cellY += 1) {
        for (let cellX = x; cellX < x + move.width; cellX += 1) {
          if (cells.has(`${cellX},${cellY}`)) {
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

function removeAlias(
  occupancy: Map<number, Map<string, string>>,
  inventoryId: number,
  alias: string
): void {
  const cells = occupancy.get(inventoryId);
  if (!cells) return;
  for (const [key, value] of cells) {
    if (value === alias) cells.delete(key);
  }
}

function placeAlias(
  occupancy: Map<number, Map<string, string>>,
  inventoryId: number,
  alias: string,
  point: GridPoint,
  width: number,
  height: number
): void {
  const cells = occupancy.get(inventoryId);
  if (!cells) throw new Error(`Inventory ${inventoryId} has no occupancy map.`);
  for (let y = point.y; y < point.y + height; y += 1) {
    for (let x = point.x; x < point.x + width; x += 1) {
      cells.set(`${x},${y}`, alias);
    }
  }
}

function bagColumns(geometry: Map<number, SpatialContainer>): number {
  const bag = geometry.get(CHARACTER_BAG_INVENTORY_ID);
  if (!bag || bag.geometry.kind !== "bag") {
    throw new Error("Character bag geometry is unavailable.");
  }
  return bag.geometry.columns;
}
