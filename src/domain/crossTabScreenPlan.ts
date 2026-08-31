import type { GameScreenLayout } from "./gameScreenLayout";
import type { GridPoint } from "./inventoryGeometry";
import type { CrossTabTransfer } from "./stashRouting";
import type { ScreenPoint } from "./stashScreenCalibration";

export interface ScreenDrag {
  source: ScreenPoint;
  destination: ScreenPoint;
}

export interface CrossTabScreenTransfer {
  transferId: string;
  itemAlias: string;
  sourceTab: { tabIndex: number; point: ScreenPoint };
  stashToBag: ScreenDrag;
  targetTab: { tabIndex: number; point: ScreenPoint };
  bagToStash: ScreenDrag;
}

export function prepareCrossTabScreenTransfer(
  transfer: CrossTabTransfer,
  layout: GameScreenLayout
): CrossTabScreenTransfer {
  const sourceTabPoint = requiredTabPoint(layout, transfer.sourceTabIndex);
  const targetTabPoint = requiredTabPoint(layout, transfer.targetTabIndex);
  const sourceStash = stashCellCenter(
    layout,
    actionPoint(transfer, "drag-stash-to-bag", "source"),
    transfer.width,
    transfer.height
  );
  const bagPoint = bagCellCenter(
    layout,
    actionPoint(transfer, "drag-stash-to-bag", "destination"),
    transfer.width,
    transfer.height
  );
  const targetStash = stashCellCenter(
    layout,
    actionPoint(transfer, "drag-bag-to-stash", "destination"),
    transfer.width,
    transfer.height
  );

  const prepared = {
    transferId: transfer.transferId,
    itemAlias: transfer.itemAlias,
    sourceTab: { tabIndex: transfer.sourceTabIndex, point: sourceTabPoint },
    stashToBag: { source: sourceStash, destination: bagPoint },
    targetTab: { tabIndex: transfer.targetTabIndex, point: targetTabPoint },
    bagToStash: { source: bagPoint, destination: targetStash }
  };
  for (const point of [
    prepared.sourceTab.point,
    prepared.stashToBag.source,
    prepared.stashToBag.destination,
    prepared.targetTab.point,
    prepared.bagToStash.source,
    prepared.bagToStash.destination
  ]) {
    if (!insideClient(point, layout)) {
      throw new RangeError("Cross-tab screen point is outside the game client.");
    }
  }
  return prepared;
}

export function prepareCrossTabScreenBatch(
  transfers: readonly CrossTabTransfer[],
  layout: GameScreenLayout
): readonly CrossTabScreenTransfer[] {
  if (transfers.length < 1 || transfers.length > 2400) {
    throw new RangeError("Complete cross-tab screen plans require one through 2400 transfers.");
  }
  const ids = new Set(transfers.map((transfer) => transfer.transferId));
  if (ids.size !== transfers.length) {
    throw new Error("Cross-tab transfer IDs must be unique.");
  }
  return transfers.map((transfer) => prepareCrossTabScreenTransfer(transfer, layout));
}

function actionPoint(
  transfer: CrossTabTransfer,
  kind: "drag-stash-to-bag" | "drag-bag-to-stash",
  side: "source" | "destination"
): GridPoint {
  const action = transfer.actions.find((candidate) => candidate.kind === kind);
  if (!action ||
      (kind === "drag-stash-to-bag" && action.kind !== "drag-stash-to-bag") ||
      (kind === "drag-bag-to-stash" && action.kind !== "drag-bag-to-stash")) {
    throw new Error(`Transfer ${transfer.transferId} is missing ${kind}.`);
  }
  if (action.kind === "select-stash-tab") {
    throw new Error(`Transfer ${transfer.transferId} has an invalid ${kind} action.`);
  }
  return side === "source" ? action.source.point : action.destination.point;
}

function stashCellCenter(
  layout: GameScreenLayout,
  point: GridPoint,
  width: number,
  height: number
): ScreenPoint {
  return rectangleCenter({
    topLeft: layout.stash.gridTopLeft,
    bottomRight: layout.stash.gridBottomRight,
    columns: layout.stash.columns,
    rows: layout.stash.rows,
    point,
    width,
    height
  });
}

function bagCellCenter(
  layout: GameScreenLayout,
  point: GridPoint,
  width: number,
  height: number
): ScreenPoint {
  return rectangleCenter({
    topLeft: layout.stash.playerBagGridTopLeft,
    bottomRight: layout.stash.playerBagGridBottomRight,
    columns: layout.stash.playerBagColumns,
    rows: layout.stash.playerBagRows,
    point,
    width,
    height
  });
}

function rectangleCenter(parameters: {
  topLeft: ScreenPoint;
  bottomRight: ScreenPoint;
  columns: number;
  rows: number;
  point: GridPoint;
  width: number;
  height: number;
}): ScreenPoint {
  const { point, width, height, columns, rows } = parameters;
  if (![point.x, point.y, width, height].every(Number.isInteger) ||
      point.x < 0 || point.y < 0 || width < 1 || height < 1 ||
      point.x + width > columns || point.y + height > rows) {
    throw new RangeError("Item rectangle is outside the fixed game grid.");
  }
  const cellWidth = (parameters.bottomRight.x - parameters.topLeft.x) / columns;
  const cellHeight = (parameters.bottomRight.y - parameters.topLeft.y) / rows;
  return {
    x: parameters.topLeft.x + (point.x + width / 2) * cellWidth,
    y: parameters.topLeft.y + (point.y + height / 2) * cellHeight
  };
}

function requiredTabPoint(layout: GameScreenLayout, tabIndex: number): ScreenPoint {
  if (!Number.isInteger(tabIndex) || tabIndex < 0) {
    throw new RangeError("Stash tab index must be a non-negative integer.");
  }
  const point = layout.stash.tabCenters[tabIndex];
  if (!point) throw new RangeError("Stash tab is not visible.");
  return point;
}

function insideClient(point: ScreenPoint, layout: GameScreenLayout): boolean {
  const bounds = layout.clientBounds;
  return point.x >= bounds.left && point.y >= bounds.top &&
    point.x < bounds.left + bounds.width &&
    point.y < bounds.top + bounds.height;
}
