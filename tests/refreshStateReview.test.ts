import { describe, expect, it } from "vitest";
import { evaluateRefreshStateGate } from "../src/protocol/refreshStateReview";

describe("read-only refresh state gate", () => {
  it("accepts only a successful complete state strictly after the action", () => {
    expect(evaluateRefreshStateGate(100, [
      { command: 44, relativeTimestampMilliseconds: 99, result: 1, complete: true },
      { command: 552, relativeTimestampMilliseconds: 101, result: 1, complete: true }
    ], true)).toEqual({ status: "pass", successfulCompleteFreshStateCount: 1, reason: "complete-fresh-state" });
  });

  it("rejects cached, not-changed, partial, and spatially blocked evidence", () => {
    expect(evaluateRefreshStateGate(100, [{ command: 44, relativeTimestampMilliseconds: 100, result: 1, complete: true }], true).reason).toBe("no-complete-fresh-state");
    expect(evaluateRefreshStateGate(100, [{ command: 552, relativeTimestampMilliseconds: 101, result: 2, complete: true }], true).reason).toBe("no-complete-fresh-state");
    expect(evaluateRefreshStateGate(100, [{ command: 44, relativeTimestampMilliseconds: 101, result: 1, complete: false }], true).reason).toBe("no-complete-fresh-state");
    expect(evaluateRefreshStateGate(100, [{ command: 44, relativeTimestampMilliseconds: 101, result: 1, complete: true }], false).reason).toBe("spatial-validation-blocked");
  });
});
