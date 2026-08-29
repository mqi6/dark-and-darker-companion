import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../src/localization/i18n";
import type { StashSortEligibility } from "../src/domain/stashSortEligibility";
import { StashExceptionAlert } from "../src/ui/StashExceptionAlert";

const eligibility: StashSortEligibility = {
  pages: [
    { inventoryId: 4, status: "eligible", enabledByUser: true, unsupportedItemCount: 0, diagnosticCodes: [] },
    {
      inventoryId: 5,
      status: "manual-relocation-required",
      enabledByUser: true,
      unsupportedItemCount: 2,
      diagnosticCodes: ["item-metadata-missing", "item-metadata-missing"]
    }
  ],
  eligibleInventoryIds: [4],
  disabledInventoryIds: [],
  blockedInventoryIds: [5],
  totalUnsupportedItemCount: 2,
  unsupportedItemCount: 2,
  requiresExceptionSelection: false,
  requiresManualRelocation: true,
  exceptionInventoryId: 30
};

describe("stash exception alert", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  afterEach(cleanup);

  it("explains the manual relocation and refresh workflow", () => {
    render(<StashExceptionAlert eligibility={eligibility} pageName={(id) => `Page ${id}`} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("2 unsupported items on 1 page");
    expect(alert).toHaveTextContent("Page 5");
    expect(alert).toHaveTextContent("Move them manually to Page 30");
    expect(alert).toHaveTextContent("reselect the current character");
  });

  it("renders the same recovery path in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    render(<StashExceptionAlert eligibility={eligibility} pageName={(id) => `页面 ${id}`} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("2 件暂不支持的物品");
    expect(alert).toHaveTextContent("手动移动到页面 30");
    expect(alert).toHaveTextContent("重新选择当前角色");
  });

  it("asks for an exception page only after an unsupported item is detected", () => {
    const onChange = vi.fn();
    const { exceptionInventoryId: _exceptionInventoryId, ...withoutException } = eligibility;
    const needsSelection: StashSortEligibility = {
      ...withoutException,
      requiresExceptionSelection: true
    };
    render(
      <StashExceptionAlert
        eligibility={needsSelection}
        pageName={(id) => `Page ${id}`}
        exceptionCandidateInventoryIds={[4, 6]}
        onExceptionPageChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText("Exception page"), { target: { value: "6" } });
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("stays hidden when no action is required", () => {
    const ready: StashSortEligibility = {
      ...eligibility,
      pages: [{ inventoryId: 4, status: "eligible", enabledByUser: true, unsupportedItemCount: 0, diagnosticCodes: [] }],
      blockedInventoryIds: [],
      totalUnsupportedItemCount: 0,
      unsupportedItemCount: 0,
      requiresExceptionSelection: false,
      requiresManualRelocation: false
    };
    const { container } = render(<StashExceptionAlert eligibility={ready} pageName={String} />);
    expect(container).toBeEmptyDOMElement();
  });
});
