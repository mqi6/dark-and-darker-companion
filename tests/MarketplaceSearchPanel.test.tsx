import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../src/localization/i18n";
import { MarketplaceSearchPanel } from "../src/ui/MarketplaceSearchPanel";
import { marketplacePreviewCatalog } from "../src/ui/marketplacePreviewCatalog";

describe("Marketplace Search filter UI", () => {
  afterEach(cleanup);

  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  it("keeps all filter edits and Reset local until Search is clicked", () => {
    const onSearch = vi.fn();
    const onRefresh = vi.fn();
    const onApplyLocal = vi.fn();
    render(
      <MarketplaceSearchPanel
        catalog={marketplacePreviewCatalog}
        hasCandidateSnapshot
        onSearch={onSearch}
        onRefresh={onRefresh}
        onApplyLocal={onApplyLocal}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Occultist Robe" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Longbow" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Warlock" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Rare" }));
    fireEvent.change(screen.getByLabelText("Minimum gold"), { target: { value: "80" } });

    expect(onSearch).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onApplyLocal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Search DarkerDB" }));

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch.mock.calls[0]?.[0]).toMatchObject({
      familyIds: ["id.item.longbow", "id.item.occultist_robe"],
      classIds: ["id.class.warlock"],
      rarities: ["rare"],
      price: { basis: "unit", range: { minimum: 80 } }
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset draft" }));
    expect(screen.getByRole("checkbox", { name: "Occultist Robe" })).not.toBeChecked();
    expect(screen.getByLabelText("Minimum gold")).toHaveValue("");
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("blocks an invalid range before it can produce a search request", () => {
    const onSearch = vi.fn();
    render(<MarketplaceSearchPanel catalog={marketplacePreviewCatalog} onSearch={onSearch} />);

    fireEvent.change(screen.getByLabelText("Minimum gold"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Maximum gold"), { target: { value: "100" } });

    expect(screen.getByText("Minimum must not exceed maximum.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search DarkerDB" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Search DarkerDB" }));
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("adds scrollable attribute rules with min/max and emits exact K-of-N", () => {
    const onSearch = vi.fn();
    render(<MarketplaceSearchPanel catalog={marketplacePreviewCatalog} onSearch={onSearch} />);

    const attributeSelect = screen.getByLabelText("Available attributes");
    fireEvent.change(attributeSelect, { target: { value: "id.attribute.strength" } });
    fireEvent.click(screen.getByRole("button", { name: "Add attribute" }));
    fireEvent.change(screen.getByLabelText("Strength Minimum"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Strength Maximum"), { target: { value: "3" } });

    fireEvent.change(attributeSelect, { target: { value: "id.attribute.agility" } });
    fireEvent.click(screen.getByRole("button", { name: "Add attribute" }));
    fireEvent.change(screen.getByLabelText("Required matches (K)"), { target: { value: "1" } });

    expect(screen.getByText("At least 1 of 2 selected attributes must match.")).toBeInTheDocument();
    expect(screen.getAllByText("Possible range: 1–3")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Search DarkerDB" }));

    expect(onSearch.mock.calls[0]?.[0]).toMatchObject({
      requiredMatchCount: 1,
      rollRules: [
        expect.objectContaining({ attributeId: "id.attribute.agility" }),
        expect.objectContaining({
          attributeId: "id.attribute.strength",
          minimum: 2,
          maximum: 3
        })
      ]
    });
  });

  it("Refresh replays the last submitted spec rather than unsubmitted draft edits", () => {
    const onSearch = vi.fn();
    const onRefresh = vi.fn();
    render(
      <MarketplaceSearchPanel
        catalog={marketplacePreviewCatalog}
        onSearch={onSearch}
        onRefresh={onRefresh}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Rare" }));
    fireEvent.click(screen.getByRole("button", { name: "Search DarkerDB" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Epic" }));
    expect(onRefresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Refresh last search" }));

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefresh.mock.calls[0]?.[0]).toMatchObject({ rarities: ["rare"] });
  });

  it("Apply locally is separate from live Search and requires a candidate snapshot", () => {
    const onSearch = vi.fn();
    const onApplyLocal = vi.fn();
    const { rerender } = render(
      <MarketplaceSearchPanel
        catalog={marketplacePreviewCatalog}
        onSearch={onSearch}
        onApplyLocal={onApplyLocal}
      />
    );
    expect(screen.getByRole("button", { name: "Apply locally" })).toBeDisabled();

    rerender(
      <MarketplaceSearchPanel
        catalog={marketplacePreviewCatalog}
        hasCandidateSnapshot
        onSearch={onSearch}
        onApplyLocal={onApplyLocal}
      />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Chest" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply locally" }));

    expect(onApplyLocal).toHaveBeenCalledTimes(1);
    expect(onApplyLocal.mock.calls[0]?.[0]).toMatchObject({ slotTypes: ["chest"] });
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("removes one active chip without clearing unrelated selections", () => {
    render(<MarketplaceSearchPanel catalog={marketplacePreviewCatalog} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Rare" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Epic" }));
    const summary = screen.getByRole("region", { name: "Draft filter summary" });

    fireEvent.click(within(summary).getByRole("button", { name: "Remove Rare" }));

    expect(screen.getByRole("checkbox", { name: "Rare" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Epic" })).toBeChecked();
  });

  it("searches catalog options by either English or Chinese alias", () => {
    render(<MarketplaceSearchPanel catalog={marketplacePreviewCatalog} />);
    fireEvent.change(screen.getByLabelText("Search within Item names"), {
      target: { value: "长弓" }
    });

    expect(screen.getByRole("checkbox", { name: "Longbow" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Occultist Robe" })).not.toBeInTheDocument();
  });

  it("shows price as a removable active filter instead of a hidden condition", () => {
    render(<MarketplaceSearchPanel catalog={marketplacePreviewCatalog} />);
    fireEvent.change(screen.getByLabelText("Minimum gold"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Maximum gold"), { target: { value: "150" } });

    fireEvent.click(screen.getByRole("button", { name: "Remove Per-unit price 50–150" }));

    expect(screen.getByLabelText("Minimum gold")).toHaveValue("");
    expect(screen.getByLabelText("Maximum gold")).toHaveValue("");
  });

  it("switches catalog labels and all control copy to Simplified Chinese without a request", async () => {
    const onSearch = vi.fn();
    render(<MarketplaceSearchPanel catalog={marketplacePreviewCatalog} onSearch={onSearch} />);

    await i18n.changeLanguage("zh-CN");

    expect(await screen.findByRole("heading", { name: "Marketplace 物品搜索" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "神秘学长袍" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "搜索 DarkerDB" })).toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();
  });
});
