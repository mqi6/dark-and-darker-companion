import { describe, expect, it } from "vitest";
import type { ScreenRectangle } from "../src/domain/stashScreenCalibration";
import type { HumanMoveApproval, PreparedSupervisedMove } from "../src/domain/supervisedMove";
import {
  SupervisedMoveRunner,
  type LiveMoveEnvironment,
  type SupervisedMoveRuntime
} from "../src/tasks/supervisedMoveRunner";
import { GameInteractionLease } from "../src/tasks/taskMachine";

const windowBounds: ScreenRectangle = { left: 10, top: 20, width: 1000, height: 800 };
const plan: PreparedSupervisedMove = {
  status: "ready",
  taskId: "task-1",
  planId: "plan-1",
  actionId: "action-1",
  itemAlias: "item-001",
  inventoryId: 20,
  tabIndex: 1,
  sourceSnapshotHash: "snapshot-1",
  sourceSnapshotVersion: 7,
  calibrationProfileId: "calibration-1",
  gameBuildFingerprint: "build-1",
  windowBounds,
  source: { slotId: 1, grid: { x: 1, y: 0 }, screen: { x: 100, y: 200 } },
  destination: { slotId: 2, grid: { x: 2, y: 0 }, screen: { x: 120, y: 200 } },
  planFingerprint: "fingerprint-1"
};
const approval: HumanMoveApproval = {
  kind: "human-confirmation",
  planFingerprint: plan.planFingerprint,
  confirmedAtMilliseconds: 1000
};
const environment: LiveMoveEnvironment = {
  sourceSnapshotHash: plan.sourceSnapshotHash,
  sourceSnapshotVersion: plan.sourceSnapshotVersion,
  snapshotAgeMilliseconds: 1000,
  calibrationProfileId: plan.calibrationProfileId,
  gameBuildFingerprint: plan.gameBuildFingerprint,
  windowBounds,
  isForeground: true,
  selectedTabIndex: plan.tabIndex,
  inventoryId: plan.inventoryId
};

function fakeRuntime(overrides: Partial<SupervisedMoveRuntime> = {}) {
  const calls = { inspect: 0, countdown: 0, dispatch: 0, verify: 0 };
  const runtime: SupervisedMoveRuntime = {
    async inspectEnvironment() { calls.inspect += 1; return environment; },
    async runCountdown() { calls.countdown += 1; return "completed"; },
    async dispatchLeftDrag() { calls.dispatch += 1; return { status: "dispatched" }; },
    async verifyMove() { calls.verify += 1; return { status: "confirmed", evidenceId: "evidence-1" }; },
    ...overrides
  };
  return { runtime, calls };
}

