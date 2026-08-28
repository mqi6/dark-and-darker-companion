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

export const gameplayCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.iso.datetime(),
    source: z.literal("DarkerDB"),
    apiVersion: z.string().trim().min(1),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    items: z.array(gameplayItemMetadataSchema)
  })
  .superRefine((catalog, context) => {
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
  return gameplayCatalogSchema.parse({
    schemaVersion: 1,
    generatedAt,
    source: "DarkerDB",
    apiVersion,
    sourceHash,
    items: sortedRows.map((row) => ({
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
    }))
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
