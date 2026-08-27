import type { CanonicalId, LocalizedGameText } from "./models";

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
  return locale === "zh-CN" && text.zhCN ? text.zhCN : text.en;
}
