import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DarkerDbClient } from "../src/adapters/darkerdb";
import {
  mergeLocalizedCatalog,
  type GameDataNameRecord
} from "../src/domain/localizedCatalog";

const apiKey = process.env.DARKERDB_API_KEY;
if (!apiKey) {
  process.stderr.write(
    "DARKERDB_API_KEY is required. The key is used in memory and is never written to output.\n"
  );
  process.exitCode = 2;
} else {
  const apiVersion = process.env.DARKERDB_API_VERSION;
  const client = new DarkerDbClient({
    apiKey,
    ...(apiVersion ? { apiVersion } : {})
  });
  const zhLocale =
    process.env.DARKERDB_ZH_LOCALE ??
    (await detectSimplifiedChineseLocale(client, ["zh-CN", "zh-Hans", "zh"]));

  const [itemsEn, itemsZh, attributesEn, attributesZh] = await Promise.all([
    fetchAll((cursor) => client.getItems<GameDataNameRecord[]>({ locale: "en", cursor, limit: 200 })),
    fetchAll((cursor) => client.getItems<GameDataNameRecord[]>({ locale: zhLocale, cursor, limit: 200 })),
    fetchAll((cursor) => client.getAttributes<GameDataNameRecord[]>({ locale: "en", cursor, limit: 200 })),
    fetchAll((cursor) => client.getAttributes<GameDataNameRecord[]>({ locale: zhLocale, cursor, limit: 200 }))
  ]);

  const items = mergeLocalizedCatalog(itemsEn, itemsZh);
  const attributes = mergeLocalizedCatalog(attributesEn, attributesZh);
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputRoot = path.join(projectRoot, "fixtures", "darkerdb", "localization");
  await mkdir(outputRoot, { recursive: true });

  await writeFile(
    path.join(outputRoot, "catalog.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        source: "DarkerDB",
        englishLocale: "en",
        simplifiedChineseLocale: zhLocale,
        items,
        attributes
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  const itemTranslated = items.filter((entry) => entry.zhStatus === "translated").length;
  const attributeTranslated = attributes.filter((entry) => entry.zhStatus === "translated").length;
  process.stdout.write(
    `Localization catalog saved. Items: ${itemTranslated}/${items.length} translated; attributes: ${attributeTranslated}/${attributes.length} translated.\n`
  );
}

async function fetchAll<T>(
  fetchPage: (cursor?: string) => Promise<{ data: T[]; nextCursor?: string }>
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    rows.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  return rows;
}

async function detectSimplifiedChineseLocale(
  client: DarkerDbClient,
  candidates: readonly string[]
): Promise<string> {
  let best: { locale: string; hanNames: number } | undefined;
  for (const locale of candidates) {
    try {
      const page = await client.getAttributes<GameDataNameRecord[]>({ locale, limit: 50 });
      const hanNames = page.data.filter((record) => /\p{Script=Han}/u.test(record.name ?? "")).length;
      if (!best || hanNames > best.hanNames) {
        best = { locale, hanNames };
      }
    } catch {
      // Unsupported locale candidates are expected during discovery.
    }
  }

  if (!best || best.hanNames === 0) {
    throw new Error(
      "Could not identify a Simplified Chinese DarkerDB locale. Set DARKERDB_ZH_LOCALE after verifying it against the live API."
    );
  }
  return best.locale;
}
