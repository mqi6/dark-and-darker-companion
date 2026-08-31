import { describe, expect, it } from "vitest";
import {
  CANONICAL_STASH_PAGE_ORDER,
  confirmedStashTabEntries,
  createStashTabMapping,
  mappingIsCurrent,
  resolveInventoryForTab
} from "../src/domain/stashTabMapping";

describe("character-local stash tab mapping", () => {
  const visibleInventories = [4, 20, 21, 30];
  const entries = [
    { tabIndex: 0, inventoryId: 4, label: "default private" },
    { tabIndex: 1, inventoryId: 20, label: "paid shared 1" },
    { tabIndex: 2, inventoryId: 21, label: "paid shared 2" },
    { tabIndex: 3, inventoryId: 30, label: "quest shared" }
  ];

  it("uses the confirmed canonical order and compacts a saved owned-page set", () => {
    expect(confirmedStashTabEntries({ visibleTabCount: 10 }).map(value => value.inventoryId))
      .toEqual(CANONICAL_STASH_PAGE_ORDER);
    expect(confirmedStashTabEntries({
      visibleTabCount: 4,
      ownedInventoryIds: visibleInventories
    })).toEqual(visibleInventories.map((inventoryId, tabIndex) => ({ tabIndex, inventoryId })));
  });

  it("represents the confirmed VIS-001 mapping without making it a global default", () => {
    const mapping = createStashTabMapping({
      runtimeProfileKey: "opaque-current-character",
      gameBuildFingerprint: "0.17.151.9472:sha256",
      availableInventoryIds: visibleInventories,
      entries
    });
    expect(resolveInventoryForTab(mapping, 2)).toBe(21);
    expect(mappingIsCurrent(mapping, "opaque-current-character", "0.17.151.9472:sha256", visibleInventories)).toBe(true);
    expect(mappingIsCurrent(mapping, "another-character", "0.17.151.9472:sha256", visibleInventories)).toBe(false);
    expect(mappingIsCurrent(mapping, "opaque-current-character", "0.17.151.9472:sha256", [4, 5, 20, 21, 30])).toBe(false);
  });

  it("rejects duplicate tabs, duplicate inventories, and absent pages", () => {
    expect(() => createStashTabMapping({
      runtimeProfileKey: "character",
      gameBuildFingerprint: "build",
      availableInventoryIds: [4],
      entries: [{ tabIndex: 0, inventoryId: 4 }, { tabIndex: 0, inventoryId: 20 }]
    })).toThrow();
  });
});
