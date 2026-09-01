import { z } from "zod";
import type { MarketQuery } from "../adapters/darkerdb";
import type { DarkerDbMarketListing } from "../adapters/darkerdbContracts";
import type { CanonicalId, MarketCandidate } from "./models";
import { evaluateCandidate, type CandidateEvaluation, type RollRule } from "./search";

export const MARKETPLACE_SEARCH_SPEC_VERSION = 1 as const;
export const DEFAULT_MARKETPLACE_REQUEST_LIMIT = 20;
export const DEFAULT_MARKETPLACE_RETRIEVED_LIMIT = 1_000;
export const DEFAULT_MARKETPLACE_PAGE_LIMIT = 50;

const canonicalIdSchema = z.custom<CanonicalId>(
  (value) => typeof value === "string" && value.startsWith("id."),
  "Expected a canonical ID beginning with id."
);

const slugSchema = z.string().trim().min(1).transform((value) => value.toLowerCase());
const rangeSchema = z
  .object({
    minimum: z.number().nonnegative().optional(),
    maximum: z.number().nonnegative().optional()
  })
  .superRefine((range, context) => {
    if (
      range.minimum !== undefined &&
      range.maximum !== undefined &&
      range.minimum > range.maximum
    ) {
      context.addIssue({ code: "custom", message: "minimum must not exceed maximum" });
    }
  });

const rollRuleSchema = z
  .object({
    id: z.string().trim().min(1),
    attributeId: canonicalIdSchema,
    enabled: z.boolean(),
    minimum: z.number().optional(),
    maximum: z.number().optional()
  })
  .superRefine((rule, context) => {
    if (
      rule.minimum !== undefined &&
      rule.maximum !== undefined &&
      rule.minimum > rule.maximum
    ) {
      context.addIssue({ code: "custom", message: "minimum must not exceed maximum" });
    }
  });

export const marketplaceSearchSpecSchema = z
  .object({
    version: z.literal(MARKETPLACE_SEARCH_SPEC_VERSION),
    classIds: z.array(canonicalIdSchema).default([]),
    familyIds: z.array(canonicalIdSchema).default([]),
    itemTypes: z.array(slugSchema).default([]),
    slotTypes: z.array(slugSchema).default([]),
    armorTypes: z.array(slugSchema).default([]),
    weaponTypes: z.array(slugSchema).default([]),
    handTypes: z.array(slugSchema).default([]),
    rarities: z.array(slugSchema).default([]),
    price: z
      .object({
        basis: z.enum(["unit", "total"]),
        range: rangeSchema
      })
      .optional(),
    rollRules: z.array(rollRuleSchema).default([]),
    requiredMatchCount: z.number().int().nonnegative().default(0),
    listingState: z.literal("active").default("active"),
    sort: z.literal("unit-price-ascending").default("unit-price-ascending"),
    locale: z.enum(["en-US", "zh-CN"]).default("en-US"),
    budget: z
      .object({
        requestLimit: z.number().int().positive().max(100),
        retrievedLimit: z.number().int().positive().max(5_000),
        pageLimit: z.number().int().positive().max(DEFAULT_MARKETPLACE_PAGE_LIMIT)
      })
      .default({
        requestLimit: DEFAULT_MARKETPLACE_REQUEST_LIMIT,
        retrievedLimit: DEFAULT_MARKETPLACE_RETRIEVED_LIMIT,
        pageLimit: DEFAULT_MARKETPLACE_PAGE_LIMIT
      })
  })
  .superRefine((spec, context) => {
    const enabled = spec.rollRules.filter((rule) => rule.enabled);
    if (
      (enabled.length === 0 && spec.requiredMatchCount !== 0) ||
      (enabled.length > 0 &&
        (spec.requiredMatchCount < 1 || spec.requiredMatchCount > enabled.length))
    ) {
      context.addIssue({
        code: "custom",
        path: ["requiredMatchCount"],
        message: "requiredMatchCount must be zero with no enabled rules, otherwise 1..N"
      });
    }
    reportDuplicates(spec.rollRules.map((rule) => rule.id), ["rollRules"], context);
    reportDuplicates(
      enabled.map((rule) => rule.attributeId),
      ["rollRules"],
      context
    );
  })
  .transform((spec) => ({
    ...spec,
    classIds: sortedUnique(spec.classIds),
    familyIds: sortedUnique(spec.familyIds),
    itemTypes: sortedUnique(spec.itemTypes),
    slotTypes: sortedUnique(spec.slotTypes),
    armorTypes: sortedUnique(spec.armorTypes),
    weaponTypes: sortedUnique(spec.weaponTypes),
    handTypes: sortedUnique(spec.handTypes),
    rarities: sortedUnique(spec.rarities),
    rollRules: [...spec.rollRules].sort((left, right) => left.id.localeCompare(right.id))
  }));

