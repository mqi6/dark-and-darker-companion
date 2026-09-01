import { z } from "zod";
import type { CanonicalId } from "../domain/models";
import {
  darkerDbAttributeSchema,
  darkerDbClassSchema,
  darkerDbFacetsBodySchema,
  darkerDbFreshnessSchema,
  darkerDbGameplayItemSchema,
  darkerDbItemDetailSchema,
  darkerDbMarketListingSchema,
  darkerDbPriceCheckBodySchema,
  type DarkerDbAttribute,
  type DarkerDbClass,
  type DarkerDbFacetsBody,
  type DarkerDbFreshness,
  type DarkerDbGameplayItem,
  type DarkerDbItemDetail,
  type DarkerDbMarketListing,
  type DarkerDbPriceCheckBody
} from "./darkerdbContracts";

export const PINNED_DARKERDB_API_VERSION = "2026-08-03";
export const DARKERDB_MARKET_PAGE_LIMIT = 50;

const envelopeSchema = z.object({
  body: z.unknown(),
  version: z.string().min(1).optional(),
  build: z.string().min(1).optional(),
  patch: z.number().int().nonnegative().optional(),
  request_id: z.string().min(1).optional(),
  elapsed: z.number().nonnegative().optional(),
  timestamp: z.iso.datetime().optional(),
  pagination: z
    .object({
      next: z.string().nullish(),
      total: z.number().int().nonnegative().optional(),
      page: z.number().int().positive().optional(),
      num_pages: z.number().int().nonnegative().optional(),
      freshness: darkerDbFreshnessSchema.optional()
    })
    .passthrough()
    .optional()
}).passthrough();

export interface DarkerDbClientOptions {
  apiKey?: string;
  apiVersion?: string;
  baseUrl?: string;
  fetchImplementation?: typeof fetch;
}

export interface DarkerDbPage<T> {
  data: T;
  nextCursor?: string;
  reportedTotal?: number;
  page?: number;
  numPages?: number;
  freshness?: DarkerDbFreshness;
  diagnostics: DarkerDbDiagnostics;
}

export interface DarkerDbRateLimitDiagnostics {
  limit?: number;
  remaining?: number;
  creditsCost?: number;
  creditsRemaining?: number;
  retryAfterSeconds?: number;
}

export interface DarkerDbDiagnostics {
  contractVersion: string;
  serviceVersion?: string;
  build?: string;
  patch?: number;
  requestId?: string;
  elapsedSeconds?: number;
  timestamp?: string;
  rateLimit?: DarkerDbRateLimitDiagnostics;
}

export interface DarkerDbRequestOptions {
  signal?: AbortSignal;
}

type QueryValue = string | number | boolean | undefined;

export interface MarketQuery {
  itemId?: CanonicalId;
  archetype?: string;
  rarity?: string;
  /** @deprecated Split with splitMarketQueryByRarity before calling getMarket. */
  rarities?: readonly string[];
  slotTypes?: readonly string[];
  foundBy?: string;
  price?: string | number;
  pricePerUnit?: string | number;
  quantity?: string | number;
  lootState?: string;
  primary?: Readonly<Record<string, string | number>>;
  secondary?: Readonly<Record<string, string | number>>;
  from?: string;
  to?: string;
  listingState?: "active" | "missing" | "sold" | "expired" | "cancelled";
  hasSold?: boolean;
  hasExpired?: boolean;
  hasCancelled?: boolean;
  sort?: string;
  locale?: string;
  page?: number;
  limit?: number;
}

export interface PriceCheckQuery {
  itemId: CanonicalId;
  attributes?: Readonly<Record<string, number>>;
  gems?: Readonly<Record<string, string>>;
  locale: string;
}

export interface MarketCollection<T> {
  data: readonly T[];
  pagesFetched: number;
  retrievedCount: number;
  reportedTotal?: number;
  complete: boolean;
  freshness?: DarkerDbFreshness;
}

export interface MarketPageSource<T> {
  getMarket(
    query: MarketQuery,
    options?: DarkerDbRequestOptions
  ): Promise<DarkerDbPage<T[]>>;
}

export interface MarketFamilyCollection<T> extends MarketCollection<T> {
  families: readonly {
    itemId: CanonicalId;
    rarity?: string;
    result: MarketCollection<T>;
  }[];
}

export interface DarkerDbCursorCollection<T> {
  data: readonly T[];
  pagesFetched: number;
  retrievedCount: number;
  complete: boolean;
  diagnostics: readonly DarkerDbDiagnostics[];
}

export interface DarkerDbCursorPageSource<T> {
  getPage(
    cursor: string | undefined,
    options?: DarkerDbRequestOptions
  ): Promise<DarkerDbPage<T[]>>;
}

