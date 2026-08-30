import type { SpatialContainer, SpatialProjection } from "./inventoryGeometry";
import {
  calibrationFreshness,
  calibrationMatchesGeometry,
  cellCenterFor,
  type CalibrationRuntimeState,
  type ScreenPoint,
  type StashGridCalibration
} from "./stashScreenCalibration";
import {
  itemTouchesReservedRegion,
  rectanglesIntersect,
  validateReservedRegions,
  type GridRectangle
} from "./stash";
import {
  mappingIsCurrent,
  resolveInventoryForTab,
  type StashTabMapping
} from "./stashTabMapping";

export interface SupervisedMoveRequest {
  taskId: string;
  planId: string;
  actionId: string;
  itemAlias: string;
  inventoryId: number;
  tabIndex: number;
  destination: { x: number; y: number };
  expectedSnapshotHash: string;
  expectedSnapshotVersion: number;
  expectedSnapshotTimestampMilliseconds?: number;
  expectedWindowIdentity?: string;
  expectedInputMethod?: string;
}

export interface SupervisedMoveRuntimeContext extends CalibrationRuntimeState {
  runtimeProfileKey: string;
  availableInventoryIds: readonly number[];
  selectedTabIndex: number;
}

export interface PreparedSupervisedMove {
  status: "ready";
  taskId: string;
  planId: string;
  actionId: string;
  itemAlias: string;
  inventoryId: number;
  tabIndex: number;
  sourceSnapshotHash: string;
  sourceSnapshotVersion: number;
  sourceSnapshotTimestampMilliseconds?: number;
  windowIdentity?: string;
  inputMethod?: string;
  calibrationProfileId: string;
  gameBuildFingerprint: string;
  windowBounds: { left: number; top: number; width: number; height: number };
  source: { slotId: number; grid: { x: number; y: number }; screen: ScreenPoint };
  destination: { slotId: number; grid: { x: number; y: number }; screen: ScreenPoint };
  planFingerprint: string;
}

export type SupervisedMoveBlockReason =
  | "page-disabled"
  | "snapshot-stale"
  | "container-not-ready"
  | "tab-mapping-stale"
  | "wrong-tab"
  | "calibration-stale"
  | "source-not-unique"
  | "first-move-requires-single-item-cell"
  | "destination-invalid"
  | "destination-occupied"
  | "reserved-region"
  | "no-op";

export type SupervisedMovePreparation = PreparedSupervisedMove | {
  status: "blocked";
  reason: SupervisedMoveBlockReason;
  detail: string;
};

export interface HumanMoveApproval {
  kind: "human-confirmation";
  planFingerprint: string;
  confirmedAtMilliseconds: number;
}

