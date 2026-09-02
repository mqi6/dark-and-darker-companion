import {
  collectDarkerDbCursorPages,
  type DarkerDbClient,
  type DarkerDbCursorCollection
} from "./darkerdb";
import type {
  DarkerDbAttribute,
  DarkerDbClass,
  DarkerDbGameplayItem
} from "./darkerdbContracts";
import {
  buildDarkerDbMarketplaceFilterCatalog,
  type DarkerDbMarketplaceCatalogSnapshot
} from "./darkerdbMarketplaceFilterCatalog";
import { VERIFIED_DARKERDB_SIMPLIFIED_CHINESE_LOCALE } from "../domain/localizedCatalog";

export const MARKETPLACE_CATALOG_CACHE_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;

export interface MarketplaceCatalogCacheEntry {
  snapshot: DarkerDbMarketplaceCatalogSnapshot;
  storedAt: number;
}

export interface MarketplaceCatalogPersistentCache {
  load(): Promise<MarketplaceCatalogCacheEntry | undefined>;
  save(entry: MarketplaceCatalogCacheEntry): Promise<void>;
}

export class DarkerDbMarketplaceCatalogLoader {
  private cached: { snapshot: DarkerDbMarketplaceCatalogSnapshot; storedAt: number } | undefined;
  private inFlight: Promise<DarkerDbMarketplaceCatalogSnapshot> | undefined;

  constructor(
    private readonly client: Pick<
      DarkerDbClient,
      "getGameplayItems" | "getAttributes" | "getClasses" | "getFacets"
    >,
    private readonly options: {
      maxAgeMilliseconds?: number;
      now?: () => number;
      persistentCache?: MarketplaceCatalogPersistentCache;
      simplifiedChineseLocale?: string;
    } = {}
  ) {}

  async load(parameters: { refresh?: boolean; signal?: AbortSignal } = {}): Promise<DarkerDbMarketplaceCatalogSnapshot> {
    const now = (this.options.now ?? Date.now)();
    const maxAge = this.options.maxAgeMilliseconds ?? MARKETPLACE_CATALOG_CACHE_TTL_MILLISECONDS;
    if (!parameters.refresh && this.cached && now - this.cached.storedAt < maxAge) {
      return {
        ...this.cached.snapshot,
        catalog: { ...this.cached.snapshot.catalog, source: "darkerdb-cache" }
      };
    }
    if (!parameters.refresh && this.inFlight) return this.inFlight;

    const promise = this.loadSnapshot(parameters);
    this.inFlight = promise;
    try {
      const snapshot = await promise;
      return snapshot;
    } finally {
      if (this.inFlight === promise) this.inFlight = undefined;
    }
  }

  clear(): void {
    this.cached = undefined;
  }

  private async loadSnapshot(parameters: {
    refresh?: boolean;
    signal?: AbortSignal;
  }): Promise<DarkerDbMarketplaceCatalogSnapshot> {
    const now = (this.options.now ?? Date.now)();
    const maxAge = this.options.maxAgeMilliseconds ?? MARKETPLACE_CATALOG_CACHE_TTL_MILLISECONDS;
    if (!parameters.refresh && this.options.persistentCache !== undefined) {
      try {
        const stored = await this.options.persistentCache.load();
        const age = stored === undefined ? undefined : now - stored.storedAt;
        if (stored !== undefined && age !== undefined && age >= 0 && age < maxAge) {
          this.cached = stored;
          return withCacheSource(stored.snapshot);
        }
      } catch {
        // A missing, unreadable, or obsolete local cache must never block a live catalog load.
      }
    }

    const snapshot = await this.fetchSnapshot(parameters.signal);
    const entry = { snapshot, storedAt: (this.options.now ?? Date.now)() };
    this.cached = entry;
    if (this.options.persistentCache !== undefined) {
      try {
        await this.options.persistentCache.save(entry);
      } catch {
        // Live catalog data remains usable even when the local cache directory is read-only.
      }
    }
    return snapshot;
  }

  private async fetchSnapshot(signal?: AbortSignal): Promise<DarkerDbMarketplaceCatalogSnapshot> {
    const zhLocale = this.options.simplifiedChineseLocale ?? VERIFIED_DARKERDB_SIMPLIFIED_CHINESE_LOCALE;
    const requestOptions = signal === undefined ? {} : { signal };
    const [englishItems, chineseItems, englishAttributes, chineseAttributes, englishClasses, chineseClasses, englishFacets, chineseFacets] = await Promise.all([
      collect(this.client.getGameplayItems.bind(this.client), "en", requestOptions),
      collect(this.client.getGameplayItems.bind(this.client), zhLocale, requestOptions),
      collect(this.client.getAttributes.bind(this.client), "en", requestOptions),
      collect(this.client.getAttributes.bind(this.client), zhLocale, requestOptions),
      collect(this.client.getClasses.bind(this.client), "en", requestOptions),
      collect(this.client.getClasses.bind(this.client), zhLocale, requestOptions),
      this.client.getFacets({ locale: "en" }, requestOptions),
      this.client.getFacets({ locale: zhLocale }, requestOptions)
    ]);
    const collections = [englishItems, chineseItems, englishAttributes, chineseAttributes, englishClasses, chineseClasses];
    if (collections.some((collection) => !collection.complete)) {
      throw new Error("DarkerDB catalog pagination exceeded its bounded 100-page limit.");
    }
    return buildDarkerDbMarketplaceFilterCatalog({
      englishItems: englishItems.data,
      simplifiedChineseItems: chineseItems.data,
      englishAttributes: englishAttributes.data,
      simplifiedChineseAttributes: chineseAttributes.data,
      englishClasses: englishClasses.data,
      simplifiedChineseClasses: chineseClasses.data,
      englishFacets: englishFacets.data,
      simplifiedChineseFacets: chineseFacets.data,
      generatedAt: new Date((this.options.now ?? Date.now)()).toISOString(),
      source: "darkerdb-live"
    });
  }
}

function withCacheSource(snapshot: DarkerDbMarketplaceCatalogSnapshot): DarkerDbMarketplaceCatalogSnapshot {
  return {
    ...snapshot,
    catalog: { ...snapshot.catalog, source: "darkerdb-cache" }
  };
}

type CursorMethod<T> = (
  parameters: { locale?: string; cursor?: string; limit?: number },
  options?: { signal?: AbortSignal }
) => Promise<{ data: T[]; nextCursor?: string; diagnostics: { contractVersion: string } }>;

function collect<T>(
  method: CursorMethod<T>,
  locale: string,
  options: { signal?: AbortSignal }
): Promise<DarkerDbCursorCollection<T>> {
  return collectDarkerDbCursorPages({
    getPage: (cursor, requestOptions) => method(
      { locale, ...(cursor === undefined ? {} : { cursor }), limit: 200 },
      requestOptions
    )
  }, { maxPages: 100, ...options });
}
