import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../src/localization/i18n";
import { MarketplaceRuntimeWorkspace } from "../src/ui/MarketplaceRuntimeWorkspace";
import { marketplacePreviewCatalog } from "../src/ui/marketplacePreviewCatalog";

describe("Marketplace runtime selection", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    globalThis.__DARKERDB_MARKETPLACE_RUNTIME__ = undefined;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    globalThis.__DARKERDB_MARKETPLACE_RUNTIME__ = undefined;
  });

  it("keeps normal browser development on an explicitly labeled preview source", () => {
    render(<MarketplaceRuntimeWorkspace />);
    expect(screen.getByText("Offline preview catalog")).toBeInTheDocument();
  });

  it("loads the live catalog from an injected localhost runtime without searching listings", async () => {
    globalThis.__DARKERDB_MARKETPLACE_RUNTIME__ = { baseUrl: "/api/marketplace" };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...marketplacePreviewCatalog, source: "darkerdb-live" }), {
        status: 200
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<MarketplaceRuntimeWorkspace />);
    expect(screen.getByText("Loading the live Marketplace catalog")).toBeInTheDocument();
    expect(await screen.findByText("Live DarkerDB catalog")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/marketplace/catalog");
  });

  it("shows a retryable error instead of silently falling back", async () => {
    globalThis.__DARKERDB_MARKETPLACE_RUNTIME__ = { baseUrl: "/api/marketplace" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("down", { status: 503 })));

    render(<MarketplaceRuntimeWorkspace />);
    expect(await screen.findByText("The live Marketplace runtime is unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Offline preview catalog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry catalog connection" })).toBeInTheDocument();
  });
});
