import type { ScreenPoint, ScreenRectangle } from "../domain/stashScreenCalibration";
import {
  approvalMatchesPlan,
  type HumanMoveApproval,
  type PreparedSupervisedMove
} from "../domain/supervisedMove";
import { GameInteractionLease } from "./taskMachine";

export interface LiveMoveEnvironment {
  sourceSnapshotHash: string;
  sourceSnapshotVersion: number;
  calibrationProfileId: string;
  gameBuildFingerprint: string;
  windowBounds: ScreenRectangle;
  isForeground: boolean;
  selectedTabIndex: number;
  inventoryId: number;
}

export type MoveDispatchResult =
  | { status: "dispatched" }
  | { status: "cancelled" }
  | { status: "failed"; diagnosticCode: string };

export type MoveVerificationResult =
  | { status: "confirmed"; evidenceId: string }
  | { status: "failed"; diagnosticCode: string }
  | { status: "ambiguous"; diagnosticCode: string };

export interface SupervisedMoveRuntime {
  inspectEnvironment(): Promise<LiveMoveEnvironment>;
  runCountdown(milliseconds: number, signal?: AbortSignal): Promise<"completed" | "cancelled">;
  dispatchLeftDrag(command: {
    source: ScreenPoint;
    destination: ScreenPoint;
    durationMilliseconds: number;
  }, signal?: AbortSignal): Promise<MoveDispatchResult>;
  verifyMove(
    plan: PreparedSupervisedMove,
    timeoutMilliseconds: number,
    signal?: AbortSignal
  ): Promise<MoveVerificationResult>;
}

export type SupervisedMoveRunResult =
  | { status: "dry-run"; plan: PreparedSupervisedMove }
  | { status: "confirmed"; evidenceId: string }
  | { status: "blocked"; diagnosticCode: string }
  | { status: "cancelled"; phase: "countdown" | "pre-dispatch" }
  | { status: "failed"; diagnosticCode: string }
  | { status: "ambiguous"; diagnosticCode: string };

export class SupervisedMoveRunner {
  constructor(
    private readonly lease: GameInteractionLease,
    private readonly runtime: SupervisedMoveRuntime
  ) {}

  preview(plan: PreparedSupervisedMove): SupervisedMoveRunResult {
    return { status: "dry-run", plan };
  }

  async execute(parameters: {
    plan: PreparedSupervisedMove;
    approval: HumanMoveApproval;
    countdownMilliseconds?: number;
    dragDurationMilliseconds?: number;
    verificationTimeoutMilliseconds?: number;
    signal?: AbortSignal;
  }): Promise<SupervisedMoveRunResult> {
    const countdownMilliseconds = boundedDuration(parameters.countdownMilliseconds ?? 3000, 0, 10_000);
    const dragDurationMilliseconds = boundedDuration(parameters.dragDurationMilliseconds ?? 350, 100, 2000);
    const verificationTimeoutMilliseconds = boundedDuration(
      parameters.verificationTimeoutMilliseconds ?? 120_000,
      1000,
      300_000
    );
    if (!approvalMatchesPlan(parameters.approval, parameters.plan)) {
      return { status: "blocked", diagnosticCode: "human-approval-missing-or-stale" };
    }
    if (!this.lease.acquire(parameters.plan.taskId)) {
      return { status: "blocked", diagnosticCode: "game-interaction-lease-unavailable" };
    }

    let dispatched = false;
    try {
      const firstInspection = await this.runtime.inspectEnvironment();
      const firstProblem = environmentProblem(parameters, firstInspection);
      if (firstProblem) return { status: "blocked", diagnosticCode: firstProblem };
      if (parameters.signal?.aborted) return { status: "cancelled", phase: "pre-dispatch" };

      const countdown = await this.runtime.runCountdown(countdownMilliseconds, parameters.signal);
      if (countdown === "cancelled" || parameters.signal?.aborted) {
        return { status: "cancelled", phase: "countdown" };
      }

      const finalInspection = await this.runtime.inspectEnvironment();
      const finalProblem = environmentProblem(parameters, finalInspection);
      if (finalProblem) return { status: "blocked", diagnosticCode: finalProblem };
      if (parameters.signal?.aborted) return { status: "cancelled", phase: "pre-dispatch" };

      const dispatch = await this.runtime.dispatchLeftDrag({
        source: parameters.plan.source.screen,
        destination: parameters.plan.destination.screen,
        durationMilliseconds: dragDurationMilliseconds
      }, parameters.signal);
      if (dispatch.status === "cancelled") return { status: "cancelled", phase: "pre-dispatch" };
      if (dispatch.status === "failed") return dispatch;
      dispatched = true;

      if (parameters.signal?.aborted) {
        return { status: "ambiguous", diagnosticCode: "cancelled-after-input-dispatch" };
      }
      return await this.runtime.verifyMove(
        parameters.plan,
        verificationTimeoutMilliseconds,
        parameters.signal
      );
    } catch (error) {
      return {
        status: dispatched ? "ambiguous" : "failed",
        diagnosticCode: dispatched ? "runtime-error-after-input-dispatch" : "runtime-error-before-input-dispatch"
      };
    } finally {
      this.lease.release(parameters.plan.taskId);
    }
  }
}

function environmentProblem(
  parameters: { plan: PreparedSupervisedMove },
  environment: LiveMoveEnvironment
): string | undefined {
  if (!environment.isForeground) return "game-window-not-foreground";
  if (environment.gameBuildFingerprint !== parameters.plan.gameBuildFingerprint) {
    return "game-build-changed";
  }
  if (!sameRectangle(environment.windowBounds, parameters.plan.windowBounds)) {
    return "game-window-bounds-changed";
  }
  if (environment.sourceSnapshotHash !== parameters.plan.sourceSnapshotHash ||
      environment.sourceSnapshotVersion !== parameters.plan.sourceSnapshotVersion) {
    return "snapshot-changed";
  }
  if (environment.calibrationProfileId !== parameters.plan.calibrationProfileId) {
    return "calibration-profile-changed";
  }
  if (environment.selectedTabIndex !== parameters.plan.tabIndex ||
      environment.inventoryId !== parameters.plan.inventoryId) {
    return "visible-tab-changed";
  }
  return undefined;
}

function sameRectangle(left: ScreenRectangle, right: ScreenRectangle): boolean {
  return left.left === right.left && left.top === right.top &&
    left.width === right.width && left.height === right.height;
}

function boundedDuration(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`Duration must be between ${minimum} and ${maximum} milliseconds.`);
  }
  return value;
}
