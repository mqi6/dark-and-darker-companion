import { z } from "zod";

const entrySchema = z.object({
  tabIndex: z.number().int().nonnegative(),
  inventoryId: z.number().int().nonnegative(),
  label: z.string().trim().min(1).optional()
});

export const stashTabMappingSchema = z
  .object({
    schemaVersion: z.literal(1),
    runtimeProfileKey: z.string().trim().min(1),
    gameBuildFingerprint: z.string().trim().min(1),
    availableInventoryIds: z.array(z.number().int().nonnegative()),
    pageSetSignature: z.string().min(1),
    entries: z.array(entrySchema)
  })
  .superRefine((mapping, context) => {
    const tabs = new Set<number>();
    const inventories = new Set<number>();
    const available = new Set(mapping.availableInventoryIds);
    mapping.entries.forEach((entry, index) => {
      if (tabs.has(entry.tabIndex)) context.addIssue({ code: "custom", path: ["entries", index, "tabIndex"], message: `Duplicate tab ${entry.tabIndex}` });
      if (inventories.has(entry.inventoryId)) context.addIssue({ code: "custom", path: ["entries", index, "inventoryId"], message: `Duplicate inventory ${entry.inventoryId}` });
      if (!available.has(entry.inventoryId)) context.addIssue({ code: "custom", path: ["entries", index, "inventoryId"], message: `Inventory ${entry.inventoryId} is not in the current page set` });
      tabs.add(entry.tabIndex);
      inventories.add(entry.inventoryId);
    });
  });

export type StashTabMapping = z.infer<typeof stashTabMappingSchema>;
export type StashTabMappingEntry = z.infer<typeof entrySchema>;

export const CANONICAL_STASH_PAGE_ORDER = Object.freeze([
  4, 5, 6, 7, 8, 9, 20, 21, 30, 200
] as const);

export function confirmedStashTabEntries(parameters: {
  visibleTabCount: number;
  ownedInventoryIds?: readonly number[];
}): StashTabMappingEntry[] {
  const owned = parameters.ownedInventoryIds === undefined
    ? CANONICAL_STASH_PAGE_ORDER
    : CANONICAL_STASH_PAGE_ORDER.filter(id => parameters.ownedInventoryIds!.includes(id));
  if (!Number.isInteger(parameters.visibleTabCount) || parameters.visibleTabCount < 1 ||
      parameters.visibleTabCount > CANONICAL_STASH_PAGE_ORDER.length ||
      owned.length !== parameters.visibleTabCount) {
    throw new Error("Saved visible-tab count and owned stash page set do not agree.");
  }
  return owned.map((inventoryId, tabIndex) => ({ tabIndex, inventoryId }));
}

export function pageSetSignature(inventoryIds: readonly number[]): string {
  const normalized = [...new Set(inventoryIds)].sort((left, right) => left - right);
  return normalized.join(",");
}

export function createStashTabMapping(parameters: {
  runtimeProfileKey: string;
  gameBuildFingerprint: string;
  availableInventoryIds: readonly number[];
  entries: readonly StashTabMappingEntry[];
}): StashTabMapping {
  return stashTabMappingSchema.parse({
    schemaVersion: 1,
    runtimeProfileKey: parameters.runtimeProfileKey,
    gameBuildFingerprint: parameters.gameBuildFingerprint,
    availableInventoryIds: [...parameters.availableInventoryIds],
    pageSetSignature: pageSetSignature(parameters.availableInventoryIds),
    entries: [...parameters.entries]
  });
}

export function mappingIsCurrent(
  mapping: StashTabMapping,
  runtimeProfileKey: string,
  gameBuildFingerprint: string,
  availableInventoryIds: readonly number[]
): boolean {
  return mapping.runtimeProfileKey === runtimeProfileKey &&
    mapping.gameBuildFingerprint === gameBuildFingerprint &&
    mapping.pageSetSignature === pageSetSignature(availableInventoryIds);
}

export function resolveInventoryForTab(mapping: StashTabMapping, tabIndex: number): number | undefined {
  return mapping.entries.find((entry) => entry.tabIndex === tabIndex)?.inventoryId;
}
