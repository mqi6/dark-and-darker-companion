import type { DarkerDbClient } from "./darkerdb";
import type { DarkerDbItemDetail } from "./darkerdbContracts";
import type { DarkerDbMarketplaceCatalogSnapshot } from "./darkerdbMarketplaceFilterCatalog";
import { DarkerDbMarketplaceCatalogLoader } from "./darkerdbMarketplaceCatalogLoader";
import { buildMarketplaceCatalog } from "./darkerdbMarketplaceCatalog";
import {
  MarketplaceSearchCoordinator,
  MarketplaceSearchExecutor,
  type MarketplaceCoordinatedSearchResult
} from "./marketplaceSearch";
import type { CanonicalId } from "../domain/models";
import {
  createMarketplaceSearchPlan,
  parseMarketplaceSearchSpec,
  type MarketplaceCatalogItem,
  type MarketplaceSearchSpecInput
} from "../domain/marketplaceSearch";

export const MARKETPLACE_DETAIL_ENRICHMENT_LIMIT = 24;

export class MarketplaceLiveController {
  private readonly coordinator: MarketplaceSearchCoordinator;
  private readonly detailCache = new Map<CanonicalId, DarkerDbItemDetail>();
  private activeSnapshot?: DarkerDbMarketplaceCatalogSnapshot;
  private operationGeneration = 0;
  private operationController: AbortController | undefined;

  constructor(
    private readonly client: Pick<DarkerDbClient, "getMarket" | "getItemDetail">,
    private readonly catalogLoader: DarkerDbMarketplaceCatalogLoader
  ) {
    this.coordinator = new MarketplaceSearchCoordinator(new MarketplaceSearchExecutor(client));
  }

  async catalog(parameters: { refresh?: boolean; signal?: AbortSignal } = {}) {
    const snapshot = await this.catalogLoader.load(parameters);
    this.activeSnapshot = snapshot;
    return snapshot.catalog;
  }

  async search(
    input: MarketplaceSearchSpecInput,
    options: { refresh?: boolean } = {}
  ): Promise<MarketplaceCoordinatedSearchResult> {
    this.operationController?.abort();
    this.coordinator.cancel();
    const operationGeneration = ++this.operationGeneration;
    const operationController = new AbortController();
    this.operationController = operationController;
    try {
      const snapshot = this.activeSnapshot ?? await this.catalogLoader.load({
        signal: operationController.signal
      });
      this.activeSnapshot = snapshot;
      throwIfAborted(operationController.signal);
      const spec = parseMarketplaceSearchSpec(input);
      const basePlan = createMarketplaceSearchPlan(spec, snapshot.catalog.items);
      const catalog = await this.enrichSelectedItems(
        snapshot.catalog.items,
        basePlan.allowedItemIds,
        spec.rollRules.some((rule) => rule.enabled),
        operationController.signal
      );
      throwIfAborted(operationController.signal);
      const plan = createMarketplaceSearchPlan(spec, catalog);
      return options.refresh
        ? await this.coordinator.refresh(plan, catalog, snapshot.localizedItemNames)
        : await this.coordinator.search(plan, catalog, snapshot.localizedItemNames);
    } catch (error) {
      if (operationController.signal.aborted || isAbort(error)) {
        return {
          status: operationGeneration === this.operationGeneration ? "cancelled" : "superseded",
          generation: operationGeneration
        };
      }
      throw error;
    } finally {
      if (this.operationController === operationController) this.operationController = undefined;
    }
  }

  cancel(): void {
    this.operationController?.abort();
    this.operationController = undefined;
    this.coordinator.cancel();
  }

  private async enrichSelectedItems(
    catalog: readonly MarketplaceCatalogItem[],
    allowedItemIds: readonly CanonicalId[],
    hasRollRules: boolean,
    signal: AbortSignal
  ): Promise<readonly MarketplaceCatalogItem[]> {
    if (!hasRollRules || allowedItemIds.length > MARKETPLACE_DETAIL_ENRICHMENT_LIMIT) {
      return catalog;
    }
    const missing = allowedItemIds.filter((id) => !this.detailCache.has(id));
    for (let index = 0; index < missing.length; index += 4) {
      const batch = missing.slice(index, index + 4);
      const settled = await Promise.allSettled(
        batch.map((id) => this.client.getItemDetail(id, { locale: "en" }, { signal }))
      );
      throwIfAborted(signal);
      settled.forEach((result, resultIndex) => {
        if (result.status === "fulfilled") {
          const id = batch[resultIndex];
          if (id !== undefined) this.detailCache.set(id, result.value.data);
        }
      });
    }
    if (this.detailCache.size === 0) return catalog;

    const itemDetails = new Map(
      allowedItemIds.flatMap((id) => {
        const detail = this.detailCache.get(id);
        return detail === undefined ? [] : [[id, detail] as const];
      })
    );
    const sourceRows = allowedItemIds.flatMap((id) => {
      const detail = itemDetails.get(id);
      return detail === undefined ? [] : [detail];
    });
    const enriched = new Map(
      buildMarketplaceCatalog(sourceRows, itemDetails).items.map((item) => [item.id, item])
    );
    return catalog.map((item) => enriched.get(item.id) ?? item);
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
}

function isAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
