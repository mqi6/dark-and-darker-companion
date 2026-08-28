export interface RefreshStateEvidence {
  command: 44 | 552;
  relativeTimestampMilliseconds: number;
  result: number;
  complete: boolean;
}

export interface RefreshStateGate {
  status: "pass" | "ambiguous";
  successfulCompleteFreshStateCount: number;
  reason: "complete-fresh-state" | "no-complete-fresh-state" | "spatial-validation-blocked";
}

export function evaluateRefreshStateGate(
  actionStartMilliseconds: number,
  states: readonly RefreshStateEvidence[],
  spatialReady: boolean
): RefreshStateGate {
  const successfulCompleteFreshStateCount = states.filter(state =>
    state.relativeTimestampMilliseconds > actionStartMilliseconds &&
    state.result === 1 && state.complete
  ).length;
  if (successfulCompleteFreshStateCount === 0) {
    return { status: "ambiguous", successfulCompleteFreshStateCount, reason: "no-complete-fresh-state" };
  }
  if (!spatialReady) {
    return { status: "ambiguous", successfulCompleteFreshStateCount, reason: "spatial-validation-blocked" };
  }
  return { status: "pass", successfulCompleteFreshStateCount, reason: "complete-fresh-state" };
}
