import { describe, expect, it } from "vitest";
import {
  GameInteractionLease,
  InvalidTaskTransitionError,
  listingFailureAction,
  transitionTask
} from "../src/tasks/taskMachine";

describe("task state machine", () => {
  it("supports the normal run and verification path", () => {
    let state = transitionTask("idle", "prepare");
    state = transitionTask(state, "prepared");
    state = transitionTask(state, "confirm");
    state = transitionTask(state, "countdown-finished");
    state = transitionTask(state, "verify");
    state = transitionTask(state, "verified");
    expect(state).toBe("completed");
  });

  it("rejects an invalid transition", () => {
    expect(() => transitionTask("completed", "resume")).toThrow(InvalidTaskTransitionError);
  });

  it("skips confirmed failures and pauses ambiguous submissions", () => {
    expect(listingFailureAction("confirmed-rejected")).toBe("skip");
    expect(listingFailureAction("possibly-submitted")).toBe("pause");
  });
});

describe("game interaction lease", () => {
  it("supports nested work owned by the same task without releasing the outer lease", () => {
    const lease = new GameInteractionLease();
    expect(lease.acquire("sort")).toBe(true);
    expect(lease.acquire("sort")).toBe(true);
    lease.release("sort");
    expect(lease.currentOwner()).toBe("sort");
    expect(lease.acquire("other")).toBe(false);
    lease.release("sort");
    expect(lease.currentOwner()).toBeUndefined();
  });

  it("permits only one task owner", () => {
    const lease = new GameInteractionLease();
    expect(lease.acquire("sort-1")).toBe(true);
    expect(lease.acquire("auction-1")).toBe(false);
    lease.release("sort-1");
    expect(lease.acquire("auction-1")).toBe(true);
  });
});
