import { z } from "zod";
import type { CanonicalId } from "../domain/models";

const envelopeSchema = z.object({
  body: z.unknown(),
  pagination: z
    .object({
      next: z.string().nullish(),
      total: z.number().int().nonnegative().optional()
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
}

export interface MarketQuery {
  itemId?: CanonicalId;
  itemIds?: readonly CanonicalId[];
  rarities?: readonly string[];
  slotTypes?: readonly string[];
  listingState?: "active" | "missing" | "sold" | "expired" | "cancelled";
  sort?: string;
  locale?: string;
  page?: number;
  limit?: number;
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
    return this.get<T>("/v2/market", {
      item_id: query.itemId,
      item_ids: query.itemIds?.join(","),
      rarity: query.rarities?.join(","),
      slot_type: query.slotTypes?.join(","),
      listing_state: query.listingState,
      sort: query.sort,
      locale: query.locale,
      page: query.page,
      limit: query.limit
    });
  }

  async priceCheck<T>(parameters: {
    itemId: CanonicalId;
    attributes: Readonly<Record<string, number>>;
    locale: string;
  }): Promise<DarkerDbPage<T>> {
    const query: Record<string, string | number | undefined> = {
      item_id: parameters.itemId,
      locale: parameters.locale
    };
    for (const [attribute, value] of Object.entries(parameters.attributes)) {
      query[`attributes[${attribute}]`] = value;
    }
    return this.get<T>("/v2/price-checks", query);
  }

  private async get<T>(
    path: string,
    query: Readonly<Record<string, string | number | undefined>>
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
    if (this.options.apiVersion) {
      headers.set("X-API-Version", this.options.apiVersion);
    }

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
        : { reportedTotal: parsed.pagination.total })
    };
  }
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
