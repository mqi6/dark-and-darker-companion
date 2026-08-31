import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SORT_INPUT_TIMING_PRESETS } from "../src/domain/automationTiming";
import i18n from "../src/localization/i18n";
import { StashSortSettings } from "../src/ui/StashSortSettings";

describe("stash sort settings", () => {
  beforeEach(async () => { await i18n.changeLanguage("en-US"); });
  afterEach(cleanup);

  it("offers both requested packing modes and all speed presets", () => {
    const onModeChange = vi.fn();
    const onPresetChange = vi.fn();
    render(
      <StashSortSettings
        mode="compact-top-left"
        speedPreset="balanced"
        timing={SORT_INPUT_TIMING_PRESETS.balanced}
        onModeChange={onModeChange}
        onSpeedPresetChange={onPresetChange}
        onTimingChange={() => undefined}
      />
    );

    fireEvent.change(screen.getByLabelText("Layout"), {
      target: { value: "category-rows" }
    });
    expect(onModeChange).toHaveBeenCalledWith("category-rows");

    fireEvent.change(screen.getByLabelText("Input speed"), {
      target: { value: "fast" }
    });
    expect(onPresetChange).toHaveBeenCalledWith("fast");
    expect(screen.getByText("Compact from top-left")).toBeInTheDocument();
    expect(screen.getByText("One category per row group")).toBeInTheDocument();
  });

  it("exposes bounded millisecond controls only in custom mode", () => {
    const onTimingChange = vi.fn();
    const { rerender } = render(
      <StashSortSettings
        mode="compact-top-left"
        speedPreset="balanced"
        timing={SORT_INPUT_TIMING_PRESETS.balanced}
        onModeChange={() => undefined}
        onSpeedPresetChange={() => undefined}
        onTimingChange={onTimingChange}
      />
    );
    expect(screen.queryByLabelText("Drag duration (ms)")).not.toBeInTheDocument();

    rerender(
      <StashSortSettings
        mode="compact-top-left"
        speedPreset="custom"
        timing={SORT_INPUT_TIMING_PRESETS.balanced}
        onModeChange={() => undefined}
        onSpeedPresetChange={() => undefined}
        onTimingChange={onTimingChange}
      />
    );
    const drag = screen.getByLabelText("Drag duration (ms)");
    expect(drag).toHaveAttribute("min", "100");
    expect(drag).toHaveAttribute("max", "2000");
    fireEvent.change(drag, { target: { value: "225" } });
    expect(onTimingChange).toHaveBeenCalledWith({
      ...SORT_INPUT_TIMING_PRESETS.balanced,
      dragDurationMilliseconds: 225
    });
  });
});
