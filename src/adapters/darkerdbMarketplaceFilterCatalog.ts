import type {
  DarkerDbAttribute,
  DarkerDbClass,
  DarkerDbFacetsBody,
  DarkerDbGameplayItem
} from "./darkerdbContracts";
import { buildMarketplaceCatalog } from "./darkerdbMarketplaceCatalog";
import type { CanonicalId, LocalizedGameText } from "../domain/models";
import type {
  MarketplaceFilterCatalog,
  MarketplaceOption
} from "../ui/marketplaceFilterCatalog";

export interface DarkerDbMarketplaceCatalogSource {
  englishItems: readonly DarkerDbGameplayItem[];
  simplifiedChineseItems: readonly DarkerDbGameplayItem[];
  englishAttributes: readonly DarkerDbAttribute[];
  simplifiedChineseAttributes: readonly DarkerDbAttribute[];
  englishClasses: readonly DarkerDbClass[];
  simplifiedChineseClasses: readonly DarkerDbClass[];
  englishFacets: DarkerDbFacetsBody;
  simplifiedChineseFacets: DarkerDbFacetsBody;
  generatedAt: string;
  source?: "darkerdb-cache" | "darkerdb-live";
}

export interface DarkerDbMarketplaceCatalogSnapshot {
  catalog: MarketplaceFilterCatalog;
  localizedItemNames: ReadonlyMap<CanonicalId, LocalizedGameText>;
  omittedItemIds: readonly CanonicalId[];
}

const facetKeys = {
  rarities: "item_rarity",
  itemTypes: "item.item_type",
  slotTypes: "item.slot_type",
  armorTypes: "item.armor_type",
  weaponTypes: "item.weapon_type",
  handTypes: "item.hand_type"
} as const;

const facetZhCN: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  [facetKeys.rarities]: {
    poor: "劣质", common: "普通", uncommon: "优良", rare: "稀有", epic: "史诗",
    legendary: "传说", unique: "唯一", artifact: "神器"
  },
  [facetKeys.itemTypes]: {
    accessory: "饰品", armor: "防具", misc: "杂项", utility: "工具", weapon: "武器"
  },
  [facetKeys.slotTypes]: {
    back: "背部", chest: "胸部", foot: "脚部", hands: "手部", head: "头部",
    legs: "腿部", necklace: "项链", primary: "主手", ring: "戒指", sash: "腰带",
    secondary: "副手", unarmed: "徒手", utility: "快捷栏"
  },
  [facetKeys.armorTypes]: { cloth: "布甲", leather: "皮甲", plate: "板甲" },
  [facetKeys.weaponTypes]: {
    axe: "斧", bow: "弓", crossbow: "弩", dagger: "匕首", firearm: "火器",
    mace: "锤", magic_stuff: "魔法武器", polearm: "长柄武器", shield: "盾",
    sword: "剑", throwable_stuff: "投掷武器", unarmed: "徒手"
  },
  [facetKeys.handTypes]: { one_handed: "单手", two_handed: "双手" }
};

