import type {
  DarkerDbGameplayItem,
  DarkerDbItemDetail
} from "./darkerdbContracts";
import type { CanonicalId } from "../domain/models";
import type { MarketplaceCatalogItem } from "../domain/marketplaceSearch";
import { normalizeDarkerDbRollRange } from "./darkerdbMapping";

export interface MarketplaceCatalogBuildResult {
  items: readonly MarketplaceCatalogItem[];
  omitted: readonly {
    id: CanonicalId;
    reason: "missing-family-id";
  }[];
}

export function buildMarketplaceCatalog(
  items: readonly DarkerDbGameplayItem[],
  itemDetails: ReadonlyMap<CanonicalId, DarkerDbItemDetail> = new Map()
): MarketplaceCatalogBuildResult {
  const seen = new Set<CanonicalId>();
  const normalized: MarketplaceCatalogItem[] = [];
  const omitted: MarketplaceCatalogBuildResult["omitted"][number][] = [];

  for (const item of items) {
    if (seen.has(item.id)) throw new Error(`Duplicate DarkerDB item ID: ${item.id}`);
    seen.add(item.id);
    if (item.archetype == null) {
      omitted.push({ id: item.id, reason: "missing-family-id" });
      continue;
    }
    const detail = itemDetails.get(item.id);
    const possibleSecondaryAttributeIds = detail?.secondary_attributes.map((range) =>
      normalizeDarkerDbRollRange(range, "item-detail").attributeId
    );
    normalized.push({
      id: item.id,
      familyId: item.archetype,
      rarity: normalizedSlug(item.rarity),
      ...(item.item_type == null ? {} : { itemType: normalizedSlug(item.item_type) }),
      ...(item.slot_type == null ? {} : { slotType: normalizedSlug(item.slot_type) }),
      ...(item.armor_type == null ? {} : { armorType: normalizedSlug(item.armor_type) }),
      ...(item.weapon_type == null ? {} : { weaponType: normalizedSlug(item.weapon_type) }),
      ...(item.hand_type == null ? {} : { handType: normalizedSlug(item.hand_type) }),
      classIds: normalizeRequiredClasses(item.required_class),
      ...(possibleSecondaryAttributeIds === undefined
        ? {}
        : { possibleSecondaryAttributeIds: [...new Set(possibleSecondaryAttributeIds)].sort() })
    });
  }

  normalized.sort((left, right) => left.id.localeCompare(right.id));
  return { items: normalized, omitted };
}

export function normalizeRequiredClasses(
  requiredClass: string | readonly string[] | null | undefined
): readonly CanonicalId[] {
  if (requiredClass == null) return [];
  const values: readonly string[] =
    typeof requiredClass === "string" ? requiredClass.split("|") : requiredClass;
  return [...new Set(values.map((value) => canonicalClassId(value)))].sort();
}

function canonicalClassId(value: string): CanonicalId {
  const normalized = normalizedSlug(value);
  if (normalized.startsWith("id.class.")) return normalized as CanonicalId;
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    throw new Error(`Unsupported DarkerDB class value: ${value}`);
  }
  return `id.class.${normalized}`;
}

function normalizedSlug(value: string): string {
  return value.trim().toLowerCase();
}
