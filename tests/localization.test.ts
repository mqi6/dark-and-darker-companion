import { describe, expect, it } from "vitest";
import { displayGameText, mergeLocalizedCatalog } from "../src/domain/localizedCatalog";
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
