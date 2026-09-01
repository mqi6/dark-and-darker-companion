import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketplaceSearchExecutionResult } from "../src/adapters/marketplaceSearch";
import i18n from "../src/localization/i18n";
import { MarketplaceSearchWorkspace, type MarketplaceSearchRuntime } from "../src/ui/MarketplaceSearchWorkspace";
import { marketplacePreviewCatalog } from "../src/ui/marketplacePreviewCatalog";
import { createMarketplacePreviewCoordinator } from "../src/ui/marketplacePreviewMarket";

describe("Marketplace Search runtime workspace", () => {
  afterEach(cleanup);

  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  it("runs the M2 planner/executor only after explicit Search and publishes derived results", async () => {
    const coordinator = createMarketplacePreviewCoordinator();
    const search = vi.fn(coordinator.search.bind(coordinator));
    const runtime: MarketplaceSearchRuntime = {
      search,
      refresh: vi.fn(coordinator.refresh.bind(coordinator)),
      cancel: vi.fn(() => coordinator.cancel())
    };
    render(<MarketplaceSearchWorkspace catalog={marketplacePreviewCatalog} runtime={runtime} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Rare" }));
    expect(search).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Search DarkerDB" }));

    expect(await screen.findByText("5 of 5 evaluated listings match")).toBeInTheDocument();
    expect(search).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Occultist Robe").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /buy/i })).not.toBeInTheDocument();
  });

  it("re-filters a compatible K-of-N draft locally without another runtime request", async () => {
    const coordinator = createMarketplacePreviewCoordinator();
    const search = vi.fn<MarketplaceSearchRuntime["search"]>(async (plan, catalog, names) => {
      const coordinated = await coordinator.search(plan, catalog, names);
      return coordinated.status === "completed"
        ? {
            ...coordinated,
            result: {
              ...coordinated.result,
              complete: false,
              incompleteReasons: ["retrieved-limit"],
              reportedTotal: 20
            }
          }
        : coordinated;
    });
    const runtime: MarketplaceSearchRuntime = {
      search,
      refresh: vi.fn(coordinator.refresh.bind(coordinator)),
      cancel: vi.fn(() => coordinator.cancel())
    };
    render(<MarketplaceSearchWorkspace catalog={marketplacePreviewCatalog} runtime={runtime} />);
    fireEvent.click(screen.getByRole("button", { name: "Search DarkerDB" }));
    await screen.findByText("8 of 8 evaluated listings match");

    fireEvent.change(screen.getByLabelText("Available attributes"), {
      target: { value: "id.attribute.strength" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add attribute" }));
    expect(screen.getByRole("button", { name: "Apply locally" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Strength Minimum"), { target: { value: "3" } });
    expect(screen.getByRole("button", { name: "Apply locally" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Available attributes"), {
      target: { value: "id.attribute.knowledge" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add attribute" }));

    expect(screen.getByRole("button", { name: "Apply locally" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Apply locally" }));

    expect(search).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Local filters applied")).toBeInTheDocument();
    expect(screen.getByText("3 of 8 evaluated listings match")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load another bounded batch" }));
    await waitFor(() => expect(screen.queryByText("Loading another bounded batch…")).not.toBeInTheDocument());
    expect(search).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Local filters applied")).toBeInTheDocument();
  });

  it("turns Search into explicit Cancel while the first request is pending", () => {
    const search = vi.fn<MarketplaceSearchRuntime["search"]>(
      () => new Promise(() => undefined)
    );
    const runtime: MarketplaceSearchRuntime = {
      search,
      refresh: vi.fn<MarketplaceSearchRuntime["refresh"]>(
        () => new Promise(() => undefined)
      ),
      cancel: vi.fn()
    };
    render(<MarketplaceSearchWorkspace catalog={marketplacePreviewCatalog} runtime={runtime} />);

    fireEvent.click(screen.getByRole("button", { name: "Search DarkerDB" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));

    expect(search).toHaveBeenCalledTimes(1);
    expect(runtime.cancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Search DarkerDB" })).toBeInTheDocument();
  });

  it("expands Load more to the next retrieved-row budget only after the user clicks", async () => {
    const first = incompleteResult();
    const search = vi.fn<MarketplaceSearchRuntime["search"]>()
      .mockResolvedValueOnce({ status: "completed", generation: 1, result: first })
      .mockResolvedValueOnce({ status: "completed", generation: 2, result: { ...first, complete: true } });
    const runtime: MarketplaceSearchRuntime = {
      search,
      refresh: vi.fn<MarketplaceSearchRuntime["refresh"]>(),
      cancel: vi.fn()
    };
    render(<MarketplaceSearchWorkspace catalog={marketplacePreviewCatalog} runtime={runtime} />);
    fireEvent.click(screen.getByRole("button", { name: "Search DarkerDB" }));
    await screen.findByRole("button", { name: "Load another bounded batch" });
    expect(search).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Load another bounded batch" }));

    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[1]?.[0].spec.budget.retrievedLimit).toBe(2_000);
  });
});

function incompleteResult(): MarketplaceSearchExecutionResult {
  return {
    evaluated: [],
    matches: [],
    retrievedCount: 1_000,
    evaluatedCount: 0,
    matchedCount: 0,
    reportedTotal: 2_500,
    complete: false,
    incompleteReasons: ["retrieved-limit"],
    liveRequestCount: 20,
    cacheHitCount: 0,
    families: [],
    diagnostics: [],
    fetchedAt: "2026-09-01T00:00:00.000Z",
    authoritativeEmpty: false
  };
}
