import type { MarketplaceSearchExecutionResult } from "../adapters/marketplaceSearch";
import {
  compareMarketplaceListings,
  createMarketplaceSearchPlan,
  evaluateMarketplaceListing,
  parseMarketplaceSearchSpec,
  type MarketplaceCatalogItem,
  type MarketplaceSearchSpec
} from "./marketplaceSearch";

/**
 * Local re-filtering is safe only when both specs would request the same
 * canonical candidate superset. Locale, paging budget and presentation-only
 * roll rules that are not pushed to the server do not change that superset.
 */
export function canApplyMarketplaceSpecLocally(
  sourceSpec: MarketplaceSearchSpec,
  draftSpec: MarketplaceSearchSpec,
  catalog: readonly MarketplaceCatalogItem[]
): boolean {
  return serverCandidateSignature(sourceSpec, catalog) === serverCandidateSignature(draftSpec, catalog);
}

export function applyMarketplaceSpecLocally(
  source: MarketplaceSearchExecutionResult,
  sourceSpec: MarketplaceSearchSpec,
  draftSpec: MarketplaceSearchSpec,
  catalog: readonly MarketplaceCatalogItem[]
): MarketplaceSearchExecutionResult | undefined {
  if (!canApplyMarketplaceSpecLocally(sourceSpec, draftSpec, catalog)) return undefined;

  const itemById = new Map(catalog.map((item) => [item.id, item]));
  const evaluated = source.evaluated.flatMap((previous) => {
    const item = itemById.get(previous.listing.item_id);
    if (item === undefined) return [];
    const next = evaluateMarketplaceListing(
      previous.listing,
      item,
      previous.evaluation.candidate,
      draftSpec
    );
    return next === undefined ? [] : [next];
  });
  evaluated.sort(compareMarketplaceListings);
  const matches = evaluated.filter((entry) => entry.evaluation.passed);

  return {
    ...source,
    evaluated,
    matches,
    evaluatedCount: evaluated.length,
    matchedCount: matches.length
  };
}

function serverCandidateSignature(
  spec: MarketplaceSearchSpec,
  catalog: readonly MarketplaceCatalogItem[]
): string {
  const normalized = parseMarketplaceSearchSpec({
    ...spec,
    locale: "en-US",
    budget: {
      requestLimit: 1,
      retrievedLimit: 1,
      pageLimit: 1
    }
  });
  const plan = createMarketplaceSearchPlan(normalized, catalog);
  return JSON.stringify({
    allowedItemIds: plan.allowedItemIds,
    authoritativeEmpty: plan.authoritativeEmpty,
    families: plan.families.map((family) => ({
      id: family.id,
      query: Object.fromEntries(
        Object.entries(family.query).filter(([key]) => key !== "locale" && key !== "limit")
      )
    }))
  });
}
