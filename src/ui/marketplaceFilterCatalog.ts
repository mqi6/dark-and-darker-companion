import type { CanonicalId } from "../domain/models";
import type { MarketplaceCatalogItem } from "../domain/marketplaceSearch";

export interface MarketplaceOption<T extends string = string> {
  value: T;
  en: string;
  zhCN?: string;
  descriptionEn?: string;
  descriptionZhCN?: string;
}

export interface MarketplaceAttributeOption extends MarketplaceOption<CanonicalId> {
  isPercentage: boolean;
  minimum?: number;
  maximum?: number;
}

export interface MarketplaceFilterCatalog {
  source: "preview-fixture" | "darkerdb-cache" | "darkerdb-live";
  generatedAt: string;
  items: readonly MarketplaceCatalogItem[];
  classes: readonly MarketplaceOption<CanonicalId>[];
  families: readonly MarketplaceOption<CanonicalId>[];
  rarities: readonly MarketplaceOption[];
  itemTypes: readonly MarketplaceOption[];
  slotTypes: readonly MarketplaceOption[];
  armorTypes: readonly MarketplaceOption[];
  weaponTypes: readonly MarketplaceOption[];
  handTypes: readonly MarketplaceOption[];
  attributes: readonly MarketplaceAttributeOption[];
}

export function marketplaceOptionLabel(
  option: Pick<MarketplaceOption, "en" | "zhCN">,
  locale: "en-US" | "zh-CN"
): string {
  return locale === "zh-CN" && option.zhCN ? option.zhCN : option.en;
}

export function marketplaceOptionDescription(
  option: Pick<MarketplaceOption, "descriptionEn" | "descriptionZhCN">,
  locale: "en-US" | "zh-CN"
): string | undefined {
  return locale === "zh-CN" && option.descriptionZhCN
    ? option.descriptionZhCN
    : option.descriptionEn;
}
