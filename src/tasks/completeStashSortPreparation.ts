import type { SortInputTiming } from "../domain/automationTiming";
import { buildGameScreenLayout } from "../domain/gameScreenLayout";
import type { SpatialProjection } from "../domain/inventoryGeometry";
import { planCompleteStashSort } from "../domain/completeStashSort";
import { prepareCompleteStashScreenPlan } from "../domain/completeStashScreenPlan";
import { scheduleCompleteStashSort } from "../domain/stashMoveScheduler";
import type { StashPackingMode } from "../domain/stashPacking";
import type { StashTabItemPolicy } from "../domain/stashRouting";
import type { StashTabMapping } from "../domain/stashTabMapping";
import { evaluateStashSortEligibility } from "../domain/stashSortEligibility";
import { CHARACTER_BAG_INVENTORY_ID } from "../domain/inventoryGeometry";
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
  | {
      status: "blocked";
      diagnosticCode: string;
      initialProjection?: SpatialProjection;
      plan?: Extract<ReturnType<typeof planCompleteStashSort>, { status: "ready" }>;
      schedule?: ReturnType<typeof scheduleCompleteStashSort>;
      options?: CompleteSortPreparationOptions;
      quarantinedInventoryIds?: readonly number[];
      unsupportedItemCount?: number;
    }
  | {
      status: "ready";
      initialProjection: SpatialProjection;
      plan: Extract<ReturnType<typeof planCompleteStashSort>, { status: "ready" }>;
      schedule: Extract<ReturnType<typeof scheduleCompleteStashSort>, { status: "ready" }>;
      screenActions: ReturnType<typeof prepareCompleteStashScreenPlan>;
      options: CompleteSortPreparationOptions;
      quarantinedInventoryIds: readonly number[];
      unsupportedItemCount: number;
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
    const visibleInventoryIds = new Set(this.mapping.entries.map((entry) => entry.inventoryId));
    const eligibility = evaluateStashSortEligibility(projection, {
      disabledInventoryIds: [
        ...options.excludedInventoryIds,
        ...options.policies.filter((policy) => !policy.enabled).map((policy) => policy.inventoryId)
      ]
    });
    const quarantinedInventoryIds = eligibility.pages
      .filter((page) =>
        visibleInventoryIds.has(page.inventoryId) &&
        page.status === "manual-relocation-required")
      .map((page) => page.inventoryId);
    const hardBlockedInventoryIds = eligibility.pages
      .filter((page) =>
        visibleInventoryIds.has(page.inventoryId) &&
        page.status === "blocked")
      .map((page) => page.inventoryId);
    const bag = projection.containers.find(
      (container) => container.inventoryId === CHARACTER_BAG_INVENTORY_ID
    );
    if (hardBlockedInventoryIds.length > 0 || !bag || bag.status !== "ready") {
      return {
        status: "blocked",
        diagnosticCode: "initial-projection-not-ready",
        initialProjection: projection,
        quarantinedInventoryIds,
        unsupportedItemCount: eligibility.totalUnsupportedItemCount
      };
    }
    const effectiveOptions: CompleteSortPreparationOptions = {
      ...options,
      excludedInventoryIds: [...new Set([
        ...options.excludedInventoryIds,
        ...quarantinedInventoryIds
      ])]
    };
    const plan = planCompleteStashSort({
      projection,
      mapping: this.mapping,
      policies: effectiveOptions.policies,
      mode: effectiveOptions.mode,
      excludedInventoryIds: effectiveOptions.excludedInventoryIds
    });
    if (plan.status !== "ready") {
      return {
        status: "blocked",
        diagnosticCode: plan.reason,
        initialProjection: projection,
        quarantinedInventoryIds,
        unsupportedItemCount: eligibility.totalUnsupportedItemCount,
        options: effectiveOptions
      };
    }
    const schedule = scheduleCompleteStashSort(plan, projection);
    if (schedule.status !== "ready") {
      return {
        status: "blocked",
        diagnosticCode: schedule.diagnosticCode,
        initialProjection: projection,
        plan,
        schedule,
        options: effectiveOptions,
        quarantinedInventoryIds,
        unsupportedItemCount: eligibility.totalUnsupportedItemCount
      };
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
      options: effectiveOptions,
      quarantinedInventoryIds,
      unsupportedItemCount: eligibility.totalUnsupportedItemCount
    };
  }
}
