import { describe, expect, it } from "vitest";
import { asGameDesignItemId, canonicalItemIdForGameDesignIdInCatalog } from "../src/domain/gameIdBridge";

describe("catalog-aware game item ID bridge", () => {
  it("uses one punctuation-insensitive canonical match", () => {
    const id = asGameDesignItemId("DesignDataItem:Id_Item_TestItem_1001");
    expect(canonicalItemIdForGameDesignIdInCatalog(id, ["id.item.test_item1001"]))
      .toBe("id.item.test_item1001");
  });

  it("fails closed when the normalized catalog match is ambiguous or absent", () => {
    const id = asGameDesignItemId("DesignDataItem:Id_Item_TestItem_1001");
    expect(canonicalItemIdForGameDesignIdInCatalog(id, [
      "id.item.test_item1001", "id_item_test_item_1001"
    ])).toBeUndefined();
    expect(canonicalItemIdForGameDesignIdInCatalog(id, ["id.item.other"]))
      .toBeUndefined();
  });
});
