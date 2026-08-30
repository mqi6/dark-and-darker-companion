import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StashSortEligibility } from "../src/domain/stashSortEligibility";
import type { StashTabItemPolicy } from "../src/domain/stashRouting";
import i18n from "../src/localization/i18n";
import { StashTabItemPolicyControls } from "../src/ui/StashTabItemPolicyControls";

const eligibility: StashSortEligibility = {
  pages: [
    { inventoryId: 4, status: "eligible", enabledByUser: true, unsupportedItemCount: 0, diagnosticCodes: [] },
    { inventoryId: 20, status: "disabled", enabledByUser: false, unsupportedItemCount: 0, diagnosticCodes: [] },
    { inventoryId: 30, status: "exception", enabledByUser: true, unsupportedItemCount: 1, diagnosticCodes: ["item-metadata-missing"] }
  ],
  eligibleInventoryIds: [4],
  disabledInventoryIds: [20],
  blockedInventoryIds: [],
  totalUnsupportedItemCount: 1,
  unsupportedItemCount: 0,
  requiresExceptionSelection: false,
  requiresManualRelocation: false,
  exceptionInventoryId: 30
};

const policies: StashTabItemPolicy[] = [
  { inventoryId: 4, enabled: true, allowedCategories: ["gear"] },
  { inventoryId: 20, enabled: false, allowedCategories: ["weapon"] },
  { inventoryId: 30, enabled: true, allowedCategories: ["currency"] }
];

describe("stash tab item policy controls", () => {
  beforeEach(async () => { await i18n.changeLanguage("en-US"); });
  afterEach(cleanup);

  it("lets each enabled tab choose the item categories it accepts", () => {
    const onChange = vi.fn();
    render(
      <StashTabItemPolicyControls
        eligibility={eligibility}
        visibleInventoryIds={[4, 20, 30]}
        policies={policies}
        pageName={(id) => `Tab ${id}`}
        onPolicyChange={onChange}
      />
    );

    const tab4 = screen.getAllByRole("group")[0]!;
    fireEvent.click(within(tab4).getByRole("checkbox", { name: "Gear" }));
    expect(onChange).toHaveBeenCalledWith({
      inventoryId: 4,
      enabled: true,
      allowedCategories: []
    });

    fireEvent.click(within(tab4).getByRole("checkbox", { name: "Necklaces and rings" }));
    expect(onChange).toHaveBeenCalledWith({
      inventoryId: 4,
      enabled: true,
      allowedCategories: ["gear", "jewelry"]
    });
  });

  it("disables category editing on user-disabled and forced-off tabs", () => {
    render(
      <StashTabItemPolicyControls
        eligibility={eligibility}
        visibleInventoryIds={[4, 20, 30]}
        policies={policies}
        pageName={(id) => `Tab ${id}`}
        onPolicyChange={() => undefined}
      />
    );

    const cards = screen.getAllByRole("group");
    expect(cards).toHaveLength(3);
    const tab20 = cards[1]!;
    const tab30 = cards[2]!;
    expect(tab20.querySelectorAll("input:disabled")).toHaveLength(7);
    expect(tab30.querySelectorAll("input:disabled")).toHaveLength(7);
    expect(screen.getByRole("switch", { name: "Tab 30: Exception page" })).toBeDisabled();
  });
});
