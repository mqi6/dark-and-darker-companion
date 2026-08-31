import { describe, expect, it } from "vitest";
import {
  CANONICAL_STASH_INVENTORY_ORDER,
  createCanonicalStashTabMapping,
  createStashTabMapping,
  FULL_STASH_TAB_MAPPING_ENTRIES,
  mappingIsCurrent,
  resolveInventoryForTab
} from "../src/domain/stashTabMapping";

describe("stash tab mapping", () => {
  const visibleInventories = [4, 20, 21, 30];
  const entries = [
    { tabIndex: 0, inventoryId: 4, label: "default private" },
    { tabIndex: 1, inventoryId: 20, label: "paid shared 1" },
    { tabIndex: 2, inventoryId: 21, label: "paid shared 2" },
    { tabIndex: 3, inventoryId: 30, label: "quest shared" }
  ];

  it("publishes the verified complete tab 0 through 9 mapping", () => {
    expect(CANONICAL_STASH_INVENTORY_ORDER).toEqual([
      4, 5, 6, 7, 8, 9, 20, 21, 30, 200
    ]);
    expect(FULL_STASH_TAB_MAPPING_ENTRIES.map(({ tabIndex, inventoryId }) => ({
      tabIndex,
      inventoryId
    }))).toEqual([
      { tabIndex: 0, inventoryId: 4 },
      { tabIndex: 1, inventoryId: 5 },
      { tabIndex: 2, inventoryId: 6 },
      { tabIndex: 3, inventoryId: 7 },
      { tabIndex: 4, inventoryId: 8 },
      { tabIndex: 5, inventoryId: 9 },
      { tabIndex: 6, inventoryId: 20 },
      { tabIndex: 7, inventoryId: 21 },
      { tabIndex: 8, inventoryId: 30 },
      { tabIndex: 9, inventoryId: 200 }
    ]);
  });

  it("compacts the canonical order for an explicitly known four-tab character", () => {
    const mapping = createCanonicalStashTabMapping({
      runtimeProfileKey: "opaque-current-character",
      gameBuildFingerprint: "0.17.151.9472:sha256",
      visibleInventoryIds: visibleInventories
    });

    expect(mapping.entries.map(({ tabIndex, inventoryId }) => ({
      tabIndex,
      inventoryId
    }))).toEqual([
      { tabIndex: 0, inventoryId: 4 },
      { tabIndex: 1, inventoryId: 20 },
      { tabIndex: 2, inventoryId: 21 },
      { tabIndex: 3, inventoryId: 30 }
    ]);
    expect(resolveInventoryForTab(mapping, 2)).toBe(21);
    expect(mappingIsCurrent(
      mapping,
      "opaque-current-character",
      "0.17.151.9472:sha256",
      visibleInventories
    )).toBe(true);
  });

  it("does not treat protocol-only container presence as visible-page evidence", () => {
    const mapping = createStashTabMapping({
      runtimeProfileKey: "opaque-current-character",
      gameBuildFingerprint: "0.17.151.9472:sha256",
      availableInventoryIds: visibleInventories,
      entries
    });
    expect(mappingIsCurrent(
      mapping,
      "opaque-current-character",
      "0.17.151.9472:sha256",
      CANONICAL_STASH_INVENTORY_ORDER
    )).toBe(false);
  });

  it("rejects duplicate tabs, duplicate inventories, absent pages, and unknown canonical pages", () => {
    expect(() => createStashTabMapping({
      runtimeProfileKey: "character",
      gameBuildFingerprint: "build",
      availableInventoryIds: [4],
      entries: [{ tabIndex: 0, inventoryId: 4 }, { tabIndex: 0, inventoryId: 20 }]
    })).toThrow();

    expect(() => createCanonicalStashTabMapping({
      runtimeProfileKey: "character",
      gameBuildFingerprint: "build",
      visibleInventoryIds: [4, 999]
    })).toThrow("Unknown visible stash inventory IDs");
  });
});
