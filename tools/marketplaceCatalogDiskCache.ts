import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  MarketplaceCatalogCacheEntry,
  MarketplaceCatalogPersistentCache
} from "../src/adapters/darkerdbMarketplaceCatalogLoader";
import type { DarkerDbMarketplaceCatalogSnapshot } from "../src/adapters/darkerdbMarketplaceFilterCatalog";
import type { CanonicalId, LocalizedGameText } from "../src/domain/models";
import type { MarketplaceFilterCatalog } from "../src/ui/marketplaceFilterCatalog";

const MARKETPLACE_DISK_CACHE_VERSION = 1 as const;
const MARKETPLACE_DISK_CACHE_FILENAME = "marketplace-catalog-v1.json";

interface StoredMarketplaceCatalogCache {
  version: typeof MARKETPLACE_DISK_CACHE_VERSION;
  identity: string;
  storedAt: number;
  snapshot: {
    catalog: MarketplaceFilterCatalog;
    localizedItemNames: [CanonicalId, LocalizedGameText][];
    omittedItemIds: CanonicalId[];
  };
}

export class MarketplaceCatalogDiskCache implements MarketplaceCatalogPersistentCache {
  constructor(
    readonly filePath = defaultMarketplaceCatalogCachePath(),
    private readonly identity = "default"
  ) {}

  async load(): Promise<MarketplaceCatalogCacheEntry | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return undefined;
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }
    if (!isStoredMarketplaceCatalogCache(parsed) || parsed.identity !== this.identity) return undefined;
    return {
      storedAt: parsed.storedAt,
      snapshot: {
        catalog: parsed.snapshot.catalog,
        localizedItemNames: new Map(parsed.snapshot.localizedItemNames),
        omittedItemIds: parsed.snapshot.omittedItemIds
      }
    };
  }

  async save(entry: MarketplaceCatalogCacheEntry): Promise<void> {
    const stored: StoredMarketplaceCatalogCache = {
      version: MARKETPLACE_DISK_CACHE_VERSION,
      identity: this.identity,
      storedAt: entry.storedAt,
      snapshot: {
        catalog: entry.snapshot.catalog,
        localizedItemNames: [...entry.snapshot.localizedItemNames.entries()],
        omittedItemIds: [...entry.snapshot.omittedItemIds]
      }
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify(stored), { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

export function defaultMarketplaceCatalogCachePath(
  environment: NodeJS.ProcessEnv = process.env
): string {
  if (environment.DARKERDB_CATALOG_CACHE_PATH?.trim()) {
    return environment.DARKERDB_CATALOG_CACHE_PATH.trim();
  }
  if (process.platform === "win32" && environment.LOCALAPPDATA?.trim()) {
    return join(
      environment.LOCALAPPDATA.trim(),
      "DarkAndDarkerCompanion",
      "cache",
      MARKETPLACE_DISK_CACHE_FILENAME
    );
  }
  const cacheRoot = environment.XDG_CACHE_HOME?.trim() || join(homedir(), ".cache");
  return join(cacheRoot, "dark-and-darker-companion", MARKETPLACE_DISK_CACHE_FILENAME);
}

function isStoredMarketplaceCatalogCache(value: unknown): value is StoredMarketplaceCatalogCache {
  if (!isRecord(value) || value.version !== MARKETPLACE_DISK_CACHE_VERSION) return false;
  if (typeof value.identity !== "string") return false;
  if (typeof value.storedAt !== "number" || !Number.isFinite(value.storedAt)) return false;
  const snapshot = value.snapshot;
  if (!isRecord(snapshot) || !isMarketplaceFilterCatalog(snapshot.catalog)) return false;
  if (!Array.isArray(snapshot.omittedItemIds) ||
      !snapshot.omittedItemIds.every(isCanonicalId)) return false;
  return Array.isArray(snapshot.localizedItemNames) &&
    snapshot.localizedItemNames.every((entry) =>
      Array.isArray(entry) && entry.length === 2 && isCanonicalId(entry[0]) && isLocalizedText(entry[1])
    );
}

function isMarketplaceFilterCatalog(value: unknown): value is MarketplaceFilterCatalog {
  if (!isRecord(value)) return false;
  const arrayKeys = [
    "items",
    "classes",
    "families",
    "rarities",
    "itemTypes",
    "slotTypes",
    "armorTypes",
    "weaponTypes",
    "handTypes",
    "attributes"
  ];
  return (value.source === "darkerdb-live" || value.source === "darkerdb-cache") &&
    typeof value.generatedAt === "string" &&
    arrayKeys.every((key) => Array.isArray(value[key]));
}

function isLocalizedText(value: unknown): value is LocalizedGameText {
  return isRecord(value) &&
    isCanonicalId(value.id) &&
    typeof value.en === "string" &&
    (value.zhCN === undefined || typeof value.zhCN === "string") &&
    (value.zhStatus === "translated" ||
      value.zhStatus === "english-fallback" ||
      value.zhStatus === "missing");
}

function isCanonicalId(value: unknown): value is CanonicalId {
  return typeof value === "string" && value.startsWith("id.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