export function buildDarkerDbMarketplaceFilterCatalog(
  source: DarkerDbMarketplaceCatalogSource
): DarkerDbMarketplaceCatalogSnapshot {
  const built = buildMarketplaceCatalog(source.englishItems);
  const zhItems = new Map(source.simplifiedChineseItems.map((item) => [item.id, item]));
  const localizedItemNames = new Map<CanonicalId, LocalizedGameText>();
  for (const item of source.englishItems) {
    const zhName = zhItems.get(item.id)?.name.trim();
    const en = item.name.trim();
    localizedItemNames.set(item.id, {
      id: item.id,
      en,
      ...(zhName && zhName !== en ? { zhCN: zhName } : {}),
      zhStatus: zhName && zhName !== en ? "translated" : en ? "english-fallback" : "missing",
      ...(item.patch == null ? {} : { patch: item.patch })
    });
  }

  const familyLabels = new Map<CanonicalId, MarketplaceOption<CanonicalId>>();
  for (const item of [...source.englishItems].sort((left, right) => left.id.localeCompare(right.id))) {
    if (item.archetype == null || familyLabels.has(item.archetype)) continue;
    const localized = localizedItemNames.get(item.id);
    familyLabels.set(item.archetype, {
      value: item.archetype,
      en: localized?.en || item.archetype,
      ...(localized?.zhCN === undefined ? {} : { zhCN: localized.zhCN })
    });
  }

  const zhAttributes = new Map(
    source.simplifiedChineseAttributes.map((attribute) => [attribute.id, attribute])
  );
  const zhClasses = new Map(
    source.simplifiedChineseClasses.map((characterClass) => [characterClass.id, characterClass])
  );

  const catalog: MarketplaceFilterCatalog = {
    source: source.source ?? "darkerdb-live",
    generatedAt: source.generatedAt,
    items: built.items,
    classes: source.englishClasses.map((characterClass) => {
      const zh = zhClasses.get(characterClass.id);
      return option(characterClass.id, characterClass.name, zh?.name);
    }).sort(byEnglishLabel),
    families: [...familyLabels.values()].sort(byEnglishLabel),
    rarities: facetOptions(source, facetKeys.rarities, (item) => item.rarity),
    itemTypes: facetOptions(source, facetKeys.itemTypes, (item) => item.item_type),
    slotTypes: facetOptions(source, facetKeys.slotTypes, (item) => item.slot_type),
    armorTypes: facetOptions(source, facetKeys.armorTypes, (item) => item.armor_type),
    weaponTypes: facetOptions(source, facetKeys.weaponTypes, (item) => item.weapon_type),
    handTypes: facetOptions(source, facetKeys.handTypes, (item) => item.hand_type),
    attributes: source.englishAttributes.map((attribute) => {
      const zh = zhAttributes.get(attribute.id);
      const enName = attribute.name?.trim() || humanizeCanonicalAttribute(attribute.id);
      return {
        ...option(attribute.id, enName, zh?.name),
        descriptionEn: attribute.description,
        ...(zh?.description ? { descriptionZhCN: zh.description } : {}),
        isPercentage: attribute.is_percentage
      };
    }).sort(byEnglishLabel)
  };

  return {
    catalog,
    localizedItemNames,
    omittedItemIds: built.omitted.map((entry) => entry.id)
  };
}

function facetOptions(
  source: DarkerDbMarketplaceCatalogSource,
  key: string,
  fallbackValue: (item: DarkerDbGameplayItem) => string | null | undefined
): MarketplaceOption[] {
  const english = source.englishFacets.facets[key]?.values;
  const simplifiedChinese = source.simplifiedChineseFacets.facets[key]?.values;
  const zhByValue = new Map(
    (simplifiedChinese ?? []).map((value) => [normalizeSlug(value.value), value.label])
  );
  if (english !== undefined && english.length > 0) {
    return english.map((value) => {
      const slug = normalizeSlug(value.value);
      const apiZh = zhByValue.get(slug);
      const translated = apiZh && apiZh !== value.label ? apiZh : facetZhCN[key]?.[slug];
      return option(slug, value.label, translated);
    }).sort(byEnglishLabel);
  }

  return [...new Set(source.englishItems.flatMap((item) => {
    const value = fallbackValue(item);
    return value == null ? [] : [normalizeSlug(value)];
  }))].sort().map((value) => option(value, humanizeSlug(value), facetZhCN[key]?.[value]));
}

function option<T extends string>(value: T, en: string, zhCN?: string): MarketplaceOption<T> {
  const normalizedZh = zhCN?.trim();
  return {
    value,
    en: en.trim() || value,
    ...(normalizedZh && normalizedZh !== en.trim() ? { zhCN: normalizedZh } : {})
  };
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

function humanizeSlug(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeCanonicalAttribute(value: CanonicalId): string {
  return humanizeSlug(value.replace(/^id\.attribute\./, ""));
}

function byEnglishLabel(left: MarketplaceOption, right: MarketplaceOption): number {
  return left.en.localeCompare(right.en) || left.value.localeCompare(right.value);
}
