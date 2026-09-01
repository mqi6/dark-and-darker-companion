import { describe, expect, it, vi } from "vitest";
import type { DarkerDbClient } from "../src/adapters/darkerdb";
import type { DarkerDbMarketplaceCatalogSnapshot } from "../src/adapters/darkerdbMarketplaceFilterCatalog";
import type { DarkerDbMarketplaceCatalogLoader } from "../src/adapters/darkerdbMarketplaceCatalogLoader";
import { MarketplaceLiveController } from "../src/adapters/marketplaceLiveController";
import { marketplacePreviewCatalog } from "../src/ui/marketplacePreviewCatalog";

describe("Marketplace live controller", () => {
  it("cancels detail enrichment before it can start a late Market request", async () => {
    const getMarket = vi.fn();
    const getItemDetail = vi.fn((
      _id: string,
      _parameters: unknown,
      options: { signal?: AbortSignal }
    ) => new Promise((_, reject) => {
      options.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError"))
      );
    }));
    const client = { getMarket, getItemDetail } as unknown as Pick<
      DarkerDbClient,
      "getMarket" | "getItemDetail"
    >;
    const snapshot: DarkerDbMarketplaceCatalogSnapshot = {
      catalog: marketplacePreviewCatalog,
      localizedItemNames: new Map(),
      omittedItemIds: []
    };
    const loader = {
      load: vi.fn().mockResolvedValue(snapshot)
    } as unknown as DarkerDbMarketplaceCatalogLoader;
    const controller = new MarketplaceLiveController(client, loader);
    await controller.catalog();

    const pending = controller.search({
      version: 1,
      familyIds: ["id.item.occultist_robe"],
      rarities: ["rare"],
      rollRules: [{
        id: "strength",
        attributeId: "id.attribute.strength",
        enabled: true,
        minimum: 1
      }],
      requiredMatchCount: 1
    });
    await Promise.resolve();
    controller.cancel();

    await expect(pending).resolves.toMatchObject({ status: "cancelled" });
    expect(getMarket).not.toHaveBeenCalled();
  });
});
