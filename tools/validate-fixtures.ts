import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sampleManifestSchema } from "../src/fixtures/sampleManifest";
import { storageSnapshotSchema } from "../src/domain/snapshot";
import {
  localizationCatalogSchema,
  summarizeLocalizationCoverage
} from "../src/domain/localizedCatalog";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const syntheticRoot = path.join(projectRoot, "fixtures", "synthetic");
const directories = await readdir(syntheticRoot, { withFileTypes: true });
let validated = 0;

for (const directory of directories) {
  if (!directory.isDirectory()) continue;
  const bundleRoot = path.join(syntheticRoot, directory.name);
  const manifest = sampleManifestSchema.parse(
    JSON.parse(await readFile(path.join(bundleRoot, "manifest.json"), "utf8"))
  );
  if (manifest.artifacts.includes("snapshot.json")) {
    storageSnapshotSchema.parse(
      JSON.parse(await readFile(path.join(bundleRoot, "snapshot.json"), "utf8"))
    );
  }
  validated += 1;
}

process.stdout.write(`Validated ${validated} synthetic sample bundle(s).\n`);

const catalogPath = path.join(projectRoot, "fixtures", "darkerdb", "localization", "catalog.json");
const catalog = localizationCatalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));
const itemCoverage = summarizeLocalizationCoverage(catalog.items);
const attributeCoverage = summarizeLocalizationCoverage(catalog.attributes);
process.stdout.write(
  `Validated DarkerDB ${catalog.englishLocale}/${catalog.simplifiedChineseLocale} catalog: ` +
    `${itemCoverage.translated}/${itemCoverage.total} items translated, ${itemCoverage.missing} missing; ` +
    `${attributeCoverage.translated}/${attributeCoverage.total} attributes translated, ${attributeCoverage.missing} missing.\n`
);
