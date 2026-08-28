import { describe, expect, it } from "vitest";
import rawCatalog from "../fixtures/darkerdb/localization/catalog.json";
import { gameplayCatalogSchema, type GameplayCatalog } from "../src/domain/gameplayCatalog";
import { GameStateReducer } from "../src/domain/gameStateReducer";
import {
  geometryForInventoryId,
  projectSpatialState,
  slotToPoint
} from "../src/domain/inventoryGeometry";
import { localizationCatalogSchema } from "../src/domain/localizedCatalog";
import { createStashPreview } from "../src/domain/stashPreview";
import type { SemanticCharacterInfoResponse, SemanticItem } from "../src/protocol/semanticDecoder";

const localization = localizationCatalogSchema.parse(rawCatalog);
const item = (uniqueId: string, slotId: number, count = 1): SemanticItem => ({
  itemUniqueId: uniqueId,
  itemId: "DesignDataItem:Id_Item_AdventurerTunic_1001",
  itemCount: count,
  inventoryId: 20,
  slotId,
  itemAmmoCount: 0,
  itemContentsCount: 0,
  primaryPropertyArray: [],
  secondaryPropertyArray: [],
  tradable: 1,
  permittedAreaArray: []
});
const response = (items: SemanticItem[]): SemanticCharacterInfoResponse => ({
  result: 1,
  characterDataBase: {
    accountId: "private",
    accountNickname: "private",
    characterId: "private",
    characterItemList: [],
    characterStorageItemList: [],
    characterStorageInfos: [{ inventoryId: 20, storageStatus: 1, characterStorageItemList: items }]
  }
});
const metadata = (width = 2, height = 2, maxStackSize = 1): GameplayCatalog => gameplayCatalogSchema.parse({
  schemaVersion: 1,
  generatedAt: "2026-08-28T00:00:00.000Z",
  source: "DarkerDB",
  apiVersion: "2026-08-03",
  sourceHash: "0".repeat(64),
  items: [{
    id: "id.item.adventurer_tunic_1001",
    rarity: "common",
    inventoryWidth: width,
    inventoryHeight: height,
    maxStackSize
  }]
});
async function reduce(items: SemanticItem[]) {
  return new GameStateReducer(localization, "test-schema").replaceBaseline([
    { relativeTimestampMs: 1, response: response(items) }
  ]);
}

describe("inventory geometry projection", () => {
  it("uses the verified 12x20 top-left row-major coordinate system", async () => {
    expect(geometryForInventoryId(20)).toEqual({ kind: "rectangular", columns: 12, rows: 20 });
    expect(slotToPoint(13, 12)).toEqual({ x: 1, y: 1 });
    const projection = projectSpatialState(await reduce([item("one", 13)]), metadata());
    const container = projection.containers[0]!;
    expect(container.status).toBe("ready");
    expect(container.placements[0]).toMatchObject({ x: 1, y: 1, width: 2, height: 2 });
    const preview = createStashPreview(container);
    expect(preview.cells).toHaveLength(240);
    expect(preview.cells.filter((cell) => cell.alias === "item-001")).toHaveLength(4);
  });

  it("blocks overlap, out-of-bounds, invalid stacks, and missing metadata", async () => {
    const overlap = projectSpatialState(await reduce([item("one", 0), item("two", 1)]), metadata());
    expect(overlap.containers[0]).toMatchObject({ status: "blocked" });
    expect(overlap.containers[0]!.diagnostics.map((value) => value.code)).toContain("item-overlap");

    const outside = projectSpatialState(await reduce([item("one", 239)]), metadata());
    expect(outside.containers[0]!.diagnostics.map((value) => value.code)).toContain("item-out-of-bounds");

    const stack = projectSpatialState(await reduce([item("one", 0, 2)]), metadata());
    expect(stack.containers[0]!.diagnostics.map((value) => value.code)).toContain("stack-invalid");

    const emptyCatalog = gameplayCatalogSchema.parse({ ...metadata(), items: [] });
    expect(projectSpatialState(await reduce([item("one", 0)]), emptyCatalog).containers[0]!.diagnostics)
      .toMatchObject([{ code: "item-metadata-missing" }]);
  });

  it("does not interpret unsupported inventories as rectangular storage", () => {
    expect(geometryForInventoryId(2)).toEqual({ kind: "unverified" });
    expect(geometryForInventoryId(3)).toEqual({ kind: "equipment" });
  });
});
