import {
  PINNED_DARKERDB_API_VERSION,
  type DarkerDbPage,
  type MarketPageSource,
  type MarketQuery
} from "../adapters/darkerdb";
import type { DarkerDbMarketListing } from "../adapters/darkerdbContracts";
import {
  MarketplaceSearchCoordinator,
  MarketplaceSearchExecutor
} from "../adapters/marketplaceSearch";
import type { CanonicalId } from "../domain/models";

const previewListings: readonly DarkerDbMarketListing[] = [
  listing(101, "id.item.occultist_robe_4001", "id.item.occultist_robe", "Occultist Robe", "rare", 95, {
    secondary_knowledge: 3,
    secondary_magical_power: 1
  }),
  listing(102, "id.item.occultist_robe_4001", "id.item.occultist_robe", "Occultist Robe", "rare", 120, {
    secondary_strength: 3,
    secondary_knowledge: 2
  }),
  listing(103, "id.item.adventurer_tunic_4001", "id.item.adventurer_tunic", "Adventurer Tunic", "rare", 150, {
    secondary_agility: 2,
    secondary_move_speed_bonus: 1
  }),
  listing(104, "id.item.adventurer_tunic_5001", "id.item.adventurer_tunic", "Adventurer Tunic", "epic", 210, {
    secondary_dexterity: 3,
    secondary_strength: 2
  }),
  listing(105, "id.item.occultist_robe_5001", "id.item.occultist_robe", "Occultist Robe", "epic", 240, {
    secondary_knowledge: 3,
    secondary_physical_damage_reduction: 1.2
  }),
  listing(106, "id.item.longbow_4001", "id.item.longbow", "Longbow", "rare", 260, {
    secondary_physical_power: 2,
    secondary_action_speed: 1
  }, "primary", "weapon"),
  listing(107, "id.item.longbow_4001", "id.item.longbow", "Longbow", "rare", 300, {
    secondary_weapon_damage: 2,
    secondary_action_speed: 1.5
  }, "primary", "weapon"),
  listing(108, "id.item.longbow_5001", "id.item.longbow", "Longbow", "epic", 450, {
    secondary_weapon_damage: 2,
    secondary_physical_power: 2
  }, "primary", "weapon")
];

export function createMarketplacePreviewCoordinator(): MarketplaceSearchCoordinator {
  const source: MarketPageSource<DarkerDbMarketListing> = {
    async getMarket(query) {
      return previewPage(query);
    }
  };
  return new MarketplaceSearchCoordinator(new MarketplaceSearchExecutor(source));
}

function previewPage(query: MarketQuery): DarkerDbPage<DarkerDbMarketListing[]> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const matching = previewListings
    .filter((entry) => query.itemId === undefined || entry.item_id === query.itemId)
    .filter((entry) => query.archetype === undefined || entry.archetype === query.archetype)
    .filter((entry) => query.rarity === undefined || entry.rarity === query.rarity)
    .filter((entry) => query.slotTypes === undefined || query.slotTypes.includes(entry.slot_type))
    .filter((entry) => matchesRange(entry.price, query.price))
    .filter((entry) => matchesRange(entry.price_per_unit, query.pricePerUnit))
    .filter((entry) => query.listingState === undefined || entry.listing_state === query.listingState)
    .filter((entry) => matchesAttributes(entry, query.secondary))
    .sort((left, right) =>
      left.price_per_unit - right.price_per_unit ||
      Date.parse(right.created_at) - Date.parse(left.created_at) ||
      left.id - right.id
    );
  const start = (page - 1) * limit;
  const archetype = matching[0]?.archetype ??
    query.itemId ??
    "id.item.preview_market" as CanonicalId;
  return {
    data: matching.slice(start, start + limit),
    page,
    numPages: Math.ceil(matching.length / limit),
    reportedTotal: matching.length,
    freshness: {
      archetype,
      status: "fresh",
      scan_started_at: "2026-09-01T00:00:00.000Z",
      scan_completed_at: "2026-09-01T00:00:02.000Z",
      age_seconds: 90,
      num_pages: Math.ceil(matching.length / limit),
      num_listings: matching.length
    },
    diagnostics: { contractVersion: PINNED_DARKERDB_API_VERSION }
  };
}

function matchesAttributes(
  listing: DarkerDbMarketListing,
  filters: Readonly<Record<string, string | number>> | undefined
): boolean {
  return Object.entries(filters ?? {}).every(([attribute, range]) => {
    const value = listing.attributes[`secondary_${attribute}`];
    return value !== undefined && matchesRange(value, range);
  });
}

function matchesRange(value: number, range: string | number | undefined): boolean {
  if (range === undefined) return true;
  if (typeof range === "number") return value === range;
  if (range.startsWith(">=")) return value >= Number(range.slice(2));
  if (range.startsWith("<=")) return value <= Number(range.slice(2));
  const [minimum, maximum] = range.split(":").map(Number);
  return minimum !== undefined && maximum !== undefined && value >= minimum && value <= maximum;
}

function listing(
  id: number,
  itemId: CanonicalId,
  archetype: CanonicalId,
  name: string,
  rarity: string,
  price: number,
  attributes: Record<string, number>,
  slotType = "chest",
  itemType = "armor"
): DarkerDbMarketListing {
  return {
    id,
    item_id: itemId,
    archetype,
    name,
    icon: `${id}.png`,
    icon_url: `https://example.test/marketplace-preview/${id}.png`,
    slot_type: slotType,
    item_type: itemType,
    rarity,
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
    created_at: `2026-09-01T00:00:${String(id - 100).padStart(2, "0")}.000Z`,
    expires_at: "2026-09-03T00:00:00.000Z",
    loot_state: "handled"
  };
}
