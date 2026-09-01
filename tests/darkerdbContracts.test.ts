import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  darkerDbMarketResponseSchema,
  darkerDbPriceCheckResponseSchema
} from "../src/adapters/darkerdbContracts";
import {
  averageDarkerDbRecentListings,
  filterDarkerDbMarketCollection,
  mapDarkerDbListingToCandidate,
  mapDarkerDbListingToRecentSale,
  mapDarkerDbPriceReference,
  mapDarkerDbSimilarSaleToRecentSale,
  normalizeDarkerDbRollRange,
  possibleSecondaryAttributesFromPriceCheck
} from "../src/adapters/darkerdbMapping";
import { indexLocalizedCatalog, localizationCatalogSchema } from "../src/domain/localizedCatalog";
import type { RollRule } from "../src/domain/search";

const testRoot = path.dirname(fileURLToPath(import.meta.url));

describe("real DarkerDB live response contracts", () => {
  it("validates active and inferred-sale Market envelopes", async () => {
    const active = darkerDbMarketResponseSchema.parse(
      await fixture("market-active.json")
    );
    const recent = darkerDbMarketResponseSchema.parse(
      await fixture("market-recent-missing.json")
    );

    expect(active.body).toHaveLength(5);
    expect(active.pagination).toMatchObject({
      count: 5,
      page: 1
    });
    expect(active.pagination.num_pages).toBeGreaterThanOrEqual(1);
    expect(active.pagination.total).toBeGreaterThanOrEqual(active.body.length);
    expect(active.pagination.freshness?.status).toMatch(/^(fresh|stale)$/);
    expect(active.body.every((listing) => listing.listing_state === "active")).toBe(true);
    expect(recent.body.every((listing) => listing.listing_state === "missing")).toBe(true);
    expect(recent.body.every((listing) => listing.has_sold && !listing.is_confirmed)).toBe(
      true
    );
  });

  it("averages the lowest three prices from the latest five inferred deals", async () => {
    const recent = darkerDbMarketResponseSchema.parse(
      await fixture("market-recent-missing.json")
    );
    const first = mapDarkerDbListingToRecentSale(recent.body[0]!);
    expect(first).toMatchObject({
      listingId: String(recent.body[0]!.id),
      unitPrice: recent.body[0]!.price_per_unit,
      confirmation: "inferred-disappearance"
    });

    const lowestThreeAverage = [...recent.body]
      .sort((left, right) => left.price_per_unit - right.price_per_unit)
      .slice(0, 3)
      .reduce((sum, listing) => sum + listing.price_per_unit, 0) / 3;
    expect(averageDarkerDbRecentListings(recent.body)).toMatchObject({
      status: "available",
      unitReference: lowestThreeAverage,
      samplesUsed: 3,
      dealsConsidered: 5,
      recentWindowRequested: 5,
      lowestDealsRequested: 3,
      includesInferredSamples: true
    });
  });

  it("validates Price Check and exposes recommendation, comparables, and possible rolls", async () => {
    const response = darkerDbPriceCheckResponseSchema.parse(
      await fixture("price-check.json")
    );

    expect(response.body.similar_sales.length).toBeGreaterThan(0);
    expect(response.body.similar_listings.length).toBeGreaterThan(0);
    expect(mapDarkerDbPriceReference(response.body)).toEqual({
      status: "available",
      source: "darkerdb-price-check",
      unitReference: response.body.valuation.fair_value,
      confidence: response.body.valuation.confidence,
      low: response.body.valuation.low,
      high: response.body.valuation.high,
      lowestAsk: response.body.valuation.lowest_ask,
      quickList: response.body.valuation.quick_list
    });
    expect(mapDarkerDbSimilarSaleToRecentSale(response.body.similar_sales[0]!)).toMatchObject({
      listingId: response.body.similar_sales[0]!.listing_id,
      unitPrice: response.body.similar_sales[0]!.price,
      confirmation: "inferred-disappearance"
    });
    expect(possibleSecondaryAttributesFromPriceCheck(response.body)).toContain(
      "id.attribute.agility"
    );
  });

  it("accepts current object-shaped Price Check selections and normalizes item-detail percentages", async () => {
    const raw = await fixture("price-check.json") as Record<string, unknown>;
    const body = raw.body as Record<string, unknown>;
    body.selection = {
      attributes: { magic_penetration: 2.4 },
      primary: [],
      secondary: []
    };
    const response = darkerDbPriceCheckResponseSchema.parse(raw);
    expect(response.body.selection.attributes).toEqual({ magic_penetration: 2.4 });

    expect(normalizeDarkerDbRollRange({
      attribute_id: "magic_penetration",
      minimum: 15,
      maximum: 30,
      enchanted_min: 15,
      enchanted_max: 30,
      percentage: true
    }, "item-detail")).toMatchObject({
      attributeId: "id.attribute.magic_penetration",
      minimum: 1.5,
      maximum: 3,
      enchantedMinimum: 1.5,
      enchantedMaximum: 3,
      percentage: true
    });
  });

  it("maps bilingual Gear Search candidates and reports matches/evaluated/retrieved/total", async () => {
    const [active, priceCheck, catalog] = await Promise.all([
      fixture("market-active.json").then((raw) =>
        darkerDbMarketResponseSchema.parse(raw)
      ),
      fixture("price-check.json").then((raw) =>
        darkerDbPriceCheckResponseSchema.parse(raw)
      ),
      readFile(
        path.resolve(testRoot, "../fixtures/darkerdb/localization/catalog.json"),
        "utf8"
      ).then((raw) => localizationCatalogSchema.parse(JSON.parse(raw)))
    ]);
    const possibleSecondaryAttributeIds = possibleSecondaryAttributesFromPriceCheck(
      priceCheck.body
    );
    const localizedNames = indexLocalizedCatalog(catalog.items);
    const firstCandidate = mapDarkerDbListingToCandidate(active.body[0]!, {
      localizedNames,
      possibleSecondaryAttributeIds
    });
    expect(firstCandidate.item.name).toMatchObject({
      en: "Occultist Robe",
      zhCN: "术士长袍"
    });
    expect(firstCandidate.item.rolls).toEqual([
      { attributeId: "id.attribute.agility", value: 2 },
      { attributeId: "id.attribute.knowledge", value: 2 }
    ]);

    const rules: RollRule[] = [
      {
        id: "agility",
        attributeId: "id.attribute.agility",
        enabled: true,
        minimum: 2
      },
      {
        id: "knowledge",
        attributeId: "id.attribute.knowledge",
        enabled: true,
        minimum: 2
      },
      {
        id: "weapon-damage",
        attributeId: "id.attribute.weapon_damage",
        enabled: true,
        minimum: 1
      }
    ];
    const summary = filterDarkerDbMarketCollection(
      {
        data: active.body,
        pagesFetched: 1,
        retrievedCount: 5,
        reportedTotal: active.pagination.total,
        complete: false,
        freshness: active.pagination.freshness!
      },
      rules,
      { requiredMatchCount: 2, localizedNames, possibleSecondaryAttributeIds }
    );

    expect(summary.matches).toHaveLength(1);
    expect(summary.evaluatedCount).toBe(5);
    expect(summary.retrievedCount).toBe(5);
    expect(summary.reportedTotal).toBe(active.pagination.total);
    expect(summary.incomplete).toBe(true);
    expect(summary.matches[0]?.evaluations.find((entry) => entry.ruleId === "weapon-damage"))
      .toMatchObject({ matched: false, reason: "naturally-impossible" });
  });
});

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(
    await readFile(path.resolve(testRoot, `../fixtures/darkerdb/live-samples/${name}`), "utf8")
  );
}
