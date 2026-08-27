import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sampleManifestSchema } from "../src/fixtures/sampleManifest";
import { storageSnapshotSchema } from "../src/domain/snapshot";
import {
  localizationCatalogSchema,
  summarizeLocalizationCoverage
} from "../src/domain/localizedCatalog";
import {
  darkerDbMarketResponseSchema,
  darkerDbPriceCheckResponseSchema
} from "../src/adapters/darkerdbContracts";

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

const liveSamplesRoot = path.join(projectRoot, "fixtures", "darkerdb", "live-samples");
const activeMarket = darkerDbMarketResponseSchema.parse(
  JSON.parse(await readFile(path.join(liveSamplesRoot, "market-active.json"), "utf8"))
);
const recentMissingMarket = darkerDbMarketResponseSchema.parse(
  JSON.parse(
    await readFile(path.join(liveSamplesRoot, "market-recent-missing.json"), "utf8")
  )
);
const priceCheck = darkerDbPriceCheckResponseSchema.parse(
  JSON.parse(await readFile(path.join(liveSamplesRoot, "price-check.json"), "utf8"))
);
process.stdout.write(
  `Validated DarkerDB live samples: ${activeMarket.body.length} active listings, ` +
    `${recentMissingMarket.body.length} inferred-sale listings, ` +
    `${priceCheck.body.similar_sales.length} Price Check sales, ` +
    `${priceCheck.body.similar_listings.length} Price Check asks.\n`
);
