import type { SortInputTiming } from "../domain/automationTiming";
import { buildGameScreenLayout } from "../domain/gameScreenLayout";
import type { SpatialProjection } from "../domain/inventoryGeometry";
import { planCompleteStashSort } from "../domain/completeStashSort";
import { prepareCompleteStashScreenPlan } from "../domain/completeStashScreenPlan";
import { scheduleCompleteStashSort } from "../domain/stashMoveScheduler";
import type { StashPackingMode } from "../domain/stashPacking";
import type { StashTabItemPolicy } from "../domain/stashRouting";
import type { StashTabMapping } from "../domain/stashTabMapping";
import type { NavigationWindowState } from "./windowsNavigationRuntime";

export interface CompleteProjectionRefreshBridge {
  /** Performs the established character-reselection route and returns its complete command-44 projection. */
  refreshCompleteProjection(signal?: AbortSignal): Promise<SpatialProjection>;
}

export interface CompleteSortPreparationOptions {
  mode: StashPackingMode;
  timing: SortInputTiming;
  policies: readonly StashTabItemPolicy[];
  excludedInventoryIds: readonly number[];
}

export type CompleteSortPreparationResult =
  | { status: "blocked"; diagnosticCode: string }
  | {
      status: "ready";
      initialProjection: SpatialProjection;
      plan: Extract<ReturnType<typeof planCompleteStashSort>, { status: "ready" }>;
      schedule: Extract<ReturnType<typeof scheduleCompleteStashSort>, { status: "ready" }>;
      screenActions: ReturnType<typeof prepareCompleteStashScreenPlan>;
      options: CompleteSortPreparationOptions;
    };

export class CompleteStashSortPreparationController {
  constructor(
    private readonly refresh: CompleteProjectionRefreshBridge,
    private readonly mapping: StashTabMapping,
    private readonly window: NavigationWindowState
  ) {}

  async refreshAndPreview(options: CompleteSortPreparationOptions, signal?: AbortSignal):
  Promise<CompleteSortPreparationResult> {
    const projection = await this.refresh.refreshCompleteProjection(signal);
    if (!projection.ready) return { status: "blocked", diagnosticCode: "initial-projection-not-ready" };
    const plan = planCompleteStashSort({
      projection,
      mapping: this.mapping,
      policies: options.policies,
      mode: options.mode,
      excludedInventoryIds: options.excludedInventoryIds
    });
    if (plan.status !== "ready") return { status: "blocked", diagnosticCode: plan.reason };
    const schedule = scheduleCompleteStashSort(plan, projection);
    if (schedule.status !== "ready") {
      return { status: "blocked", diagnosticCode: schedule.diagnosticCode };
    }
    const layout = buildGameScreenLayout({
      clientBounds: this.window.clientBounds,
      visibleStashTabs: this.mapping.entries.length
    });
    return {
      status: "ready",
      initialProjection: projection,
      plan,
      schedule,
      screenActions: prepareCompleteStashScreenPlan(schedule, layout),
      options
    };
  }
}
