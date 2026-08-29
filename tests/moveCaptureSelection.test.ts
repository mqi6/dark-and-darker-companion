import { describe, expect, it } from "vitest";
import {
  selectLatestCompletePostState,
  selectLatestCompletePreState,
  selectSingleActionEvent,
  validateMoveCaptureWindow,
  type MoveCaptureWindow,
  type TimedStateCandidate
} from "../src/domain/moveCaptureSelection";

const window: MoveCaptureWindow = {
  readyAtMilliseconds: 100,
  actionStartAtMilliseconds: 200,
  actionEndAtMilliseconds: 300,
  stopAtMilliseconds: 500
};

describe("MOVE-002 capture selection", () => {
  it("requires strictly ordered operator markers", () => {
    expect(() => validateMoveCaptureWindow(window)).not.toThrow();
    expect(() => validateMoveCaptureWindow({ ...window, actionEndAtMilliseconds: 200 }))
      .toThrow(/READY < ACTION_START < ACTION_END < STOP/);
  });

  it("selects exactly one request strictly inside the action window", () => {
    expect(selectSingleActionEvent([
      { atMilliseconds: 200, value: "boundary" },
      { atMilliseconds: 250, value: "move" },
      { atMilliseconds: 300, value: "boundary" }
    ], window)).toEqual({
      status: "selected",
      observedCount: 1,
      event: { atMilliseconds: 250, value: "move" }
    });
  });

  it("reports missing and duplicate action requests without choosing one", () => {
    expect(selectSingleActionEvent([], window)).toEqual({ status: "missing", observedCount: 0 });
    expect(selectSingleActionEvent([
      { atMilliseconds: 240, value: "first" },
      { atMilliseconds: 260, value: "second" }
    ], window)).toEqual({ status: "multiple", observedCount: 2 });
  });

  it("uses the latest successful complete pre-state after READY and before the request", () => {
    const states: TimedStateCandidate<string>[] = [
      { atMilliseconds: 90, successful: true, complete: true, value: "too-old" },
      { atMilliseconds: 120, successful: true, complete: false, value: "partial" },
      { atMilliseconds: 150, successful: true, complete: true, value: "first" },
      { atMilliseconds: 230, successful: true, complete: true, value: "latest" },
      { atMilliseconds: 250, successful: true, complete: true, value: "at-request" }
    ];
    expect(selectLatestCompletePreState(states, window, 250)?.value).toBe("latest");
  });

  it("uses only a successful complete post-refresh state after ACTION_END", () => {
    const states: TimedStateCandidate<string>[] = [
      { atMilliseconds: 290, successful: true, complete: true, value: "during-action" },
      { atMilliseconds: 320, successful: false, complete: true, value: "failed" },
      { atMilliseconds: 350, successful: true, complete: false, value: "partial" },
      { atMilliseconds: 400, successful: true, complete: true, value: "first" },
      { atMilliseconds: 450, successful: true, complete: true, value: "latest" },
      { atMilliseconds: 500, successful: true, complete: true, value: "at-stop" }
    ];
    expect(selectLatestCompletePostState(states, window)?.value).toBe("latest");
  });
});
