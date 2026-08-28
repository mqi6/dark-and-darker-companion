import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  collectMarketItemFamilies,
  collectMarketPages,
  DarkerDbClient,
  DarkerDbHttpError,
  PINNED_DARKERDB_API_VERSION,
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

  it("encodes documented market filters and enforces the 50-row page cap", async () => {
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
      rarities: ["epic", "legendary"],
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
      rarity: "epic,legendary",
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
