import { z } from "zod";
import type { CanonicalId, LocalizedGameText } from "./models";

export const VERIFIED_DARKERDB_SIMPLIFIED_CHINESE_LOCALE = "zh-Hans";

const canonicalIdSchema = z.custom<CanonicalId>(
  (value) => typeof value === "string" && value.startsWith("id."),
  "Expected a canonical DarkerDB ID beginning with id."
);

export const localizedGameTextSchema = z
  .object({
    id: canonicalIdSchema,
    en: z.string(),
    zhCN: z.string().trim().min(1).optional(),
    zhStatus: z.enum(["translated", "english-fallback", "missing"]),
    patch: z.string().trim().min(1).optional()
  })
  .superRefine((value, context) => {
    if (value.zhStatus === "translated" && (!value.zhCN || value.zhCN === value.en.trim())) {
      context.addIssue({
        code: "custom",
        path: ["zhCN"],
        message: "Translated records require a non-English Simplified Chinese value."
      });
    }
    if (value.zhStatus !== "translated" && value.zhCN) {
      context.addIssue({
        code: "custom",
        path: ["zhCN"],
        message: "Fallback and missing records must not carry a translated value."
      });
    }
    if (value.zhStatus === "english-fallback" && value.en.trim() === "") {
      context.addIssue({
        code: "custom",
        path: ["en"],
        message: "English fallback records require a non-empty English value."
      });
    }
    if (value.zhStatus === "missing" && value.en.trim() !== "") {
      context.addIssue({
        code: "custom",
        path: ["en"],
        message: "Missing records must have an empty English value."
      });
    }
  })
  .transform(
    (value): LocalizedGameText => ({
      id: value.id,
      en: value.en,
      zhStatus: value.zhStatus,
      ...(value.zhCN === undefined ? {} : { zhCN: value.zhCN }),
      ...(value.patch === undefined ? {} : { patch: value.patch })
    })
  );

export const localizationCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.iso.datetime(),
    source: z.literal("DarkerDB"),
    englishLocale: z.literal("en"),
    simplifiedChineseLocale: z.string().trim().min(1),
    items: z.array(localizedGameTextSchema),
    attributes: z.array(localizedGameTextSchema)
  })
  .superRefine((value, context) => {
    reportDuplicateIds(value.items, "items", context);
    reportDuplicateIds(value.attributes, "attributes", context);
  });

export type LocalizationCatalog = z.infer<typeof localizationCatalogSchema>;

export interface LocalizationCoverage {
  total: number;
  translated: number;
  englishFallback: number;
  missing: number;
}

export interface GameDataNameRecord {
  id: CanonicalId;
  name?: string;
  patch?: string;
}

export function mergeLocalizedCatalog(
  english: readonly GameDataNameRecord[],
  simplifiedChinese: readonly GameDataNameRecord[]
): readonly LocalizedGameText[] {
  const zhById = new Map(simplifiedChinese.map((record) => [record.id, record]));

  return english.map((record) => {
    const en = record.name?.trim() ?? "";
    const zh = zhById.get(record.id)?.name?.trim();
    const translated = Boolean(zh && zh !== en);

    return {
      id: record.id,
      en,
      ...(translated && zh ? { zhCN: zh } : {}),
      zhStatus: translated ? "translated" : en ? "english-fallback" : "missing",
      ...(record.patch ? { patch: record.patch } : {})
    };
  });
}

export function displayGameText(text: LocalizedGameText, locale: "en-US" | "zh-CN"): string {
  return (locale === "zh-CN" && text.zhCN ? text.zhCN : text.en) || text.id;
}

export function summarizeLocalizationCoverage(
  records: readonly LocalizedGameText[]
): LocalizationCoverage {
  return records.reduce<LocalizationCoverage>(
    (coverage, record) => {
      coverage.total += 1;
      if (record.zhStatus === "translated") coverage.translated += 1;
      if (record.zhStatus === "english-fallback") coverage.englishFallback += 1;
      if (record.zhStatus === "missing") coverage.missing += 1;
      return coverage;
    },
    { total: 0, translated: 0, englishFallback: 0, missing: 0 }
  );
}

export function indexLocalizedCatalog(
  records: readonly LocalizedGameText[]
): ReadonlyMap<CanonicalId, LocalizedGameText> {
  return new Map(records.map((record) => [record.id, record]));
}

function reportDuplicateIds(
  records: readonly LocalizedGameText[],
  collection: "items" | "attributes",
  context: z.RefinementCtx
): void {
  const seen = new Set<CanonicalId>();
  records.forEach((record, index) => {
    if (seen.has(record.id)) {
      context.addIssue({
        code: "custom",
        path: [collection, index, "id"],
        message: `Duplicate canonical ID: ${record.id}`
      });
    }
    seen.add(record.id);
  });
}
