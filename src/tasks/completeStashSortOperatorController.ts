import type { CompleteStashSortPlan } from "../domain/completeStashSort";
import type { ScheduledStashSortScreenAction } from "../domain/completeStashScreenPlan";
import type { SpatialProjection } from "../domain/inventoryGeometry";
import type { ScheduledStashSort } from "../domain/stashMoveScheduler";
import {
  issueCompleteSortLocalApproval,
  type CompleteStashSortRunResult
} from "./completeStashSortExecution";

export type CompleteStashSortOperatorPhase =
  | "ready"
  | "running"
  | "confirmed"
  | "already-sorted"
  | "blocked"
  | "cancelled"
  | "ambiguous";

export interface CompleteStashSortOperatorState {
  phase: CompleteStashSortOperatorPhase;
  preview: {
    mode: Extract<CompleteStashSortPlan, { status: "ready" }>["mode"];
    itemMoveCount: number;
    dragCount: number;
    actionCount: number;
    crossTabMoveCount: number;
    temporaryBufferCount: number;
    skippedAliases: readonly string[];
    diagnostics: Extract<CompleteStashSortPlan, { status: "ready" }>["diagnostics"];
    refreshStrategy: "single-final-complete-refresh";
  };
  lastResult?: CompleteStashSortRunResult;
}

interface CompleteSortExecutor {
  execute(parameters: {
    plan: CompleteStashSortPlan;
    schedule: ScheduledStashSort;
    screenActions: readonly ScheduledStashSortScreenAction[];
    initialProjection: SpatialProjection;
    approval: ReturnType<typeof issueCompleteSortLocalApproval>;
    signal?: AbortSignal;
  }): Promise<CompleteStashSortRunResult>;
}

/**
 * Process-local bridge for the eventual product/operator button.
 *
 * Previewing never dispatches input. One local button press creates an opaque
 * in-process approval and runs the already prepared complete action sequence.
 * There is no fingerprint to copy through chat and no intermediate refresh.
 */
export class CompleteStashSortOperatorController {
  private busy = false;
  private abort: AbortController | undefined;
  private state: CompleteStashSortOperatorState;

  constructor(
    private readonly prepared: {
      plan: Extract<CompleteStashSortPlan, { status: "ready" }>;
      schedule: Extract<ScheduledStashSort, { status: "ready" }>;
      screenActions: readonly ScheduledStashSortScreenAction[];
      initialProjection: SpatialProjection;
    },
    private readonly executor: CompleteSortExecutor
  ) {
    if (prepared.screenActions.length !== prepared.schedule.actions.length) {
      throw new Error("Operator requires matching logical and screen action sequences.");
    }
    this.state = {
      phase: "ready",
      preview: {
        mode: prepared.plan.mode,
        itemMoveCount: prepared.schedule.itemMoveCount,
        dragCount: prepared.schedule.dragCount,
        actionCount: prepared.schedule.actions.length,
        crossTabMoveCount: prepared.plan.moves.filter(
          (move) => move.route === "via-character-bag"
        ).length,
        temporaryBufferCount: prepared.schedule.temporaryBufferCount,
        skippedAliases: [...prepared.plan.skippedAliases],
        diagnostics: structuredClone(prepared.plan.diagnostics),
        refreshStrategy: "single-final-complete-refresh"
      }
    };
  }

  snapshot(): CompleteStashSortOperatorState {
    return structuredClone(this.state);
  }

  async run(signal?: AbortSignal): Promise<CompleteStashSortOperatorState> {
    if (this.busy) throw new Error("operator-busy");
    this.busy = true;
    this.abort = new AbortController();
    signal?.addEventListener("abort", () => this.abort?.abort(), { once: true });
    this.state.phase = "running";
    try {
      const approval = issueCompleteSortLocalApproval(
        this.prepared.plan,
        this.prepared.schedule,
        Date.now()
      );
      const result = await this.executor.execute({
        ...this.prepared,
        approval,
        signal: this.abort.signal
      });
      this.state.lastResult = result;
      this.state.phase = result.status;
      return this.snapshot();
    } finally {
      this.abort = undefined;
      this.busy = false;
    }
  }

  stop(): CompleteStashSortOperatorState {
    this.abort?.abort();
    return this.snapshot();
  }
}
