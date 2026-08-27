import { z } from "zod";
import type { CanonicalId } from "../domain/models";

export const PINNED_DARKERDB_API_VERSION = "2026-08-03";
export const DARKERDB_MARKET_PAGE_LIMIT = 50;

const envelopeSchema = z.object({
  body: z.unknown(),
  pagination: z
    .object({
      next: z.string().nullish(),
      total: z.number().int().nonnegative().optional(),
      page: z.number().int().positive().optional(),
      num_pages: z.number().int().nonnegative().optional()
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
}

type QueryValue = string | number | boolean | undefined;

export interface MarketQuery {
  itemId?: CanonicalId;
  archetype?: string;
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
  }): Promise<DarkerDbPage<T>> {
    return this.get<T>("/v2/items", {
      locale: parameters.locale,
      cursor: parameters.cursor,
      limit: parameters.limit
    });
  }

  async getAttributes<T>(parameters: {
    locale: string;
    cursor?: string;
    limit?: number;
  }): Promise<DarkerDbPage<T>> {
    return this.get<T>("/v2/attributes", {
      locale: parameters.locale,
      cursor: parameters.cursor,
      limit: parameters.limit
    });
  }

  async getMarket<T>(query: MarketQuery): Promise<DarkerDbPage<T>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DARKERDB_MARKET_PAGE_LIMIT;
    assertPositiveInteger(page, "Market page");
    if (!Number.isInteger(limit) || limit < 1 || limit > DARKERDB_MARKET_PAGE_LIMIT) {
      throw new RangeError(`Market limit must be between 1 and ${DARKERDB_MARKET_PAGE_LIMIT}.`);
    }

    const parameters: Record<string, QueryValue> = {
      item_id: query.itemId,
      archetype: query.archetype,
      rarity: query.rarities?.join(","),
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
    return this.get<T>("/v2/market", parameters);
  }

  async priceCheck<T>(parameters: PriceCheckQuery): Promise<DarkerDbPage<T>> {
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
    return this.get<T>("/v2/price-checks", query);
  }

  private async get<T>(
    path: string,
    query: Readonly<Record<string, QueryValue>>
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

    const response = await this.fetchImplementation(url, { headers });
    if (!response.ok) {
      throw new DarkerDbHttpError(response.status, response.statusText);
    }

    const parsed = envelopeSchema.parse(await response.json());
    return {
      data: parsed.body as T,
      ...(parsed.pagination?.next ? { nextCursor: parsed.pagination.next } : {}),
      ...(parsed.pagination?.total === undefined
        ? {}
        : { reportedTotal: parsed.pagination.total }),
      ...(parsed.pagination?.page === undefined ? {} : { page: parsed.pagination.page }),
      ...(parsed.pagination?.num_pages === undefined
        ? {}
        : { numPages: parsed.pagination.num_pages })
    };
  }
}

export async function collectMarketPages<T>(
  client: DarkerDbClient,
  query: MarketQuery,
  options: { maxPages?: number } = {}
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

  while (pagesFetched < maxPages) {
    const requestedPage = firstPage + pagesFetched;
    const page = await client.getMarket<T[]>({ ...query, page: requestedPage, limit });
    data.push(...page.data);
    pagesFetched += 1;
    if (page.reportedTotal !== undefined) reportedTotal = page.reportedTotal;

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
    complete
  };
}

export class DarkerDbHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string
  ) {
    super(`DarkerDB request failed with ${status} ${statusText}.`);
    this.name = "DarkerDbHttpError";
  }
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
