export interface MoveCaptureWindow {
  readyAtMilliseconds: number;
  actionStartAtMilliseconds: number;
  actionEndAtMilliseconds: number;
  stopAtMilliseconds: number;
}

export interface TimedCaptureEvent<T> {
  atMilliseconds: number;
  value: T;
}

export interface TimedStateCandidate<T> extends TimedCaptureEvent<T> {
  successful: boolean;
  complete: boolean;
}

export interface RequiredContainerSpatialReadiness {
  ready: boolean;
  blockedContainerCount: number;
}

export function evaluateRequiredContainerSpatialReadiness(
  containers: readonly { inventoryId: number; status: "ready" | "blocked" | "not-applicable" }[],
  requiredInventoryIds: readonly number[]
): RequiredContainerSpatialReadiness {
  const required = new Set(requiredInventoryIds);
  const selected = containers.filter(container => required.has(container.inventoryId));
  const observedIds = new Set(selected.map(container => container.inventoryId));
  const blockedContainerCount = selected.filter(container => container.status !== "ready").length;
  return {
    ready:
      observedIds.size === required.size &&
      selected.length === required.size &&
      blockedContainerCount === 0,
    blockedContainerCount
  };
}

export type SingleEventSelection<T> =
  | { status: "selected"; event: TimedCaptureEvent<T>; observedCount: 1 }
  | { status: "missing"; observedCount: 0 }
  | { status: "multiple"; observedCount: number };

export function validateMoveCaptureWindow(window: MoveCaptureWindow): void {
  const values = [
    window.readyAtMilliseconds,
    window.actionStartAtMilliseconds,
    window.actionEndAtMilliseconds,
    window.stopAtMilliseconds
  ];
  if (!values.every(Number.isFinite)) throw new Error("MOVE-002 markers must be finite timestamps.");
  if (!(
    window.readyAtMilliseconds < window.actionStartAtMilliseconds &&
    window.actionStartAtMilliseconds < window.actionEndAtMilliseconds &&
    window.actionEndAtMilliseconds < window.stopAtMilliseconds
  )) {
    throw new Error("MOVE-002 markers must satisfy READY < ACTION_START < ACTION_END < STOP.");
  }
}

export function selectSingleActionEvent<T>(
  events: readonly TimedCaptureEvent<T>[],
  window: MoveCaptureWindow
): SingleEventSelection<T> {
  validateMoveCaptureWindow(window);
  const matching = events.filter(
    event =>
      event.atMilliseconds > window.actionStartAtMilliseconds &&
      event.atMilliseconds < window.actionEndAtMilliseconds
  );
  if (matching.length === 0) return { status: "missing", observedCount: 0 };
  if (matching.length > 1) return { status: "multiple", observedCount: matching.length };
  return { status: "selected", event: matching[0]!, observedCount: 1 };
}

export function selectLatestCompletePreState<T>(
  states: readonly TimedStateCandidate<T>[],
  window: MoveCaptureWindow,
  requestAtMilliseconds: number
): TimedStateCandidate<T> | undefined {
  validateMoveCaptureWindow(window);
  return states
    .filter(
      state =>
        state.successful &&
        state.complete &&
        state.atMilliseconds > window.readyAtMilliseconds &&
        state.atMilliseconds < requestAtMilliseconds
    )
    .sort((left, right) => left.atMilliseconds - right.atMilliseconds)
    .at(-1);
}

export function selectLatestCompletePostState<T>(
  states: readonly TimedStateCandidate<T>[],
  window: MoveCaptureWindow
): TimedStateCandidate<T> | undefined {
  validateMoveCaptureWindow(window);
  return states
    .filter(
      state =>
        state.successful &&
        state.complete &&
        state.atMilliseconds > window.actionEndAtMilliseconds &&
        state.atMilliseconds < window.stopAtMilliseconds
    )
    .sort((left, right) => left.atMilliseconds - right.atMilliseconds)
    .at(-1);
}
