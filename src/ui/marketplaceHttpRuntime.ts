import type {
  MarketplaceCoordinatedSearchResult
} from "../adapters/marketplaceSearch";
import type { MarketplaceSearchPlan } from "../domain/marketplaceSearch";
import type { MarketplaceFilterCatalog } from "./marketplaceFilterCatalog";
import type { MarketplaceSearchRuntime } from "./MarketplaceSearchWorkspace";

export interface MarketplaceRuntimeConfig {
  baseUrl: string;
}

declare global {
  var __DARKERDB_MARKETPLACE_RUNTIME__: MarketplaceRuntimeConfig | undefined;
}

export function configuredMarketplaceRuntime(): MarketplaceRuntimeConfig | undefined {
  return globalThis.__DARKERDB_MARKETPLACE_RUNTIME__;
}

export async function loadMarketplaceHttpCatalog(
  config: MarketplaceRuntimeConfig,
  options: { signal?: AbortSignal } = {}
): Promise<MarketplaceFilterCatalog> {
  return requestJson(`${normalizedBaseUrl(config.baseUrl)}/catalog`, {
    method: "GET",
    ...(options.signal === undefined ? {} : { signal: options.signal })
  });
}

export class MarketplaceHttpRuntime implements MarketplaceSearchRuntime {
  private active: AbortController | undefined;

  constructor(private readonly config: MarketplaceRuntimeConfig) {}

  search = async (plan: MarketplaceSearchPlan): Promise<MarketplaceCoordinatedSearchResult> =>
    this.run("search", plan);

  refresh = async (plan: MarketplaceSearchPlan): Promise<MarketplaceCoordinatedSearchResult> =>
    this.run("refresh", plan);

  cancel = (): void => {
    this.active?.abort();
    this.active = undefined;
    void fetch(`${normalizedBaseUrl(this.config.baseUrl)}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      keepalive: true
    }).catch(() => undefined);
  };

  private async run(
    action: "search" | "refresh",
    plan: MarketplaceSearchPlan
  ): Promise<MarketplaceCoordinatedSearchResult> {
    this.active?.abort();
    const controller = new AbortController();
    this.active = controller;
    try {
      return await requestJson(`${normalizedBaseUrl(this.config.baseUrl)}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec: plan.spec }),
        signal: controller.signal
      });
    } finally {
      if (this.active === controller) this.active = undefined;
    }
  }
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { accept: "application/json", ...init.headers }
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`.trim();
    try {
      const body = await response.json() as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // A non-JSON proxy or static-host response is still represented by its HTTP status.
    }
    throw new Error(`Marketplace runtime request failed: ${detail}`);
  }
  return await response.json() as T;
}

function normalizedBaseUrl(value: string): string {
  return value.replace(/\/$/, "");
}
