// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarketplaceLiveOperator } from "../tools/marketplace-live-operator";

const temporaryDirectories: string[] = [];

describe("Marketplace live localhost operator", () => {
  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ));
  });

  it("serves runtime config and forwards explicit read-only searches", async () => {
    const distDirectory = await createDist();
    const controller = {
      catalog: vi.fn().mockResolvedValue({ source: "darkerdb-live", items: [] }),
      search: vi.fn().mockResolvedValue({ status: "completed", generation: 1, result: {} }),
      cancel: vi.fn()
    };
    const server = await createMarketplaceLiveOperator({
      controller,
      distDirectory,
      allowedOrigins: new Set()
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const config = await fetch(`${baseUrl}/marketplace-runtime-config.js`).then((response) => response.text());
      expect(config).toContain('/api/marketplace');
      expect(config).not.toContain("DARKERDB_API_KEY");

      await expect(fetch(`${baseUrl}/api/marketplace/catalog`).then((response) => response.json()))
        .resolves.toMatchObject({ source: "darkerdb-live" });
      expect(controller.search).not.toHaveBeenCalled();

      const response = await fetch(`${baseUrl}/api/marketplace/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec: { version: 1, familyIds: ["id.item.robe"] } })
      });
      expect(response.status).toBe(200);
      expect(controller.search).toHaveBeenCalledWith(
        { version: 1, familyIds: ["id.item.robe"] },
        { refresh: false }
      );
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("rejects cross-origin quota-consuming requests", async () => {
    const distDirectory = await createDist();
    const controller = {
      catalog: vi.fn(),
      search: vi.fn(),
      cancel: vi.fn()
    };
    const server = await createMarketplaceLiveOperator({
      controller,
      distDirectory,
      allowedOrigins: new Set(["http://127.0.0.1:4318"])
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/marketplace/search`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://malicious.example"
        },
        body: JSON.stringify({ spec: { version: 1 } })
      });
      expect(response.status).toBe(403);
      expect(controller.search).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

async function createDist(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "marketplace-operator-"));
  temporaryDirectories.push(directory);
  await writeFile(join(directory, "index.html"), "<!doctype html><div id=\"root\"></div>", "utf8");
  return directory;
}
