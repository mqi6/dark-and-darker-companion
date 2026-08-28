import type { SemanticCharacterInfoResponse, SemanticItem, SemanticItemProperty } from "./semanticDecoder";
import type { ItemAliasResolver } from "../domain/sessionItemAliasRegistry";

export interface SanitizedProtocolProperty { propertyId: string; value: number }
export interface SanitizedProtocolItem {
  alias: string; gameDesignItemId: string; inventoryId: number; slotId: number; stackQuantity: number;
  ammoCount: number; contentsCount: number; primaryProperties: SanitizedProtocolProperty[];
  secondaryProperties: SanitizedProtocolProperty[]; tradable: number; permittedAreas: number[];
}
export interface SanitizedProtocolContainer { inventoryId: number; kind: "inventory" | "storage"; storageStatus?: number; items: SanitizedProtocolItem[] }
export interface SanitizedSemanticSnapshotV1 {
  schemaVersion: 1; sourceSchemaVersion: string; relativeTimestampMs: number; snapshotVersion: number;
  containers: SanitizedProtocolContainer[]; snapshotHash: string; intentionallyOmitted: string[];
}

export async function createSanitizedSemanticSnapshot(
  response: SemanticCharacterInfoResponse,
  sourceSchemaVersion: string,
  relativeTimestampMs: number,
  snapshotVersion: number,
  options: { aliasFor?: ItemAliasResolver } = {}
): Promise<SanitizedSemanticSnapshotV1> {
  if (response.result !== 1 || !response.characterDataBase) throw new Error("Character snapshot result is not successful");
  const aliases = new Map<string, string>();
  const rawIdByAlias = new Map<string, string>();
  const aliasFor = (uniqueId: string) => {
    const existing = aliases.get(uniqueId);
    if (existing) return existing;
    const alias = options.aliasFor?.(uniqueId) ?? `item-${String(aliases.size + 1).padStart(3, "0")}`;
    if (!/^item-[0-9]{3,}$/.test(alias)) throw new Error("Item alias resolver returned a non-opaque alias");
    const owner = rawIdByAlias.get(alias);
    if (owner !== undefined && owner !== uniqueId) throw new Error(`Duplicate item alias: ${alias}`);
    aliases.set(uniqueId, alias);
    rawIdByAlias.set(alias, uniqueId);
    return alias;
  };
  const convert = (item: SemanticItem): SanitizedProtocolItem => ({
    alias: aliasFor(String(item.itemUniqueId)), gameDesignItemId: item.itemId, inventoryId: item.inventoryId,
    slotId: item.slotId, stackQuantity: item.itemCount, ammoCount: item.itemAmmoCount,
    contentsCount: item.itemContentsCount, primaryProperties: properties(item.primaryPropertyArray),
    secondaryProperties: properties(item.secondaryPropertyArray), tradable: item.tradable,
    permittedAreas: item.permittedAreaArray.map(area => area.type)
  });
  const character = response.characterDataBase;
  const containers = new Map<string, SanitizedProtocolContainer>();
  const addItems = (kind: "inventory" | "storage", items: SemanticItem[], storageStatus?: number, forcedInventoryId?: number) => {
    for (const item of items) {
      const inventoryId = forcedInventoryId ?? item.inventoryId, key = `${kind}:${inventoryId}`;
      let container = containers.get(key);
      if (!container) { container = { inventoryId, kind, ...(storageStatus === undefined ? {} : { storageStatus }), items: [] }; containers.set(key, container); }
      container.items.push(convert(item));
    }
    if (forcedInventoryId !== undefined && !containers.has(`${kind}:${forcedInventoryId}`)) containers.set(`${kind}:${forcedInventoryId}`, { inventoryId: forcedInventoryId, kind, ...(storageStatus === undefined ? {} : { storageStatus }), items: [] });
  };
  addItems("inventory", character.characterItemList ?? []);
  if ((character.characterStorageInfos?.length ?? 0) > 0) for (const storage of character.characterStorageInfos) addItems("storage", storage.characterStorageItemList ?? [], storage.storageStatus, storage.inventoryId);
  else addItems("storage", character.characterStorageItemList ?? []);
  const sortedContainers = [...containers.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.inventoryId - b.inventoryId);
  for (const container of sortedContainers) container.items.sort((a, b) => a.slotId - b.slotId || a.alias.localeCompare(b.alias));
  const base = { schemaVersion: 1 as const, sourceSchemaVersion, relativeTimestampMs, snapshotVersion, containers: sortedContainers, intentionallyOmitted: ["accountId", "accountNickname", "characterId", "nickname", "networkAddresses", "rawItemUniqueIds", "legacyCharacterStorageItemListWhenStorageInfosPresent"] };
  return { ...base, snapshotHash: await sha256(stableStringify(legacyV1HashContract(base))) };
}

function properties(values: SemanticItemProperty[] = []): SanitizedProtocolProperty[] { return values.map(value => ({ propertyId: value.propertyTypeId, value: value.propertyValue })); }
function legacyV1HashContract(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(legacyV1HashContract);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key === "gameDesignItemId" ? "canonicalItemId" : key, legacyV1HashContract(item)]));
  return value;
}
function stableStringify(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`; return JSON.stringify(value); }
async function sha256(value: string): Promise<string> { const bytes = new TextEncoder().encode(value), digest = await crypto.subtle.digest("SHA-256", bytes); return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join(""); }
