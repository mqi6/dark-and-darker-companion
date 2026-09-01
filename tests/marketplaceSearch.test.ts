import { describe, expect, it } from "vitest";
import type { DarkerDbMarketListing } from "../src/adapters/darkerdbContracts";
import type { CanonicalId, MarketCandidate } from "../src/domain/models";
import {
  catalogItemMatchesSpec,
  compareMarketplaceListings,
  createMarketplaceSearchPlan,
  evaluateMarketplaceListing,
  parseMarketplaceSearchSpec,
  type MarketplaceCatalogItem
} from "../src/domain/marketplaceSearch";

const fighter = "id.class.fighter" as CanonicalId;
const wizard = "id.class.wizard" as CanonicalId;
const strength = "id.attribute.strength" as CanonicalId;
const moveSpeed = "id.attribute.move_speed" as CanonicalId;

const catalog: MarketplaceCatalogItem[] = [
  item("id.item.robe_3001", "id.archetype.robe", "rare", [wizard]),
  item("id.item.robe_4001", "id.archetype.robe", "epic", [wizard]),
  item("id.item.tunic_3001", "id.archetype.tunic", "rare", [fighter]),
  item("id.item.ring_3001", "id.archetype.ring", "rare", [])
];

describe("Marketplace search specification and planning", () => {
  it("normalizes unordered selections into a stable fingerprint", () => {
    const first = createMarketplaceSearchPlan(
      { version: 1, classIds: [wizard, fighter], rarities: ["EPIC", "rare"] },
      catalog
    );
    const second = createMarketplaceSearchPlan(
      { version: 1, classIds: [fighter, wizard], rarities: ["rare", "epic"] },
      catalog
    );
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.spec.rarities).toEqual(["epic", "rare"]);
  });

  it("uses OR across selected classes and includes unrestricted items", () => {
    const spec = parseMarketplaceSearchSpec({ version: 1, classIds: [wizard] });
    expect(catalogItemMatchesSpec(catalog[0]!, spec)).toBe(true);
    expect(catalogItemMatchesSpec(catalog[2]!, spec)).toBe(false);
    expect(catalogItemMatchesSpec(catalog[3]!, spec)).toBe(true);
  });

  it("resolves a selected family and rarity to concrete canonical item IDs", () => {
    const plan = createMarketplaceSearchPlan(
      { version: 1, familyIds: ["id.archetype.robe"], rarities: ["epic"] },
      catalog
    );
    expect(plan.allowedItemIds).toEqual(["id.item.robe_4001"]);
    expect(plan.families).toEqual([
      expect.objectContaining({
        id: "item:id.item.robe_4001",
        query: expect.objectContaining({ itemId: "id.item.robe_4001", listingState: "active" })
      })
    ]);
  });

  it("splits broad multi-rarity searches into one safe request family per rarity", () => {
    const plan = createMarketplaceSearchPlan(
      { version: 1, rarities: ["rare", "epic"] },
      catalog
    );
    expect(plan.families.map((family) => family.query.rarity)).toEqual(["epic", "rare"]);
    expect(plan.families.every((family) => family.query.rarities === undefined)).toBe(true);
  });

  it("pushes only mandatory bounded rolls for K=N and keeps K<N local", () => {
    const all = createMarketplaceSearchPlan(
      {
        version: 1,
        rollRules: [
          { id: "strength", attributeId: strength, enabled: true, minimum: 2 },
          { id: "speed", attributeId: moveSpeed, enabled: true }
        ],
        requiredMatchCount: 2
      },
      catalog
    );
    expect(all.families[0]?.query.secondary).toEqual({ strength: ">=2" });

    const any = createMarketplaceSearchPlan(
      {
        version: 1,
        rollRules: [
          { id: "strength", attributeId: strength, enabled: true, minimum: 2 },
          { id: "speed", attributeId: moveSpeed, enabled: true, minimum: 1 }
        ],
        requiredMatchCount: 1
      },
      catalog
    );
    expect(any.families[0]?.query.secondary).toBeUndefined();
  });

  it("maps unit price and slot filters to API-safe query parameters", () => {
    const plan = createMarketplaceSearchPlan(
      {
        version: 1,
        slotTypes: ["Chest"],
        price: { basis: "unit", range: { minimum: 50, maximum: 200 } },
        locale: "zh-CN"
      },
      catalog
    );
    expect(plan.families[0]?.query).toMatchObject({
      slotTypes: ["chest"],
      pricePerUnit: "50:200",
      locale: "zh-Hans",
      sort: "price_per_unit:asc,created_at:desc,id:asc"
    });
  });

  it("rejects invalid ranges, K values, and duplicate enabled attributes", () => {
    expect(() =>
      parseMarketplaceSearchSpec({
        version: 1,
        price: { basis: "unit", range: { minimum: 20, maximum: 10 } }
      })
    ).toThrow();
    expect(() => parseMarketplaceSearchSpec({ version: 1, requiredMatchCount: 1 })).toThrow();
    expect(() =>
      parseMarketplaceSearchSpec({
        version: 1,
        rollRules: [
          { id: "one", attributeId: strength, enabled: true },
          { id: "two", attributeId: strength, enabled: true }
        ],
        requiredMatchCount: 1
      })
    ).toThrow();
  });

  it("returns an authoritative empty plan without broadening the API query", () => {
    const plan = createMarketplaceSearchPlan(
      { version: 1, familyIds: ["id.archetype.missing"] },
      catalog
    );
    expect(plan).toMatchObject({ authoritativeEmpty: true, families: [], allowedItemIds: [] });
  });
});

