import type { LocalizationCatalog } from "./localizedCatalog";
import type { LocalizedGameText } from "./models";

declare const gameItemBrand: unique symbol;
declare const gameAttributeBrand: unique symbol;
declare const darkerItemBrand: unique symbol;
declare const darkerAttributeBrand: unique symbol;
export type GameDesignItemId = string & { readonly [gameItemBrand]: true };
export type GameDesignAttributeId = string & { readonly [gameAttributeBrand]: true };
export type DarkerDbCanonicalItemId = `id.item.${string}` & { readonly [darkerItemBrand]: true };
export type DarkerDbCanonicalAttributeId = `id.attribute.${string}` & { readonly [darkerAttributeBrand]: true };
export interface IdBridgeDiagnostic { kind: "unknown-item-id" | "unknown-attribute-id" | "catalog-id-missing"; gameId: string; attemptedId?: string }
export interface BridgedId<TGameId extends string, TCanonicalId extends string> { gameId: TGameId; canonicalId: TCanonicalId; display: Pick<LocalizedGameText, "en" | "zhCN" | "zhStatus"> }

const ITEM_EXCEPTIONS: Readonly<Record<string, string>> = {
  "DesignDataItem:Id_Item_PotionofWaterBreathing_1001": "id.item.potion_of_water_breathing_1001",
  "DesignDataItem:Id_Item_PotionofWaterBreathing_2001": "id.item.potion_of_water_breathing_2001",
  "DesignDataItem:Id_Item_PotionofWaterBreathing_4001": "id.item.potion_of_water_breathing_4001",
  "DesignDataItem:Id_Item_PotionofWaterBreathing_5001": "id.item.potion_of_water_breathing_5001",
  "DesignDataItem:Id_Item_TomeofSheol_5001": "id.item.tome_of_sheol_5001",
  "DesignDataItem:Id_Item_SealofDominion": "id.item.seal_of_dominion",
  "DesignDataItem:Id_Item_FangsofDeathNecklace_5001": "id.item.fangs_of_death_necklace_5001"
};
const ATTRIBUTE_EXCEPTIONS: Readonly<Record<string, string>> = {
  MaxHealthAdd: "max_health", PhysicalWeaponDamage: "weapon_damage", ArmorRatingAdd: "additional_armor_rating",
  PhysicalDamageAdd: "additional_physical_damage", MagicRegistance: "magic_resistance", UndeadDamageMod: "undead_damage_bonus",
  MemoryCapacityAdd: "additional_memory_capacity", DemonReductionMod: "demon_damage_reduction", MagicalDamageAdd: "additional_magical_damage",
  HeadshotDamageMod: "headshot_damage_bonus", DemonDamageMod: "demon_damage_bonus", UndeadReductionMod: "undead_damage_reduction",
  ProjectileReductionMod: "projectile_damage_reduction"
};

export class GameIdBridge {
  private readonly items: ReadonlyMap<string, LocalizedGameText>;
  private readonly attributes: ReadonlyMap<string, LocalizedGameText>;
  constructor(catalog: LocalizationCatalog) { this.items = new Map(catalog.items.map(value => [value.id, value])); this.attributes = new Map(catalog.attributes.map(value => [value.id, value])); }

  item(gameId: GameDesignItemId): BridgedId<GameDesignItemId, DarkerDbCanonicalItemId> | IdBridgeDiagnostic {
    const attemptedId = canonicalItemIdForGameDesignId(gameId);
    if (!attemptedId) return { kind: "unknown-item-id", gameId };
    const display = this.items.get(attemptedId);
    if (!display) return { kind: "catalog-id-missing", gameId, attemptedId };
    return { gameId, canonicalId: attemptedId as DarkerDbCanonicalItemId, display: pickDisplay(display) };
  }

  attribute(gameId: GameDesignAttributeId): BridgedId<GameDesignAttributeId, DarkerDbCanonicalAttributeId> | IdBridgeDiagnostic {
    const leaf = gameId.split(/[:_]/).at(-1) ?? "";
    const slug = ATTRIBUTE_EXCEPTIONS[leaf] ?? snakeCase(leaf);
    if (!leaf) return { kind: "unknown-attribute-id", gameId };
    const attemptedId = `id.attribute.${slug}`;
    const display = this.attributes.get(attemptedId);
    if (!display) return { kind: "catalog-id-missing", gameId, attemptedId };
    return { gameId, canonicalId: attemptedId as DarkerDbCanonicalAttributeId, display: pickDisplay(display) };
  }
}

export const asGameDesignItemId = (value: string): GameDesignItemId => value as GameDesignItemId;
export const asGameDesignAttributeId = (value: string): GameDesignAttributeId => value as GameDesignAttributeId;
export const isIdBridgeDiagnostic = (value: object): value is IdBridgeDiagnostic => "kind" in value;
export function canonicalItemIdForGameDesignId(gameId: GameDesignItemId): DarkerDbCanonicalItemId | undefined {
  const normal = /^DesignDataItem:Id_Item_(.+)$/.exec(gameId)?.[1];
  const candidate = ITEM_EXCEPTIONS[gameId] ?? (normal ? `id.item.${snakeCase(normal)}` : undefined);
  return candidate as DarkerDbCanonicalItemId | undefined;
}
function snakeCase(value: string): string { return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_").toLowerCase(); }
function pickDisplay(value: LocalizedGameText): Pick<LocalizedGameText, "en" | "zhCN" | "zhStatus"> { return { en: value.en, zhStatus: value.zhStatus, ...(value.zhCN ? { zhCN: value.zhCN } : {}) }; }
