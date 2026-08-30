import { describe, expect, it } from "vitest";
import type { GameplayItemMetadata } from "../src/domain/gameplayCatalog";
import type { SpatialContainer, SpatialPlacement, SpatialProjection } from "../src/domain/inventoryGeometry";
import { createStashGridCalibration } from "../src/domain/stashScreenCalibration";
import { createStashTabMapping } from "../src/domain/stashTabMapping";
import {
  approvalMatchesPlan,
  prepareSupervisedMove,
  type SupervisedMoveRequest
} from "../src/domain/supervisedMove";

const metadata: GameplayItemMetadata = {
  id: "id.item.test",
  rarity: "common",
  inventoryWidth: 1,
  inventoryHeight: 1,
  maxStackSize: 1
};

function placement(alias: string, x: number, y: number, overrides: Partial<SpatialPlacement> = {}): SpatialPlacement {
  return {
    alias,
    inventoryId: 20,
    slotId: y * 12 + x,
    x,
    y,
    width: 1,
    height: 1,
    stackQuantity: 1,
    metadata,
    ...overrides
  };
}

function container(placements: SpatialPlacement[]): SpatialContainer {
  return {
    inventoryId: 20,
    status: "ready",
    geometry: { kind: "rectangular", columns: 12, rows: 20 },
    placements,
    diagnostics: []
  };
}

const calibration = createStashGridCalibration({
  profileId: "calibration-1",
  gameBuildFingerprint: "build-1",
  windowBounds: { left: 0, top: 0, width: 400, height: 400 },
  grid: { columns: 12, rows: 20 },
  gridTopLeft: { x: 100, y: 100 },
  gridBottomRight: { x: 220, y: 300 }
});
const mapping = createStashTabMapping({
  runtimeProfileKey: "character-a",
  gameBuildFingerprint: "build-1",
  availableInventoryIds: [4, 20],
  entries: [
    { tabIndex: 0, inventoryId: 4 },
    { tabIndex: 1, inventoryId: 20 }
  ]
});

const request: SupervisedMoveRequest = {
  taskId: "move-task-1",
  planId: "move-plan-1",
  actionId: "move-action-1",
  itemAlias: "item-001",
  inventoryId: 20,
  tabIndex: 1,
  destination: { x: 3, y: 4 },
  expectedSnapshotHash: "snapshot-hash-1",
  expectedSnapshotVersion: 7
};

const runtime = {
  runtimeProfileKey: "character-a",
  availableInventoryIds: [4, 20],
  selectedTabIndex: 1,
  gameBuildFingerprint: "build-1",
  windowBounds: { left: 0, top: 0, width: 400, height: 400 },
  isForeground: true
};

function projection(placements = [placement("item-001", 1, 2)]): SpatialProjection {
  return {
    sourceSnapshotHash: "snapshot-hash-1",
    sourceVersion: 7,
    containers: [container(placements)],
    ready: true
  };
}

function prepare(overrides: Partial<Parameters<typeof prepareSupervisedMove>[0]> = {}) {
  return prepareSupervisedMove({
    request,
    projection: projection(),
    mapping,
    calibration,
    runtime,
    pageEnabled: true,
    ...overrides
  });
}

describe("first supervised generated move preparation", () => {
  it("prepares one unstacked 1x1 move and binds logical and screen coordinates", () => {
    const result = prepare();
    expect(result).toMatchObject({
      status: "ready",
      source: { slotId: 25, grid: { x: 1, y: 2 }, screen: { x: 115, y: 125 } },
      destination: { slotId: 51, grid: { x: 3, y: 4 }, screen: { x: 135, y: 145 } },
      calibrationProfileId: "calibration-1",
      gameBuildFingerprint: "build-1"
    });
    if (result.status !== "ready") throw new Error("Expected a ready plan.");
    expect(result.planFingerprint).toMatch(/^move003-[a-f0-9]{32}$/);
    expect(approvalMatchesPlan({
      kind: "human-confirmation",
      planFingerprint: result.planFingerprint,
      confirmedAtMilliseconds: 1000
    }, result)).toBe(true);
    expect(approvalMatchesPlan({
      kind: "human-confirmation",
      planFingerprint: `${result.planFingerprint}-stale`,
      confirmedAtMilliseconds: 1000
    }, result)).toBe(false);
  });

  it("changes the compact fingerprint when a bound plan field changes", () => {
    const first = prepare();
    const second = prepare({ request: { ...request, destination: { x: 4, y: 4 } } });
    if (first.status !== "ready" || second.status !== "ready") throw new Error("Expected ready plans.");
    expect(first.planFingerprint).not.toBe(second.planFingerprint);
  });

  it("binds the foreground drag implementation into the approval fingerprint", () => {
    const first = prepare({ request: { ...request, expectedInputMethod: "legacy" } });
    const second = prepare({ request: { ...request, expectedInputMethod: "dndtools-absolute-drag-v1" } });
    if (first.status !== "ready" || second.status !== "ready") throw new Error("Expected ready plans.");
    expect(second.inputMethod).toBe("dndtools-absolute-drag-v1");
    expect(first.planFingerprint).not.toBe(second.planFingerprint);
  });

  it("fails closed for disabled pages, stale snapshots, mappings, calibration, and wrong tabs", () => {
    expect(prepare({ pageEnabled: false })).toMatchObject({ status: "blocked", reason: "page-disabled" });
    expect(prepare({ request: { ...request, expectedSnapshotVersion: 6 } }))
      .toMatchObject({ status: "blocked", reason: "snapshot-stale" });
    expect(prepare({ runtime: { ...runtime, selectedTabIndex: 0 } }))
      .toMatchObject({ status: "blocked", reason: "wrong-tab" });
    expect(prepare({ runtime: { ...runtime, windowBounds: { ...runtime.windowBounds, width: 500 } } }))
      .toMatchObject({ status: "blocked", reason: "calibration-stale" });
    expect(prepare({ runtime: { ...runtime, availableInventoryIds: [4, 20, 21] } }))
      .toMatchObject({ status: "blocked", reason: "tab-mapping-stale" });
  });

  it("blocks occupied, reserved, out-of-bounds, and no-op destinations", () => {
    expect(prepare({ projection: projection([
      placement("item-001", 1, 2),
      placement("item-002", 3, 4)
    ]) })).toMatchObject({ status: "blocked", reason: "destination-occupied" });
    expect(prepare({ reservedRegions: [{ x: 3, y: 4, width: 1, height: 1 }] }))
      .toMatchObject({ status: "blocked", reason: "reserved-region" });
    expect(prepare({ request: { ...request, destination: { x: 12, y: 0 } } }))
      .toMatchObject({ status: "blocked", reason: "destination-invalid" });
    expect(prepare({ request: { ...request, destination: { x: 1, y: 2 } } }))
      .toMatchObject({ status: "blocked", reason: "no-op" });
  });

  it("restricts the first generated move to one unstacked 1x1 item", () => {
    expect(prepare({ projection: projection([
      placement("item-001", 1, 2, { stackQuantity: 2 })
    ]) })).toMatchObject({ status: "blocked", reason: "first-move-requires-single-item-cell" });
    expect(prepare({ projection: projection([
      placement("item-001", 1, 2, { width: 2, metadata: { ...metadata, inventoryWidth: 2 } })
    ]) })).toMatchObject({ status: "blocked", reason: "first-move-requires-single-item-cell" });
  });
});
