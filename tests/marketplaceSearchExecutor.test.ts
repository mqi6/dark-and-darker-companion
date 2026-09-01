import { describe, expect, it, vi } from "vitest";
import {
  DarkerDbHttpError,
  PINNED_DARKERDB_API_VERSION,
  type DarkerDbPage,
  type MarketPageSource,
  type MarketQuery
} from "../src/adapters/darkerdb";
import type { DarkerDbMarketListing } from "../src/adapters/darkerdbContracts";
import {
  MarketplacePageCache,
  MarketplaceSearchCoordinator,
  MarketplaceSearchExecutor
} from "../src/adapters/marketplaceSearch";
import type { CanonicalId } from "../src/domain/models";
import {
  createMarketplaceSearchPlan,
  type MarketplaceCatalogItem
} from "../src/domain/marketplaceSearch";

const itemIds = ["id.item.alpha_3001", "id.item.beta_3001", "id.item.gamma_3001"] as const;
const catalog = itemIds.map((id) => catalogItem(id));
const diagnostics = { contractVersion: PINNED_DARKERDB_API_VERSION };

describe("Marketplace bounded search execution", () => {
  it("paginates query families round-robin under one global request budget", async () => {
    const calls: string[] = [];
    const source = sourceFrom(async (query) => {
      calls.push(`${query.itemId}:${query.page}`);
      return page([listing(calls.length, query.itemId!, calls.length * 10)], {
        page: query.page ?? 1,
        numPages: 2,
        reportedTotal: 2
      });
    });
    const plan = createMarketplaceSearchPlan(
      {
        version: 1,
        familyIds: ["id.archetype.test"],
        budget: { requestLimit: 4, retrievedLimit: 100, pageLimit: 1 }
      },
      catalog
    );

    const result = await new MarketplaceSearchExecutor(source).execute(plan, catalog);

    expect(calls).toEqual([
      "id.item.alpha_3001:1",
      "id.item.beta_3001:1",
      "id.item.gamma_3001:1",
      "id.item.alpha_3001:2"
    ]);
    expect(result).toMatchObject({
      retrievedCount: 4,
      evaluatedCount: 4,
      matchedCount: 4,
      liveRequestCount: 4,
      complete: false,
      incompleteReasons: ["request-limit"]
    });
  });

  it("stops at the overall retrieved-row cap without letting one family monopolize it", async () => {
    const calls: CanonicalId[] = [];
    const source = sourceFrom(async (query) => {
      calls.push(query.itemId!);
      return page([listing(calls.length, query.itemId!, 100)], {
        page: query.page ?? 1,
        numPages: 3,
        reportedTotal: 3
      });
    });
    const plan = createMarketplaceSearchPlan(
      {
        version: 1,
        familyIds: ["id.archetype.test"],
        budget: { requestLimit: 20, retrievedLimit: 2, pageLimit: 1 }
      },
      catalog
    );

    const result = await new MarketplaceSearchExecutor(source).execute(plan, catalog);

    expect(calls).toEqual([itemIds[0], itemIds[1]]);
    expect(result).toMatchObject({
      retrievedCount: 2,
      liveRequestCount: 2,
      complete: false,
      incompleteReasons: ["retrieved-limit"]
    });
  });

  it("distinguishes raw retrieved, deduplicated evaluated, matched, and reported totals", async () => {
    const repeated = listing(7, itemIds[0], 90);
    const source = sourceFrom(async (query) =>
      page([repeated], { page: 1, numPages: 1, reportedTotal: 1 })
    );
    const plan = createMarketplaceSearchPlan(
      { version: 1, familyIds: ["id.archetype.test"] },
      catalog.slice(0, 2)
    );

    const result = await new MarketplaceSearchExecutor(source).execute(plan, catalog.slice(0, 2));

    expect(result).toMatchObject({
      retrievedCount: 2,
      evaluatedCount: 1,
      matchedCount: 1,
      reportedTotal: 2,
      complete: true
    });
  });

  it("passes each item's own possible-roll set into local K-of-N evaluation", async () => {
    const strength = "id.attribute.strength" as CanonicalId;
    const speed = "id.attribute.move_speed" as CanonicalId;
    const selected = catalogItem(itemIds[0], [strength]);
    const source = sourceFrom(async () =>
      page([listing(1, itemIds[0], 100, { secondary_strength: 3 })], {
        page: 1,
        numPages: 1,
        reportedTotal: 1
      })
    );
    const plan = createMarketplaceSearchPlan(
      {
        version: 1,
        rollRules: [
          { id: "speed", attributeId: speed, enabled: true, minimum: 1 },
          { id: "strength", attributeId: strength, enabled: true, minimum: 2 }
        ],
        requiredMatchCount: 1
      },
      [selected]
    );

    const result = await new MarketplaceSearchExecutor(source).execute(plan, [selected]);

    expect(result.matches[0]?.evaluation).toMatchObject({ passed: true, matchCount: 1 });
    expect(result.matches[0]?.evaluation.evaluations[0]?.reason).toBe("naturally-impossible");
  });

  it("keeps a family failure partial and still evaluates other families", async () => {
    const source = sourceFrom(async (query) => {
      if (query.itemId === itemIds[0]) throw new Error("temporary network failure");
      return page([listing(2, query.itemId!, 80)], {
        page: 1,
        numPages: 1,
        reportedTotal: 1
      });
    });
    const plan = createMarketplaceSearchPlan(
      { version: 1, familyIds: ["id.archetype.test"] },
      catalog.slice(0, 2)
    );

    const result = await new MarketplaceSearchExecutor(source).execute(plan, catalog.slice(0, 2));

    expect(result).toMatchObject({
      matchedCount: 1,
      liveRequestCount: 2,
      complete: false
    });
    expect(result.incompleteReasons).toContain("family-error");
    expect(result.families[0]?.error?.kind).toBe("contract-or-network");
    expect(result.families[1]?.complete).toBe(true);
  });

  it("stops fan-out after authentication or rate-limit errors", async () => {
    const getMarket = vi.fn(async () => {
      throw new DarkerDbHttpError(429, "Too Many Requests", diagnostics);
    });
    const plan = createMarketplaceSearchPlan(
      { version: 1, familyIds: ["id.archetype.test"] },
      catalog
    );

    const result = await new MarketplaceSearchExecutor({ getMarket }).execute(plan, catalog);

    expect(getMarket).toHaveBeenCalledTimes(1);
    expect(result.incompleteReasons).toEqual(["family-error", "rate-limited"]);
  });

  it("returns authoritative empty without making a broad fallback request", async () => {
    const getMarket = vi.fn();
    const plan = createMarketplaceSearchPlan(
      { version: 1, familyIds: ["id.archetype.not_in_catalog"] },
      catalog
    );

    const result = await new MarketplaceSearchExecutor({ getMarket }).execute(plan, catalog);

    expect(getMarket).not.toHaveBeenCalled();
    expect(result).toMatchObject({ authoritativeEmpty: true, complete: true, matchedCount: 0 });
  });

  it("reuses fresh pages without spending another live-request budget", async () => {
    let now = 1_000;
    const getMarket = vi.fn(async (query: MarketQuery) =>
      page([listing(1, query.itemId!, 100)], { page: 1, numPages: 1, reportedTotal: 1 })
    );
    const cache = new MarketplacePageCache(15_000, () => now);
    const executor = new MarketplaceSearchExecutor({ getMarket }, { cache, now: () => now });
    const plan = createMarketplaceSearchPlan(
      { version: 1, familyIds: ["id.archetype.test"] },
      [catalog[0]!]
    );

    const first = await executor.execute(plan, [catalog[0]!]);
    now += 1_000;
    const second = await executor.execute(plan, [catalog[0]!]);

    expect(getMarket).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ liveRequestCount: 1, cacheHitCount: 0 });
    expect(second).toMatchObject({ liveRequestCount: 0, cacheHitCount: 1 });
  });

  it("marks an older in-flight search superseded so it cannot publish stale data", async () => {
    let call = 0;
    const source = sourceFrom((query, options) => {
      call += 1;
      if (call === 1) {
        return new Promise((_, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        });
      }
      return Promise.resolve(
        page([listing(2, query.itemId!, 50)], { page: 1, numPages: 1, reportedTotal: 1 })
      );
    });
    const coordinator = new MarketplaceSearchCoordinator(new MarketplaceSearchExecutor(source));
    const plan = createMarketplaceSearchPlan(
      { version: 1, familyIds: ["id.archetype.test"] },
      [catalog[0]!]
    );

    const oldSearch = coordinator.search(plan, [catalog[0]!]);
    await Promise.resolve();
    const newSearch = coordinator.search(plan, [catalog[0]!]);

    await expect(oldSearch).resolves.toMatchObject({ status: "superseded", generation: 1 });
    await expect(newSearch).resolves.toMatchObject({
      status: "completed",
      generation: 2,
      result: { matchedCount: 1 }
    });
  });
});