describe("Marketplace local filtering", () => {
  it("keeps an impossible roll local to that rule and allows another rule to satisfy K", () => {
    const selected = item(
      "id.item.robe_3001",
      "id.archetype.robe",
      "rare",
      [wizard],
      [strength]
    );
    const spec = parseMarketplaceSearchSpec({
      version: 1,
      rollRules: [
        { id: "speed", attributeId: moveSpeed, enabled: true, minimum: 1 },
        { id: "strength", attributeId: strength, enabled: true, minimum: 2 }
      ],
      requiredMatchCount: 1
    });
    const row = listing(1, selected.id, 100, 1, { secondary_strength: 3 });
    const candidate = marketCandidate(row, [strength]);
    const result = evaluateMarketplaceListing(row, selected, candidate, spec);
    expect(result?.evaluation).toMatchObject({ passed: true, matchCount: 1 });
    expect(result?.evaluation.evaluations[0]?.reason).toBe("naturally-impossible");
  });

  it("orders deterministically by unit price, newest creation time, then listing ID", () => {
    const spec = parseMarketplaceSearchSpec({ version: 1 });
    const selected = catalog[0]!;
    const rows = [
      listing(2, selected.id, 100, 1, {}, "2026-08-01T00:00:00.000Z"),
      listing(3, selected.id, 200, 2, {}, "2026-08-02T00:00:00.000Z"),
      listing(1, selected.id, 100, 1, {}, "2026-08-02T00:00:00.000Z")
    ].map((row) => evaluateMarketplaceListing(row, selected, marketCandidate(row), spec)!);
    expect(rows.sort(compareMarketplaceListings).map((row) => row.listing.id)).toEqual([1, 3, 2]);
  });
});

function item(
  id: CanonicalId,
  familyId: CanonicalId,
  rarity: string,
  classIds: CanonicalId[],
  possibleSecondaryAttributeIds?: CanonicalId[]
): MarketplaceCatalogItem {
  return {
    id,
    familyId,
    rarity,
    itemType: familyId.includes("ring") ? "accessory" : "armor",
    slotType: familyId.includes("ring") ? "finger" : "chest",
    armorType: "cloth",
    classIds,
    ...(possibleSecondaryAttributeIds === undefined
      ? {}
      : { possibleSecondaryAttributeIds })
  };
}

function listing(
  id: number,
  itemId: CanonicalId,
  price: number,
  quantity: number,
  attributes: Record<string, number>,
  createdAt = "2026-08-01T00:00:00.000Z"
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
    price_per_unit: price / quantity,
    quantity,
    listing_state: "active",
    is_confirmed: true,
    has_cancelled: false,
    has_expired: false,
    has_sold: false,
    attributes,
    sockets: [],
    created_at: createdAt,
    expires_at: "2026-09-01T00:00:00.000Z",
    loot_state: "handled"
  };
}

function marketCandidate(
  row: DarkerDbMarketListing,
  possibleSecondaryAttributeIds?: CanonicalId[]
): MarketCandidate {
  return {
    listingId: String(row.id),
    item: {
      instanceKey: `market:${row.id}`,
      itemId: row.item_id,
      name: { id: row.item_id, en: row.name, zhStatus: "english-fallback" },
      quantity: row.quantity,
      rolls: Object.entries(row.attributes).map(([attribute, value]) => ({
        attributeId: `id.attribute.${attribute.replace("secondary_", "")}`,
        value
      })),
      ...(possibleSecondaryAttributeIds === undefined
        ? {}
        : { possibleSecondaryAttributeIds })
    },
    price: row.price,
    createdAt: row.created_at
  };
}
