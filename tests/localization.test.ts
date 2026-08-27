import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  displayGameText,
  localizationCatalogSchema,
  mergeLocalizedCatalog,
  summarizeLocalizationCoverage,
  VERIFIED_DARKERDB_SIMPLIFIED_CHINESE_LOCALE
} from "../src/domain/localizedCatalog";
import { enUS } from "../src/localization/resources/en-US";
import { zhCN } from "../src/localization/resources/zh-CN";

describe("localized game-data catalog", () => {
  it("joins languages by canonical ID and falls back to English", () => {
    const merged = mergeLocalizedCatalog(
      [
        { id: "id.item.longbow", name: "Longbow" },
        { id: "id.item.spear", name: "Spear" }
      ],
      [{ id: "id.item.longbow", name: "长弓" }]
    );

    expect(merged[0]).toMatchObject({ zhCN: "长弓", zhStatus: "translated" });
    expect(merged[1]).toMatchObject({ zhStatus: "english-fallback" });
    expect(displayGameText(merged[0]!, "zh-CN")).toBe("长弓");
    expect(displayGameText(merged[1]!, "zh-CN")).toBe("Spear");
  });

  it("does not pair records by display name or array position", () => {
    const merged = mergeLocalizedCatalog(
      [{ id: "id.attribute.strength", name: "Strength" }],
      [{ id: "id.attribute.agility", name: "力量" }]
    );
    expect(merged[0]).toMatchObject({ id: "id.attribute.strength", zhStatus: "english-fallback" });
  });

  it("uses the canonical ID when both localized names are missing", () => {
    expect(
      displayGameText(
        { id: "id.item.unknown", en: "", zhStatus: "missing" },
        "zh-CN"
      )
    ).toBe("id.item.unknown");
  });

  it("validates the real DarkerDB catalog and locks its measured coverage", async () => {
    const testRoot = path.dirname(fileURLToPath(import.meta.url));
    const raw = JSON.parse(
      await readFile(
        path.resolve(testRoot, "../fixtures/darkerdb/localization/catalog.json"),
        "utf8"
      )
    );
    const catalog = localizationCatalogSchema.parse(raw);

    expect(catalog.simplifiedChineseLocale).toBe(
      VERIFIED_DARKERDB_SIMPLIFIED_CHINESE_LOCALE
    );
    expect(summarizeLocalizationCoverage(catalog.items)).toEqual({
      total: 2430,
      translated: 2422,
      englishFallback: 0,
      missing: 8
    });
    expect(summarizeLocalizationCoverage(catalog.attributes)).toEqual({
      total: 58,
      translated: 56,
      englishFallback: 0,
      missing: 2
    });
    expect(catalog.items[0]).toMatchObject({
      id: "id.item.adventurer_boots_1001",
      en: "Adventurer Boots",
      zhCN: "冒险者长靴",
      zhStatus: "translated"
    });
    expect(catalog.attributes[0]).toMatchObject({
      id: "id.attribute.action_speed",
      en: "Action Speed",
      zhCN: "动作速度",
      zhStatus: "translated"
    });
  });

  it("rejects duplicate canonical IDs and inconsistent translation states", () => {
    const base = {
      schemaVersion: 1,
      generatedAt: "2026-08-27T09:31:43.160Z",
      source: "DarkerDB",
      englishLocale: "en",
      simplifiedChineseLocale: "zh-Hans",
      attributes: []
    } as const;
    const invalid = localizationCatalogSchema.safeParse({
      ...base,
      items: [
        { id: "id.item.longbow", en: "Longbow", zhStatus: "translated" },
        { id: "id.item.longbow", en: "Longbow", zhStatus: "english-fallback" }
      ]
    });

    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Translated records require a non-English Simplified Chinese value.",
          "Duplicate canonical ID: id.item.longbow"
        ])
      );
    }
  });

  it("keeps English and Simplified Chinese UI resource key sets identical", () => {
    expect(flattenKeys(zhCN)).toEqual(flattenKeys(enUS));
  });
});

function flattenKeys(value: object, prefix = ""): string[] {
  return Object.entries(value)
    .flatMap(([key, nested]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof nested === "object" && nested !== null
        ? flattenKeys(nested as object, path)
        : [path];
    })
    .sort();
}
