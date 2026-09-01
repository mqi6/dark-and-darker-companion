import type { CompleteStashSortPlan } from "../domain/completeStashSort";
import type { ScheduledStashSortScreenAction } from "../domain/completeStashScreenPlan";
import type {
  SpatialContainer,
  SpatialProjection
} from "../domain/inventoryGeometry";
import type { ScheduledStashSort } from "../domain/stashMoveScheduler";
import { GameInteractionLease } from "./taskMachine";
import type { CrossTabRuntimeActionResult } from "./crossTabSortExecution";

export interface CompleteSortLocalApproval {
  readonly kind: "local-complete-sort-confirmation";
  readonly confirmedAtMilliseconds: number;
}

const approvalBindings = new WeakMap<CompleteSortLocalApproval, string>();

export function issueCompleteSortLocalApproval(
  plan: Extract<CompleteStashSortPlan, { status: "ready" }>,
  schedule: Extract<ScheduledStashSort, { status: "ready" }>,
  confirmedAtMilliseconds: number
): CompleteSortLocalApproval {
  if (!Number.isFinite(confirmedAtMilliseconds)) {
    throw new Error("Confirmation time must be finite.");
  }
  const approval = Object.freeze({
    kind: "local-complete-sort-confirmation" as const,
    confirmedAtMilliseconds
  });
  approvalBindings.set(approval, executionBinding(plan, schedule));
  return approval;
}

export interface CompleteStashSortRuntime {
  preflightScheduledScreenActions(
    actions: readonly ScheduledStashSortScreenAction[],
    signal?: AbortSignal
  ): Promise<string | undefined>;
  runScheduledScreenAction(
    action: ScheduledStashSortScreenAction,
    signal?: AbortSignal
  ): Promise<CrossTabRuntimeActionResult>;
  refreshCompletePostState(signal?: AbortSignal): Promise<SpatialProjection>;
}

export interface CompleteSortActionJournalEntry {
  actionIndex: number;
  actionKind: ScheduledStashSortScreenAction["kind"];
  itemAlias?: string;
  selectedTab?: number;
  observedTab?: number;
  observedScreen?: string;
  status: "start" | "completed" | "rejected" | "failed" | "cancelled" | "ambiguous";
  completedActionCount: number;
  completedDragCount: number;
  diagnosticCode?: string;
  adapterError?: string;
}

export type CompleteStashSortRunResult =
  | { status: "already-sorted"; actionCount: 0; dragCount: 0 }
  | { status: "confirmed"; actionCount: number; dragCount: number; evidenceId: string }
  | { status: "blocked"; diagnosticCode: string; actionCount: number; dragCount: number }
  | { status: "cancelled"; actionCount: number; dragCount: number }
  | { status: "ambiguous"; diagnosticCode: string; actionCount: number; dragCount: number };

export class CompleteStashSortExecutionRunner {
  constructor(
    private readonly lease: GameInteractionLease,
    private readonly runtime: CompleteStashSortRuntime,
    private readonly log: (event: { event: string; detail: string }) => void = () => undefined,
    private readonly journal: (entry: CompleteSortActionJournalEntry) => void | Promise<void> = () => undefined,
    private readonly savePostState: (projection: SpatialProjection, reconciliation: {
      status: "confirmed" | "ambiguous";
      diagnosticCode?: string;
    }) => void | Promise<void> = () => undefined
  ) {}

