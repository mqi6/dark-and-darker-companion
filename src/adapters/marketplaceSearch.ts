import {
  DarkerDbHttpError,
  type DarkerDbDiagnostics,
  type DarkerDbPage,
  type MarketPageSource,
  type MarketQuery
} from "./darkerdb";
import type {
  DarkerDbFreshness,
  DarkerDbMarketListing
} from "./darkerdbContracts";
import { mapDarkerDbListingToCandidate } from "./darkerdbMapping";
import type { LocalizedGameText } from "../domain/models";
import {
  compareMarketplaceListings,
  evaluateMarketplaceListing,
  type MarketplaceCatalogItem,
  type MarketplaceListingEvaluation,
  type MarketplaceQueryFamily,
  type MarketplaceSearchPlan
} from "../domain/marketplaceSearch";

export const MARKETPLACE_PAGE_CACHE_TTL_MILLISECONDS = 15_000;

export type MarketplaceIncompleteReason =
  | "request-limit"
  | "retrieved-limit"
  | "family-error"
  | "rate-limited"
  | "authentication-error"
  | "server-incomplete";

export interface MarketplaceFamilyResult {
  id: string;
  pagesFetched: number;
  liveRequestCount: number;
  cacheHitCount: number;
  retrievedCount: number;
  reportedTotal?: number;
  complete: boolean;
  freshness?: DarkerDbFreshness;
  error?: {
    kind: "http" | "contract-or-network";
    status?: number;
    message: string;
  };
}

export interface MarketplaceSearchExecutionResult {
  /** Every canonical listing evaluated locally, including K-of-N non-matches. */
  evaluated: readonly MarketplaceListingEvaluation[];
  matches: readonly MarketplaceListingEvaluation[];
  retrievedCount: number;
  evaluatedCount: number;
  matchedCount: number;
  reportedTotal?: number;
  complete: boolean;
  incompleteReasons: readonly MarketplaceIncompleteReason[];
  liveRequestCount: number;
  cacheHitCount: number;
  families: readonly MarketplaceFamilyResult[];
  diagnostics: readonly DarkerDbDiagnostics[];
  fetchedAt: string;
  authoritativeEmpty: boolean;
}

interface CacheEntry {
  page: DarkerDbPage<DarkerDbMarketListing[]>;
  storedAt: number;
}

export class MarketplacePageCache {
  private readonly pages = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMilliseconds = MARKETPLACE_PAGE_CACHE_TTL_MILLISECONDS,
    private readonly now: () => number = Date.now
  ) {}

  get(query: MarketQuery): DarkerDbPage<DarkerDbMarketListing[]> | undefined {
    const key = marketPageCacheKey(query);
    const entry = this.pages.get(key);
    if (entry === undefined) return undefined;
    if (this.now() - entry.storedAt >= this.ttlMilliseconds) {
      this.pages.delete(key);
      return undefined;
    }
    return entry.page;
  }

  set(query: MarketQuery, page: DarkerDbPage<DarkerDbMarketListing[]>): void {
    this.pages.set(marketPageCacheKey(query), { page, storedAt: this.now() });
  }

  clear(): void {
    this.pages.clear();
  }
}

export interface MarketplaceSearchExecutorOptions {
  cache?: MarketplacePageCache;
  now?: () => number;
}

interface MutableFamilyState {
  family: MarketplaceQueryFamily;
  nextPage: number;
  result: MarketplaceFamilyResult;
}

export class MarketplaceSearchExecutor {
  private readonly cache: MarketplacePageCache;
  private readonly now: () => number;

  constructor(
    private readonly source: MarketPageSource<DarkerDbMarketListing>,
    options: MarketplaceSearchExecutorOptions = {}
  ) {
    this.now = options.now ?? Date.now;
    this.cache = options.cache ?? new MarketplacePageCache(undefined, this.now);
  }

  clearCache(): void {
    this.cache.clear();
  }