export class DarkerDbClient {
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: DarkerDbClientOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.darkerdb.com";
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async getItems<T>(parameters: {
    locale: string;
    cursor?: string;
    limit?: number;
  }, options: DarkerDbRequestOptions = {}): Promise<DarkerDbPage<T>> {
    return this.get<T>("/v2/items", {
      locale: parameters.locale,
      cursor: parameters.cursor,
      limit: parameters.limit
    }, undefined, options);
  }

  async getGameplayItems(parameters: {
    locale?: string;
    cursor?: string;
    limit?: number;
  }, options: DarkerDbRequestOptions = {}): Promise<DarkerDbPage<DarkerDbGameplayItem[]>> {
    return this.get("/v2/items", {
      locale: parameters.locale ?? "en",
      cursor: parameters.cursor,
      limit: parameters.limit
    }, z.array(darkerDbGameplayItemSchema), options);
  }

  async getAttributes(parameters: {
    locale?: string;
    group?: "primary" | "secondary";
    cursor?: string;
    limit?: number;
  }, options: DarkerDbRequestOptions = {}): Promise<DarkerDbPage<DarkerDbAttribute[]>> {
    return this.get("/v2/attributes", {
      locale: parameters.locale ?? "en",
      group: parameters.group,
      cursor: parameters.cursor,
      limit: parameters.limit
    }, z.array(darkerDbAttributeSchema), options);
  }

  async getClasses(parameters: {
    locale?: string;
    cursor?: string;
    limit?: number;
  } = {}, options: DarkerDbRequestOptions = {}): Promise<DarkerDbPage<DarkerDbClass[]>> {
    return this.get("/v2/classes", {
      locale: parameters.locale ?? "en",
      cursor: parameters.cursor,
      limit: parameters.limit
    }, z.array(darkerDbClassSchema), options);
  }

  async getFacets(options: DarkerDbRequestOptions = {}): Promise<DarkerDbPage<DarkerDbFacetsBody>> {
    return this.get("/v2/facets", {}, darkerDbFacetsBodySchema, options);
  }

  async getItemDetail(
    itemId: CanonicalId,
    parameters: { locale?: string } = {},
    options: DarkerDbRequestOptions = {}
  ): Promise<DarkerDbPage<DarkerDbItemDetail>> {
    return this.get(`/v2/items/${encodeURIComponent(itemId)}`, {
      locale: parameters.locale ?? "en"
    }, darkerDbItemDetailSchema, options);
  }

  async getMarket(
    query: MarketQuery,
    options: DarkerDbRequestOptions = {}
  ): Promise<DarkerDbPage<DarkerDbMarketListing[]>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DARKERDB_MARKET_PAGE_LIMIT;
    assertPositiveInteger(page, "Market page");
    if (!Number.isInteger(limit) || limit < 1 || limit > DARKERDB_MARKET_PAGE_LIMIT) {
      throw new RangeError(`Market limit must be between 1 and ${DARKERDB_MARKET_PAGE_LIMIT}.`);
    }

