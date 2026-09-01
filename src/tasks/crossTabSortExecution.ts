import type { SpatialProjection } from "../domain/inventoryGeometry";
import type { CrossTabSortPlan, CrossTabTransfer } from "../domain/stashRouting";
import { GameInteractionLease } from "./taskMachine";

export interface CrossTabLocalApproval {
  readonly kind: "local-cross-tab-confirmation";
  readonly confirmedAtMilliseconds: number;
}

const approvalBindings = new WeakMap<CrossTabLocalApproval, string>();

export function issueCrossTabLocalApproval(
  plan: Extract<CrossTabSortPlan, { status: "ready" }>,
  confirmedAtMilliseconds: number
): CrossTabLocalApproval {
  if (!Number.isFinite(confirmedAtMilliseconds)) throw new Error("Confirmation time must be finite.");
  const approval = Object.freeze({
    kind: "local-cross-tab-confirmation" as const,
    confirmedAtMilliseconds
  });
  approvalBindings.set(approval, planBinding(plan));
  return approval;
}

export interface CrossTabRuntimeObservation {
  screen?: string;
  expectedTabIndex?: number;
  observedTabIndex?: number;
}

export type CrossTabRuntimeActionResult =
  | { status: "completed"; observation?: CrossTabRuntimeObservation }
  | { status: "cancelled"; observation?: CrossTabRuntimeObservation }
  | {
      status: "failed";
      diagnosticCode: string;
      inputMayHaveBeenDispatched?: boolean;
      adapterError?: string;
      observation?: CrossTabRuntimeObservation;
    };

export interface CrossTabSortRuntime {
  preflight(
    plan: Extract<CrossTabSortPlan, { status: "ready" }>,
    signal?: AbortSignal
  ): Promise<string | undefined>;
  selectStashTab(
    tabIndex: number,
    inventoryId: number,
    signal?: AbortSignal
  ): Promise<CrossTabRuntimeActionResult>;
  dragStashToBag(
    transfer: CrossTabTransfer,
    signal?: AbortSignal
  ): Promise<CrossTabRuntimeActionResult>;
  dragBagToStash(
    transfer: CrossTabTransfer,
    signal?: AbortSignal
  ): Promise<CrossTabRuntimeActionResult>;
  refreshCompletePostState(
    signal?: AbortSignal
  ): Promise<SpatialProjection>;
}

export type CrossTabRunResult =
  | { status: "dry-run"; transferCount: number; dragCount: 0 }
  | { status: "confirmed"; transferCount: number; dragCount: number; evidenceId: string }
  | { status: "blocked"; diagnosticCode: string; transferCount: number; dragCount: number }
  | { status: "cancelled"; phase: string; transferCount: number; dragCount: number }
  | { status: "ambiguous"; diagnosticCode: string; transferCount: number; dragCount: number };

export interface CrossTabReconciliation {
  status: "confirmed" | "mismatch";
  diagnosticCode?: string;
  evidenceId?: string;
}

export class CrossTabSortExecutionRunner {
  constructor(
    private readonly lease: GameInteractionLease,
    private readonly runtime: CrossTabSortRuntime,
    private readonly log: (event: { event: string; detail: string }) => void = () => undefined
  ) {}

  preview(plan: CrossTabSortPlan): CrossTabRunResult {
    return {
      status: "dry-run",
      transferCount: plan.status === "ready" ? plan.transfers.length : 0,
      dragCount: 0
    };
  }

  async execute(parameters: {
    plan: CrossTabSortPlan;
    approval: CrossTabLocalApproval;
    signal?: AbortSignal;
  }): Promise<CrossTabRunResult> {
    const plan = parameters.plan;
    if (plan.status !== "ready") {
      return { status: "blocked", diagnosticCode: plan.reason, transferCount: 0, dragCount: 0 };
    }
    if (plan.transfers.length === 0) {
      return { status: "blocked", diagnosticCode: "no-cross-tab-transfers", transferCount: 0, dragCount: 0 };
    }
    if (plan.transfers.length > 2400 || !plan.independentTransfersOnly) {
      return { status: "blocked", diagnosticCode: "unsafe-cross-tab-plan", transferCount: 0, dragCount: 0 };
    }
    if (approvalBindings.get(parameters.approval) !== planBinding(plan)) {
      return { status: "blocked", diagnosticCode: "local-approval-missing-or-stale", transferCount: 0, dragCount: 0 };
    }
    if (!this.lease.acquire("STASH-SORT")) {
      return { status: "blocked", diagnosticCode: "game-interaction-lease-unavailable", transferCount: 0, dragCount: 0 };
    }

    let dragCount = 0;
    let completedTransfers = 0;
    try {
      const initialProblem = await this.runtime.preflight(plan, parameters.signal);
      if (initialProblem) {
        return { status: "blocked", diagnosticCode: initialProblem, transferCount: 0, dragCount };
      }

      for (const transfer of plan.transfers) {
        if (parameters.signal?.aborted) {
          return cancellation(dragCount, completedTransfers, "before-transfer");
        }
        this.log({ event: "transfer-start", detail: transfer.transferId });

        const sourceTab = await this.runtime.selectStashTab(
          transfer.sourceTabIndex,
          transfer.sourceInventoryId,
          parameters.signal
        );
        const sourceTabProblem = actionProblem(sourceTab, dragCount > 0);
        if (sourceTabProblem) return terminalFromProblem(sourceTabProblem, dragCount, completedTransfers, "select-source-tab");

        const toBag = await this.runtime.dragStashToBag(transfer, parameters.signal);
        if (toBag.status === "completed") dragCount += 1;
        const toBagProblem = actionProblem(toBag, dragCount > 0);
        if (toBagProblem) return terminalFromProblem(toBagProblem, dragCount, completedTransfers, "stash-to-bag");

        const targetTab = await this.runtime.selectStashTab(
          transfer.targetTabIndex,
          transfer.targetInventoryId,
          parameters.signal
        );
        const targetTabProblem = actionProblem(targetTab, true);
        if (targetTabProblem) {
          return {
            status: "ambiguous",
            diagnosticCode: "item-may-remain-in-bag",
            transferCount: completedTransfers,
            dragCount
          };
        }

        const toStash = await this.runtime.dragBagToStash(transfer, parameters.signal);
        if (toStash.status === "completed") dragCount += 1;
        if (toStash.status !== "completed") {
          return {
            status: "ambiguous",
            diagnosticCode: "item-may-remain-in-bag",
            transferCount: completedTransfers,
            dragCount
          };
        }
        completedTransfers += 1;
        this.log({ event: "transfer-complete", detail: transfer.transferId });
      }

      if (parameters.signal?.aborted) {
        return {
          status: "ambiguous",
          diagnosticCode: "cancelled-before-post-refresh",
          transferCount: completedTransfers,
          dragCount
        };
      }

      this.log({ event: "post-refresh-start", detail: "automatic-character-reselection" });
      const postState = await this.runtime.refreshCompletePostState(parameters.signal);
      const reconciliation = reconcileCrossTabPlan(plan, postState);
      if (reconciliation.status === "mismatch") {
        return {
          status: "ambiguous",
          diagnosticCode: reconciliation.diagnosticCode ?? "post-state-mismatch",
          transferCount: completedTransfers,
          dragCount
        };
      }
      return {
        status: "confirmed",
        transferCount: completedTransfers,
        dragCount,
        evidenceId: reconciliation.evidenceId!
      };
    } catch {
      return {
        status: dragCount > 0 ? "ambiguous" : "blocked",
        diagnosticCode: dragCount > 0
          ? "runtime-error-after-input-dispatch"
          : "runtime-error-before-input-dispatch",
        transferCount: completedTransfers,
        dragCount
      };
    } finally {
      this.lease.release("STASH-SORT");
    }
  }
}

