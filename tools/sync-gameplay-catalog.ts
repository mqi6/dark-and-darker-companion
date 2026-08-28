import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DarkerDbClient,
  PINNED_DARKERDB_API_VERSION
} from "../src/adapters/darkerdb";
import type { DarkerDbGameplayItem } from "../src/adapters/darkerdbContracts";
import { buildGameplayCatalog } from "../src/domain/gameplayCatalog";

const apiKey = process.env.DARKERDB_API_KEY;
if (!apiKey) throw new Error("DARKERDB_API_KEY is required; it is never written to disk.");

const client = new DarkerDbClient({ apiKey });
const rows: DarkerDbGameplayItem[] = [];
const seenCursors = new Set<string>();
let cursor: string | undefined;

do {
  const page = await client.getGameplayItems({
    locale: "en",
    limit: 200,
    ...(cursor ? { cursor } : {})
  });
  rows.push(...page.data);
  cursor = page.nextCursor;
  if (cursor && seenCursors.has(cursor)) throw new Error(`Repeated pagination cursor: ${cursor}`);
  if (cursor) seenCursors.add(cursor);
} while (cursor);

const catalog = await buildGameplayCatalog(
  rows,
  PINNED_DARKERDB_API_VERSION,
  new Date().toISOString()
);
const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(toolRoot, "../fixtures/darkerdb/gameplay");
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "catalog.json"),
  `${JSON.stringify(catalog, null, 2)}\n`,
  "utf8"
);
console.log(`Wrote ${catalog.items.length} gameplay item records.`);
