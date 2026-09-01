import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketplaceHttpRuntime, loadMarketplaceHttpCatalog } from "../src/ui/marketplaceHttpRuntime";
import { createMarketplaceSearchPlan } from "../src/domain/marketplaceSearch";
import { marketplacePreviewCatalog } from "../src/ui/marketplacePreviewCatalog";

describe("Marketplace localhost HTTP runtime", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads a catalog without initiating a Market search", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(marketplacePreviewCatalog), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadMarketplaceHttpCatalog({ baseUrl: "/api/marketplace" }))
      .resolves.toMatchObject({ source: "preview-fixture" });
    expect(fetchMock).toHaveBeenCalledWith("/api/marketplace/catalog", expect.objectContaining({ method: "GET" }));
  });

  it("sends only the normalized spec and keeps cancellation explicit", async () => {
    const completed = {
      status: "completed",
      generation: 1,
      result: {
        evaluated: [], matches: [], retrievedCount: 0, evaluatedCount: 0,
        matchedCount: 0, complete: true, incompleteReasons: [], liveRequestCount: 1,
        cacheHitCount: 0, families: [], diagnostics: [], fetchedAt: "2026-09-01T00:00:00.000Z",
        authoritativeEmpty: false
      }
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(completed), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const runtime = new MarketplaceHttpRuntime({ baseUrl: "/api/marketplace/" });
    const plan = createMarketplaceSearchPlan(
      { version: 1, familyIds: ["id.item.occultist_robe"] },
      marketplacePreviewCatalog.items
    );

    await runtime.search(plan);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/marketplace/search");
    expect(JSON.parse(String(request.body))).toEqual({ spec: plan.spec });
    expect(String(request.body)).not.toContain("possibleSecondaryAttributeIds");

    runtime.cancel();
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/marketplace/cancel");
  });

  it("surfaces runtime errors instead of substituting preview data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "authentication-failed" }), {
        status: 503,
        statusText: "Unavailable"
      })
    ));

    await expect(loadMarketplaceHttpCatalog({ baseUrl: "/api/marketplace" }))
      .rejects.toThrow("authentication-failed");
  });
});
