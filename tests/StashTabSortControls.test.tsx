import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../src/localization/i18n";
import type { StashSortEligibility } from "../src/domain/stashSortEligibility";
import { StashTabSortControls } from "../src/ui/StashTabSortControls";

const eligibility: StashSortEligibility = {
  pages: [
    { inventoryId: 4, status: "eligible", enabledByUser: true, unsupportedItemCount: 0, diagnosticCodes: [] },
    { inventoryId: 5, status: "disabled", enabledByUser: false, unsupportedItemCount: 0, diagnosticCodes: [] },
    { inventoryId: 30, status: "exception", enabledByUser: true, unsupportedItemCount: 1, diagnosticCodes: ["item-metadata-missing"] }
  ],
  eligibleInventoryIds: [4],
  disabledInventoryIds: [5],
  blockedInventoryIds: [],
  totalUnsupportedItemCount: 1,
  unsupportedItemCount: 0,
  requiresExceptionSelection: false,
  requiresManualRelocation: false,
  exceptionInventoryId: 30
};

describe("stash tab sort controls", () => {
  beforeEach(async () => { await i18n.changeLanguage("en-US"); });
  afterEach(cleanup);

  it("lets the user toggle each ordinary tab independently", () => {
    const onChange = vi.fn();
    render(
      <StashTabSortControls
        eligibility={eligibility}
        visibleInventoryIds={[4, 5, 30]}
        pageName={(id) => `Tab ${id}`}
        onTabEnabledChange={onChange}
      />
    );
    const enabled = screen.getByRole("switch", { name: "Tab 4: On" });
    fireEvent.click(enabled);
    expect(onChange).toHaveBeenCalledWith(4, false);
    const disabled = screen.getByRole("switch", { name: "Tab 5: Off" });
    fireEvent.click(disabled);
    expect(onChange).toHaveBeenCalledWith(5, true);
  });

  it("forces the active exception tab off", () => {
    render(
      <StashTabSortControls
        eligibility={eligibility}
        visibleInventoryIds={[4, 5, 30]}
        pageName={(id) => `Tab ${id}`}
        onTabEnabledChange={() => undefined}
      />
    );
    const exceptionSwitch = screen.getByRole("switch", { name: "Tab 30: Exception page" });
    expect(exceptionSwitch).toBeDisabled();
    expect(exceptionSwitch).toHaveAttribute("aria-checked", "false");
  });
});
