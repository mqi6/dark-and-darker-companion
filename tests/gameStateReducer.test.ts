import { describe, expect, it } from "vitest";
import rawCatalog from "../fixtures/darkerdb/localization/catalog.json";
import { localizationCatalogSchema } from "../src/domain/localizedCatalog";
import { GameIdBridge, asGameDesignAttributeId, asGameDesignItemId, isIdBridgeDiagnostic } from "../src/domain/gameIdBridge";
import { GameStateReducer } from "../src/domain/gameStateReducer";
import type { SemanticCharacterInfoResponse, SemanticItem } from "../src/protocol/semanticDecoder";

const catalog = localizationCatalogSchema.parse(rawCatalog), bridge = new GameIdBridge(catalog);
const baseItem = (overrides: Partial<SemanticItem> = {}): SemanticItem => ({ itemUniqueId: "1", itemId: "DesignDataItem:Id_Item_AdventurerTunic_1001", itemCount: 1, inventoryId: 3, slotId: 0, itemAmmoCount: 0, itemContentsCount: 0, primaryPropertyArray: [], secondaryPropertyArray: [], tradable: 1, permittedAreaArray: [], ...overrides });
const response = (items: SemanticItem[], result = 1): SemanticCharacterInfoResponse => ({ result, characterDataBase: { accountId: "private", accountNickname: "private", characterId: "private", characterItemList: items, characterStorageItemList: [], characterStorageInfos: [] } });

describe("game ID bridge", () => {
  it("keeps game and DarkerDB item namespaces distinct", () => { const mapped = bridge.item(asGameDesignItemId("DesignDataItem:Id_Item_AdventurerTunic_1001")); expect(isIdBridgeDiagnostic(mapped)).toBe(false); if (!isIdBridgeDiagnostic(mapped)) { expect(mapped.gameId).toBe("DesignDataItem:Id_Item_AdventurerTunic_1001"); expect(mapped.canonicalId).toBe("id.item.adventurer_tunic_1001"); expect(mapped.display.en).toBeTruthy(); expect(mapped.display.zhCN).toBeTruthy(); } });
  it("maps the water-breathing potion exception", () => { expect(bridge.item(asGameDesignItemId("DesignDataItem:Id_Item_PotionofWaterBreathing_4001"))).toMatchObject({ canonicalId: "id.item.potion_of_water_breathing_4001" }); });
  it.each(Object.entries({ MaxHealthAdd: "max_health", PhysicalWeaponDamage: "weapon_damage", ArmorRatingAdd: "additional_armor_rating", PhysicalDamageAdd: "additional_physical_damage", MagicRegistance: "magic_resistance", UndeadDamageMod: "undead_damage_bonus", MemoryCapacityAdd: "additional_memory_capacity", DemonReductionMod: "demon_damage_reduction", MagicalDamageAdd: "additional_magical_damage", HeadshotDamageMod: "headshot_damage_bonus", DemonDamageMod: "demon_damage_bonus", UndeadReductionMod: "undead_damage_reduction", ProjectileReductionMod: "projectile_damage_reduction" }))("maps explicit attribute %s", (gameId, slug) => { expect(bridge.attribute(asGameDesignAttributeId(gameId))).toMatchObject({ canonicalId: `id.attribute.${slug}` }); });
  it("diagnoses rather than guesses unknown IDs", () => { expect(bridge.item(asGameDesignItemId("unknown"))).toEqual({ kind: "unknown-item-id", gameId: "unknown" }); });
});

