import { describe, expect, it } from "vitest";
import type { NavigationWindowState } from "../src/tasks/windowsNavigationRuntime";
import {
  WindowsFixedCoordinateCrossTabAdapter,
  type DragInputBridge,
  type NavigationInputBridge
} from "../tools/windowsFixedCoordinateCrossTabAdapter";

const windowState: NavigationWindowState = {
  windowHandle: "0x1",
  processName: "DungeonCrawler",
  clientBounds: { left: 1920, top: 0, width: 1920, height: 1080 },
  display: { left: 0, top: 0, width: 3840, height: 1080 },
  primaryDisplay: { left: 0, top: 0, width: 1920, height: 1080 },
  gameBuildFingerprint: "build"
};

function setup(result: Awaited<ReturnType<DragInputBridge["dispatchLeftDrag"]>>) {
  const calls: unknown[] = [];
  const navigation: NavigationInputBridge = {
    async inspectWindow() {
      calls.push("inspect");
      return windowState;
    },
    async classifyScreen() {
      calls.push("classify");
      return { status: "classified", observation: { screen: "stash" } };
    },
    async clickForeground(point) {
      calls.push({ click: point });
      return { status: "clicked" };
    }
  };
  const drag: DragInputBridge = {
    async dispatchLeftDrag(parameters) {
      calls.push({ drag: parameters });
      return result;
    }
  };
  return {
    calls,
    adapter: new WindowsFixedCoordinateCrossTabAdapter(
      navigation,
      drag,
      windowState
    )
  };
}

describe("Windows fixed-coordinate cross-tab adapter", () => {
  it("forwards virtual-desktop clicks and bounds-bound drags", async () => {
    const { adapter, calls } = setup({ status: "dispatched" });
    await adapter.clickForeground({ x: 3248, y: 256 });
    await expect(adapter.dragForeground({
      source: { x: 3318, y: 219 },
      destination: { x: 2628, y: 645 },
      durationMilliseconds: 350
    })).resolves.toEqual({ status: "completed" });
    expect(calls).toEqual([
      { click: { x: 3248, y: 256 } },
      {
        drag: {
          expectedWindowHandle: "0x1",
          expectedBounds: { left: 1920, top: 0, width: 1920, height: 1080 },
          source: { x: 3318, y: 219 },
          destination: { x: 2628, y: 645 },
          durationMilliseconds: 350
        }
      }
    ]);
  });

  it("preserves possible-dispatch failures without retrying", async () => {
    const { adapter } = setup({
      status: "failed",
      diagnosticCode: "ordinary-foreground-input-failed",
      inputMayHaveBeenDispatched: true
    });
    await expect(adapter.dragForeground({
      source: { x: 1, y: 2 },
      destination: { x: 3, y: 4 },
      durationMilliseconds: 350
    })).resolves.toEqual({
      status: "failed",
      diagnosticCode: "ordinary-foreground-input-failed",
      inputMayHaveBeenDispatched: true
    });
  });
});
