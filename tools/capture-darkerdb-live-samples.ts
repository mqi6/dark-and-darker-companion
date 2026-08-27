import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PINNED_DARKERDB_API_VERSION } from "../src/adapters/darkerdb";
import { sanitizeDarkerDbSample } from "../src/adapters/darkerdbSample";

const apiKey = process.env.DARKERDB_API_KEY;
if (!apiKey) {
  process.stderr.write(
    "DARKERDB_API_KEY is required. It is used only in request headers and is never written.\n"
  );
  process.exitCode = 2;
} else {
  const baseUrl = process.env.DARKERDB_BASE_URL ?? "https://api.darkerdb.com";
  const apiVersion = process.env.DARKERDB_API_VERSION ?? PINNED_DARKERDB_API_VERSION;
  const itemId = process.env.DARKERDB_SAMPLE_ITEM_ID ?? "id.item.occultist_robe_4001";
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputRoot = path.join(projectRoot, "fixtures", "darkerdb", "live-samples");
  await mkdir(outputRoot, { recursive: true });

  const samples = [
    {
      filename: "market-active.json",
      endpoint: "/v2/market",
      query: { item_id: itemId, listing_state: "active", locale: "en", page: 1, limit: 5 }
    },
    {
      filename: "market-recent-missing.json",
      endpoint: "/v2/market",
      query: {
        item_id: itemId,
        listing_state: "missing",
        has_sold: true,
        locale: "en",
        page: 1,
        limit: 5
      }
    },
    {
      filename: "price-check.json",
      endpoint: "/v2/price-checks",
      query: { item_id: itemId, locale: "en" }
    }
  ] as const;

  for (const sample of samples) {
    const url = new URL(sample.endpoint, baseUrl);
    for (const [key, value] of Object.entries(sample.query)) {
      url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
        "X-API-Version": apiVersion
      }
    });
    if (!response.ok) {
      throw new Error(
        `${sample.endpoint} failed with ${response.status} ${response.statusText}. No partial sample was written for this response.`
      );
    }

    const sanitized = sanitizeDarkerDbSample(await response.json());
    const serialized = JSON.stringify(sanitized, null, 2) + "\n";
    if (serialized.includes(apiKey)) {
      throw new Error("Refusing to write a sample containing the API key.");
    }
    await writeFile(path.join(outputRoot, sample.filename), serialized, "utf8");
  }

  process.stdout.write(
    `Saved three sanitized DarkerDB samples for ${itemId} in fixtures/darkerdb/live-samples. Review them before sharing.\n`
  );
}
