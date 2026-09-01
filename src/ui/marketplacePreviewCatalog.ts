import type { CanonicalId } from "../domain/models";
import type { MarketplaceCatalogItem } from "../domain/marketplaceSearch";
import type {
  MarketplaceFilterCatalog,
  MarketplaceOption
} from "./marketplaceFilterCatalog";

const warlock = "id.class.warlock" as CanonicalId;
const wizard = "id.class.wizard" as CanonicalId;
const ranger = "id.class.ranger" as CanonicalId;
const fighter = "id.class.fighter" as CanonicalId;
const occultistRobe = "id.item.occultist_robe" as CanonicalId;
const adventurerTunic = "id.item.adventurer_tunic" as CanonicalId;
const longbow = "id.item.longbow" as CanonicalId;

const items: MarketplaceCatalogItem[] = [
  catalogItem("id.item.occultist_robe_4001", occultistRobe, "rare", "armor", "chest", {
    armorType: "cloth",
    classIds: [warlock],
    possible: ["agility", "knowledge", "strength", "magical_power", "physical_damage_reduction"]
  }),
  catalogItem("id.item.occultist_robe_5001", occultistRobe, "epic", "armor", "chest", {
    armorType: "cloth",
    classIds: [warlock],
    possible: ["agility", "knowledge", "strength", "magical_power", "physical_damage_reduction"]
  }),
  catalogItem("id.item.adventurer_tunic_4001", adventurerTunic, "rare", "armor", "chest", {
    armorType: "leather",
    classIds: [],
    possible: ["agility", "dexterity", "strength", "move_speed_bonus"]
  }),
  catalogItem("id.item.adventurer_tunic_5001", adventurerTunic, "epic", "armor", "chest", {
    armorType: "leather",
    classIds: [],
    possible: ["agility", "dexterity", "strength", "move_speed_bonus"]
  }),
  catalogItem("id.item.longbow_4001", longbow, "rare", "weapon", "primary", {
    weaponType: "bow",
    handType: "two_handed",
    classIds: [ranger, fighter],
    possible: ["physical_power", "weapon_damage", "action_speed"]
  }),
  catalogItem("id.item.longbow_5001", longbow, "epic", "weapon", "primary", {
    weaponType: "bow",
    handType: "two_handed",
    classIds: [ranger, fighter],
    possible: ["physical_power", "weapon_damage", "action_speed"]
  })
];

export const marketplacePreviewCatalog: MarketplaceFilterCatalog = {
  source: "preview-fixture",
  generatedAt: "2026-09-01T00:00:00.000Z",
  items,
  classes: [
    option(fighter, "Fighter", "战士"),
    option(ranger, "Ranger", "游侠"),
    option(warlock, "Warlock", "术士"),
    option(wizard, "Wizard", "法师")
  ],
  families: [
    option(adventurerTunic, "Adventurer Tunic", "冒险者外衣"),
    option(longbow, "Longbow", "长弓"),
    option(occultistRobe, "Occultist Robe", "神秘学长袍")
  ],
  rarities: [
    option("rare", "Rare", "稀有"),
    option("epic", "Epic", "史诗")
  ],
  itemTypes: [
    option("armor", "Armor", "防具"),
    option("weapon", "Weapon", "武器")
  ],
  slotTypes: [
    option("chest", "Chest", "胸部"),
    option("primary", "Primary hand", "主手")
  ],
  armorTypes: [
    option("cloth", "Cloth", "布甲"),
    option("leather", "Leather", "皮甲")
  ],
  weaponTypes: [option("bow", "Bow", "弓")],
  handTypes: [option("two_handed", "Two-handed", "双手")],
  attributes: [
    attribute("action_speed", "Action Speed", "动作速度", true, 0.5, 1.5),
    attribute("agility", "Agility", "敏捷", false, 1, 3),
    attribute("dexterity", "Dexterity", "灵巧", false, 1, 3),
    attribute("knowledge", "Knowledge", "知识", false, 1, 3),
    attribute("magical_power", "Magical Power", "魔法强度", false, 1, 2),
    attribute("move_speed_bonus", "Move Speed Bonus", "移动速度加成", true, 0.5, 1.5),
    attribute("physical_damage_reduction", "Physical Damage Reduction", "物理伤害减免", true, 0.7, 1.5),
    attribute("physical_power", "Physical Power", "物理强度", false, 1, 2),
    attribute("strength", "Strength", "力量", false, 1, 3),
    attribute("weapon_damage", "Weapon Damage", "武器伤害", false, 1, 2)
  ]
};

function catalogItem(
  id: CanonicalId,
  familyId: CanonicalId,
  rarity: string,
  itemType: string,
  slotType: string,
  details: {
    armorType?: string;
    weaponType?: string;
    handType?: string;
    classIds: CanonicalId[];
    possible: string[];
  }
): MarketplaceCatalogItem {
  return {
    id,
    familyId,
    rarity,
    itemType,
    slotType,
    ...(details.armorType === undefined ? {} : { armorType: details.armorType }),
    ...(details.weaponType === undefined ? {} : { weaponType: details.weaponType }),
    ...(details.handType === undefined ? {} : { handType: details.handType }),
    classIds: details.classIds,
    possibleSecondaryAttributeIds: details.possible.map(
      (value) => `id.attribute.${value}` as CanonicalId
    )
  };
}

function option<T extends string>(value: T, en: string, zhCN: string): MarketplaceOption<T> {
  return { value, en, zhCN };
}

function attribute(
  value: string,
  en: string,
  zhCN: string,
  isPercentage: boolean,
  minimum: number,
  maximum: number
) {
  return {
    value: `id.attribute.${value}` as CanonicalId,
    en,
    zhCN,
    isPercentage,
    minimum,
    maximum
  };
}
