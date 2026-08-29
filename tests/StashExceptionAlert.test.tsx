import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import i18n from "../src/localization/i18n";
import type { StashSortEligibility } from "../src/domain/stashSortEligibility";
import { StashExceptionAlert } from "../src/ui/StashExceptionAlert";

const eligibility: StashSortEligibility = {
  pages: [
    { inventoryId: 4, status: "eligible", unsupportedItemCount: 0, diagnosticCodes: [] },
    {
      inventoryId: 5,
      status: "manual-relocation-required",
      unsupportedItemCount: 2,
      diagnosticCodes: ["item-metadata-missing", "item-metadata-missing"]
    }
  ],
  eligibleInventoryIds: [4],
  blockedInventoryIds: [5],
  unsupportedItemCount: 2,
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

  it("stays hidden when no action is required", () => {
    const ready: StashSortEligibility = {
      ...eligibility,
      pages: [{ inventoryId: 4, status: "eligible", unsupportedItemCount: 0, diagnosticCodes: [] }],
      blockedInventoryIds: [],
      unsupportedItemCount: 0,
      requiresManualRelocation: false
    };
    const { container } = render(<StashExceptionAlert eligibility={ready} pageName={String} />);
    expect(container).toBeEmptyDOMElement();
  });
});