  async execute(
    plan: MarketplaceSearchPlan,
    catalog: readonly MarketplaceCatalogItem[],
    options: {
      signal?: AbortSignal;
      localizedNames?: ReadonlyMap<MarketplaceCatalogItem["id"], LocalizedGameText>;
    } = {}
  ): Promise<MarketplaceSearchExecutionResult> {
    if (plan.authoritativeEmpty) {
      return emptyResult(new Date(this.now()).toISOString());
    }

    const families: MutableFamilyState[] = plan.families.map((family) => ({
      family,
      nextPage: 1,
      result: {
        id: family.id,
        pagesFetched: 0,
        liveRequestCount: 0,
        cacheHitCount: 0,
        retrievedCount: 0,
        complete: false
      }
    }));
    const rawListings: DarkerDbMarketListing[] = [];
    const diagnostics: DarkerDbDiagnostics[] = [];
    const reasons = new Set<MarketplaceIncompleteReason>();
    let liveRequestCount = 0;
    let cacheHitCount = 0;
    let stopAll = false;

    while (!stopAll && rawListings.length < plan.spec.budget.retrievedLimit) {
      let visitedActiveFamily = false;
      for (const state of families) {
        if (state.result.complete || state.result.error !== undefined) continue;
        visitedActiveFamily = true;
        throwIfAborted(options.signal);

        const remainingRows = plan.spec.budget.retrievedLimit - rawListings.length;
        if (remainingRows <= 0) break;
        const query: MarketQuery = {
          ...state.family.query,
          page: state.nextPage,
          limit: Math.min(plan.spec.budget.pageLimit, remainingRows)
        };
        let page = this.cache.get(query);
        if (page === undefined) {
          if (liveRequestCount >= plan.spec.budget.requestLimit) {
            reasons.add("request-limit");
            stopAll = true;
            break;
          }
          liveRequestCount += 1;
          state.result.liveRequestCount += 1;
          try {
            page = await this.source.getMarket(
              query,
              options.signal === undefined ? {} : { signal: options.signal }
            );
            throwIfAborted(options.signal);
            this.cache.set(query, page);
          } catch (error) {
            if (isAbort(error) || options.signal?.aborted === true) throw error;
            state.result.error = describeError(error);
            reasons.add("family-error");
            if (error instanceof DarkerDbHttpError && error.status === 429) {
              reasons.add("rate-limited");
              stopAll = true;
            } else if (
              error instanceof DarkerDbHttpError &&
              (error.status === 401 || error.status === 403)
            ) {
              reasons.add("authentication-error");
              stopAll = true;
            }
            if (stopAll) break;
            continue;
          }
        } else {
          cacheHitCount += 1;
          state.result.cacheHitCount += 1;
        }

        diagnostics.push(page.diagnostics);
        rawListings.push(...page.data);
        state.result.pagesFetched += 1;
        state.result.retrievedCount += page.data.length;
        state.nextPage += 1;
        if (page.reportedTotal !== undefined) {
          state.result.reportedTotal = page.reportedTotal;
        }
        if (page.freshness !== undefined) state.result.freshness = page.freshness;
        state.result.complete = pageCompletesFamily(page, query, state.result.retrievedCount);

        if (rawListings.length >= plan.spec.budget.retrievedLimit) break;
      }
      if (!visitedActiveFamily) break;
    }

    const hasIncompleteFamily = families.some((state) => !state.result.complete);
    if (
      rawListings.length >= plan.spec.budget.retrievedLimit &&
      hasIncompleteFamily &&
      !reasons.has("request-limit")
    ) {
      reasons.add("retrieved-limit");
    }
    if (hasIncompleteFamily && reasons.size === 0) reasons.add("server-incomplete");

    const itemById = new Map(catalog.map((item) => [item.id, item]));
    const allowedIds = new Set(plan.allowedItemIds);
    const deduplicated = new Map<number, DarkerDbMarketListing>();
    for (const listing of rawListings) {
      if (!deduplicated.has(listing.id)) deduplicated.set(listing.id, listing);
    }
    const evaluatedListings: MarketplaceListingEvaluation[] = [];
    const matches: MarketplaceListingEvaluation[] = [];
    let evaluatedCount = 0;
    for (const listing of deduplicated.values()) {
      const item = itemById.get(listing.item_id);
      if (item === undefined || !allowedIds.has(listing.item_id)) continue;
      const candidate = mapDarkerDbListingToCandidate(listing, {
        ...(options.localizedNames === undefined
          ? {}
          : { localizedNames: options.localizedNames }),
        ...(item.possibleSecondaryAttributeIds === undefined
          ? {}
          : { possibleSecondaryAttributeIds: item.possibleSecondaryAttributeIds })
      });
      const evaluated = evaluateMarketplaceListing(listing, item, candidate, plan.spec);
      if (evaluated !== undefined) {
        evaluatedCount += 1;
        evaluatedListings.push(evaluated);
        if (evaluated.evaluation.passed) matches.push(evaluated);
      }
    }
    evaluatedListings.sort(compareMarketplaceListings);
    matches.sort(compareMarketplaceListings);

    const familyResults = families.map((state) => state.result);
    const everyFamilyReportsTotal = familyResults.every(
      (family) => family.reportedTotal !== undefined
    );
    const reportedTotal = everyFamilyReportsTotal
      ? familyResults.reduce((sum, family) => sum + (family.reportedTotal ?? 0), 0)
      : undefined;

    return {
      evaluated: evaluatedListings,
      matches,
      retrievedCount: rawListings.length,
      evaluatedCount,
      matchedCount: matches.length,
      ...(reportedTotal === undefined ? {} : { reportedTotal }),
      complete: familyResults.every((family) => family.complete),
      incompleteReasons: [...reasons],
      liveRequestCount,
      cacheHitCount,
      families: familyResults,
      diagnostics,
      fetchedAt: new Date(this.now()).toISOString(),
      authoritativeEmpty: false
    };
  }
}

