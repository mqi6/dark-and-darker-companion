import { z } from "zod";
import type { CanonicalId } from "../domain/models";

const canonicalIdSchema = z.custom<CanonicalId>(
  (value) => typeof value === "string" && value.startsWith("id."),
  "Expected a canonical DarkerDB ID beginning with id."
);
const timestampSchema = z.iso.datetime();

export const darkerDbFreshnessSchema = z
  .object({
    archetype: canonicalIdSchema,
    status: z.string().min(1),
    scan_started_at: timestampSchema,
    scan_completed_at: timestampSchema,
    age_seconds: z.number().nonnegative(),
    num_pages: z.number().int().nonnegative(),
    num_listings: z.number().int().nonnegative()
  })
  .passthrough();

export const darkerDbMarketListingSchema = z
  .object({
    id: z.number().int().nonnegative(),
    item_id: canonicalIdSchema,
    archetype: canonicalIdSchema,
    name: z.string(),
    icon: z.string().min(1),
    icon_url: z.string().url(),
    slot_type: z.string().min(1),
    item_type: z.string().min(1),
    rarity: z.string().min(1),
    price: z.number().positive(),
    price_per_unit: z.number().positive(),
    quantity: z.number().int().positive(),
    listing_state: z.enum(["active", "missing", "sold", "expired", "cancelled"]),
    is_confirmed: z.boolean(),
    has_cancelled: z.boolean(),
    has_expired: z.boolean(),
    has_sold: z.boolean(),
    attributes: z.record(z.string(), z.number()),
    sockets: z.array(canonicalIdSchema),
    created_at: timestampSchema,
    expires_at: timestampSchema,
    missing_at: timestampSchema.optional(),
    loot_state: z.string().min(1),
    found_by: z.string().optional()
  })
  .passthrough();

export const darkerDbMarketPaginationSchema = z
  .object({
    count: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    page: z.number().int().positive(),
    num_pages: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    next: z.string().url().nullish(),
    freshness: darkerDbFreshnessSchema.optional()
  })
  .passthrough();

const responseBaseShape = {
  version: z.string().min(1),
  stage: z.string().min(1),
  code: z.number().int(),
  status: z.string().min(1),
  debug: z.boolean(),
  elapsed: z.number().nonnegative(),
  timestamp: timestampSchema,
  request_id: z.string().min(1),
  meta: z
    .object({
      method: z.string().min(1),
      path: z.string().min(1),
      query: z.record(z.string(), z.string())
    })
    .passthrough(),
  build: z.string().min(1),
  patch: z.number().int().nonnegative()
} as const;

export const darkerDbMarketResponseSchema = z
  .object({
    ...responseBaseShape,
    pagination: darkerDbMarketPaginationSchema,
    body: z.array(darkerDbMarketListingSchema)
  })
  .passthrough();

const availableAttributeSchema = z
  .object({
    attribute_id: z.string().min(1),
    label: z.string().min(1),
    minimum: z.number(),
    maximum: z.number(),
    enchanted_min: z.number(),
    enchanted_max: z.number(),
    percentage: z.boolean(),
    model: z
      .object({
        grade: z.string().min(1),
        market_score: z.number().nonnegative(),
        confidence: z.string().min(1)
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const comparableAttributeSchema = z
  .object({
    attribute_id: z.string().min(1),
    label: z.string().min(1),
    value: z.number(),
    formatted_value: z.string()
  })
  .passthrough();

const similarSaleSchema = z
  .object({
    listing_id: z.string().min(1),
    price: z.number().positive(),
    similarity: z.number().nonnegative(),
    sold_at: timestampSchema,
    evidence_type: z.string().min(1),
    state_source: z.string().min(1),
    sale_seconds: z.number().nonnegative(),
    attributes: z.array(comparableAttributeSchema)
  })
  .passthrough();

const similarListingSchema = z
  .object({
    listing_id: z.string().min(1),
    price: z.number().positive(),
    similarity: z.number().nonnegative(),
    listed_at: timestampSchema,
    evidence_type: z.string().min(1),
    state_source: z.string().min(1),
    attributes: z.array(comparableAttributeSchema)
  })
  .passthrough();

const optionalPriceSchema = z.number().nonnegative().nullable();

export const darkerDbPriceCheckBodySchema = z
  .object({
    item: z
      .object({
        item_id: canonicalIdSchema,
        archetype: canonicalIdSchema,
        name: z.string(),
        rarity: z.string().min(1),
        icon_url: z.string().url(),
        num_secondary_attributes: z.number().int().nonnegative()
      })
      .passthrough(),
    selection: z
      .object({
        attributes: z.array(z.unknown()),
        primary: z.array(z.unknown()),
        secondary: z.array(z.unknown())
      })
      .passthrough(),
    available_attributes: z
      .object({
        primary: z.array(availableAttributeSchema),
        secondary: z.array(availableAttributeSchema)
      })
      .passthrough(),
    valuation: z
      .object({
        fair_value: optionalPriceSchema,
        low: optionalPriceSchema,
        high: optionalPriceSchema,
        lowest_ask: optionalPriceSchema,
        quick_list: optionalPriceSchema,
        confidence: z.string().min(1)
      })
      .passthrough(),
    market: z
      .object({
        sales_30d: z.number().int().nonnegative(),
        inferred_sales_30d: z.number().int().nonnegative(),
        active_listings: z.number().int().nonnegative()
      })
      .passthrough(),
    similar_sales: z.array(similarSaleSchema),
    similar_listings: z.array(similarListingSchema),
    upgrades: z
      .object({
        plans: z.array(z.unknown()),
        reason: z.string()
      })
      .passthrough()
  })
  .passthrough();

export const darkerDbPriceCheckResponseSchema = z
  .object({
    ...responseBaseShape,
    body: darkerDbPriceCheckBodySchema
  })
  .passthrough();

export type DarkerDbFreshness = z.infer<typeof darkerDbFreshnessSchema>;
export type DarkerDbMarketListing = z.infer<typeof darkerDbMarketListingSchema>;
export type DarkerDbMarketResponse = z.infer<typeof darkerDbMarketResponseSchema>;
export type DarkerDbPriceCheckBody = z.infer<typeof darkerDbPriceCheckBodySchema>;
export type DarkerDbPriceCheckResponse = z.infer<typeof darkerDbPriceCheckResponseSchema>;
export type DarkerDbSimilarSale = DarkerDbPriceCheckBody["similar_sales"][number];
