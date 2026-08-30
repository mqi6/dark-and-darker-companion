import type { GridPoint, InventoryGeometry } from "./inventoryGeometry";

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenRectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface StashGridCalibration {
  schemaVersion: 1;
  profileId: string;
  gameBuildFingerprint: string;
  windowBounds: ScreenRectangle;
  grid: { columns: number; rows: number };
  gridTopLeft: ScreenPoint;
  gridBottomRight: ScreenPoint;
  cellWidth: number;
  cellHeight: number;
}

export interface CalibrationRuntimeState {
  gameBuildFingerprint: string;
  windowBounds: ScreenRectangle;
  isForeground: boolean;
}

export type CalibrationStaleReason =
  | "window-not-foreground"
  | "game-build-changed"
  | "window-bounds-changed";

export interface CalibrationFreshness {
  current: boolean;
  reasons: readonly CalibrationStaleReason[];
}

export function createStashGridCalibration(parameters: {
  profileId: string;
  gameBuildFingerprint: string;
  windowBounds: ScreenRectangle;
  grid: { columns: number; rows: number };
  gridTopLeft: ScreenPoint;
  gridBottomRight: ScreenPoint;
}): StashGridCalibration {
  const profileId = parameters.profileId.trim();
  const gameBuildFingerprint = parameters.gameBuildFingerprint.trim();
  if (!profileId || !gameBuildFingerprint) {
    throw new Error("Calibration profile and game build fingerprint are required.");
  }
  validateScreenRectangle(parameters.windowBounds);
  if (!Number.isInteger(parameters.grid.columns) || parameters.grid.columns < 1 ||
      !Number.isInteger(parameters.grid.rows) || parameters.grid.rows < 1) {
    throw new Error("Calibration grid dimensions must be positive integers.");
  }
  validateScreenPoint(parameters.gridTopLeft);
  validateScreenPoint(parameters.gridBottomRight);
  if (parameters.gridBottomRight.x <= parameters.gridTopLeft.x ||
      parameters.gridBottomRight.y <= parameters.gridTopLeft.y) {
    throw new Error("Calibration bottom-right anchor must be below and right of top-left.");
  }
  if (!pointInsideRectangle(parameters.gridTopLeft, parameters.windowBounds) ||
      !pointInsideRectangle(parameters.gridBottomRight, parameters.windowBounds, true)) {
    throw new Error("Calibration anchors must remain inside the captured game window.");
  }

  return {
    schemaVersion: 1,
    profileId,
    gameBuildFingerprint,
    windowBounds: { ...parameters.windowBounds },
    grid: { ...parameters.grid },
    gridTopLeft: { ...parameters.gridTopLeft },
    gridBottomRight: { ...parameters.gridBottomRight },
    cellWidth: (parameters.gridBottomRight.x - parameters.gridTopLeft.x) / parameters.grid.columns,
    cellHeight: (parameters.gridBottomRight.y - parameters.gridTopLeft.y) / parameters.grid.rows
  };
}

export function createCharacterBagGridCalibration(
  parameters: Omit<Parameters<typeof createStashGridCalibration>[0], "grid">
): StashGridCalibration {
  return createStashGridCalibration({
    ...parameters,
    grid: { columns: 10, rows: 5 }
  });
}

export function calibrationMatchesGeometry(
  calibration: StashGridCalibration,
  geometry: InventoryGeometry
): boolean {
  return (geometry.kind === "rectangular" || geometry.kind === "bag") &&
    geometry.columns === calibration.grid.columns &&
    geometry.rows === calibration.grid.rows;
}

export function cellCenterFor(
  calibration: StashGridCalibration,
  point: GridPoint
): ScreenPoint {
  if (!Number.isInteger(point.x) || !Number.isInteger(point.y) ||
      point.x < 0 || point.y < 0 ||
      point.x >= calibration.grid.columns || point.y >= calibration.grid.rows) {
    throw new RangeError("Grid point is outside the calibrated stash.");
  }
  return {
    x: calibration.gridTopLeft.x + (point.x + 0.5) * calibration.cellWidth,
    y: calibration.gridTopLeft.y + (point.y + 0.5) * calibration.cellHeight
  };
}

export function calibrationFreshness(
  calibration: StashGridCalibration,
  runtime: CalibrationRuntimeState,
  boundsTolerancePixels = 1
): CalibrationFreshness {
  if (!Number.isFinite(boundsTolerancePixels) || boundsTolerancePixels < 0) {
    throw new RangeError("Window bounds tolerance must be non-negative.");
  }
  const reasons: CalibrationStaleReason[] = [];
  if (!runtime.isForeground) reasons.push("window-not-foreground");
  if (runtime.gameBuildFingerprint !== calibration.gameBuildFingerprint) {
    reasons.push("game-build-changed");
  }
  if (!rectanglesEqualWithin(calibration.windowBounds, runtime.windowBounds, boundsTolerancePixels)) {
    reasons.push("window-bounds-changed");
  }
  return { current: reasons.length === 0, reasons };
}

function validateScreenPoint(point: ScreenPoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("Screen coordinates must be finite.");
  }
}

function validateScreenRectangle(rectangle: ScreenRectangle): void {
  if (![rectangle.left, rectangle.top, rectangle.width, rectangle.height].every(Number.isFinite) ||
      rectangle.width <= 0 || rectangle.height <= 0) {
    throw new Error("Game window bounds must be finite and positive.");
  }
}

function pointInsideRectangle(
  point: ScreenPoint,
  rectangle: ScreenRectangle,
  allowBottomRightEdge = false
): boolean {
  const right = rectangle.left + rectangle.width;
  const bottom = rectangle.top + rectangle.height;
  return point.x >= rectangle.left && point.y >= rectangle.top &&
    (allowBottomRightEdge ? point.x <= right && point.y <= bottom : point.x < right && point.y < bottom);
}

function rectanglesEqualWithin(
  left: ScreenRectangle,
  right: ScreenRectangle,
  tolerance: number
): boolean {
  return Math.abs(left.left - right.left) <= tolerance &&
    Math.abs(left.top - right.top) <= tolerance &&
    Math.abs(left.width - right.width) <= tolerance &&
    Math.abs(left.height - right.height) <= tolerance;
}