describe("supervised move runner", () => {
  it.each([
    ["foreground-window mismatch", { isForeground: false }, "game-window-not-foreground"],
    ["stale snapshot", { snapshotAgeMilliseconds: 300_001 }, "snapshot-stale"],
    ["window movement or resize", { windowBounds: { ...windowBounds, left: 11 } }, "game-window-bounds-changed"],
    ["build mismatch", { gameBuildFingerprint: "other-build" }, "game-build-changed"],
    ["changed calibration profile", { calibrationProfileId: "other-profile" }, "calibration-profile-changed"],
    ["visible-tab mismatch", { selectedTabIndex: 2 }, "visible-tab-changed"]
  ])("blocks %s before input", async (_name, change, diagnosticCode) => {
    const { runtime, calls } = fakeRuntime({
      async inspectEnvironment() { calls.inspect += 1; return { ...environment, ...change }; }
    });
    const result = await new SupervisedMoveRunner(new GameInteractionLease(), runtime).execute({ plan, approval });
    expect(result).toEqual({ status: "blocked", diagnosticCode });
    expect(calls.dispatch).toBe(0);
  });

  it("preflights twice, dispatches exactly once, and requires protocol verification", async () => {
    const lease = new GameInteractionLease();
    const { runtime, calls } = fakeRuntime();
    const result = await new SupervisedMoveRunner(lease, runtime).execute({ plan, approval });
    expect(result).toEqual({ status: "confirmed", evidenceId: "evidence-1" });
    expect(calls).toEqual({ inspect: 2, countdown: 1, dispatch: 1, verify: 1 });
    expect(lease.currentOwner()).toBeUndefined();
  });

  it("does not touch the runtime without a matching human approval", async () => {
    const { runtime, calls } = fakeRuntime();
    const result = await new SupervisedMoveRunner(new GameInteractionLease(), runtime).execute({
      plan,
      approval: { ...approval, planFingerprint: "stale" }
    });
    expect(result).toEqual({ status: "blocked", diagnosticCode: "human-approval-missing-or-stale" });
    expect(calls).toEqual({ inspect: 0, countdown: 0, dispatch: 0, verify: 0 });
  });

  it("rechecks the environment after countdown and blocks a changed snapshot", async () => {
    let inspection = 0;
    const { runtime, calls } = fakeRuntime({
      async inspectEnvironment() {
        inspection += 1;
        calls.inspect += 1;
        return inspection === 1 ? environment : { ...environment, sourceSnapshotVersion: 8 };
      }
    });
    const result = await new SupervisedMoveRunner(new GameInteractionLease(), runtime).execute({ plan, approval });
    expect(result).toEqual({ status: "blocked", diagnosticCode: "snapshot-changed" });
    expect(calls.dispatch).toBe(0);
    expect(calls.verify).toBe(0);
  });

  it("never retries and reports runtime errors after dispatch as ambiguous", async () => {
    const { runtime, calls } = fakeRuntime({
      async verifyMove() { calls.verify += 1; throw new Error("capture ended"); }
    });
    const result = await new SupervisedMoveRunner(new GameInteractionLease(), runtime).execute({ plan, approval });
    expect(result).toEqual({ status: "ambiguous", diagnosticCode: "runtime-error-after-input-dispatch" });
    expect(calls.dispatch).toBe(1);
    expect(calls.verify).toBe(1);
  });

  it("classifies a possible post-dispatch input error as ambiguous", async () => {
    const { runtime, calls } = fakeRuntime({
      async dispatchLeftDrag() {
        calls.dispatch += 1;
        return { status: "failed", diagnosticCode: "ordinary-input-failed", inputMayHaveBeenDispatched: true };
      }
    });
    const result = await new SupervisedMoveRunner(new GameInteractionLease(), runtime).execute({ plan, approval });
    expect(result).toEqual({ status: "ambiguous", diagnosticCode: "ordinary-input-failed" });
    expect(calls.dispatch).toBe(1);
    expect(calls.verify).toBe(0);
  });

  it("never treats dispatch alone as confirmation", async () => {
    const { runtime, calls } = fakeRuntime({
      async verifyMove() { calls.verify += 1; return { status: "ambiguous", diagnosticCode: "no-newer-post-state" }; }
    });
    const result = await new SupervisedMoveRunner(new GameInteractionLease(), runtime).execute({ plan, approval });
    expect(result).toEqual({ status: "ambiguous", diagnosticCode: "no-newer-post-state" });
    expect(calls.dispatch).toBe(1);
  });

  it("cancels before input and always releases the lease", async () => {
    const controller = new AbortController();
    controller.abort();
    const lease = new GameInteractionLease();
    const { runtime, calls } = fakeRuntime();
    const result = await new SupervisedMoveRunner(lease, runtime).execute({
      plan, approval, signal: controller.signal
    });
    expect(result).toEqual({ status: "cancelled", phase: "pre-dispatch" });
    expect(calls.dispatch).toBe(0);
    expect(lease.currentOwner()).toBeUndefined();
  });

  it("cancels during countdown and releases the lease", async () => {
    const lease = new GameInteractionLease();
    const { runtime, calls } = fakeRuntime({
      async runCountdown() { calls.countdown += 1; return "cancelled"; }
    });
    const result = await new SupervisedMoveRunner(lease, runtime).execute({ plan, approval });
    expect(result).toEqual({ status: "cancelled", phase: "countdown" });
    expect(calls.dispatch).toBe(0);
    expect(lease.currentOwner()).toBeUndefined();
  });

  it("supports a no-input dry-run preview", () => {
    const { runtime, calls } = fakeRuntime();
    expect(new SupervisedMoveRunner(new GameInteractionLease(), runtime).preview(plan))
      .toEqual({ status: "dry-run", plan });
    expect(calls).toEqual({ inspect: 0, countdown: 0, dispatch: 0, verify: 0 });
  });
});
