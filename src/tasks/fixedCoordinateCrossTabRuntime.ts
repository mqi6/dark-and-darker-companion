import {
  SORT_INPUT_TIMING_PRESETS,
  validateSortInputTiming,
  type SortInputTiming
} from "../domain/automationTiming";
import { buildGameScreenLayout, type GameScreenLayout } from "../domain/gameScreenLayout";
import { prepareCrossTabScreenTransfer } from "../domain/crossTabScreenPlan";
import type { ScheduledStashSortScreenAction } from "../domain/completeStashScreenPlan";
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

export interface FixedCoordinateClickTiming {
  pointerSettleMilliseconds: number;
  clickHoldMilliseconds: number;
  postClickMilliseconds: number;
}

export interface FixedCoordinateDrag {
  source: ScreenPoint;
  destination: ScreenPoint;
  durationMilliseconds: number;
  pointerSettleMilliseconds: number;
  postDragMilliseconds: number;
}

export interface FixedCoordinateCrossTabAdapter {
  inspectWindow(): Promise<NavigationWindowState>;
  classifyScreen(): Promise<ScreenClassification>;
  clickForeground(
    point: ScreenPoint,
    timing: FixedCoordinateClickTiming
  ): Promise<{ status: "clicked" } | { status: "rejected"; diagnosticCode: string }>;
  dragForeground(drag: FixedCoordinateDrag): Promise<CrossTabRuntimeActionResult>;
}

export interface CompleteSpatialProjectionRefresher {
  refreshCompleteProjection(signal?: AbortSignal): Promise<SpatialProjection>;
}

export class FixedCoordinateCrossTabRuntime implements CrossTabSortRuntime {
  readonly layout: GameScreenLayout;
  readonly timing: SortInputTiming;

  constructor(
    private readonly adapter: FixedCoordinateCrossTabAdapter,
    private readonly refresher: CompleteSpatialProjectionRefresher,
    private readonly expectedWindow: NavigationWindowState,
    visibleStashTabs: number,
    timing: SortInputTiming = SORT_INPUT_TIMING_PRESETS.balanced
  ) {
    validateSortInputTiming(timing);
    this.timing = { ...timing };
    this.layout = buildGameScreenLayout({
      clientBounds: expectedWindow.clientBounds,
      visibleStashTabs
    });
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
    const click = await this.adapter.clickForeground(point, {
      pointerSettleMilliseconds: this.timing.pointerSettleMilliseconds,
      clickHoldMilliseconds: this.timing.clickHoldMilliseconds,
      postClickMilliseconds: this.timing.postClickMilliseconds
    });
    if (click.status === "rejected") {
      return { status: "failed", diagnosticCode: click.diagnosticCode };
    }
    await cancellableDelay(this.timing.tabSettleMilliseconds, signal);
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
        inputMayHaveBeenDispatched: true,
        observation: {
          expectedTabIndex: tabIndex,
          ...(classification.status === "classified"
            ? { screen: classification.observation.screen }
            : { screen: classification.status })
        }
      };
    }
    const observedTab = classification.observation.selectedStashTabIndex;
    if (observedTab !== undefined && observedTab !== tabIndex) {
      return {
        status: "failed",
        diagnosticCode: "selected-stash-tab-mismatch",
        inputMayHaveBeenDispatched: true,
        observation: {
          screen: classification.observation.screen,
          expectedTabIndex: tabIndex,
          observedTabIndex: observedTab
        }
      };
    }
    return {
      status: "completed",
      observation: {
        screen: classification.observation.screen,
        expectedTabIndex: tabIndex,
        ...(observedTab === undefined ? {} : { observedTabIndex: observedTab })
      }
    };
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

  async preflightScheduledScreenActions(
    actions: readonly ScheduledStashSortScreenAction[],
    signal?: AbortSignal
  ): Promise<string | undefined> {
    if (signal?.aborted) return "operator-cancelled";
    if (actions.length === 0) return "complete-sort-has-no-actions";
    for (const action of actions) {
      const points = action.kind === "select-stash-tab"
        ? [action.point]
        : [action.source, action.destination];
      if (points.some((point) => !insideClient(point, this.layout.clientBounds))) {
        return "fixed-coordinate-plan-invalid";
      }
    }
    const problem = await this.windowProblem();
    if (problem) return problem;
    const classification = await this.adapter.classifyScreen();
    return classification.status === "classified" &&
      classification.observation.screen === "stash"
      ? undefined
      : "stash-screen-not-observed";
  }

  async runScheduledScreenAction(
    action: ScheduledStashSortScreenAction,
    signal?: AbortSignal
  ): Promise<CrossTabRuntimeActionResult> {
    if (action.kind === "select-stash-tab") {
      return this.selectStashTab(action.tabIndex, action.inventoryId, signal);
    }
    return this.dispatchDrag({
      source: action.source,
      destination: action.destination
    }, signal);
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
      durationMilliseconds: this.timing.dragDurationMilliseconds,
      pointerSettleMilliseconds: this.timing.pointerSettleMilliseconds,
      postDragMilliseconds: this.timing.postDragMilliseconds
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

function insideClient(point: ScreenPoint, bounds: ScreenRectangle): boolean {
  return point.x >= bounds.left && point.y >= bounds.top &&
    point.x < bounds.left + bounds.width &&
    point.y < bounds.top + bounds.height;
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