describe("Phase 4 baseline reducer", () => {
  it("selects the latest success, replaces atomically, and increments versions", async () => { const reducer = new GameStateReducer(catalog, "schema"); const first = await reducer.replaceBaseline([{ relativeTimestampMs: 2, response: response([baseItem({ itemCount: 2 })]) }, { relativeTimestampMs: 3, response: response([], 0) }, { relativeTimestampMs: 1, response: response([]) }]); expect(first.protocol.snapshotVersion).toBe(1); expect(first.items[0]!.stackQuantity).toBe(2); const second = await reducer.replaceBaseline([{ relativeTimestampMs: 4, response: response([baseItem({ itemCount: 3 })]) }]); expect(second.protocol.snapshotVersion).toBe(2); expect(second.protocol.snapshotHash).not.toBe(first.protocol.snapshotHash); });
  it("keeps item aliases stable when packet order and location change", async () => {
    const reducer = new GameStateReducer(catalog, "schema");
    const first = await reducer.replaceBaseline([{ relativeTimestampMs: 1, response: response([
      baseItem({ itemUniqueId: "alpha", slotId: 0 }),
      baseItem({ itemUniqueId: "beta", slotId: 1 })
    ]) }]);
    const alphaAlias = first.items.find((value) => value.slotId === 0)!.alias;
    const betaAlias = first.items.find((value) => value.slotId === 1)!.alias;
    const second = await reducer.replaceBaseline([{ relativeTimestampMs: 2, response: response([
      baseItem({ itemUniqueId: "beta", slotId: 1 }),
      baseItem({ itemUniqueId: "alpha", slotId: 12 })
    ]) }]);
    expect(second.items.find((value) => value.slotId === 12)!.alias).toBe(alphaAlias);
    expect(second.items.find((value) => value.slotId === 1)!.alias).toBe(betaAlias);
    expect(JSON.stringify(second)).not.toContain("alpha");
    expect(JSON.stringify(second)).not.toContain("beta");
  });
  it("rejects duplicate aliases without replacing current state", async () => { const reducer = new GameStateReducer(catalog, "schema"); const accepted = await reducer.replaceBaseline([{ relativeTimestampMs: 1, response: response([baseItem()]) }]); await expect(reducer.replaceBaseline([{ relativeTimestampMs: 2, response: response([baseItem(), baseItem({ slotId: 1 })]) }])).rejects.toThrow(/Duplicate item alias/); expect(reducer.current).toBe(accepted); });
  it("rejects invalid container membership", async () => { const reducer = new GameStateReducer(catalog, "schema"); const invalid: SemanticCharacterInfoResponse = { result: 1, characterDataBase: { accountId: "", accountNickname: "", characterId: "", characterItemList: [], characterStorageItemList: [], characterStorageInfos: [{ inventoryId: 20, storageStatus: 1, characterStorageItemList: [baseItem({ inventoryId: 21 })] }] } }; await expect(reducer.replaceBaseline([{ relativeTimestampMs: 1, response: invalid }])).rejects.toThrow(/does not belong/); });
  it("preserves properties, tradability, permitted areas and enriches after reduction", async () => { const reducer = new GameStateReducer(catalog, "schema"); const state = await reducer.replaceBaseline([{ relativeTimestampMs: 1, response: response([baseItem({ primaryPropertyArray: [{ propertyTypeId: "MaxHealthAdd", propertyValue: 5 }], secondaryPropertyArray: [{ propertyTypeId: "PhysicalWeaponDamage", propertyValue: 2 }], tradable: 0, permittedAreaArray: [{ type: 7 }] })]) }]); expect(state.items[0]).toMatchObject({ gameDesignItemId: "DesignDataItem:Id_Item_AdventurerTunic_1001", darkerDbCanonicalItemId: "id.item.adventurer_tunic_1001", tradable: 0, permittedAreas: [7], primaryProperties: [{ darkerDbCanonicalAttributeId: "id.attribute.max_health", value: 5 }], secondaryProperties: [{ darkerDbCanonicalAttributeId: "id.attribute.weapon_damage", value: 2 }] }); });
  it("keeps spatial identity when only display localization is missing", async () => {
    const reducer = new GameStateReducer(catalog, "schema");
    const state = await reducer.replaceBaseline([{ relativeTimestampMs: 1, response: response([
      baseItem({ itemId: "DesignDataItem:Id_Item_FutureItem_1001" })
    ]) }]);
    expect(state.items[0]).toMatchObject({ darkerDbCanonicalItemId: "id.item.future_item_1001" });
    expect(state.items[0]).not.toHaveProperty("en");
    expect(state.items[0]).not.toHaveProperty("zhCN");
    expect(state.diagnostics).toContainEqual({
      kind: "catalog-id-missing",
      gameId: "DesignDataItem:Id_Item_FutureItem_1001",
      attemptedId: "id.item.future_item_1001"
    });
  });
});