function sourceFrom(
  getMarket: MarketPageSource<DarkerDbMarketListing>["getMarket"]
): MarketPageSource<DarkerDbMarketListing> {
  return { getMarket };
}

function page(
  data: DarkerDbMarketListing[],
  metadata: Pick<DarkerDbPage<DarkerDbMarketListing[]>, "page" | "numPages" | "reportedTotal">
): DarkerDbPage<DarkerDbMarketListing[]> {
  return { data, diagnostics, ...metadata };
}

function catalogItem(
  id: CanonicalId,
  possibleSecondaryAttributeIds?: CanonicalId[]
): MarketplaceCatalogItem {
  return {
    id,
    familyId: "id.archetype.test",
    rarity: "rare",
    itemType: "armor",
    slotType: "chest",
    classIds: [],
    ...(possibleSecondaryAttributeIds === undefined
      ? {}
      : { possibleSecondaryAttributeIds })
  };
}

function listing(
  id: number,
  itemId: CanonicalId,
  price: number,
  attributes: Record<string, number> = {}
): DarkerDbMarketListing {
  return {
    id,
    item_id: itemId,
    archetype: "id.archetype.test",
    name: "Test Item",
    icon: "test.png",
    icon_url: "https://example.test/test.png",
    slot_type: "chest",
    item_type: "armor",
    rarity: "rare",
    price,
    price_per_unit: price,
    quantity: 1,
    listing_state: "active",
    is_confirmed: true,
    has_cancelled: false,
    has_expired: false,
    has_sold: false,
    attributes,
    sockets: [],
    created_at: `2026-08-01T00:00:0${id}.000Z`,
    expires_at: "2026-09-01T00:00:00.000Z",
    loot_state: "handled"
  };
}
