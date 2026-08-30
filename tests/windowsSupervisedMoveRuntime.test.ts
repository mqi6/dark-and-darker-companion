import { describe, expect, it, vi } from "vitest";
import type { PreparedSupervisedMove } from "../src/domain/supervisedMove";
import {
  WindowsSupervisedMoveRuntime,
  type ForegroundWindowInspection,
  type MoveRuntimeStateProvider,
  type WindowsUiBridge
} from "../tools/windowsSupervisedMoveRuntime";

const window: ForegroundWindowInspection = {
  windowHandle: "0x1234",
  processId: 42,
  processName: "DungeonCrawler",
  windowTitle: "Dark and Darker",
  bounds: { left: 10, top: 20, width: 1000, height: 800 },
  display: { virtualLeft: 0, virtualTop: 0, virtualWidth: 1920, virtualHeight: 1080 }
};
const stateValue = {
  sourceSnapshotHash: "snapshot",
  sourceSnapshotVersion: 2,
  snapshotAgeMilliseconds: 1000,
  calibrationProfileId: "profile",
  gameBuildFingerprint: "build",
  selectedTabIndex: 0,
  inventoryId: 4
};
const plan = { planFingerprint: "fingerprint" } as PreparedSupervisedMove;

function setup(overrides: Partial<WindowsUiBridge> = {}, dryRun = false) {
  const calls = { dispatch: 0, verify: 0 };
  const ui: WindowsUiBridge = {
    async inspectForegroundWindow() { return window; },
    async inspectCursor() { return { ...window, cursor: { x: 100, y: 100 } }; },
    async dispatchLeftDrag() { calls.dispatch += 1; return { status: "dispatched" }; },
    ...overrides
  };
  const state: MoveRuntimeStateProvider = {
    async inspectState() { return stateValue; },
    async verifyMove() { calls.verify += 1; return { status: "ambiguous", diagnosticCode: "fixture" }; }
  };
  const runtime = new WindowsSupervisedMoveRuntime(ui, state, {
    windowHandle: window.windowHandle,
    processName: window.processName,
    display: window.display,
    windowBounds: window.bounds
  }, dryRun);
  return { runtime, calls };
}

describe("Windows supervised move runtime", () => {
  it("requires the exact foreground window identity and display geometry", async () => {
    const { runtime } = setup({
      async inspectForegroundWindow() { return { ...window, windowHandle: "0x9999" }; }
    });
    expect((await runtime.inspectEnvironment()).isForeground).toBe(false);

    const changedDisplay = setup({
      async inspectForegroundWindow() {
        return { ...window, display: { ...window.display, virtualWidth: 2560 } };
      }
    });
    expect((await changedDisplay.runtime.inspectEnvironment()).isForeground).toBe(false);
  });

  it("dry-run mode produces no mouse-button dispatch", async () => {
    const { runtime, calls } = setup({}, true);
    expect(await runtime.dispatchLeftDrag({
      source: { x: 10, y: 10 }, destination: { x: 20, y: 20 }, durationMilliseconds: 350
    })).toEqual({ status: "failed", diagnosticCode: "dry-run-input-disabled" });
    expect(calls.dispatch).toBe(0);
  });

  it("dispatches at most one bridge drag and never retries a rejection", async () => {
    const dispatch = vi.fn(async () => ({ status: "failed" as const, diagnosticCode: "blocked" }));
    const { runtime } = setup({ dispatchLeftDrag: dispatch });
    expect(await runtime.dispatchLeftDrag({
      source: { x: 10, y: 10 }, destination: { x: 20, y: 20 }, durationMilliseconds: 350
    })).toEqual({ status: "failed", diagnosticCode: "blocked" });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("blocks dispatch if the window moved after runner preflight", async () => {
    const dispatch = vi.fn(async () => ({ status: "dispatched" as const }));
    const { runtime } = setup({
      async inspectForegroundWindow() { return { ...window, bounds: { ...window.bounds, left: 11 } }; },
      dispatchLeftDrag: dispatch
    });
    expect(await runtime.dispatchLeftDrag({
      source: { x: 10, y: 10 }, destination: { x: 20, y: 20 }, durationMilliseconds: 350
    })).toEqual({ status: "failed", diagnosticCode: "foreground-window-changed" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("supports cancellation during the countdown", async () => {
    const { runtime } = setup();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5);
    await expect(runtime.runCountdown(1000, controller.signal)).resolves.toBe("cancelled");
  });

  it("delegates verification instead of confirming dispatch", async () => {
    const { runtime, calls } = setup();
    expect(await runtime.verifyMove(plan, 1000)).toEqual({ status: "ambiguous", diagnosticCode: "fixture" });
    expect(calls.verify).toBe(1);
  });
});

