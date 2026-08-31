import { buildGameScreenLayout, type GameScreenLayout } from "../domain/gameScreenLayout";
import { prepareCrossTabScreenTransfer } from "../domain/crossTabScreenPlan";
import type { SpatialProjection } from "../domain/inventoryGeometry";
import type { CrossTabSortPlan, CrossTabTransfer } from "../domain/stashRouting";
import type { ScreenPoint, ScreenRectangle } from "../domain/stashScreenCalibration";
import type {
  CrossTabRuntimeActionResult,
  CrossTabSortRuntime
} from "./crossTabSortExecution";
import type {
  DisplayGeometry,
  NavigationWindowState,
  ScreenClassification
} from "./windowsNavigationRuntime";

export interface FixedCoordinateDrag {
  source: ScreenPoint;
  destination: ScreenPoint;
  durationMilliseconds: number;
}

export interface FixedCoordinateCrossTabAdapter {
  inspectWindow(): Promise<NavigationWindowState>;
  classifyScreen(): Promise<ScreenClassification>;
  clickForeground(
    point: ScreenPoint
  ): Promise<{ status: "clicked" } | { status: "rejected"; diagnosticCode: string }>;
  dragForeground(drag: FixedCoordinateDrag): Promise<CrossTabRuntimeActionResult>;
}

export interface CompleteSpatialProjectionRefresher {
  refreshCompleteProjection(signal?: AbortSignal): Promise<SpatialProjection>;
}

export function rebindExpectedGameWindow(
  expected: NavigationWindowState,
  current: NavigationWindowState
): void {
  if (current.processName.toLowerCase() !== "dungeoncrawler" ||
      !sameRectangle(current.clientBounds, expected.clientBounds) ||
      !sameDisplay(current.display, expected.display) ||
      current.gameBuildFingerprint !== expected.gameBuildFingerprint) {
    throw new Error("game-window-rebind-contract-mismatch");
  }
  expected.windowHandle = current.windowHandle;
}

export class FixedCoordinateCrossTabRuntime implements CrossTabSortRuntime {
  readonly layout: GameScreenLayout;

  constructor(
    private readonly adapter: FixedCoordinateCrossTabAdapter,
    private readonly refresher: CompleteSpatialProjectionRefresher,
    private readonly expectedWindow: NavigationWindowState,
    visibleStashTabs: number,
    private readonly tabSettleMilliseconds = 250,
    private readonly dragDurationMilliseconds = 350
  ) {
    this.layout = buildGameScreenLayout({
      clientBounds: expectedWindow.clientBounds,
      visibleStashTabs
    });
    if (!Number.isFinite(tabSettleMilliseconds) ||
        tabSettleMilliseconds < 0 || tabSettleMilliseconds > 2000) {
      throw new RangeError("Tab settle delay must be between 0 and 2000 milliseconds.");
    }
    if (!Number.isFinite(dragDurationMilliseconds) ||
        dragDurationMilliseconds < 100 || dragDurationMilliseconds > 2000) {
      throw new RangeError("Drag duration must be between 100 and 2000 milliseconds.");
    }
  }

  async preflight(
    plan: Extract<CrossTabSortPlan, { status: "ready" }>,
    signal?: AbortSignal
  ): Promise<string | undefined> {
    if (signal?.aborted) return "operator-cancelled";
    try {
      for (const transfer of plan.transfers) {
        prepareCrossTabScreenTransfer(transfer, this.layout);
      }
    } catch {
      return "fixed-coordinate-plan-invalid";
    }
    const windowProblem = await this.windowProblem();
    if (windowProblem) return windowProblem;
    const classification = await this.adapter.classifyScreen();
    if (classification.status !== "classified") {
      return `screen-${classification.status}`;
    }
    return classification.observation.screen === "stash"
      ? undefined
      : "stash-screen-not-observed";
  }

  async selectStashTab(
    tabIndex: number,
    _inventoryId: number,
    signal?: AbortSignal
  ): Promise<CrossTabRuntimeActionResult> {
    if (signal?.aborted) return { status: "cancelled" };
    const problem = await this.windowProblem();
    if (problem) return { status: "failed", diagnosticCode: problem };
    const point = this.layout.stash.tabCenters[tabIndex];
    if (!point) return { status: "failed", diagnosticCode: "stash-tab-not-visible" };
    const click = await this.adapter.clickForeground(point);
    if (click.status === "rejected") {
      return { status: "failed", diagnosticCode: click.diagnosticCode };
    }
    await cancellableDelay(this.tabSettleMilliseconds, signal);
    if (signal?.aborted) {
      return {
        status: "failed",
        diagnosticCode: "cancelled-after-tab-click",
        inputMayHaveBeenDispatched: true
      };
    }
    const classification = await this.adapter.classifyScreen();
    if (classification.status !== "classified" ||
        classification.observation.screen !== "stash") {
      return {
        status: "failed",
        diagnosticCode: "stash-screen-lost-after-tab-click",
        inputMayHaveBeenDispatched: true
      };
    }
    // A stash template proves the screen, not the selected tab. The saved
    // template may have been captured on tab 0 and is reused for every tab.
    return { status: "completed" };
  }

  async dragStashToBag(
    transfer: CrossTabTransfer,
    signal?: AbortSignal
  ): Promise<CrossTabRuntimeActionResult> {
    const prepared = prepareCrossTabScreenTransfer(transfer, this.layout);
    return this.dispatchDrag(prepared.stashToBag, signal);
  }

  async dragBagToStash(
    transfer: CrossTabTransfer,
    signal?: AbortSignal
  ): Promise<CrossTabRuntimeActionResult> {
    const prepared = prepareCrossTabScreenTransfer(transfer, this.layout);
    return this.dispatchDrag(prepared.bagToStash, signal);
  }

  refreshCompletePostState(signal?: AbortSignal): Promise<SpatialProjection> {
    return this.refresher.refreshCompleteProjection(signal);
  }

  private async dispatchDrag(
    drag: { source: ScreenPoint; destination: ScreenPoint },
    signal?: AbortSignal
  ): Promise<CrossTabRuntimeActionResult> {
    if (signal?.aborted) return { status: "cancelled" };
    const problem = await this.windowProblem();
    if (problem) return { status: "failed", diagnosticCode: problem };
    return this.adapter.dragForeground({
      ...drag,
      durationMilliseconds: this.dragDurationMilliseconds
    });
  }

  private async windowProblem(): Promise<string | undefined> {
    const current = await this.adapter.inspectWindow();
    if (current.processName.toLowerCase() !== "dungeoncrawler" ||
        current.windowHandle !== this.expectedWindow.windowHandle) {
      return "foreground-window-mismatch";
    }
    if (!sameRectangle(current.clientBounds, this.expectedWindow.clientBounds)) {
      return "window-bounds-changed";
    }
    if (!sameDisplay(current.display, this.expectedWindow.display)) {
      return "display-geometry-changed";
    }
    if (current.gameBuildFingerprint !== this.expectedWindow.gameBuildFingerprint) {
      return "game-build-changed";
    }
    return undefined;
  }
}

function sameRectangle(left: ScreenRectangle, right: ScreenRectangle): boolean {
  return left.left === right.left && left.top === right.top &&
    left.width === right.width && left.height === right.height;
}

function sameDisplay(left: DisplayGeometry, right: DisplayGeometry): boolean {
  return left.left === right.left && left.top === right.top &&
    left.width === right.width && left.height === right.height;
}

async function cancellableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0 || signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}
