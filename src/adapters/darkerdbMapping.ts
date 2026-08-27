import type { CanonicalId, LocalizedGameText, MarketCandidate } from "../domain/models";
import {
  averageRecentSales,
  type RecentAveragePolicy,
  type RecentAverageResult,
  type RecentSaleSample
} from "../domain/pricing";
import {
  filterCandidates,
  type FilterSummary,
  type RollRule
} from "../domain/search";
import type { MarketCollection } from "./darkerdb";
import type {
  DarkerDbMarketListing,
  DarkerDbPriceCheckBody,
  DarkerDbSimilarSale
} from "./darkerdbContracts";

export type DarkerDbPriceReference =
  | {
      status: "available";
      source: "darkerdb-price-check";
      unitReference: number;
      confidence: string;
      low?: number;
      high?: number;
      lowestAsk?: number;
      quickList?: number;
    }
  | {
      status: "unknown";
      alertKey: "auction.priceUnknown";
      reason: "fair-value-unavailable";
    };

export interface MarketCandidateMappingOptions {
  localizedNames?: ReadonlyMap<CanonicalId, LocalizedGameText>;
  possibleSecondaryAttributeIds?: readonly CanonicalId[];
}

export function mapDarkerDbListingToCandidate(
  listing: DarkerDbMarketListing,
  options: MarketCandidateMappingOptions = {}
): MarketCandidate {
  const localizedName = options.localizedNames?.get(listing.item_id);
  const name: LocalizedGameText = localizedName ?? {
    id: listing.item_id,
    en: listing.name,
    zhStatus: listing.name.trim() === "" ? "missing" : "english-fallback"
  };

  return {
    listingId: String(listing.id),
    item: {
      instanceKey: `market:${listing.id}`,
      itemId: listing.item_id,
      name,
      quantity: listing.quantity,
      rarity: listing.rarity,
      rolls: Object.entries(listing.attributes)
        .filter(([key]) => key.startsWith("secondary_"))
        .map(([key, value]) => ({
          attributeId: canonicalAttributeId(key.slice("secondary_".length)),
          value
        })),
      ...(options.possibleSecondaryAttributeIds === undefined
        ? {}
        : { possibleSecondaryAttributeIds: options.possibleSecondaryAttributeIds })
    },
    price: listing.price,
    createdAt: listing.created_at
  };
}

export function possibleSecondaryAttributesFromPriceCheck(
  priceCheck: DarkerDbPriceCheckBody
): readonly CanonicalId[] {
  return priceCheck.available_attributes.secondary.map((attribute) =>
    canonicalAttributeId(attribute.attribute_id)
  );
}

export function mapDarkerDbListingToRecentSale(
  listing: DarkerDbMarketListing
): RecentSaleSample | undefined {
  if (
    listing.listing_state !== "missing" ||
    !listing.has_sold ||
    listing.has_cancelled ||
    listing.has_expired ||
    listing.missing_at === undefined
  ) {
    return undefined;
  }

  return {
    listingId: String(listing.id),
    unitPrice: listing.price_per_unit,
    closedAt: listing.missing_at,
    confirmation: listing.is_confirmed ? "confirmed" : "inferred-disappearance"
  };
}

export function averageDarkerDbRecentListings(
  listings: readonly DarkerDbMarketListing[],
  policy?: RecentAveragePolicy
): RecentAverageResult {
  const samples = listings.flatMap((listing) => {
    const sample = mapDarkerDbListingToRecentSale(listing);
    return sample === undefined ? [] : [sample];
  });
  return policy === undefined
    ? averageRecentSales(samples)
    : averageRecentSales(samples, policy);
}

export function filterDarkerDbMarketCollection(
  collection: MarketCollection<DarkerDbMarketListing>,
  rules: readonly RollRule[],
  options: MarketCandidateMappingOptions & { requiredMatchCount: number }
): FilterSummary {
  const candidates = collection.data.map((listing) =>
    mapDarkerDbListingToCandidate(listing, options)
  );
  return filterCandidates(candidates, rules, {
    requiredMatchCount: options.requiredMatchCount,
    ...(collection.reportedTotal === undefined
      ? {}
      : { reportedTotal: collection.reportedTotal }),
    stoppedEarly: !collection.complete
  });
}

export function mapDarkerDbSimilarSaleToRecentSale(
  sale: DarkerDbSimilarSale
): RecentSaleSample {
  const confirmation = comparableConfirmation(sale.evidence_type, sale.state_source);
  return {
    listingId: sale.listing_id,
    unitPrice: sale.price,
    closedAt: sale.sold_at,
    confirmation
  };
}

export function mapDarkerDbPriceReference(
  priceCheck: DarkerDbPriceCheckBody
): DarkerDbPriceReference {
  const valuation = priceCheck.valuation;
  if (valuation.fair_value === null || valuation.fair_value <= 0) {
    return {
      status: "unknown",
      alertKey: "auction.priceUnknown",
      reason: "fair-value-unavailable"
    };
  }

  return {
    status: "available",
    source: "darkerdb-price-check",
    unitReference: valuation.fair_value,
    confidence: valuation.confidence,
    ...(valuation.low === null ? {} : { low: valuation.low }),
    ...(valuation.high === null ? {} : { high: valuation.high }),
    ...(valuation.lowest_ask === null ? {} : { lowestAsk: valuation.lowest_ask }),
    ...(valuation.quick_list === null ? {} : { quickList: valuation.quick_list })
  };
}

function canonicalAttributeId(attribute: string): CanonicalId {
  if (!/^[a-z0-9_]+$/.test(attribute)) {
    throw new Error(`Unsupported DarkerDB attribute ID: ${attribute}`);
  }
  return `id.attribute.${attribute}`;
}

function comparableConfirmation(
  evidenceType: string,
  stateSource: string
): RecentSaleSample["confirmation"] {
  if (evidenceType === "inferred_disappearance" && stateSource === "inferred") {
    return "inferred-disappearance";
  }
  if (stateSource === "confirmed") {
    return "confirmed";
  }
  throw new Error(
    `Unsupported DarkerDB sale evidence combination: ${evidenceType}/${stateSource}`
  );
}
