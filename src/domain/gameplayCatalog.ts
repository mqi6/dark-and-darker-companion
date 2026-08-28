import { z } from "zod";
import type { DarkerDbGameplayItem } from "../adapters/darkerdbContracts";
import type { CanonicalId } from "./models";

const canonicalIdSchema = z.custom<CanonicalId>(
  (value) => typeof value === "string" && value.startsWith("id."),
  "Expected a canonical DarkerDB ID beginning with id."
);

export const gameplayItemMetadataSchema = z.object({
  id: canonicalIdSchema,
  rarity: z.string().trim().min(1),
  inventoryWidth: z.number().int().positive(),
  inventoryHeight: z.number().int().positive(),
  maxStackSize: z.number().int().positive(),
  slotType: z.string().trim().min(1).optional(),
  itemType: z.string().trim().min(1).optional(),
  armorType: z.string().trim().min(1).optional(),
  weaponType: z.string().trim().min(1).optional(),
  patch: z.string().trim().min(1).optional()
});

export const gameplayCatalogOmissionSchema = z.object({
  id: canonicalIdSchema,
  reason: z.enum(["non-spatial-item", "missing-inventory-dimensions"])
});

export const gameplayCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.iso.datetime(),
    source: z.enum(["DarkerDB", "DarkerDB-via-DnDTools"]),
    apiVersion: z.string().trim().min(1),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceRepository: z.string().trim().min(1).optional(),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/).optional(),
    sourceBlobSha: z.string().regex(/^[a-f0-9]{40}$/).optional(),
    sourceAssetPath: z.string().trim().min(1).optional(),
    items: z.array(gameplayItemMetadataSchema),
    omissions: z.array(gameplayCatalogOmissionSchema).default([])
  })
  .superRefine((catalog, context) => {
    if (catalog.source === "DarkerDB-via-DnDTools") {
      for (const field of ["sourceRepository", "sourceCommit", "sourceBlobSha", "sourceAssetPath"] as const) {
        if (!catalog[field]) context.addIssue({ code: "custom", path: [field], message: `${field} is required for DnDTools-derived catalogs` });
      }
    }
    const seen = new Set<CanonicalId>();
    catalog.items.forEach((item, index) => {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "id"],
          message: `Duplicate gameplay item ID: ${item.id}`
        });
      }
      seen.add(item.id);
    });
  });

export type GameplayItemMetadata = z.infer<typeof gameplayItemMetadataSchema>;
export type GameplayCatalog = z.infer<typeof gameplayCatalogSchema>;

export async function buildGameplayCatalog(
  sourceRows: readonly DarkerDbGameplayItem[],
  apiVersion: string,
  generatedAt: string
): Promise<GameplayCatalog> {
  const sortedRows = [...sourceRows].sort((left, right) => left.id.localeCompare(right.id));
  const sourceHash = await sha256(JSON.stringify(sortedRows));
  const usableRows = sortedRows.filter(
    (row): row is DarkerDbGameplayItem & { inventory_width: number; inventory_height: number } =>
      row.inventory_width !== null && row.inventory_width !== undefined &&
      row.inventory_height !== null && row.inventory_height !== undefined
  );
  return gameplayCatalogSchema.parse({
    schemaVersion: 1,
    generatedAt,
    source: "DarkerDB",
    apiVersion,
    sourceHash,
    items: usableRows.map((row) => ({
      id: row.id,
      rarity: row.rarity,
      inventoryWidth: row.inventory_width,
      inventoryHeight: row.inventory_height,
      maxStackSize: row.max_stack_size,
      ...(row.slot_type ? { slotType: row.slot_type } : {}),
      ...(row.item_type ? { itemType: row.item_type } : {}),
      ...(row.armor_type ? { armorType: row.armor_type } : {}),
      ...(row.weapon_type ? { weaponType: row.weapon_type } : {}),
      ...(row.patch ? { patch: row.patch } : {})
    })),
    omissions: sortedRows
      .filter((row) => row.inventory_width == null || row.inventory_height == null)
      .map((row) => ({ id: row.id, reason: "missing-inventory-dimensions" }))
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function indexGameplayCatalog(
  catalog: GameplayCatalog
): ReadonlyMap<CanonicalId, GameplayItemMetadata> {
  return new Map(catalog.items.map((item) => [item.id, item]));
}