    const rarity = singleMarketRarity(query);
    const parameters: Record<string, QueryValue> = {
      item_id: query.itemId,
      archetype: query.archetype,
      rarity,
      slot_type: query.slotTypes?.join(","),
      found_by: query.foundBy,
      price: query.price,
      price_per_unit: query.pricePerUnit,
      quantity: query.quantity,
      loot_state: query.lootState,
      from: query.from,
      to: query.to,
      listing_state: query.listingState,
      has_sold: query.hasSold,
      has_expired: query.hasExpired,
      has_cancelled: query.hasCancelled,
      sort: query.sort,
      locale: query.locale,
      page,
      limit
    };
    addBracketedParameters(parameters, "primary", query.primary);
    addBracketedParameters(parameters, "secondary", query.secondary);
    return this.get("/v2/market", parameters, z.array(darkerDbMarketListingSchema), options);
  }

  async priceCheck(
    parameters: PriceCheckQuery,
    options: DarkerDbRequestOptions = {}
  ): Promise<DarkerDbPage<DarkerDbPriceCheckBody>> {
    const query: Record<string, QueryValue> = {
      item_id: parameters.itemId,
      locale: parameters.locale
    };
    for (const [attribute, value] of Object.entries(parameters.attributes ?? {})) {
      query[`attributes[${attribute}]`] = value;
    }
    for (const [socket, gem] of Object.entries(parameters.gems ?? {})) {
      query[`gems[${socket}]`] = gem;
    }
    return this.get("/v2/price-checks", query, darkerDbPriceCheckBodySchema, options);
  }

  private async get<T>(
    path: string,
    query: Readonly<Record<string, QueryValue>>,
    bodySchema?: z.ZodType<T>,
    options: DarkerDbRequestOptions = {}
  ): Promise<DarkerDbPage<T>> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = new Headers({ Accept: "application/json" });
    if (this.options.apiKey) {
      headers.set("X-API-Key", this.options.apiKey);
    }
    headers.set("X-API-Version", this.options.apiVersion ?? PINNED_DARKERDB_API_VERSION);

    const response = await this.fetchImplementation(url, {
      headers,
      ...(options.signal === undefined ? {} : { signal: options.signal })
    });
    const diagnostics = diagnosticsFromResponse(
      response,
      this.options.apiVersion ?? PINNED_DARKERDB_API_VERSION
    );
    if (!response.ok) {
      throw new DarkerDbHttpError(response.status, response.statusText, diagnostics);
    }

    const parsed = envelopeSchema.parse(await response.json());
    return {
      data: bodySchema ? bodySchema.parse(parsed.body) : (parsed.body as T),
      diagnostics: {
        ...diagnostics,
        ...(parsed.version === undefined ? {} : { serviceVersion: parsed.version }),
        ...(parsed.build === undefined ? {} : { build: parsed.build }),
        ...(parsed.patch === undefined ? {} : { patch: parsed.patch }),
        ...(parsed.request_id === undefined ? {} : { requestId: parsed.request_id }),
        ...(parsed.elapsed === undefined ? {} : { elapsedSeconds: parsed.elapsed }),
        ...(parsed.timestamp === undefined ? {} : { timestamp: parsed.timestamp })
      },
      ...(parsed.pagination?.next ? { nextCursor: parsed.pagination.next } : {}),
      ...(parsed.pagination?.total === undefined
        ? {}
        : { reportedTotal: parsed.pagination.total }),
      ...(parsed.pagination?.page === undefined ? {} : { page: parsed.pagination.page }),
      ...(parsed.pagination?.num_pages === undefined
        ? {}
        : { numPages: parsed.pagination.num_pages }),
      ...(parsed.pagination?.freshness === undefined
        ? {}
        : { freshness: parsed.pagination.freshness })
    };
  }
}

export async function collectMarketPages<T>(
  client: MarketPageSource<T>,
  query: MarketQuery,
  options: { maxPages?: number; signal?: AbortSignal } = {}
): Promise<MarketCollection<T>> {
  const maxPages = options.maxPages ?? 20;
  assertPositiveInteger(maxPages, "maxPages");
  const firstPage = query.page ?? 1;
  assertPositiveInteger(firstPage, "Market page");
  const limit = query.limit ?? DARKERDB_MARKET_PAGE_LIMIT;

  const data: T[] = [];
  let pagesFetched = 0;
  let reportedTotal: number | undefined;
  let complete = false;
  let freshness: DarkerDbFreshness | undefined;

  while (pagesFetched < maxPages) {
    const requestedPage = firstPage + pagesFetched;
    const page = await client.getMarket(
      { ...query, page: requestedPage, limit },
      options.signal === undefined ? {} : { signal: options.signal }
    );
    data.push(...page.data);
    pagesFetched += 1;
    if (page.reportedTotal !== undefined) reportedTotal = page.reportedTotal;
    if (page.freshness !== undefined) freshness = page.freshness;

    const currentPage = page.page ?? requestedPage;
    if (
      page.data.length === 0 ||
      page.data.length < limit ||
      (page.numPages !== undefined && currentPage >= page.numPages) ||
      (reportedTotal !== undefined && data.length >= reportedTotal)
    ) {
      complete = true;
      break;
    }
  }

  return {
    data,
    pagesFetched,
    retrievedCount: data.length,
    ...(reportedTotal === undefined ? {} : { reportedTotal }),
    complete,
    ...(freshness === undefined ? {} : { freshness })
  };
}

