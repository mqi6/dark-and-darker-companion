// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MarketplaceCatalogCacheEntry } from "../src/adapters/darkerdbMarketplaceCatalogLoader";
import type { CanonicalId } from "../src/domain/models";
import { marketplacePreviewCatalog } from "../src/ui/marketplacePreviewCatalog";
import {
  MarketplaceCatalogDiskCache,
  defaultMarketplaceCatalogCachePath
} from "../tools/marketplaceCatalogDiskCache";

const temporaryDirectories: string[] = [];

describe("Marketplace catalog disk cache", () => {
  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ));
  });

  it("round-trips the normalized catalog and canonical localized-name map", async () => {
    const directory = await temporaryDirectory();
    const filePath = join(directory, "nested", "catalog.json");
    const cache = new MarketplaceCatalogDiskCache(filePath);
    const itemId = "id.item.occultist_robe_4001" as CanonicalId;
    const entry: MarketplaceCatalogCacheEntry = {
      storedAt: Date.parse("2026-09-01T00:00:00.000Z"),
      snapshot: {
        catalog: { ...marketplacePreviewCatalog, source: "darkerdb-live" },
        localizedItemNames: new Map([[itemId, {
          id: itemId,
          en: "Occultist Robe",
          zhCN: "神秘学长袍",
          zhStatus: "translated"
        }]]),
        omittedItemIds: []
      }
    };

    await cache.save(entry);
    const loaded = await cache.load();

    expect(loaded?.storedAt).toBe(entry.storedAt);
    expect(loaded?.snapshot.catalog.items).toEqual(marketplacePreviewCatalog.items);
    expect(loaded?.snapshot.localizedItemNames).toBeInstanceOf(Map);
    expect(loaded?.snapshot.localizedItemNames.get(itemId)?.zhCN).toBe("神秘学长袍");
  });

  it("ignores corrupt or obsolete cache files", async () => {
    const directory = await temporaryDirectory();
    const filePath = join(directory, "catalog.json");
    const cache = new MarketplaceCatalogDiskCache(filePath);

    await writeFile(filePath, "not json", "utf8");
    await expect(cache.load()).resolves.toBeUndefined();
    await writeFile(filePath, JSON.stringify({ version: 0 }), "utf8");
    await expect(cache.load()).resolves.toBeUndefined();
  });

  it("supports an explicit cache path override", () => {
    expect(defaultMarketplaceCatalogCachePath({
      DARKERDB_CATALOG_CACHE_PATH: "C:\\companion\\catalog.json"
    })).toBe("C:\\companion\\catalog.json");
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "marketplace-catalog-cache-"));
  temporaryDirectories.push(directory);
  return directory;
}
