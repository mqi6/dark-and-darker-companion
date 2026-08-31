import { describe, expect, it } from "vitest";
import {
  resolveSortInputTiming,
  SORT_INPUT_TIMING_PRESETS,
  validateSortInputTiming
} from "../src/domain/automationTiming";

describe("sort input timing", () => {
  it("provides ordered fast, balanced, and reliable presets", () => {
    expect(SORT_INPUT_TIMING_PRESETS.fast.dragDurationMilliseconds)
      .toBeLessThan(SORT_INPUT_TIMING_PRESETS.balanced.dragDurationMilliseconds);
    expect(SORT_INPUT_TIMING_PRESETS.balanced.dragDurationMilliseconds)
      .toBeLessThan(SORT_INPUT_TIMING_PRESETS.reliable.dragDurationMilliseconds);
    expect(SORT_INPUT_TIMING_PRESETS.fast.tabSettleMilliseconds)
      .toBeLessThan(SORT_INPUT_TIMING_PRESETS.reliable.tabSettleMilliseconds);
  });

  it("allows bounded custom values without changing the presets", () => {
    const timing = resolveSortInputTiming({
      preset: "custom",
      custom: {
        dragDurationMilliseconds: 220,
        tabSettleMilliseconds: 140,
        clickHoldMilliseconds: 20
      }
    });
    expect(timing).toMatchObject({
      dragDurationMilliseconds: 220,
      tabSettleMilliseconds: 140,
      clickHoldMilliseconds: 20,
      postDragMilliseconds: 150
    });
    expect(SORT_INPUT_TIMING_PRESETS.balanced.dragDurationMilliseconds).toBe(350);
  });

  it("rejects values that are too fast to dispatch reliably or excessively slow", () => {
    expect(() => validateSortInputTiming({
      ...SORT_INPUT_TIMING_PRESETS.balanced,
      dragDurationMilliseconds: 99
    })).toThrow("dragDurationMilliseconds");
    expect(() => validateSortInputTiming({
      ...SORT_INPUT_TIMING_PRESETS.balanced,
      tabSettleMilliseconds: 3001
    })).toThrow("tabSettleMilliseconds");
  });
});
