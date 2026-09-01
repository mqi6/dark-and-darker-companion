import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketplaceSearchExecutionResult } from "../src/adapters/marketplaceSearch";
import type { DarkerDbMarketListing } from "../src/adapters/darkerdbContracts";
import type { CanonicalId, MarketCandidate } from "../src/domain/models";
import { parseMarketplaceSearchSpec, type MarketplaceListingEvaluation } from "../src/domain/marketplaceSearch";
import { evaluateCandidate } from "../src/domain/search";
import i18n from "../src/localization/i18n";
import {
  MarketplaceSearchResults,
  type MarketplaceSearchPresentation
} from "../src/ui/MarketplaceSearchResults";
import { marketplacePreviewCatalog } from "../src/ui/marketplacePreviewCatalog";

const strength = "id.attribute.strength" as CanonicalId;

describe("Marketplace Search result and state UI", () => {
  afterEach(cleanup);

  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
  });

  it("starts with instructions and no fake result counts", () => {
    render(<MarketplaceSearchResults catalog={marketplacePreviewCatalog} />);

    expect(screen.getByText("Run an explicit search to see qualifying listings")).toBeInTheDocument();
    expect(screen.queryByText(/evaluated listings match/)).not.toBeInTheDocument();
  });

  it("always exposes retrieved versus reported totals for an incomplete result", () => {
    render(
      <MarketplaceSearchResults
        catalog={marketplacePreviewCatalog}
        presentation={presentation(result({ complete: false, retrievedCount: 2, reportedTotal: 10 }))}
        canLoadMore
      />
    );

    expect(screen.getByText("2 retrieved / 10 server-reported")).toBeInTheDocument();
    expect(screen.getByText(/2 listings were retrieved from 10 reported/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load another bounded batch" })).toBeInTheDocument();
  });

  it("does not claim an authoritative empty market when freshness is stale", () => {
    const empty = result({
      evaluated: [],
      matches: [],
      evaluatedCount: 0,
      matchedCount: 0,
      families: [{
        id: "market:all",
        pagesFetched: 1,
        liveRequestCount: 1,
        cacheHitCount: 0,
        retrievedCount: 0,
        reportedTotal: 0,
        complete: true,
        freshness: freshness("stale")
      }]
    });

    render(<MarketplaceSearchResults catalog={marketplacePreviewCatalog} presentation={presentation(empty)} />);

    expect(screen.getByText("No usable listings were retrieved, but absence is not authoritative")).toBeInTheDocument();
    expect(screen.queryByText("No active listings match")).not.toBeInTheDocument();
  });

  it("shows an authoritative empty only after a complete fresh query", () => {
    render(
      <MarketplaceSearchResults
        catalog={marketplacePreviewCatalog}
        presentation={presentation(result({
          evaluated: [],
          matches: [],
          retrievedCount: 0,
          evaluatedCount: 0,
          matchedCount: 0
        }))}
      />
    );

    expect(screen.getByText("No active listings match")).toBeInTheDocument();
  });

  it("distinguishes a local K-of-N empty result from a server empty result", () => {
    const failed = evaluation(false);
    render(
      <MarketplaceSearchResults
        catalog={marketplacePreviewCatalog}
        presentation={presentation(result({
          evaluated: [failed],
          matches: [],
          evaluatedCount: 1,
          matchedCount: 0
        }))}
      />
    );

    expect(screen.getByText("Server candidates were found, but none passed locally")).toBeInTheDocument();
  });

  it("keeps authentication, rate-limit, and partial-family failures distinct from empty", () => {
    render(
      <MarketplaceSearchResults
        catalog={marketplacePreviewCatalog}
        presentation={presentation(result({
          complete: false,
          incompleteReasons: ["family-error", "authentication-error", "rate-limited"],
          families: [{
            id: "item:failed",
            pagesFetched: 0,
            liveRequestCount: 1,
            cacheHitCount: 0,
            retrievedCount: 0,
            complete: false,
            error: { kind: "http", status: 401, message: "Unauthorized" }
          }]
        }))}
      />
    );

    expect(screen.getByText("DarkerDB authentication failed")).toBeInTheDocument();
    expect(screen.getByText("DarkerDB rate limit reached")).toBeInTheDocument();
    expect(screen.getByText("Some item families failed")).toBeInTheDocument();
  });

  it("preserves the previous result while presenting a fatal request error", () => {
    render(
      <MarketplaceSearchResults
        catalog={marketplacePreviewCatalog}
        presentation={presentation()}
        error="network unavailable"
      />
    );

    expect(screen.getByText("The last successful results remain visible and may now be stale.")).toBeInTheDocument();
    expect(screen.getByText("network unavailable")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Occultist Robe/ })).toBeInTheDocument();
  });

  it("shows unit and total stack prices and copies a manual in-game summary", async () => {
    const writeText = vi.fn(async (_value: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(
      <MarketplaceSearchResults
        catalog={marketplacePreviewCatalog}
        presentation={presentation()}
      />
    );

    expect(screen.getByRole("cell", { name: "100 gold" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "300 gold" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Show listing attributes"));
    expect(screen.getByText("Primary · primary_armor_rating: 50")).toBeInTheDocument();
    expect(screen.getByText("Random · Strength: 2")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Show search summary"));
    expect(screen.getByText(/Listing reference: 100 gold per unit \/ 300 gold total/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy summary" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain("Item: Occultist Robe");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});

function presentation(
  value: MarketplaceSearchExecutionResult = result()
): MarketplaceSearchPresentation {
  const spec = parseMarketplaceSearchSpec({ version: 1 });
  return { spec, sourceSpec: spec, result: value, locallyApplied: false };
}

function result(
  overrides: Partial<MarketplaceSearchExecutionResult> = {}
): MarketplaceSearchExecutionResult {
  const match = evaluation(true);
  return {
    evaluated: [match],
    matches: [match],
    retrievedCount: 1,
    evaluatedCount: 1,
    matchedCount: 1,
    reportedTotal: 1,
    complete: true,
    incompleteReasons: [],
    liveRequestCount: 1,
    cacheHitCount: 0,
    families: [{
      id: "market:all",
      pagesFetched: 1,
      liveRequestCount: 1,
      cacheHitCount: 0,
      retrievedCount: 1,
      reportedTotal: 1,
      complete: true,
      freshness: freshness("fresh")
    }],
    diagnostics: [],
    fetchedAt: "2026-09-01T00:00:10.000Z",
    authoritativeEmpty: false,
    ...overrides
  };
}

function evaluation(passed: boolean): MarketplaceListingEvaluation {
  const listing: DarkerDbMarketListing = {
    id: 900,
    item_id: "id.item.occultist_robe_4001",
    archetype: "id.item.occultist_robe",
    name: "Occultist Robe",
    icon: "robe.png",
    icon_url: "https://example.test/robe.png",
    slot_type: "chest",
    item_type: "armor",
    rarity: "rare",
    price: 300,
    price_per_unit: 100,
    quantity: 3,
    listing_state: "active",
    is_confirmed: true,
    has_cancelled: false,
    has_expired: false,
    has_sold: false,
    attributes: { primary_armor_rating: 50, secondary_strength: 2 },
    sockets: [],
    created_at: "2026-09-01T00:00:00.000Z",
    expires_at: "2026-09-02T00:00:00.000Z",
    loot_state: "handled"
  };
  const candidate: MarketCandidate = {
    listingId: String(listing.id),
    item: {
      instanceKey: `market:${listing.id}`,
      itemId: listing.item_id,
      name: { id: listing.item_id, en: listing.name, zhStatus: "english-fallback" },
      quantity: listing.quantity,
      rarity: listing.rarity,
      rolls: [{ attributeId: strength, value: 2 }],
      possibleSecondaryAttributeIds: [strength]
    },
    price: listing.price,
    createdAt: listing.created_at
  };
  const calculated = passed
    ? evaluateCandidate(candidate, [], 0)
    : evaluateCandidate(candidate, [{ id: "strength", attributeId: strength, enabled: true, minimum: 3 }], 1);
  return { listing, evaluation: calculated };
}

function freshness(status: string) {
  return {
    archetype: "id.item.occultist_robe" as CanonicalId,
    status,
    scan_started_at: "2026-09-01T00:00:00.000Z",
    scan_completed_at: "2026-09-01T00:00:02.000Z",
    age_seconds: status === "fresh" ? 90 : 7_200,
    num_pages: 1,
    num_listings: 1
  };
}