export function reconcileCrossTabPlan(
  plan: Extract<CrossTabSortPlan, { status: "ready" }>,
  postState: SpatialProjection
): CrossTabReconciliation {
  if (postState.sourceSnapshotHash === plan.sourceSnapshotHash ||
      postState.sourceVersion <= plan.sourceSnapshotVersion) {
    return { status: "mismatch", diagnosticCode: "post-state-not-newer" };
  }
  if (!postState.ready || postState.containers.some(container => container.status === "blocked")) {
    return { status: "mismatch", diagnosticCode: "post-state-spatial-validation-failed" };
  }

  const placements = postState.containers.flatMap(container => container.placements);
  for (const transfer of plan.transfers) {
    const matches = placements.filter(placement => placement.alias === transfer.itemAlias);
    if (matches.length !== 1) {
      return { status: "mismatch", diagnosticCode: "post-state-item-identity-mismatch" };
    }
    const item = matches[0]!;
    if (item.inventoryId !== transfer.targetInventoryId || item.slotId !== transfer.targetSlotId) {
      return { status: "mismatch", diagnosticCode: "post-state-destination-mismatch" };
    }
    if (item.width !== transfer.width || item.height !== transfer.height) {
      return { status: "mismatch", diagnosticCode: "post-state-footprint-mismatch" };
    }
  }

  return {
    status: "confirmed",
    evidenceId: `stash-sort:${postState.sourceVersion}:${postState.sourceSnapshotHash.slice(0, 12)}`
  };
}

function planBinding(plan: Extract<CrossTabSortPlan, { status: "ready" }>): string {
  return JSON.stringify({
    sourceSnapshotHash: plan.sourceSnapshotHash,
    sourceSnapshotVersion: plan.sourceSnapshotVersion,
    transfers: plan.transfers.map(transfer => ({
      transferId: transfer.transferId,
      itemAlias: transfer.itemAlias,
      sourceInventoryId: transfer.sourceInventoryId,
      bagSlotId: transfer.bagSlotId,
      targetInventoryId: transfer.targetInventoryId,
      targetSlotId: transfer.targetSlotId
    }))
  });
}

function actionProblem(
  result: CrossTabRuntimeActionResult,
  inputAlreadyDispatched: boolean
): { kind: "cancelled" | "blocked" | "ambiguous"; code: string } | undefined {
  if (result.status === "completed") return undefined;
  if (result.status === "cancelled") {
    return {
      kind: inputAlreadyDispatched ? "ambiguous" : "cancelled",
      code: inputAlreadyDispatched ? "cancelled-after-input-dispatch" : "operator-cancelled"
    };
  }
  return {
    kind: result.inputMayHaveBeenDispatched || inputAlreadyDispatched ? "ambiguous" : "blocked",
    code: result.diagnosticCode
  };
}

function terminalFromProblem(
  problem: { kind: "cancelled" | "blocked" | "ambiguous"; code: string },
  dragCount: number,
  transferCount: number,
  phase: string
): CrossTabRunResult {
  if (problem.kind === "cancelled") {
    return { status: "cancelled", phase, transferCount, dragCount };
  }
  return {
    status: problem.kind,
    diagnosticCode: problem.code,
    transferCount,
    dragCount
  };
}

function cancellation(
  dragCount: number,
  transferCount: number,
  phase: string
): CrossTabRunResult {
  return dragCount === 0
    ? { status: "cancelled", phase, transferCount, dragCount }
    : {
        status: "ambiguous",
        diagnosticCode: "cancelled-after-input-dispatch",
        transferCount,
        dragCount
      };
}
