import { describe, expect, it } from "vitest";
import { MarketplaceSearchExecutor } from "../src/adapters/marketplaceSearch";
import { PINNED_DARKERDB_API_VERSION } from "../src/adapters/darkerdb";
import type { DarkerDbMarketListing } from "../src/adapters/darkerdbContracts";
import {
  applyMarketplaceSpecLocally,
  canApplyMarketplaceSpecLocally
} from "../src/domain/marketplaceLocalFiltering";
import {
  createMarketplaceSearchPlan,
  parseMarketplaceSearchSpec,
  type MarketplaceCatalogItem
} from "../src/domain/marketplaceSearch";
import type { CanonicalId } from "../src/domain/models";

const itemId = "id.item.local_4001" as CanonicalId;
const strength = "id.attribute.strength" as CanonicalId;
const knowledge = "id.attribute.knowledge" as CanonicalId;
const catalog: MarketplaceCatalogItem[] = [{
  id: itemId,
  familyId: "id.item.local",
  rarity: "rare",
  slotType: "chest",
  classIds: [],
  possibleSecondaryAttributeIds: [knowledge, strength]
}];

describe("Marketplace immutable local candidate snapshot", () => {
  it("allows K<N roll changes that do not alter the server candidate query", () => {
    const source = parseMarketplaceSearchSpec({ version: 1 });
    const local = parseMarketplaceSearchSpec({
      version: 1,
      rollRules: [
        { id: "knowledge", attributeId: knowledge, enabled: true, minimum: 3 },
        { id: "strength", attributeId: strength, enabled: true, minimum: 3 }
      ],
      requiredMatchCount: 1
    });

    expect(canApplyMarketplaceSpecLocally(source, local, catalog)).toBe(true);
  });

  it("blocks local application when K=N would push a new server attribute range", () => {
    const source = parseMarketplaceSearchSpec({ version: 1 });
    const unsafe = parseMarketplaceSearchSpec({
      version: 1,
      rollRules: [{ id: "strength", attributeId: strength, enabled: true, minimum: 3 }],
      requiredMatchCount: 1
    });

    expect(canApplyMarketplaceSpecLocally(source, unsafe, catalog)).toBe(false);
  });

  it("re-evaluates every candidate, including prior K-of-N non-matches", async () => {
    const sourceSpec = parseMarketplaceSearchSpec({
      version: 1,
      rollRules: [
        { id: "knowledge", attributeId: knowledge, enabled: true, minimum: 3 },
        { id: "strength", attributeId: strength, enabled: true, minimum: 3 }
      ],
      requiredMatchCount: 1
    });
    const sourceResult = await new MarketplaceSearchExecutor({
      async getMarket() {
        return {
          data: [listing(1, { secondary_strength: 2 }), listing(2, { secondary_strength: 3 })],
          page: 1,
          numPages: 1,
          reportedTotal: 2,
          diagnostics: { contractVersion: PINNED_DARKERDB_API_VERSION }
        };
      }
    }).execute(createMarketplaceSearchPlan(sourceSpec, catalog), catalog);
    const relaxed = parseMarketplaceSearchSpec({
      version: 1,
      rollRules: [
        { id: "knowledge", attributeId: knowledge, enabled: true, minimum: 3 },
        { id: "strength", attributeId: strength, enabled: true, minimum: 2 }
      ],
      requiredMatchCount: 1
    });

    const local = applyMarketplaceSpecLocally(sourceResult, sourceSpec, relaxed, catalog);

    expect(sourceResult).toMatchObject({ evaluatedCount: 2, matchedCount: 1 });
    expect(local).toMatchObject({ evaluatedCount: 2, matchedCount: 2 });
  });
});

function listing(id: number, attributes: Record<string, number>): DarkerDbMarketListing {
  return {
    id,
    item_id: itemId,
    archetype: "id.item.local",
    name: "Local Test",
    icon: "local.png",
    icon_url: "https://example.test/local.png",
    slot_type: "chest",
    item_type: "armor",
    rarity: "rare",
    price: 100,
    price_per_unit: 100,
    quantity: 1,
    listing_state: "active",
    is_confirmed: true,
    has_cancelled: false,
    has_expired: false,
    has_sold: false,
    attributes,
    sockets: [],
    created_at: `2026-09-01T00:00:0${id}.000Z`,
    expires_at: "2026-09-02T00:00:00.000Z",
    loot_state: "handled"
  };
}
