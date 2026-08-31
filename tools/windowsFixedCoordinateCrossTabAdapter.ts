import type { ScreenPoint } from "../src/domain/stashScreenCalibration";
import type {
  CrossTabRuntimeActionResult
} from "../src/tasks/crossTabSortExecution";
import type {
  FixedCoordinateCrossTabAdapter,
  FixedCoordinateDrag
} from "../src/tasks/fixedCoordinateCrossTabRuntime";
import type {
  NavigationWindowState,
  ScreenClassification
} from "../src/tasks/windowsNavigationRuntime";
import type { MoveDispatchResult } from "../src/tasks/supervisedMoveRunner";

export interface NavigationInputBridge {
  inspectWindow(): Promise<NavigationWindowState>;
  classifyScreen(): Promise<ScreenClassification>;
  clickForeground(
    point: ScreenPoint
  ): Promise<{ status: "clicked" } | { status: "rejected"; diagnosticCode: string }>;
}

export interface DragInputBridge {
  dispatchLeftDrag(parameters: {
    expectedWindowHandle: string;
    expectedBounds: NavigationWindowState["clientBounds"];
    source: ScreenPoint;
    destination: ScreenPoint;
    durationMilliseconds: number;
  }): Promise<MoveDispatchResult>;
}

export class WindowsFixedCoordinateCrossTabAdapter
implements FixedCoordinateCrossTabAdapter {
  constructor(
    private readonly navigation: NavigationInputBridge,
    private readonly drag: DragInputBridge,
    private readonly expectedWindow: NavigationWindowState
  ) {}

  inspectWindow(): Promise<NavigationWindowState> {
    // The production navigation bridge restores and verifies the expected
    // DungeonCrawler foreground window before returning.
    return this.navigation.inspectWindow();
  }

  classifyScreen(): Promise<ScreenClassification> {
    return this.navigation.classifyScreen();
  }

  clickForeground(point: ScreenPoint) {
    return this.navigation.clickForeground(point);
  }

  async dragForeground(
    parameters: FixedCoordinateDrag
  ): Promise<CrossTabRuntimeActionResult> {
    const result = await this.drag.dispatchLeftDrag({
      expectedWindowHandle: this.expectedWindow.windowHandle,
      expectedBounds: this.expectedWindow.clientBounds,
      ...parameters
    });
    if (result.status === "dispatched") return { status: "completed" };
    if (result.status === "cancelled") return { status: "cancelled" };
    return {
      status: "failed",
      diagnosticCode: result.diagnosticCode,
      ...(result.inputMayHaveBeenDispatched
        ? { inputMayHaveBeenDispatched: true }
        : {})
    };
  }
}