export type MarketplaceSearchSpec = z.infer<typeof marketplaceSearchSpecSchema>;
export type MarketplaceSearchSpecInput = z.input<typeof marketplaceSearchSpecSchema>;

export interface MarketplaceCatalogItem {
  id: CanonicalId;
  familyId: CanonicalId;
  rarity: string;
  itemType?: string;
  slotType?: string;
  armorType?: string;
  weaponType?: string;
  handType?: string;
  classIds: readonly CanonicalId[];
  possibleSecondaryAttributeIds?: readonly CanonicalId[];
}

export interface MarketplaceQueryFamily {
  id: string;
  query: MarketQuery;
}

export interface MarketplaceSearchPlan {
  spec: MarketplaceSearchSpec;
  fingerprint: string;
  allowedItemIds: readonly CanonicalId[];
  families: readonly MarketplaceQueryFamily[];
  authoritativeEmpty: boolean;
}

export function parseMarketplaceSearchSpec(
  input: MarketplaceSearchSpecInput
): MarketplaceSearchSpec {
  return marketplaceSearchSpecSchema.parse(input);
}

export function createMarketplaceSearchPlan(
  input: MarketplaceSearchSpecInput,
  catalog: readonly MarketplaceCatalogItem[]
): MarketplaceSearchPlan {
  const spec = parseMarketplaceSearchSpec(input);
  const allowedItems = catalog
    .filter((item) => catalogItemMatchesSpec(item, spec))
    .sort((left, right) => left.id.localeCompare(right.id));
  const allowedItemIds = allowedItems.map((item) => item.id);
  const fingerprint = marketplaceSearchFingerprint(spec);
  if (allowedItems.length === 0) {
    return { spec, fingerprint, allowedItemIds, families: [], authoritativeEmpty: true };
  }

  const commonQuery = serverQueryFromSpec(spec);
  const families: MarketplaceQueryFamily[] = [];
  if (spec.familyIds.length > 0) {
    for (const item of allowedItems) {
      families.push({
        id: `item:${item.id}`,
        query: { ...commonQuery, itemId: item.id }
      });
    }
  } else if (spec.rarities.length > 0) {
    for (const rarity of sortedUnique(allowedItems.map((item) => normalized(item.rarity)))) {
      families.push({
        id: `rarity:${rarity}`,
        query: { ...commonQuery, rarity }
      });
    }
  } else {
    families.push({ id: "market:all", query: commonQuery });
  }

  return { spec, fingerprint, allowedItemIds, families, authoritativeEmpty: false };
}

export function marketplaceSearchFingerprint(spec: MarketplaceSearchSpec): string {
  return JSON.stringify(spec);
}

export function catalogItemMatchesSpec(
  item: MarketplaceCatalogItem,
  spec: MarketplaceSearchSpec
): boolean {
  return (
    includesOrUnfiltered(spec.familyIds, item.familyId) &&
    includesOrUnfiltered(spec.rarities, normalized(item.rarity)) &&
    includesOptionalOrUnfiltered(spec.itemTypes, item.itemType) &&
    includesOptionalOrUnfiltered(spec.slotTypes, item.slotType) &&
    includesOptionalOrUnfiltered(spec.armorTypes, item.armorType) &&
    includesOptionalOrUnfiltered(spec.weaponTypes, item.weaponType) &&
    includesOptionalOrUnfiltered(spec.handTypes, item.handType) &&
    classMatches(item.classIds, spec.classIds)
  );
}

export interface MarketplaceListingEvaluation {
  listing: DarkerDbMarketListing;
  evaluation: CandidateEvaluation;
}

