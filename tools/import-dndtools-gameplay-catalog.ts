import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { PINNED_DARKERDB_API_VERSION } from "../src/adapters/darkerdb";
import { gameplayCatalogSchema } from "../src/domain/gameplayCatalog";

const sourcePath = process.env.DND_TOOLS_ITEMS_PATH;
const sourceCommit = process.env.DND_TOOLS_COMMIT;
const sourceBlobSha = process.env.DND_TOOLS_BLOB_SHA;
if (!sourcePath || !sourceCommit || !sourceBlobSha) {
  throw new Error("DND_TOOLS_ITEMS_PATH, DND_TOOLS_COMMIT, and DND_TOOLS_BLOB_SHA are required.");
}

const canonicalIdSchema = z.string().regex(/^id\./);
const optionalText = z.string().trim().min(1).nullish();
const dndToolsItemSchema = z.object({
  darkerdb_id: canonicalIdSchema,
  rarity: z.string().trim().min(1),
  inventory_width: z.number().int().positive().nullish(),
  inventory_height: z.number().int().positive().nullish(),
  max_stack_size: z.number().int().positive(),
  slot_type: optionalText,
  item_type: optionalText,
  armor_type: optionalText,
  weapon_type: optionalText,
  patch: optionalText
}).passthrough();
type DndToolsItem = z.infer<typeof dndToolsItemSchema>;

const sourceBytes = await readFile(path.resolve(sourcePath));
const source = z.record(z.string(), dndToolsItemSchema).parse(JSON.parse(sourceBytes.toString("utf8")));
const rows = Object.values(source);
const items = rows
  .filter((row): row is DndToolsItem & { inventory_width: number; inventory_height: number } =>
    row.inventory_width !== null && row.inventory_width !== undefined &&
    row.inventory_height !== null && row.inventory_height !== undefined
  )
  .map((row) => ({
    id: row.darkerdb_id,
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
  .sort((left, right) => left.id.localeCompare(right.id));

const catalog = gameplayCatalogSchema.parse({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "DarkerDB-via-DnDTools",
  apiVersion: PINNED_DARKERDB_API_VERSION,
  sourceHash: createHash("sha256").update(sourceBytes).digest("hex"),
  sourceRepository: "Beelzebub2/DnDTools",
  sourceCommit,
  sourceBlobSha,
  sourceAssetPath: "UI/assets/items.json",
  items,
  omissions: rows
    .filter((row) => row.inventory_width == null || row.inventory_height == null)
    .map((row) => ({ id: row.darkerdb_id, reason: "non-spatial-item" }))
});

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(toolRoot, "../fixtures/darkerdb/gameplay");
await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Wrote ${catalog.items.length} gameplay records with ${catalog.omissions.length} explicit omissions.`);