  async execute(parameters: {
    plan: CompleteStashSortPlan;
    schedule: ScheduledStashSort;
    screenActions: readonly ScheduledStashSortScreenAction[];
    initialProjection: SpatialProjection;
    approval: CompleteSortLocalApproval;
    signal?: AbortSignal;
  }): Promise<CompleteStashSortRunResult> {
    if (parameters.plan.status !== "ready") {
      return { status: "blocked", diagnosticCode: "sort-plan-not-ready", actionCount: 0, dragCount: 0 };
    }
    if (parameters.schedule.status !== "ready") {
      return { status: "blocked", diagnosticCode: "sort-schedule-not-ready", actionCount: 0, dragCount: 0 };
    }
    if (parameters.screenActions.length !== parameters.schedule.actions.length) {
      return { status: "blocked", diagnosticCode: "screen-action-count-mismatch", actionCount: 0, dragCount: 0 };
    }
    if (approvalBindings.get(parameters.approval) !==
        executionBinding(parameters.plan, parameters.schedule)) {
      return { status: "blocked", diagnosticCode: "local-approval-missing-or-stale", actionCount: 0, dragCount: 0 };
    }
    if (parameters.schedule.actions.length === 0) {
      return { status: "already-sorted", actionCount: 0, dragCount: 0 };
    }
    if (!this.lease.acquire("STASH-SORT")) {
      return { status: "blocked", diagnosticCode: "game-interaction-lease-unavailable", actionCount: 0, dragCount: 0 };
    }

    let completedActions = 0;
    let dragCount = 0;
    try {
      const preflightProblem = await this.runtime.preflightScheduledScreenActions(
        parameters.screenActions,
        parameters.signal
      );
      if (preflightProblem) {
        return { status: "blocked", diagnosticCode: preflightProblem, actionCount: 0, dragCount: 0 };
      }

      for (const [actionIndex, action] of parameters.screenActions.entries()) {
        if (parameters.signal?.aborted) {
          return dragCount === 0
            ? { status: "cancelled", actionCount: completedActions, dragCount }
            : {
                status: "ambiguous",
                diagnosticCode: "cancelled-after-input-dispatch",
                actionCount: completedActions,
                dragCount
              };
        }
        await this.journal(journalEntry(actionIndex, action, "start", completedActions, dragCount));
        this.log({ event: "sort-action-start", detail: action.kind });
        const result = await this.runtime.runScheduledScreenAction(action, parameters.signal);
        if (result.status !== "completed") {
          const possiblyChanged = dragCount > 0 ||
            (result.status === "failed" && result.inputMayHaveBeenDispatched === true);
          const diagnosticCode = result.status === "cancelled"
            ? "cancelled-after-input-dispatch"
            : result.diagnosticCode;
          await this.journal(journalEntry(
            actionIndex,
            action,
            possiblyChanged ? "ambiguous" : result.status,
            completedActions,
            dragCount,
            diagnosticCode,
            "adapterError" in result ? String(result.adapterError ?? "") || undefined : undefined,
            result
          ));
          return possiblyChanged
            ? {
                status: "ambiguous",
                diagnosticCode: result.status === "cancelled"
                  ? "cancelled-after-input-dispatch"
                  : result.diagnosticCode,
                actionCount: completedActions,
                dragCount
              }
            : result.status === "cancelled"
              ? { status: "cancelled", actionCount: completedActions, dragCount }
              : {
                  status: "blocked",
                  diagnosticCode: result.diagnosticCode,
                  actionCount: completedActions,
                  dragCount
                };
        }
        completedActions += 1;
        if (action.kind.startsWith("drag-")) dragCount += 1;
        await this.journal(journalEntry(
          actionIndex, action, "completed", completedActions, dragCount,
          undefined, undefined, result
        ));
      }

      this.log({ event: "sort-final-refresh", detail: "automatic-character-reselection" });
      const postState = await this.runtime.refreshCompletePostState(parameters.signal);
      const mismatch = reconcileCompleteStashSort(
        parameters.plan,
        parameters.initialProjection,
        postState
      );
      await this.savePostState(postState, mismatch
        ? { status: "ambiguous", diagnosticCode: mismatch }
        : { status: "confirmed" });
      if (mismatch) {
        return {
          status: "ambiguous",
          diagnosticCode: mismatch,
          actionCount: completedActions,
          dragCount
        };
      }
      return {
        status: "confirmed",
        actionCount: completedActions,
        dragCount,
        evidenceId: `stash-sort:${postState.sourceVersion}:${postState.sourceSnapshotHash.slice(0, 12)}`
      };
    } catch {
      return {
        status: dragCount > 0 ? "ambiguous" : "blocked",
        diagnosticCode: dragCount > 0
          ? "runtime-error-after-input-dispatch"
          : "runtime-error-before-input-dispatch",
        actionCount: completedActions,
        dragCount
      };
    } finally {
      this.lease.release("STASH-SORT");
    }
  }
}