export function evaluateMarketplaceListing(
  listing: DarkerDbMarketListing,
  item: MarketplaceCatalogItem,
  candidate: MarketCandidate,
  spec: MarketplaceSearchSpec
): MarketplaceListingEvaluation | undefined {
  if (!catalogItemMatchesSpec(item, spec)) return undefined;
  const price = spec.price;
  if (price !== undefined) {
    const actual = price.basis === "unit" ? listing.price_per_unit : listing.price;
    if (price.range.minimum !== undefined && actual < price.range.minimum) return undefined;
    if (price.range.maximum !== undefined && actual > price.range.maximum) return undefined;
  }
  if (listing.listing_state !== "active") return undefined;
  return {
    listing,
    evaluation: evaluateCandidate(
      candidate,
      spec.rollRules.map(toRollRule),
      spec.requiredMatchCount
    )
  };
}

export function compareMarketplaceListings(
  left: MarketplaceListingEvaluation,
  right: MarketplaceListingEvaluation
): number {
  return (
    left.listing.price_per_unit - right.listing.price_per_unit ||
    Date.parse(right.listing.created_at) - Date.parse(left.listing.created_at) ||
    left.listing.id - right.listing.id
  );
}

function serverQueryFromSpec(spec: MarketplaceSearchSpec): MarketQuery {
  const enabledRules = spec.rollRules.filter((rule) => rule.enabled);
  const pushAllRules =
    enabledRules.length > 0 && spec.requiredMatchCount === enabledRules.length;
  const priceValue = spec.price === undefined ? undefined : rangeParameter(spec.price.range);
  return {
    ...(spec.slotTypes.length === 0 ? {} : { slotTypes: spec.slotTypes }),
    ...(spec.price?.basis === "total" && priceValue !== undefined
      ? { price: priceValue }
      : {}),
    ...(spec.price?.basis === "unit" && priceValue !== undefined
      ? { pricePerUnit: priceValue }
      : {}),
    ...(pushAllRules && enabledRules.some(hasExplicitRange)
      ? {
          secondary: Object.fromEntries(
            enabledRules
              .filter(hasExplicitRange)
              .map((rule) => [attributeSlug(rule.attributeId), rangeParameter(rule)!])
          )
        }
      : {}),
    listingState: "active",
    sort: "price_per_unit:asc,created_at:desc,id:asc",
    locale: spec.locale === "zh-CN" ? "zh-Hans" : "en",
    limit: spec.budget.pageLimit
  };
}

function hasExplicitRange(range: {
  minimum?: number | undefined;
  maximum?: number | undefined;
}): boolean {
  return range.minimum !== undefined || range.maximum !== undefined;
}

function rangeParameter(range: {
  minimum?: number | undefined;
  maximum?: number | undefined;
}): string | undefined {
  if (range.minimum !== undefined && range.maximum !== undefined) {
    return `${range.minimum}:${range.maximum}`;
  }
  if (range.minimum !== undefined) return `>=${range.minimum}`;
  if (range.maximum !== undefined) return `<=${range.maximum}`;
  return undefined;
}

function toRollRule(rule: MarketplaceSearchSpec["rollRules"][number]): RollRule {
  return {
    id: rule.id,
    attributeId: rule.attributeId,
    enabled: rule.enabled,
    ...(rule.minimum === undefined ? {} : { minimum: rule.minimum }),
    ...(rule.maximum === undefined ? {} : { maximum: rule.maximum })
  };
}

function attributeSlug(id: CanonicalId): string {
  const prefix = "id.attribute.";
  if (!id.startsWith(prefix) || id.length === prefix.length) {
    throw new Error(`Expected canonical attribute ID: ${id}`);
  }
  return id.slice(prefix.length);
}

function classMatches(
  itemClassIds: readonly CanonicalId[],
  selectedClassIds: readonly CanonicalId[]
): boolean {
  return (
    selectedClassIds.length === 0 ||
    itemClassIds.length === 0 ||
    itemClassIds.some((classId) => selectedClassIds.includes(classId))
  );
}

function includesOptionalOrUnfiltered(
  selected: readonly string[],
  actual: string | undefined
): boolean {
  return selected.length === 0 || (actual !== undefined && selected.includes(normalized(actual)));
}

function includesOrUnfiltered<T>(selected: readonly T[], actual: T): boolean {
  return selected.length === 0 || selected.includes(actual);
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function reportDuplicates(
  values: readonly string[],
  path: (string | number)[],
  context: z.RefinementCtx
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      context.addIssue({ code: "custom", path, message: `Duplicate value: ${value}` });
    }
    seen.add(value);
  }
}
