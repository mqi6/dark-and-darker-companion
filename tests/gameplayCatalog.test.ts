import { describe, expect, it } from "vitest";
import type { DarkerDbGameplayItem } from "../src/adapters/darkerdbContracts";
import {
  buildGameplayCatalog,
  gameplayCatalogSchema,
  indexGameplayCatalog
} from "../src/domain/gameplayCatalog";

const row = (id: `id.${string}`, width = 1): DarkerDbGameplayItem => ({
  id,
  name: id,
  rarity: "common",
  inventory_width: width,
  inventory_height: 2,
  max_stack_size: 5,
  slot_type: "chest"
});

describe("gameplay metadata catalog", () => {
  it("normalizes DarkerDB dimensions and hashes stable sorted source rows", async () => {
    const first = await buildGameplayCatalog(
      [row("id.item.z"), row("id.item.a", 2)],
      "2026-08-03",
      "2026-08-28T00:00:00.000Z"
    );
    const second = await buildGameplayCatalog(
      [row("id.item.a", 2), row("id.item.z")],
      "2026-08-03",
      "2026-08-28T00:00:00.000Z"
    );
    expect(first.sourceHash).toBe(second.sourceHash);
    expect(first.items.map((item) => item.id)).toEqual(["id.item.a", "id.item.z"]);
    expect(indexGameplayCatalog(first).get("id.item.a")).toMatchObject({
      inventoryWidth: 2,
      inventoryHeight: 2,
      maxStackSize: 5
    });
  });

  it("rejects duplicate IDs and invalid dimensions instead of guessing", async () => {
    await expect(buildGameplayCatalog(
      [row("id.item.a"), row("id.item.a")],
      "2026-08-03",
      "2026-08-28T00:00:00.000Z"
    )).rejects.toThrow(/Duplicate gameplay item ID/);
    expect(() => gameplayCatalogSchema.parse({
      schemaVersion: 1,
      generatedAt: "2026-08-28T00:00:00.000Z",
      source: "DarkerDB",
      apiVersion: "2026-08-03",
      sourceHash: "0".repeat(64),
      items: [{ id: "id.item.a", rarity: "common", inventoryWidth: 0, inventoryHeight: 1, maxStackSize: 1 }]
    })).toThrow();
  });
});
