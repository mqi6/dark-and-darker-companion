import protobuf, { type Message, type Type } from "protobufjs";
import schemaJson from "./schema/pinned-schema.json";
import { PRIORITIZED_COMMANDS, SCHEMA_PROVENANCE } from "./commands";

export interface SemanticItemProperty { propertyTypeId: string; propertyValue: number }
export interface SemanticPermittedArea { type: number }
export interface SemanticItem {
  itemUniqueId: string; itemId: string; itemCount: number; inventoryId: number; slotId: number;
  itemAmmoCount: number; itemContentsCount: number; primaryPropertyArray: SemanticItemProperty[];
  secondaryPropertyArray: SemanticItemProperty[]; tradable: number; permittedAreaArray: SemanticPermittedArea[];
}
export interface SemanticStorageInfo { inventoryId: number; characterStorageItemList: SemanticItem[]; storageStatus: number }
export interface SemanticCharacterInfo {
  accountId: string; accountNickname: string; characterId: string; characterItemList: SemanticItem[];
  characterStorageItemList: SemanticItem[]; characterStorageInfos: SemanticStorageInfo[];
}
export interface SemanticCharacterInfoResponse { result: number; characterDataBase?: SemanticCharacterInfo }
export interface SemanticDecodedMessage { command: number; commandName: string; typeName: string; value: Record<string, unknown> }

const root = protobuf.Root.fromJSON(schemaJson);
root.resolveAll();
const packetCommandEnum = root.lookupEnum("DC.Packet.PacketCommand");
export const pinnedPacketCommandIds: ReadonlySet<number> = new Set(Object.values(packetCommandEnum.values));

export function semanticTypeForCommand(command: number): Type | undefined {
  const commandName = (PRIORITIZED_COMMANDS as Record<number, string>)[command];
  if (!commandName) return undefined;
  const type = root.lookupTypeOrEnum(`DC.Packet.S${commandName}`);
  return type instanceof protobuf.Type ? type : undefined;
}

export function decodeSemanticMessage(command: number, payload: Uint8Array): SemanticDecodedMessage | undefined {
  const commandName = (PRIORITIZED_COMMANDS as Record<number, string>)[command];
  const type = semanticTypeForCommand(command);
  if (!commandName || !type) return undefined;
  const message = type.decode(payload);
  const value = type.toObject(message, { longs: String, enums: Number, defaults: true, arrays: true, objects: true }) as Record<string, unknown>;
  return { command, commandName, typeName: type.fullName.slice(1), value };
}

export function encodeSemanticMessage(command: number, value: Record<string, unknown>): Uint8Array {
  const type = semanticTypeForCommand(command);
  if (!type) throw new Error(`No pinned semantic schema for command ${command}`);
  const validationError = type.verify(value);
  if (validationError) throw new Error(validationError);
  return type.encode(type.create(value) as Message).finish();
}

export function asCharacterInfoResponse(value: Record<string, unknown>): SemanticCharacterInfoResponse {
  const source = value as Record<string, any>;
  const character = source.characterDataBase as Record<string, any> | undefined;
  return {
    result: Number(source.result ?? 0),
    ...(character ? { characterDataBase: {
      accountId: String(character.accountId ?? ""), accountNickname: String(character.accountNickname ?? ""), characterId: String(character.characterId ?? ""),
      characterItemList: (character.CharacterItemList ?? []) as SemanticItem[],
      characterStorageItemList: (character.CharacterStorageItemList ?? []) as SemanticItem[],
      characterStorageInfos: ((character.CharacterStorageInfos ?? []) as Array<Record<string, any>>).map(storage => ({ inventoryId: Number(storage.inventoryId ?? 0), characterStorageItemList: (storage.CharacterStorageItemList ?? []) as SemanticItem[], storageStatus: Number(storage.storageStatus ?? 0) }))
    } } : {})
  };
}

export const semanticSchemaProvenance = SCHEMA_PROVENANCE;
