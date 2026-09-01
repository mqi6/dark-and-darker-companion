export type DarkerDbCatalogResource =
  | "facets"
  | "classes"
  | "attributes"
  | "items"
  | `item:${string}`;

export interface DarkerDbCatalogCacheKey {
  contractVersion: string;
  patch: number;
  locale: string;
  resource: DarkerDbCatalogResource;
}

interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

export class DarkerDbCatalogCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly maxAgeMs = 300_000,
    private readonly now: () => number = Date.now
  ) {
    if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
      throw new RangeError("Catalog cache maxAgeMs must be a non-negative number.");
    }
  }

  get(key: DarkerDbCatalogCacheKey): T | undefined {
    const cacheKey = serializeCatalogCacheKey(key);
    const entry = this.entries.get(cacheKey);
    if (entry === undefined) return undefined;
    if (this.now() - entry.storedAt > this.maxAgeMs) {
      this.entries.delete(cacheKey);
      return undefined;
    }
    return entry.value;
  }

  set(key: DarkerDbCatalogCacheKey, value: T): void {
    this.entries.set(serializeCatalogCacheKey(key), { value, storedAt: this.now() });
  }

  clear(): void {
    this.entries.clear();
  }
}

export function serializeCatalogCacheKey(key: DarkerDbCatalogCacheKey): string {
  const locale = key.locale.trim();
  if (locale === "") throw new RangeError("Catalog cache locale must not be empty.");
  if (!Number.isInteger(key.patch) || key.patch < 0) {
    throw new RangeError("Catalog cache patch must be a non-negative integer.");
  }
  return JSON.stringify([
    key.contractVersion,
    key.patch,
    locale,
    key.resource
  ]);
}
