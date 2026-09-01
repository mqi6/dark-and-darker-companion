import { describe, expect, it } from "vitest";
import {
  buildMarketplaceCatalog,
  normalizeRequiredClasses
} from "../src/adapters/darkerdbMarketplaceCatalog";
import {
  darkerDbGameplayItemSchema,
  darkerDbItemDetailSchema
} from "../src/adapters/darkerdbContracts";

describe("DarkerDB Marketplace catalog normalization", () => {
  it("maps canonical family, class, type, and per-item possible-roll metadata", () => {
    const row = darkerDbGameplayItemSchema.parse({
      id: "id.item.arcane_garb_4001",
      archetype: "id.archetype.arcane_garb",
      name: "Arcane Garb",
      rarity: "Epic",
      inventory_width: 2,
      inventory_height: 3,
      max_stack_size: 1,
      slot_type: "Chest",
      item_type: "Armor",
      armor_type: "Cloth",
      hand_type: "Two Handed",
      required_class: "wizard|id.class.sorcerer"
    });
    const detail = darkerDbItemDetailSchema.parse({
      ...row,
      primary_attributes: [],
      secondary_attributes: [
        {
          attribute_id: "magic_penetration",
          minimum: 15,
          maximum: 30,
          enchanted_min: 15,
          enchanted_max: 30,
          percentage: true
        }
      ]
    });

    const result = buildMarketplaceCatalog([row], new Map([[row.id, detail]]));

    expect(result.items[0]).toEqual({
      id: "id.item.arcane_garb_4001",
      familyId: "id.archetype.arcane_garb",
      rarity: "epic",
      itemType: "armor",
      slotType: "chest",
      armorType: "cloth",
      handType: "two handed",
      classIds: ["id.class.sorcerer", "id.class.wizard"],
      possibleSecondaryAttributeIds: ["id.attribute.magic_penetration"]
    });
  });

  it("omits rows without a server-provided family ID instead of guessing from a name", () => {
    const row = darkerDbGameplayItemSchema.parse({
      id: "id.item.unknown_3001",
      name: "Unknown",
      rarity: "rare",
      max_stack_size: 1
    });

    expect(buildMarketplaceCatalog([row])).toEqual({
      items: [],
      omitted: [{ id: "id.item.unknown_3001", reason: "missing-family-id" }]
    });
  });

  it("normalizes unrestricted, pipe-separated, and array class values", () => {
    expect(normalizeRequiredClasses(undefined)).toEqual([]);
    expect(normalizeRequiredClasses("wizard|cleric|wizard")).toEqual([
      "id.class.cleric",
      "id.class.wizard"
    ]);
    expect(normalizeRequiredClasses(["fighter", "id.class.ranger"])).toEqual([
      "id.class.fighter",
      "id.class.ranger"
    ]);
  });

  it("rejects duplicate canonical item IDs", () => {
    const row = darkerDbGameplayItemSchema.parse({
      id: "id.item.duplicate_3001",
      archetype: "id.archetype.duplicate",
      name: "Duplicate",
      rarity: "rare",
      max_stack_size: 1
    });
    expect(() => buildMarketplaceCatalog([row, row])).toThrow("Duplicate DarkerDB item ID");
  });
});
