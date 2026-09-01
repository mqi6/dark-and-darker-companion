import { describe, expect, it } from "vitest";
import {
  darkerDbAttributeSchema,
  darkerDbClassSchema,
  darkerDbFacetsBodySchema,
  darkerDbGameplayItemSchema
} from "../src/adapters/darkerdbContracts";
import { buildDarkerDbMarketplaceFilterCatalog } from "../src/adapters/darkerdbMarketplaceFilterCatalog";

describe("live DarkerDB Marketplace filter catalog", () => {
  it("joins bilingual labels by canonical IDs and keeps filter values canonical", () => {
    const englishItems = [item("id.item.arcane_robe_4001", "Arcane Robe", "rare")];
    const chineseItems = [item("id.item.arcane_robe_4001", "奥术长袍", "rare")];
    const result = buildDarkerDbMarketplaceFilterCatalog({
      englishItems,
      simplifiedChineseItems: chineseItems,
      englishAttributes: [attribute("Power", "Power description")],
      simplifiedChineseAttributes: [attribute("力量", "力量说明")],
      englishClasses: [characterClass("Wizard")],
      simplifiedChineseClasses: [characterClass("法师")],
      englishFacets: facets("Rare", "Chest"),
      simplifiedChineseFacets: facets("稀有", "胸部"),
      generatedAt: "2026-09-01T00:00:00.000Z"
    });

    expect(result.catalog).toMatchObject({
      source: "darkerdb-live",
      families: [{ value: "id.item.arcane_robe", en: "Arcane Robe", zhCN: "奥术长袍" }],
      classes: [{ value: "id.class.wizard", en: "Wizard", zhCN: "法师" }],
      rarities: [{ value: "rare", en: "Rare", zhCN: "稀有" }],
      slotTypes: [{ value: "chest", en: "Chest", zhCN: "胸部" }]
    });
    expect(result.catalog.attributes[0]).toMatchObject({
      value: "id.attribute.power",
      en: "Power",
      zhCN: "力量",
      descriptionEn: "Power description",
      descriptionZhCN: "力量说明"
    });
    expect(result.localizedItemNames.get("id.item.arcane_robe_4001")).toMatchObject({
      id: "id.item.arcane_robe_4001",
      en: "Arcane Robe",
      zhCN: "奥术长袍"
    });
  });

  it("falls back to English without using a localized display name as an identity", () => {
    const englishItems = [item("id.item.arcane_robe_4001", "Arcane Robe", "rare")];
    const result = buildDarkerDbMarketplaceFilterCatalog({
      englishItems,
      simplifiedChineseItems: [],
      englishAttributes: [],
      simplifiedChineseAttributes: [],
      englishClasses: [],
      simplifiedChineseClasses: [],
      englishFacets: darkerDbFacetsBodySchema.parse({ facets: {} }),
      simplifiedChineseFacets: darkerDbFacetsBodySchema.parse({ facets: {} }),
      generatedAt: "2026-09-01T00:00:00.000Z"
    });

    expect(result.catalog.families[0]).toEqual({
      value: "id.item.arcane_robe",
      en: "Arcane Robe"
    });
    expect(result.catalog.rarities[0]).toEqual({ value: "rare", en: "Rare", zhCN: "稀有" });
  });
});

function item(id: `id.${string}`, name: string, rarity: string) {
  return darkerDbGameplayItemSchema.parse({
    id,
    archetype: "id.item.arcane_robe",
    name,
    rarity,
    max_stack_size: 1,
    slot_type: "chest",
    item_type: "armor",
    armor_type: "cloth",
    required_class: "wizard"
  });
}

function attribute(name: string, description: string) {
  return darkerDbAttributeSchema.parse({
    id: "id.attribute.power",
    name,
    description,
    is_percentage: false,
    attribute_group: "secondary"
  });
}

function characterClass(name: string) {
  return darkerDbClassSchema.parse({ id: "id.class.wizard", name });
}

function facets(rarityLabel: string, slotLabel: string) {
  return darkerDbFacetsBodySchema.parse({
    facets: {
      item_rarity: {
        name: "Rarity",
        description: "",
        auth_required: false,
        values: [{ value: "rare", label: rarityLabel }]
      },
      "item.slot_type": {
        name: "Slot",
        description: "",
        auth_required: false,
        values: [{ value: "chest", label: slotLabel }]
      }
    }
  });
}
