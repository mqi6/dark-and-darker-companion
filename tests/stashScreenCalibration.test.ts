import { describe, expect, it } from "vitest";
import {
  calibrationFreshness,
  calibrationMatchesGeometry,
  cellCenterFor,
  createStashGridCalibration
} from "../src/domain/stashScreenCalibration";

const calibration = createStashGridCalibration({
  profileId: "calibration-1",
  gameBuildFingerprint: "build-1",
  windowBounds: { left: 0, top: 0, width: 400, height: 400 },
  grid: { columns: 12, rows: 20 },
  gridTopLeft: { x: 100, y: 100 },
  gridBottomRight: { x: 220, y: 300 }
});

describe("stash screen calibration", () => {
  it("derives exact cell centers from two outer grid anchors", () => {
    expect(calibration).toMatchObject({ cellWidth: 10, cellHeight: 10 });
    expect(cellCenterFor(calibration, { x: 0, y: 0 })).toEqual({ x: 105, y: 105 });
    expect(cellCenterFor(calibration, { x: 11, y: 19 })).toEqual({ x: 215, y: 295 });
  });

  it("rejects points outside the calibrated grid", () => {
    expect(() => cellCenterFor(calibration, { x: 12, y: 0 })).toThrow(/outside/);
    expect(() => cellCenterFor(calibration, { x: 0.5, y: 0 })).toThrow(/outside/);
  });

  it("invalidates calibration when the foreground, build, or window changes", () => {
    expect(calibrationFreshness(calibration, {
      gameBuildFingerprint: "build-1",
      windowBounds: { left: 0, top: 0, width: 400, height: 400 },
      isForeground: true
    })).toEqual({ current: true, reasons: [] });

    expect(calibrationFreshness(calibration, {
      gameBuildFingerprint: "build-2",
      windowBounds: { left: 4, top: 0, width: 400, height: 400 },
      isForeground: false
    }).reasons).toEqual([
      "window-not-foreground",
      "game-build-changed",
      "window-bounds-changed"
    ]);
  });

  it("requires calibration geometry to match the protocol container", () => {
    expect(calibrationMatchesGeometry(calibration, {
      kind: "rectangular",
      columns: 12,
      rows: 20
    })).toBe(true);
    expect(calibrationMatchesGeometry(calibration, { kind: "equipment" })).toBe(false);
  });
});
