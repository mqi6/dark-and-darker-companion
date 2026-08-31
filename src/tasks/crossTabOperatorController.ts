import type { CrossTabScreenTransfer } from "../domain/crossTabScreenPlan";
import type { CrossTabSortPlan } from "../domain/stashRouting";
import {
  CrossTabSortExecutionRunner,
  issueCrossTabLocalApproval,
  type CrossTabRunResult
} from "./crossTabSortExecution";

export type CrossTabOperatorPhase =
  | "ready"
  | "running"
  | "confirmed"
  | "blocked"
  | "cancelled"
  | "ambiguous";

export interface CrossTabOperatorState {
  phase: CrossTabOperatorPhase;
  plan: {
    transferCount: number;
    dragCount: number;
    bagItemCount: number;
    bagFreeCells: number;
    transfers: readonly CrossTabScreenTransfer[];
  };
  lastResult?: CrossTabRunResult;
}

export class CrossTabOperatorController {
  private busy = false;
  private state: CrossTabOperatorState;

  constructor(
    private readonly planValue: Extract<CrossTabSortPlan, { status: "ready" }>,
    screenTransfers: readonly CrossTabScreenTransfer[],
    private readonly runner: CrossTabSortExecutionRunner
  ) {
    if (planValue.transfers.length === 0 ||
        planValue.transfers.length !== screenTransfers.length) {
      throw new Error("Operator requires matching non-empty logical and screen plans.");
    }
    this.state = {
      phase: "ready",
      plan: {
        transferCount: planValue.transfers.length,
        dragCount: planValue.transfers.length * 2,
        bagItemCount: planValue.bag.itemCount,
        bagFreeCells: planValue.bag.freeCellCount,
        transfers: screenTransfers
      }
    };
  }

  snapshot(): CrossTabOperatorState {
    return structuredClone(this.state);
  }

  preview(): CrossTabRunResult {
    return this.runner.preview(this.planValue);
  }

  async run(signal?: AbortSignal): Promise<CrossTabOperatorState> {
    if (this.busy) throw new Error("operator-busy");
    this.busy = true;
    this.state.phase = "running";
    try {
      // The local UI button itself is the approval. Nothing is copied through
      // chat and no persistent approval token is written to disk.
      const approval = issueCrossTabLocalApproval(this.planValue, Date.now());
      const result = await this.runner.execute({
        plan: this.planValue,
        approval,
        signal
      });
      this.state.lastResult = result;
      this.state.phase = result.status === "dry-run"
        ? "ready"
        : result.status;
      return this.snapshot();
    } finally {
      this.busy = false;
    }
  }
}
