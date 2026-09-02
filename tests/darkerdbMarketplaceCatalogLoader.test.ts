import { describe, expect, it, vi } from "vitest";
import type { DarkerDbClient, DarkerDbPage } from "../src/adapters/darkerdb";
import {
  darkerDbAttributeSchema,
  darkerDbClassSchema,
  darkerDbFacetsBodySchema,
  darkerDbGameplayItemSchema
} from "../src/adapters/darkerdbContracts";
import { DarkerDbMarketplaceCatalogLoader } from "../src/adapters/darkerdbMarketplaceCatalogLoader";
import type { MarketplaceCatalogCacheEntry } from "../src/adapters/darkerdbMarketplaceCatalogLoader";

describe("DarkerDB Marketplace catalog loader", () => {
  it("collects both locales once, reuses a bounded cache, and refreshes explicitly", async () => {
    let now = Date.parse("2026-09-01T00:00:00.000Z");
    const item = darkerDbGameplayItemSchema.parse({
      id: "id.item.robe_4001",
      archetype: "id.item.robe",
      name: "Robe",
      rarity: "rare",
      max_stack_size: 1
    });
    const attribute = darkerDbAttributeSchema.parse({
      id: "id.attribute.strength",
      name: "Strength",
      description: "",
      is_percentage: false,
      attribute_group: "secondary"
    });
    const characterClass = darkerDbClassSchema.parse({ id: "id.class.wizard", name: "Wizard" });
    const facets = darkerDbFacetsBodySchema.parse({ facets: {} });
    const client = {
      getGameplayItems: vi.fn(async (parameters: { locale?: string }) =>
        page([{ ...item, name: parameters.locale === "zh-Hans" ? "长袍" : "Robe" }])
      ),
      getAttributes: vi.fn(async (parameters: { locale?: string }) =>
        page([{ ...attribute, name: parameters.locale === "zh-Hans" ? "力量" : "Strength" }])
      ),
      getClasses: vi.fn(async (parameters: { locale?: string }) =>
        page([{ ...characterClass, name: parameters.locale === "zh-Hans" ? "法师" : "Wizard" }])
      ),
      getFacets: vi.fn(async () => page(facets))
    } as unknown as Pick<
      DarkerDbClient,
      "getGameplayItems" | "getAttributes" | "getClasses" | "getFacets"
    >;
    const loader = new DarkerDbMarketplaceCatalogLoader(client, { now: () => now });

    const live = await loader.load();
    now += 1_000;
    const cached = await loader.load();
    const refreshed = await loader.load({ refresh: true });

    expect(live.catalog.source).toBe("darkerdb-live");
    expect(cached.catalog.source).toBe("darkerdb-cache");
    expect(refreshed.catalog.source).toBe("darkerdb-live");
    expect(live.catalog.families[0]).toMatchObject({ en: "Robe", zhCN: "长袍" });
    expect(client.getGameplayItems).toHaveBeenCalledTimes(4);
    expect(client.getFacets).toHaveBeenCalledTimes(4);
  });

  it("reuses a 24-hour persistent cache across loader instances", async () => {
    let now = Date.parse("2026-09-01T00:00:00.000Z");
    let stored: MarketplaceCatalogCacheEntry | undefined;
    const item = darkerDbGameplayItemSchema.parse({
      id: "id.item.robe_4001",
      archetype: "id.item.robe",
      name: "Robe",
      rarity: "rare",
      max_stack_size: 1
    });
    const attribute = darkerDbAttributeSchema.parse({
      id: "id.attribute.strength",
      name: "Strength",
      description: "",
      is_percentage: false,
      attribute_group: "secondary"
    });
    const characterClass = darkerDbClassSchema.parse({ id: "id.class.wizard", name: "Wizard" });
    const facets = darkerDbFacetsBodySchema.parse({ facets: {} });
    const client = {
      getGameplayItems: vi.fn(async () => page([item])),
      getAttributes: vi.fn(async () => page([attribute])),
      getClasses: vi.fn(async () => page([characterClass])),
      getFacets: vi.fn(async () => page(facets))
    } as unknown as Pick<
      DarkerDbClient,
      "getGameplayItems" | "getAttributes" | "getClasses" | "getFacets"
    >;
    const persistentCache = {
      load: vi.fn(async () => stored),
      save: vi.fn(async (entry: MarketplaceCatalogCacheEntry) => { stored = entry; })
    };

    const firstLoader = new DarkerDbMarketplaceCatalogLoader(client, {
      now: () => now,
      persistentCache
    });
    expect((await firstLoader.load()).catalog.source).toBe("darkerdb-live");
    expect(client.getGameplayItems).toHaveBeenCalledTimes(2);

    now += 24 * 60 * 60 * 1_000 - 1;
    const restartedLoader = new DarkerDbMarketplaceCatalogLoader(client, {
      now: () => now,
      persistentCache
    });
    expect((await restartedLoader.load()).catalog.source).toBe("darkerdb-cache");
    expect(client.getGameplayItems).toHaveBeenCalledTimes(2);

    now += 2;
    const expiredLoader = new DarkerDbMarketplaceCatalogLoader(client, {
      now: () => now,
      persistentCache
    });
    expect((await expiredLoader.load()).catalog.source).toBe("darkerdb-live");
    expect(client.getGameplayItems).toHaveBeenCalledTimes(4);
  });
});

function page<T>(data: T): DarkerDbPage<T> {
  return {
    data,
    diagnostics: { contractVersion: "2026-08-03" }
  };
}