export function prepareSupervisedMove(parameters: {
  request: SupervisedMoveRequest;
  projection: SpatialProjection;
  mapping: StashTabMapping;
  calibration: StashGridCalibration;
  runtime: SupervisedMoveRuntimeContext;
  pageEnabled: boolean;
  reservedRegions?: readonly GridRectangle[];
}): SupervisedMovePreparation {
  const { request, projection, mapping, calibration, runtime } = parameters;
  const reservedRegions = parameters.reservedRegions ?? [];
  if (!parameters.pageEnabled) return blocked("page-disabled", "This stash tab is disabled for sorting.");
  if (projection.sourceSnapshotHash !== request.expectedSnapshotHash ||
      projection.sourceVersion !== request.expectedSnapshotVersion) {
    return blocked("snapshot-stale", "The authoritative stash snapshot changed after planning.");
  }

  const containers = projection.containers.filter(container => container.inventoryId === request.inventoryId);
  const container = containers[0];
  if (containers.length !== 1 || !container || container.status !== "ready" ||
      container.geometry.kind !== "rectangular") {
    return blocked("container-not-ready", "The selected stash container is missing, duplicated, or spatially blocked.");
  }
  if (!mappingIsCurrent(
    mapping,
    runtime.runtimeProfileKey,
    runtime.gameBuildFingerprint,
    runtime.availableInventoryIds
  )) {
    return blocked("tab-mapping-stale", "The character page set or game build changed after tab mapping.");
  }
  if (runtime.selectedTabIndex !== request.tabIndex ||
      resolveInventoryForTab(mapping, request.tabIndex) !== request.inventoryId) {
    return blocked("wrong-tab", "The visible stash tab does not match the requested inventory.");
  }
  const freshness = calibrationFreshness(calibration, runtime);
  if (!freshness.current || !calibrationMatchesGeometry(calibration, container.geometry)) {
    return blocked(
      "calibration-stale",
      `The screen calibration is not current (${freshness.reasons.join(", ") || "grid-geometry-changed"}).`
    );
  }
  const reservedValidation = validateReservedRegions(calibration.grid, reservedRegions);
  if (!reservedValidation.valid) {
    return blocked("reserved-region", reservedValidation.errors.join(" "));
  }

  const sources = container.placements.filter(placement => placement.alias === request.itemAlias);
  if (sources.length !== 1) {
    return blocked("source-not-unique", "The selected deterministic item alias is missing or duplicated.");
  }
  const source = sources[0];
  if (!source) {
    return blocked("source-not-unique", "The selected deterministic item alias is missing or duplicated.");
  }
  if (source.width !== 1 || source.height !== 1 || source.stackQuantity !== 1) {
    return blocked(
      "first-move-requires-single-item-cell",
      "The first generated move is restricted to one unstacked 1x1 item."
    );
  }
  if (!validGridPoint(request.destination, container)) {
    return blocked("destination-invalid", "The requested destination is outside the selected stash grid.");
  }
  if (source.x === request.destination.x && source.y === request.destination.y) {
    return blocked("no-op", "Source and destination are the same cell.");
  }
  const sourceRectangle = { x: source.x, y: source.y, width: 1, height: 1 };
  const destinationRectangle = { ...request.destination, width: 1, height: 1 };
  if (itemTouchesReservedRegion({ instanceKey: source.alias, bounds: sourceRectangle }, reservedRegions) ||
      reservedRegions.some(region => rectanglesIntersect(destinationRectangle, region))) {
    return blocked("reserved-region", "The source or destination intersects a user-reserved region.");
  }
  if (container.placements.some(placement =>
    placement.alias !== source.alias && rectanglesIntersect(destinationRectangle, placement)
  )) {
    return blocked("destination-occupied", "The requested destination is not empty.");
  }

  const base = {
    status: "ready" as const,
    taskId: request.taskId,
    planId: request.planId,
    actionId: request.actionId,
    itemAlias: request.itemAlias,
    inventoryId: request.inventoryId,
    tabIndex: request.tabIndex,
    sourceSnapshotHash: projection.sourceSnapshotHash,
    sourceSnapshotVersion: projection.sourceVersion,
    ...(request.expectedSnapshotTimestampMilliseconds === undefined ? {} : { sourceSnapshotTimestampMilliseconds: request.expectedSnapshotTimestampMilliseconds }),
    ...(request.expectedWindowIdentity === undefined ? {} : { windowIdentity: request.expectedWindowIdentity }),
    ...(request.expectedInputMethod === undefined ? {} : { inputMethod: request.expectedInputMethod }),
    calibrationProfileId: calibration.profileId,
    gameBuildFingerprint: runtime.gameBuildFingerprint,
    windowBounds: { ...runtime.windowBounds },
    source: {
      slotId: source.slotId,
      grid: { x: source.x, y: source.y },
      screen: cellCenterFor(calibration, source)
    },
    destination: {
      slotId: request.destination.y * container.geometry.columns + request.destination.x,
      grid: { ...request.destination },
      screen: cellCenterFor(calibration, request.destination)
    }
  };
  return { ...base, planFingerprint: fingerprint(base) };
}

export function approvalMatchesPlan(
  approval: HumanMoveApproval,
  plan: PreparedSupervisedMove
): boolean {
  return approval.kind === "human-confirmation" &&
    Number.isFinite(approval.confirmedAtMilliseconds) &&
    approval.planFingerprint === plan.planFingerprint;
}

function validGridPoint(point: { x: number; y: number }, container: SpatialContainer): boolean {
  return container.geometry.kind === "rectangular" &&
    Number.isInteger(point.x) && Number.isInteger(point.y) &&
    point.x >= 0 && point.y >= 0 &&
    point.x < container.geometry.columns && point.y < container.geometry.rows;
}

function fingerprint(value: Omit<PreparedSupervisedMove, "planFingerprint">): string {
  const payload = JSON.stringify([
    value.taskId,
    value.planId,
    value.actionId,
    value.itemAlias,
    value.inventoryId,
    value.tabIndex,
    value.sourceSnapshotHash,
    value.sourceSnapshotVersion,
    value.sourceSnapshotTimestampMilliseconds ?? null,
    value.windowIdentity ?? null,
    value.inputMethod ?? null,
    1,
    "1x1",
    1,
    0,
    value.calibrationProfileId,
    value.gameBuildFingerprint,
    value.windowBounds.left,
    value.windowBounds.top,
    value.windowBounds.width,
    value.windowBounds.height,
    value.source.slotId,
    value.destination.slotId,
    value.source.screen.x,
    value.source.screen.y,
    value.destination.screen.x,
    value.destination.screen.y
  ]);
  return `move003-${fnv1a64(`left:${payload}`)}${fnv1a64(`right:${payload}`)}`;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

function blocked(reason: SupervisedMoveBlockReason, detail: string): SupervisedMovePreparation {
  return { status: "blocked", reason, detail };
}
