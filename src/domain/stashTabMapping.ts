import { z } from "zod";
import canonicalStashTabs from "../data/stash-tabs.v1.json";

const entrySchema = z.object({
  tabIndex: z.number().int().nonnegative(),
  inventoryId: z.number().int().nonnegative(),
  label: z.string().trim().min(1).optional()
});

const canonicalCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    description: z.string().trim().min(1),
    maximumVisibleTabs: z.literal(10),
    entries: z.array(z.object({
      tabIndex: z.number().int().min(0).max(9),
      inventoryId: z.number().int().nonnegative(),
      pageType: z.enum(["personal", "shared", "mission"]),
      pageNumber: z.number().int().positive()
    })).length(10)
  })
  .superRefine((catalog, context) => {
    const tabs = new Set<number>();
    const inventories = new Set<number>();
    catalog.entries.forEach((entry, index) => {
      if (tabs.has(entry.tabIndex)) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "tabIndex"],
          message: `Duplicate canonical tab ${entry.tabIndex}`
        });
      }
      if (inventories.has(entry.inventoryId)) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "inventoryId"],
          message: `Duplicate canonical inventory ${entry.inventoryId}`
        });
      }
      tabs.add(entry.tabIndex);
      inventories.add(entry.inventoryId);
    });
    for (let tabIndex = 0; tabIndex < catalog.maximumVisibleTabs; tabIndex += 1) {
      if (!tabs.has(tabIndex)) {
        context.addIssue({
          code: "custom",
          path: ["entries"],
          message: `Canonical tab ${tabIndex} is missing`
        });
      }
    }
  });

export const CANONICAL_STASH_TAB_CATALOG = canonicalCatalogSchema.parse(canonicalStashTabs);

export const CANONICAL_STASH_INVENTORY_ORDER: readonly number[] = Object.freeze(
  [...CANONICAL_STASH_TAB_CATALOG.entries]
    .sort((left, right) => left.tabIndex - right.tabIndex)
    .map((entry) => entry.inventoryId)
);

export const FULL_STASH_TAB_MAPPING_ENTRIES: readonly StashTabMappingEntry[] = Object.freeze(
  CANONICAL_STASH_TAB_CATALOG.entries
    .map((entry) => ({
      tabIndex: entry.tabIndex,
      inventoryId: entry.inventoryId,
      label: `${entry.pageType}-${entry.pageNumber}`
    }))
    .sort((left, right) => left.tabIndex - right.tabIndex)
);

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

/**
 * Creates the compact visible mapping for one character from the verified
 * ten-page order. The caller must supply pages proven visible for that
 * character; command-44 container presence alone is not visibility evidence.
 */
export function createCanonicalStashTabMapping(parameters: {
  runtimeProfileKey: string;
  gameBuildFingerprint: string;
  visibleInventoryIds: readonly number[];
}): StashTabMapping {
  if (parameters.visibleInventoryIds.length < 1 ||
      parameters.visibleInventoryIds.length > CANONICAL_STASH_TAB_CATALOG.maximumVisibleTabs) {
    throw new RangeError("Visible stash inventory count must be between 1 and 10.");
  }
  const visible = new Set(parameters.visibleInventoryIds);
  if (visible.size !== parameters.visibleInventoryIds.length) {
    throw new Error("Visible stash inventory IDs must be unique.");
  }
  const unknown = [...visible].filter(
    (inventoryId) => !CANONICAL_STASH_INVENTORY_ORDER.includes(inventoryId)
  );
  if (unknown.length > 0) {
    throw new Error(`Unknown visible stash inventory IDs: ${unknown.join(", ")}`);
  }

  const entries = FULL_STASH_TAB_MAPPING_ENTRIES
    .filter((entry) => visible.has(entry.inventoryId))
    .map((entry, tabIndex) => ({
      tabIndex,
      inventoryId: entry.inventoryId,
      ...(entry.label ? { label: entry.label } : {})
    }));

  return createStashTabMapping({
    runtimeProfileKey: parameters.runtimeProfileKey,
    gameBuildFingerprint: parameters.gameBuildFingerprint,
    availableInventoryIds: entries.map((entry) => entry.inventoryId),
    entries
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


/**
 * Ensures a character-specific UI mapping is compact and matches the number
 * of buttons actually visible in the current navigation profile.
 *
 * A full ten-container protocol snapshot is not proof that ten tab buttons
 * are visible. Mixing those concepts can click a valid button for the wrong
 * inventory, so the operator must stop before dispatching input.
 */
export function assertCompactVisibleStashMapping(
  mapping: StashTabMapping,
  visibleStashTabs: number
): void {
  if (!Number.isInteger(visibleStashTabs) || visibleStashTabs < 1 || visibleStashTabs > 10) {
    throw new RangeError("Visible stash tab count must be between 1 and 10.");
  }
  if (mapping.entries.length !== visibleStashTabs) {
    throw new Error(
      `visible-stash-mapping-mismatch: profile has ${visibleStashTabs} buttons but mapping has ${mapping.entries.length} entries`
    );
  }
  const ordered = [...mapping.entries].sort((left, right) => left.tabIndex - right.tabIndex);
  if (ordered.some((entry, index) => entry.tabIndex !== index)) {
    throw new Error("visible-stash-mapping-not-compact");
  }
}
