import { describe, expect, it } from "vitest";
import { asCharacterInfoResponse, decodeSemanticMessage, encodeSemanticMessage, semanticTypeForCommand } from "../src/protocol/semanticDecoder";
import { createSanitizedSemanticSnapshot } from "../src/protocol/semanticSnapshot";
import { VersionedProtobufDecoder } from "../src/protocol/protobufDecoder";

const item = (overrides: Record<string, unknown> = {}) => ({ itemUniqueId: 101, itemId: "DesignDataItem:synthetic", itemCount: 1, inventoryId: 3, slotId: 0, itemAmmoCount: 0, itemContentsCount: 0, primaryPropertyArray: [], secondaryPropertyArray: [], tradable: 1, permittedAreaArray: [], ...overrides });
const response = (character: Record<string, unknown>) => ({ result: 1, characterDataBase: { accountId: "private-account", accountNickname: "private-name", characterId: "private-character", CharacterItemList: [], CharacterStorageItemList: [], CharacterStorageInfos: [], ...character } });
const roundTrip = (value: Record<string, unknown>) => asCharacterInfoResponse(decodeSemanticMessage(44, encodeSemanticMessage(44, value))!.value);
const snapshot = (value: Record<string, unknown>) => createSanitizedSemanticSnapshot(roundTrip(value), "test-schema", 100, 1);

describe("pinned semantic protocol", () => {
  it("decodes an empty character snapshot", async () => { const result = await snapshot(response({})); expect(result.containers).toEqual([]); });
  it("decodes one inventory item", async () => { const result = await snapshot(response({ CharacterItemList: [item()] })); expect(result.containers[0]).toMatchObject({ kind: "inventory", inventoryId: 3 }); expect(result.containers[0]!.items).toHaveLength(1); });
  it("decodes one storage item", async () => { const result = await snapshot(response({ CharacterStorageInfos: [{ inventoryId: 20, storageStatus: 1, CharacterStorageItemList: [item({ inventoryId: 20 })] }] })); expect(result.containers[0]).toMatchObject({ kind: "storage", inventoryId: 20, storageStatus: 1 }); });
  it("preserves stack quantity", async () => { const result = await snapshot(response({ CharacterItemList: [item({ itemCount: 17 })] })); expect(result.containers[0]!.items[0]!.stackQuantity).toBe(17); });
  it("preserves primary and secondary properties", async () => { const result = await snapshot(response({ CharacterItemList: [item({ primaryPropertyArray: [{ propertyTypeId: "Property.Primary", propertyValue: 12 }], secondaryPropertyArray: [{ propertyTypeId: "Property.Secondary", propertyValue: -3 }] })] })); expect(result.containers[0]!.items[0]).toMatchObject({ primaryProperties: [{ propertyId: "Property.Primary", value: 12 }], secondaryProperties: [{ propertyId: "Property.Secondary", value: -3 }] }); });
  it("preserves multiple empty storage pages", async () => { const result = await snapshot(response({ CharacterStorageInfos: [{ inventoryId: 20, storageStatus: 1, CharacterStorageItemList: [] }, { inventoryId: 21, storageStatus: 1, CharacterStorageItemList: [] }] })); expect(result.containers.map(container => container.inventoryId)).toEqual([20, 21]); });
  it("rejects malformed semantic payload", () => { expect(() => decodeSemanticMessage(44, Uint8Array.from([0xff]))).toThrow(); });
  it("retains unknown-command fallback", () => { expect(new VersionedProtobufDecoder().decode(65535, new Uint8Array())).toMatchObject({ kind: "unknown-command", command: 65535 }); });
  it("sanitizes player fields and aliases unique IDs deterministically", async () => { const result = await snapshot(response({ CharacterItemList: [item({ itemUniqueId: 999 }), item({ itemUniqueId: 1000, slotId: 1 })] })); const serialized = JSON.stringify(result); expect(result.containers[0]!.items.map(value => value.alias)).toEqual(["item-001", "item-002"]); expect(serialized).not.toContain("private-account"); expect(serialized).not.toContain("private-name"); expect(serialized).not.toContain("private-character"); expect(serialized).not.toContain("999"); });
  it("loads semantic types for prioritized inventory and marketplace commands", () => { for (const command of [44, 502, 504, 506, 507, 508, 552, 3513, 3514, 3533, 3534, 3560, 3565, 3566]) expect(semanticTypeForCommand(command)?.fullName).toMatch(/^\.DC\.Packet\.S/); });
});
