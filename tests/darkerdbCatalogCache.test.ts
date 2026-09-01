import { describe, expect, it } from "vitest";
import {
  DarkerDbCatalogCache,
  type DarkerDbCatalogCacheKey
} from "../src/adapters/darkerdbCatalogCache";

const baseKey: DarkerDbCatalogCacheKey = {
  contractVersion: "2026-08-03",
  patch: 132,
  locale: "en",
  resource: "attributes"
};

describe("DarkerDB catalog cache", () => {
  it("isolates entries by contract, patch, locale, and canonical resource", () => {
    const cache = new DarkerDbCatalogCache<readonly string[]>();
    cache.set(baseKey, ["strength"]);

    expect(cache.get(baseKey)).toEqual(["strength"]);
    expect(cache.get({ ...baseKey, patch: 133 })).toBeUndefined();
    expect(cache.get({ ...baseKey, locale: "zh-Hans" })).toBeUndefined();
    expect(cache.get({ ...baseKey, resource: "classes" })).toBeUndefined();
  });

  it("expires static data after its bounded lifetime", () => {
    let now = 1_000;
    const cache = new DarkerDbCatalogCache<string>(300_000, () => now);
    cache.set(baseKey, "catalog");
    now += 300_001;

    expect(cache.get(baseKey)).toBeUndefined();
  });
});