export async function collectMarketItemFamilies<T>(
  client: MarketPageSource<T>,
  itemIds: readonly CanonicalId[],
  query: Omit<MarketQuery, "itemId" | "page">,
  options: { maxPagesPerItem?: number; signal?: AbortSignal } = {}
): Promise<MarketFamilyCollection<T>> {
  const uniqueItemIds = [...new Set(itemIds)];
  if (uniqueItemIds.length === 0) {
    throw new RangeError("At least one item ID is required.");
  }

  const families: { itemId: CanonicalId; rarity?: string; result: MarketCollection<T> }[] = [];
  for (const itemId of uniqueItemIds) {
    for (const splitQuery of splitMarketQueryByRarity({ ...query, itemId })) {
      const result = await collectMarketPages(client, splitQuery, {
        ...(options.maxPagesPerItem === undefined
          ? {}
          : { maxPages: options.maxPagesPerItem }),
        ...(options.signal === undefined ? {} : { signal: options.signal })
      });
      families.push({
        itemId,
        ...(splitQuery.rarity === undefined ? {} : { rarity: splitQuery.rarity }),
        result
      });
    }
  }

  const data = families.flatMap((family) => family.result.data);
  const hasEveryReportedTotal = families.every(
    (family) => family.result.reportedTotal !== undefined
  );
  const reportedTotal = hasEveryReportedTotal
    ? families.reduce((total, family) => total + (family.result.reportedTotal ?? 0), 0)
    : undefined;

  return {
    data,
    families,
    pagesFetched: families.reduce(
      (total, family) => total + family.result.pagesFetched,
      0
    ),
    retrievedCount: data.length,
    ...(reportedTotal === undefined ? {} : { reportedTotal }),
    complete: families.every((family) => family.result.complete)
  };
}

export class DarkerDbHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly diagnostics: DarkerDbDiagnostics
  ) {
    super(`DarkerDB request failed with ${status} ${statusText}.`);
    this.name = "DarkerDbHttpError";
  }
}

export function splitMarketQueryByRarity(query: MarketQuery): readonly MarketQuery[] {
  const { rarities, ...withoutRarities } = query;
  const explicit = query.rarity?.trim();
  const selected = [...new Set((rarities ?? []).map((rarity) => rarity.trim()).filter(Boolean))];
  if (explicit && selected.length > 0 && selected.some((rarity) => rarity !== explicit)) {
    throw new RangeError("Market rarity and rarities must not conflict.");
  }
  const raritiesToUse = explicit ? [explicit] : selected;
  return raritiesToUse.length === 0
    ? [withoutRarities]
    : raritiesToUse.map((rarity) => ({ ...withoutRarities, rarity }));
}

export async function collectDarkerDbCursorPages<T>(
  source: DarkerDbCursorPageSource<T>,
  options: { maxPages?: number; signal?: AbortSignal } = {}
): Promise<DarkerDbCursorCollection<T>> {
  const maxPages = options.maxPages ?? 100;
  assertPositiveInteger(maxPages, "maxPages");
  const data: T[] = [];
  const diagnostics: DarkerDbDiagnostics[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let pagesFetched = 0;
  let complete = false;

  while (pagesFetched < maxPages) {
    const page = await source.getPage(
      cursor,
      options.signal === undefined ? {} : { signal: options.signal }
    );
    data.push(...page.data);
    diagnostics.push(page.diagnostics);
    pagesFetched += 1;
    if (page.nextCursor === undefined) {
      complete = true;
      break;
    }
    if (seenCursors.has(page.nextCursor)) {
      throw new Error(`DarkerDB returned a repeated cursor: ${page.nextCursor}`);
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  return { data, pagesFetched, retrievedCount: data.length, complete, diagnostics };
}

function addBracketedParameters(
  target: Record<string, QueryValue>,
  group: "primary" | "secondary",
  values?: Readonly<Record<string, string | number>>
): void {
  for (const [key, value] of Object.entries(values ?? {})) {
    target[`${group}[${key}]`] = value;
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer.`);
  }
}

function singleMarketRarity(query: MarketQuery): string | undefined {
  const split = splitMarketQueryByRarity(query);
  if (split.length > 1) {
    throw new RangeError(
      "DarkerDB Market accepts one rarity per request; split the query before fetching."
    );
  }
  return split[0]?.rarity;
}

function diagnosticsFromResponse(
  response: Response,
  contractVersion: string
): DarkerDbDiagnostics {
  const rateLimit: DarkerDbRateLimitDiagnostics = compactNumberRecord({
    limit: response.headers.get("x-ratelimit-limit"),
    remaining: response.headers.get("x-ratelimit-remaining"),
    creditsCost: response.headers.get("x-credits-cost"),
    creditsRemaining: response.headers.get("x-credits-remaining"),
    retryAfterSeconds: response.headers.get("retry-after")
  });
  return {
    contractVersion: response.headers.get("x-api-version") ?? contractVersion,
    ...(Object.keys(rateLimit).length === 0 ? {} : { rateLimit })
  };
}

function compactNumberRecord<T extends Record<string, string | null>>(
  values: T
): { [K in keyof T]?: number } {
  const result: { [K in keyof T]?: number } = {};
  for (const [key, value] of Object.entries(values) as [keyof T, string | null][]) {
    if (value === null || value.trim() === "") continue;
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) result[key] = number;
  }
  return result;
}