export type MarketplaceCoordinatedSearchResult =
  | {
      status: "completed";
      generation: number;
      result: MarketplaceSearchExecutionResult;
    }
  | { status: "superseded" | "cancelled"; generation: number };

export class MarketplaceSearchCoordinator {
  private generation = 0;
  private controller: AbortController | undefined;

  constructor(private readonly executor: MarketplaceSearchExecutor) {}

  async search(
    plan: MarketplaceSearchPlan,
    catalog: readonly MarketplaceCatalogItem[],
    localizedNames?: ReadonlyMap<MarketplaceCatalogItem["id"], LocalizedGameText>
  ): Promise<MarketplaceCoordinatedSearchResult> {
    this.controller?.abort();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const result = await this.executor.execute(plan, catalog, {
        signal: controller.signal,
        ...(localizedNames === undefined ? {} : { localizedNames })
      });
      if (generation !== this.generation) return { status: "superseded", generation };
      this.controller = undefined;
      return { status: "completed", generation, result };
    } catch (error) {
      if (!isAbort(error) && !controller.signal.aborted) {
        if (generation === this.generation) this.controller = undefined;
        throw error;
      }
      return {
        status: generation === this.generation ? "cancelled" : "superseded",
        generation
      };
    }
  }

  async refresh(
    plan: MarketplaceSearchPlan,
    catalog: readonly MarketplaceCatalogItem[],
    localizedNames?: ReadonlyMap<MarketplaceCatalogItem["id"], LocalizedGameText>
  ): Promise<MarketplaceCoordinatedSearchResult> {
    this.executor.clearCache();
    return this.search(plan, catalog, localizedNames);
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = undefined;
  }
}

function marketPageCacheKey(query: MarketQuery): string {
  return JSON.stringify({
    ...query,
    slotTypes: query.slotTypes === undefined ? undefined : [...query.slotTypes].sort(),
    primary: sortedRecord(query.primary),
    secondary: sortedRecord(query.secondary)
  });
}

function sortedRecord(
  value: Readonly<Record<string, string | number>> | undefined
): Readonly<Record<string, string | number>> | undefined {
  if (value === undefined) return undefined;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function pageCompletesFamily(
  page: DarkerDbPage<DarkerDbMarketListing[]>,
  query: MarketQuery,
  familyRetrievedCount: number
): boolean {
  const requestedPage = query.page ?? 1;
  const limit = query.limit ?? 50;
  return (
    page.data.length === 0 ||
    page.data.length < limit ||
    (page.numPages !== undefined && (page.page ?? requestedPage) >= page.numPages) ||
    (page.reportedTotal !== undefined && familyRetrievedCount >= page.reportedTotal)
  );
}

function describeError(error: unknown): NonNullable<MarketplaceFamilyResult["error"]> {
  if (error instanceof DarkerDbHttpError) {
    return { kind: "http", status: error.status, message: error.message };
  }
  return {
    kind: "contract-or-network",
    message: error instanceof Error ? error.message : "Unknown Marketplace request failure"
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw signal.reason ?? new DOMException("Aborted", "AbortError");
}

function isAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function emptyResult(fetchedAt: string): MarketplaceSearchExecutionResult {
  return {
    evaluated: [],
    matches: [],
    retrievedCount: 0,
    evaluatedCount: 0,
    matchedCount: 0,
    reportedTotal: 0,
    complete: true,
    incompleteReasons: [],
    liveRequestCount: 0,
    cacheHitCount: 0,
    families: [],
    diagnostics: [],
    fetchedAt,
    authoritativeEmpty: true
  };
}
