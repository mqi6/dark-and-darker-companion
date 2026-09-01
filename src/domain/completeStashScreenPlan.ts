import type { GameScreenLayout } from "./gameScreenLayout";
import type { GridPoint } from "./inventoryGeometry";
import type {
  ScheduledStashSort,
  ScheduledStashSortAction
} from "./stashMoveScheduler";
import type { ScreenPoint } from "./stashScreenCalibration";

export type ScheduledStashSortScreenAction =
  | {
      kind: "select-stash-tab";
      tabIndex: number;
      inventoryId: number;
      point: ScreenPoint;
    }
  | {
      kind: "drag-stash-to-stash" | "drag-stash-to-bag" | "drag-bag-to-stash";
      itemAlias: string;
      source: ScreenPoint;
      destination: ScreenPoint;
    };

export function prepareCompleteStashScreenPlan(
  schedule: ScheduledStashSort,
  layout: GameScreenLayout
): readonly ScheduledStashSortScreenAction[] {
  if (schedule.status !== "ready") {
    throw new Error("A blocked stash schedule has no screen plan.");
  }
  return schedule.actions.map((action) => prepareAction(action, layout));
}

function prepareAction(
  action: ScheduledStashSortAction,
  layout: GameScreenLayout
): ScheduledStashSortScreenAction {
  if (action.kind === "select-stash-tab") {
    const point = layout.stash.tabCenters[action.tabIndex];
    if (!point) throw new RangeError(`Stash tab ${action.tabIndex} is not visible.`);
    return { ...action, point };
  }

  const source = action.kind === "drag-bag-to-stash"
    ? bagCellCenter(layout, action.source.point, action.width, action.height)
    : stashCellCenter(layout, action.source.point, action.width, action.height);
  const destination = action.kind === "drag-stash-to-bag"
    ? bagCellCenter(layout, action.destination.point, action.width, action.height)
    : stashCellCenter(layout, action.destination.point, action.width, action.height);
  return {
    kind: action.kind,
    itemAlias: action.itemAlias,
    source,
    destination
  };
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
    throw new RangeError("Scheduled item rectangle is outside the fixed game grid.");
  }
  const cellWidth = (parameters.bottomRight.x - parameters.topLeft.x) / columns;
  const cellHeight = (parameters.bottomRight.y - parameters.topLeft.y) / rows;
  return {
    x: parameters.topLeft.x + (point.x + width / 2) * cellWidth,
    y: parameters.topLeft.y + (point.y + height / 2) * cellHeight
  };
}
