export type TaskState =
  | "idle"
  | "preparing"
  | "awaiting-confirmation"
  | "countdown"
  | "running"
  | "pausing"
  | "paused"
  | "resuming"
  | "stopping"
  | "stopped"
  | "verifying"
  | "completed"
  | "failed";

export type TaskEvent =
  | "prepare"
  | "prepared"
  | "confirm"
  | "countdown-finished"
  | "pause"
  | "paused"
  | "resume"
  | "resumed"
  | "stop"
  | "stopped"
  | "verify"
  | "verified"
  | "fail"
  | "reset";

const transitions: Readonly<Record<TaskState, Partial<Record<TaskEvent, TaskState>>>> = {
  idle: { prepare: "preparing" },
  preparing: { prepared: "awaiting-confirmation", stop: "stopping", fail: "failed" },
  "awaiting-confirmation": { confirm: "countdown", stop: "stopping", fail: "failed" },
  countdown: { "countdown-finished": "running", pause: "pausing", stop: "stopping", fail: "failed" },
  running: { pause: "pausing", stop: "stopping", verify: "verifying", fail: "failed" },
  pausing: { paused: "paused", stop: "stopping", fail: "failed" },
  paused: { resume: "resuming", stop: "stopping", fail: "failed" },
  resuming: { resumed: "running", stop: "stopping", fail: "failed" },
  stopping: { stopped: "stopped", fail: "failed" },
  stopped: { reset: "idle" },
  verifying: { verified: "completed", pause: "pausing", stop: "stopping", fail: "failed" },
  completed: { reset: "idle" },
  failed: { reset: "idle" }
};

export class InvalidTaskTransitionError extends Error {
  constructor(state: TaskState, event: TaskEvent) {
    super(`Task event '${event}' is invalid while state is '${state}'.`);
    this.name = "InvalidTaskTransitionError";
  }
}

export function transitionTask(state: TaskState, event: TaskEvent): TaskState {
  const next = transitions[state][event];
  if (!next) {
    throw new InvalidTaskTransitionError(state, event);
  }
  return next;
}

export type ListingFailureKind =
  | "confirmed-pre-submit"
  | "confirmed-rejected"
  | "possibly-submitted";

export type ListingFailureAction = "skip" | "pause";

export function listingFailureAction(kind: ListingFailureKind): ListingFailureAction {
  return kind === "possibly-submitted" ? "pause" : "skip";
}

export class GameInteractionLease {
  private owner: string | undefined;

  acquire(taskId: string): boolean {
    if (this.owner !== undefined) {
      return this.owner === taskId;
    }
    this.owner = taskId;
    return true;
  }

  release(taskId: string): void {
    if (this.owner !== taskId) {
      throw new Error(`Task '${taskId}' does not own the game interaction lease.`);
    }
    this.owner = undefined;
  }

  currentOwner(): string | undefined {
    return this.owner;
  }
}
