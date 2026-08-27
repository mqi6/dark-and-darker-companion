export type LocaleCode = "en-US" | "zh-CN";

export type CanonicalId = `id.${string}`;

export interface LocalizedGameText {
  id: CanonicalId;
  en: string;
  zhCN?: string;
  zhStatus: "translated" | "english-fallback" | "missing";
  patch?: string;
}

export interface ItemRoll {
  attributeId: CanonicalId;
  value: number;
}

export interface ItemInstance {
  instanceKey: string;
  itemId: CanonicalId;
  name: LocalizedGameText;
  quantity: number;
  rarity?: string;
  rolls: readonly ItemRoll[];
  possibleSecondaryAttributeIds?: readonly CanonicalId[];
}

export interface MarketCandidate {
  listingId: string;
  item: ItemInstance;
  price: number;
  createdAt: string;
}

export interface SearchQuery {
  classIds: readonly CanonicalId[];
  itemIds: readonly CanonicalId[];
  slotTypes: readonly string[];
  rarities: readonly string[];
  minimumPrice?: number;
  maximumPrice?: number;
}

export type ActivityModule =
  | "capture"
  | "stash"
  | "auction"
  | "search"
  | "darkerdb"
  | "calibration"
  | "system";

export type ActivitySeverity = "information" | "success" | "warning" | "error";

export interface ActivityEntry {
  id: string;
  occurredAt: string;
  module: ActivityModule;
  severity: ActivitySeverity;
  messageKey: string;
  parameters?: Readonly<Record<string, string | number>>;
  diagnosticCode?: string;
  taskId?: string;
}
