import type { LocalizationCatalog } from "./localizedCatalog";
import { GameIdBridge, asGameDesignAttributeId, asGameDesignItemId, isIdBridgeDiagnostic, type DarkerDbCanonicalAttributeId, type DarkerDbCanonicalItemId, type GameDesignAttributeId, type GameDesignItemId, type IdBridgeDiagnostic } from "./gameIdBridge";
import type { SemanticCharacterInfoResponse } from "../protocol/semanticDecoder";
import { createSanitizedSemanticSnapshot, type SanitizedSemanticSnapshotV1 } from "../protocol/semanticSnapshot";
import { SessionItemAliasRegistry } from "./sessionItemAliasRegistry";

export interface CharacterSnapshotCandidate { relativeTimestampMs: number; response: SemanticCharacterInfoResponse }
export interface EnrichedProtocolProperty { gameDesignAttributeId: GameDesignAttributeId; darkerDbCanonicalAttributeId?: DarkerDbCanonicalAttributeId; value: number; en?: string; zhCN?: string }
export interface EnrichedProtocolItem { alias: string; gameDesignItemId: GameDesignItemId; darkerDbCanonicalItemId?: DarkerDbCanonicalItemId; en?: string; zhCN?: string; inventoryId: number; slotId: number; stackQuantity: number; ammoCount: number; contentsCount: number; primaryProperties: EnrichedProtocolProperty[]; secondaryProperties: EnrichedProtocolProperty[]; tradable: number; permittedAreas: number[] }
export interface ReducedGameState { protocol: SanitizedSemanticSnapshotV1; items: EnrichedProtocolItem[]; diagnostics: IdBridgeDiagnostic[] }

export class GameStateReducer {
  private version = 0;
  private currentState: ReducedGameState | undefined;
  private readonly bridge: GameIdBridge;
  private readonly aliases = new SessionItemAliasRegistry();
  constructor(catalog: LocalizationCatalog, private readonly schemaVersion: string) { this.bridge = new GameIdBridge(catalog); }
  get current(): ReducedGameState | undefined { return this.currentState; }

  async replaceBaseline(candidates: readonly CharacterSnapshotCandidate[]): Promise<ReducedGameState> {
    const selected = [...candidates].filter(value => value.response.result === 1 && value.response.characterDataBase).sort((a, b) => a.relativeTimestampMs - b.relativeTimestampMs).at(-1);
    if (!selected) throw new Error("No successful character baseline is available");
    const nextVersion = this.version + 1;
    const protocol = await createSanitizedSemanticSnapshot(
      selected.response,
      this.schemaVersion,
      selected.relativeTimestampMs,
      nextVersion,
      { aliasFor: (rawUniqueId) => this.aliases.aliasFor(rawUniqueId) }
    );
    validateProtocolSnapshot(protocol);
    const diagnostics: IdBridgeDiagnostic[] = [], items: EnrichedProtocolItem[] = [];
    for (const container of protocol.containers) for (const item of container.items) {
      const gameDesignItemId = asGameDesignItemId(item.gameDesignItemId), itemBridge = this.bridge.item(gameDesignItemId);
      if (isIdBridgeDiagnostic(itemBridge)) diagnostics.push(itemBridge);
      const convertProperties = (values: typeof item.primaryProperties): EnrichedProtocolProperty[] => values.map(value => {
        const gameDesignAttributeId = asGameDesignAttributeId(value.propertyId), bridge = this.bridge.attribute(gameDesignAttributeId);
        if (isIdBridgeDiagnostic(bridge)) { diagnostics.push(bridge); return { gameDesignAttributeId, value: value.value }; }
        return { gameDesignAttributeId, darkerDbCanonicalAttributeId: bridge.canonicalId, value: value.value, en: bridge.display.en, ...(bridge.display.zhCN ? { zhCN: bridge.display.zhCN } : {}) };
      });
      items.push({ alias: item.alias, gameDesignItemId, ...(!isIdBridgeDiagnostic(itemBridge) ? { darkerDbCanonicalItemId: itemBridge.canonicalId, en: itemBridge.display.en, ...(itemBridge.display.zhCN ? { zhCN: itemBridge.display.zhCN } : {}) } : {}), inventoryId: item.inventoryId, slotId: item.slotId, stackQuantity: item.stackQuantity, ammoCount: item.ammoCount, contentsCount: item.contentsCount, primaryProperties: convertProperties(item.primaryProperties), secondaryProperties: convertProperties(item.secondaryProperties), tradable: item.tradable, permittedAreas: item.permittedAreas } satisfies EnrichedProtocolItem);
    }
    const next = { protocol, items, diagnostics };
    this.version = nextVersion; this.currentState = next;
    return next;
  }
}

function validateProtocolSnapshot(snapshot: SanitizedSemanticSnapshotV1): void {
  const aliases = new Set<string>();
  for (const container of snapshot.containers) for (const item of container.items) {
    if (aliases.has(item.alias)) throw new Error(`Duplicate item alias: ${item.alias}`);
    aliases.add(item.alias);
    if (item.inventoryId !== container.inventoryId) throw new Error(`Item ${item.alias} does not belong to container ${container.inventoryId}`);
  }
}
