import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  collectMarketItemFamilies,
  collectDarkerDbCursorPages,
  collectMarketPages,
  DarkerDbClient,
  DarkerDbHttpError,
  PINNED_DARKERDB_API_VERSION,
  splitMarketQueryByRarity,
  type DarkerDbCursorPageSource,
  type MarketPageSource
} from "../src/adapters/darkerdb";
import { sanitizeDarkerDbSample } from "../src/adapters/darkerdbSample";

describe("DarkerDbClient", () => {
  it("requests localized item data and returns pagination metadata", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          body: [{ id: "id.item.longbow", name: "长弓" }],
          pagination: { next: "cursor-2", total: 2400, page: 1, num_pages: 12 }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = new DarkerDbClient({
      apiKey: "secret-test-key",
      baseUrl: "https://example.test",
      fetchImplementation
    });

    const page = await client.getItems<{ id: string; name: string }[]>({
      locale: "zh-CN",
      limit: 200
    });

    const calledUrl = fetchImplementation.mock.calls[0]?.[0];
    expect(String(calledUrl)).toContain("locale=zh-CN");
    expect(String(calledUrl)).toContain("limit=200");
    expect(page).toMatchObject({
      nextCursor: "cursor-2",
      reportedTotal: 2400,
      page: 1,
      numPages: 12
    });
    const calledHeaders = fetchImplementation.mock.calls[0]?.[1]?.headers as Headers;
    expect(calledHeaders.get("X-API-Version")).toBe(PINNED_DARKERDB_API_VERSION);
    expect(calledHeaders.get("X-API-Key")).toBe("secret-test-key");
  });

  it("accepts null page metadata on cursor-paginated catalog endpoints", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        body: [],
        pagination: { next: null, total: 0, page: null, num_pages: null }
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const client = new DarkerDbClient({ baseUrl: "https://example.test", fetchImplementation });

    await expect(client.getAttributes({ locale: "en" })).resolves.toEqual({
      data: [],
      reportedTotal: 0,
      diagnostics: { contractVersion: PINNED_DARKERDB_API_VERSION }
    });
  });

  it("keeps canonical attributes usable when DarkerDB omits display text", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ body: [{
        id: "id.attribute.additional_weight_limit",
        is_percentage: false,
        attribute_group: "secondary"
      }] }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const client = new DarkerDbClient({ baseUrl: "https://example.test", fetchImplementation });

    await expect(client.getAttributes({ locale: "en" })).resolves.toMatchObject({
      data: [{ id: "id.attribute.additional_weight_limit", description: "" }]
    });
  });

  it("accepts an untranslated item row so localized UI can fall back by canonical ID", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ body: [{
        id: "id.item.untranslated_1001",
        archetype: "id.item.untranslated",
        rarity: "poor",
        max_stack_size: 1
      }] }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const client = new DarkerDbClient({ baseUrl: "https://example.test", fetchImplementation });

    await expect(client.getGameplayItems({ locale: "zh-Hans" })).resolves.toMatchObject({
      data: [{ id: "id.item.untranslated_1001", name: "" }]
    });
  });

  it("validates gameplay dimensions instead of accepting incomplete item metadata", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ body: [{
        id: "id.item.longbow",
        name: "Longbow",
        rarity: "common",
        inventory_width: 2,
        inventory_height: 3,
        max_stack_size: 1
      }] }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const client = new DarkerDbClient({ baseUrl: "https://example.test", fetchImplementation });
    await expect(client.getGameplayItems({ locale: "en" })).resolves.toMatchObject({
      data: [{ id: "id.item.longbow", inventory_width: 2, inventory_height: 3 }]
    });

    fetchImplementation.mockResolvedValueOnce(
      new Response(JSON.stringify({ body: [{
        id: "id.item.longbow",
        name: "Longbow",
        rarity: "common",
        max_stack_size: 1
      }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const nonSpatial = await client.getGameplayItems({ locale: "en" });
    expect(nonSpatial.data).toMatchObject([{ id: "id.item.longbow" }]);
    expect(nonSpatial.data[0]?.inventory_width).toBeUndefined();
  });

  it("encodes one documented market rarity and enforces the 50-row page cap", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ body: [], pagination: { page: 2, num_pages: 2, total: 0 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const client = new DarkerDbClient({
      baseUrl: "https://example.test",
      fetchImplementation
    });

    await client.getMarket({
      itemId: "id.item.occultist_robe_4001",
      archetype: "id.archetype.occultist_robe",
      rarity: "epic",
      slotTypes: ["chest"],
      listingState: "missing",
      hasSold: true,
      primary: { armor_rating: 42 },
      secondary: { strength: ">=3" },
      page: 2,
      limit: 50,
      locale: "zh-Hans"
    });

    const url = new URL(String(fetchImplementation.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/v2/market");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      item_id: "id.item.occultist_robe_4001",
      archetype: "id.archetype.occultist_robe",
      rarity: "epic",
      slot_type: "chest",
      listing_state: "missing",
      has_sold: "true",
      "primary[armor_rating]": "42",
      "secondary[strength]": ">=3",
      page: "2",
      limit: "50",
      locale: "zh-Hans"
    });
    await expect(client.getMarket({ limit: 51 })).rejects.toThrow(
      "Market limit must be between 1 and 50."
    );
  });

  it("splits multiple rarities instead of sending an unsupported comma query", async () => {
    expect(splitMarketQueryByRarity({
      itemId: "id.item.occultist_robe_4001",
      rarities: ["epic", "legendary", "epic"]
    })).toEqual([
      { itemId: "id.item.occultist_robe_4001", rarity: "epic" },
      { itemId: "id.item.occultist_robe_4001", rarity: "legendary" }
    ]);

    const fetchImplementation = vi.fn<typeof fetch>();
    const client = new DarkerDbClient({ baseUrl: "https://example.test", fetchImplementation });
    await expect(client.getMarket({ rarities: ["epic", "legendary"] })).rejects.toThrow(
      "one rarity per request"
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("exposes envelope and rate-limit diagnostics and forwards cancellation", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        version: "v1.0.0-rc.37",
        build: "0.17.151.9472",
        patch: 132,
        request_id: "request-test",
        elapsed: 0.012,
        timestamp: "2026-09-01T00:00:00.000Z",
        body: { facets: {} }
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": "59",
          "X-Credits-Cost": "1",
          "X-Credits-Remaining": "999"
        }
      })
    );
    const controller = new AbortController();
    const client = new DarkerDbClient({ baseUrl: "https://example.test", fetchImplementation });

    const page = await client.getFacets({ signal: controller.signal });

    expect(fetchImplementation.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    expect(page.diagnostics).toEqual({
      contractVersion: PINNED_DARKERDB_API_VERSION,
      serviceVersion: "v1.0.0-rc.37",
      build: "0.17.151.9472",
      patch: 132,
      requestId: "request-test",
      elapsedSeconds: 0.012,
      timestamp: "2026-09-01T00:00:00.000Z",
      rateLimit: { limit: 60, remaining: 59, creditsCost: 1, creditsRemaining: 999 }
    });
  });

  it("loads typed facets, classes, attributes, and item detail", async () => {
    const responses = [
      { body: { facets: { item_rarity: { name: "item_rarity", description: "Rarity", auth_required: false, values: [{ value: "rare", label: "Rare" }] } } } },
      { body: [{ id: "id.class.fighter", name: "Fighter" }] },
      { body: [{ id: "id.attribute.strength", name: "Strength", description: "Power", is_percentage: false, attribute_group: "primary" }] },
      { body: { id: "id.item.robe_4001", name: "Robe", rarity: "rare", max_stack_size: 1, primary_attributes: [], secondary_attributes: [{ attribute_id: "magic_penetration", minimum: 15, maximum: 30, enchanted_min: 15, enchanted_max: 30, percentage: true }] } }
    ];
    const fetchImplementation = vi.fn<typeof fetch>();
    for (const response of responses) {
      fetchImplementation.mockResolvedValueOnce(new Response(JSON.stringify(response), {
        status: 200, headers: { "Content-Type": "application/json" }
      }));
    }
    const client = new DarkerDbClient({ baseUrl: "https://example.test", fetchImplementation });

    await expect(client.getFacets()).resolves.toMatchObject({ data: { facets: { item_rarity: { values: [{ value: "rare" }] } } } });
    await expect(client.getClasses()).resolves.toMatchObject({ data: [{ id: "id.class.fighter" }] });
    await expect(client.getAttributes({ group: "primary" })).resolves.toMatchObject({ data: [{ id: "id.attribute.strength" }] });
    await expect(client.getItemDetail("id.item.robe_4001")).resolves.toMatchObject({ data: { secondary_attributes: [{ percentage: true }] } });
  });

  it("encodes attribute and gem price-check comparables", async () => {
    const testRoot = path.dirname(fileURLToPath(import.meta.url));
    const priceCheckFixture = JSON.parse(
      await readFile(
        path.resolve(testRoot, "../fixtures/darkerdb/live-samples/price-check.json"),
        "utf8"
      )
    ) as { body: unknown };
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ body: priceCheckFixture.body }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const client = new DarkerDbClient({
      baseUrl: "https://example.test",
      fetchImplementation
    });

    await client.priceCheck({
      itemId: "id.item.occultist_robe_4001",
      attributes: { strength: 3 },
      gems: { action_speed: "diamond" },
      locale: "en"
    });

    const url = new URL(String(fetchImplementation.mock.calls[0]?.[0]));
    expect(url.searchParams.get("attributes[strength]")).toBe("3");
    expect(url.searchParams.get("gems[action_speed]")).toBe("diamond");
  });

  it("collects page-based market results and reports an intentional cap as incomplete", async () => {
    const client: MarketPageSource<{ id: string }> = {
      getMarket: vi.fn((query) => {
        const page = query.page ?? 1;
        return Promise.resolve({
          data: [{ id: `listing-${query.itemId}-${page}` }],
          diagnostics: { contractVersion: PINNED_DARKERDB_API_VERSION },
          page,
          numPages: 3,
          reportedTotal: 3
        });
      })
    };

    const capped = await collectMarketPages<{ id: string }>(
      client,
      { itemId: "id.item.longbow", limit: 1 },
      { maxPages: 2 }
    );
    expect(capped).toEqual({
      data: [
        { id: "listing-id.item.longbow-1" },
        { id: "listing-id.item.longbow-2" }
      ],
      pagesFetched: 2,
      retrievedCount: 2,
      reportedTotal: 3,
      complete: false
    });

    const complete = await collectMarketPages<{ id: string }>(
      client,
      { itemId: "id.item.longbow", limit: 1 },
      { maxPages: 3 }
    );
    expect(complete.complete).toBe(true);
    expect(complete.retrievedCount).toBe(3);
  });

  it("collects multiple selected gear names and sums their completeness metadata", async () => {
    const client: MarketPageSource<{ id: string }> = {
      getMarket: vi.fn((query) =>
        Promise.resolve({
          data: [{ id: String(query.itemId) }],
          diagnostics: { contractVersion: PINNED_DARKERDB_API_VERSION },
          page: 1,
          numPages: 1,
          reportedTotal: 1
        })
      )
    };

    const result = await collectMarketItemFamilies(
      client,
      ["id.item.robe", "id.item.frock", "id.item.robe"],
      { locale: "en", limit: 50 }
    );

    expect(result.data).toEqual([{ id: "id.item.robe" }, { id: "id.item.frock" }]);
    expect(result.retrievedCount).toBe(2);
    expect(result.reportedTotal).toBe(2);
    expect(result.complete).toBe(true);
    expect(result.families).toHaveLength(2);
  });

  it("splits item-family rarity requests and follows cursor pagination until next is absent", async () => {
    const marketClient: MarketPageSource<{ id: string }> = {
      getMarket: vi.fn((query) => Promise.resolve({
        data: [{ id: `${query.itemId}:${query.rarity}` }],
        diagnostics: { contractVersion: PINNED_DARKERDB_API_VERSION },
        page: 1,
        numPages: 1,
        reportedTotal: 1
      }))
    };
    const market = await collectMarketItemFamilies(
      marketClient,
      ["id.item.robe"],
      { rarities: ["rare", "epic"], limit: 50 }
    );
    expect(market.data).toEqual([
      { id: "id.item.robe:rare" },
      { id: "id.item.robe:epic" }
    ]);
    expect(market.families.map(({ itemId, rarity }) => ({ itemId, rarity }))).toEqual([
      { itemId: "id.item.robe", rarity: "rare" },
      { itemId: "id.item.robe", rarity: "epic" }
    ]);

    const cursorSource: DarkerDbCursorPageSource<{ id: string }> = {
      getPage: vi.fn((cursor) => Promise.resolve({
        data: [{ id: cursor ?? "first" }],
        diagnostics: { contractVersion: PINNED_DARKERDB_API_VERSION },
        ...(cursor === undefined ? { nextCursor: "cursor-2" } : {})
      }))
    };
    await expect(collectDarkerDbCursorPages(cursorSource)).resolves.toMatchObject({
      data: [{ id: "first" }, { id: "cursor-2" }],
      pagesFetched: 2,
      retrievedCount: 2,
      complete: true
    });
  });

  it("keeps authentication errors distinct from empty results", async () => {
    const client = new DarkerDbClient({
      baseUrl: "https://example.test",
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        new Response("unauthorized", { status: 401, statusText: "Unauthorized" })
      )
    });
    await expect(client.getAttributes({ locale: "en" })).rejects.toBeInstanceOf(
      DarkerDbHttpError
    );
  });

  it("redacts player-identifying sample fields without erasing item names", () => {
    expect(
      sanitizeDarkerDbSample({
        request_id: "request-123",
        body: [{ name: "Occultist Robe", seller: { username: "player" }, price: 100 }]
      })
    ).toEqual({
      request_id: "[redacted]",
      body: [{ name: "Occultist Robe", seller: "[redacted]", price: 100 }]
    });
  });
});