function journalEntry(
  actionIndex: number,
  action: ScheduledStashSortScreenAction,
  status: CompleteSortActionJournalEntry["status"],
  completedActionCount: number,
  completedDragCount: number,
  diagnosticCode?: string,
  adapterError?: string,
  runtimeResult?: CrossTabRuntimeActionResult
): CompleteSortActionJournalEntry {
  return {
    actionIndex,
    actionKind: action.kind,
    ...(action.kind === "select-stash-tab"
      ? { selectedTab: action.tabIndex }
      : { itemAlias: action.itemAlias }),
    status,
    completedActionCount,
    completedDragCount,
    ...(runtimeResult?.observation?.observedTabIndex === undefined
      ? {}
      : { observedTab: runtimeResult.observation.observedTabIndex }),
    ...(runtimeResult?.observation?.screen === undefined
      ? {}
      : { observedScreen: runtimeResult.observation.screen }),
    ...(diagnosticCode ? { diagnosticCode } : {}),
    ...(adapterError ? { adapterError } : {})
  };
}

export function reconcileCompleteStashSort(
  plan: Extract<CompleteStashSortPlan, { status: "ready" }>,
  initial: SpatialProjection,
  postState: SpatialProjection
): string | undefined {
  if (postState.sourceVersion <= plan.sourceSnapshotVersion ||
      postState.sourceSnapshotHash === plan.sourceSnapshotHash) {
    return "post-state-not-newer";
  }

  const postByInventory = new Map(
    postState.containers.map((container) => [container.inventoryId, container])
  );
  for (const page of plan.pages) {
    const actual = postByInventory.get(page.inventoryId);
    if (!actual || actual.status !== "ready" ||
        actual.geometry.kind !== "rectangular") {
      return "post-state-page-not-ready";
    }
    const expectedSignature = placementSignature(page.placements);
    const actualSignature = placementSignature(actual.placements);
    if (expectedSignature !== actualSignature) {
      return "post-state-layout-mismatch";
    }
  }

  const initialBag = initial.containers.find((container) => container.inventoryId === 2);
  const postBag = postByInventory.get(2);
  if (!initialBag || !postBag ||
      placementSignature(initialBag.placements) !== placementSignature(postBag.placements)) {
    return "post-state-bag-not-restored";
  }
  return undefined;
}

function placementSignature(
  placements: readonly {
    alias: string;
    slotId: number;
    width: number;
    height: number;
    stackQuantity?: number;
  }[]
): string {
  return JSON.stringify([...placements]
    .map((placement) => ({
      alias: placement.alias,
      slotId: placement.slotId,
      width: placement.width,
      height: placement.height,
      stackQuantity: placement.stackQuantity ?? 1
    }))
    .sort((left, right) => left.alias.localeCompare(right.alias)));
}

function executionBinding(
  plan: Extract<CompleteStashSortPlan, { status: "ready" }>,
  schedule: Extract<ScheduledStashSort, { status: "ready" }>
): string {
  return JSON.stringify({
    sourceSnapshotHash: plan.sourceSnapshotHash,
    sourceSnapshotVersion: plan.sourceSnapshotVersion,
    mode: plan.mode,
    moves: plan.moves.map((move) => ({
      alias: move.alias,
      sourceInventoryId: move.source.inventoryId,
      sourceSlotId: move.source.slotId,
      targetInventoryId: move.destination.inventoryId,
      targetSlotId: move.destination.slotId
    })),
    actions: schedule.actions
  });
}
