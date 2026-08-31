import { once } from "node:events";
import { Script } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { createCompleteSortOperatorServer } from "../tools/completeSortOperatorServer";

describe("complete sort localhost operator", () => {
  it("wires preview, one run, stop, and the required controls", async () => {
    const controller = {
      snapshot: () => ({ phase: "idle" }),
      focus: vi.fn(async () => ({ phase: "idle", foreground: { status: "focused" } })),
      refreshAndPreview: vi.fn(async () => ({ phase: "ready" })),
      run: vi.fn(async () => ({ phase: "confirmed" })),
      stop: vi.fn(() => ({ phase: "cancelled" }))
    };
    const server = createCompleteSortOperatorServer({ controller, token: "secret" });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("address");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const page = await (await fetch(base)).text();
      expect(page).toContain("Refresh and Preview");
      expect(page).toContain("Bring game to front");
      expect(page).toContain("Run Sort");
      expect(page).toContain("Category rows");
      const script = page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
      if (!script) throw new Error("script");
      expect(() => new Script(script)).not.toThrow();
      const headers = { "x-operator-token": "secret", "content-type": "application/json" };
      expect((await fetch(`${base}/api/preview`, { method: "POST", headers, body: "{}" })).status).toBe(200);
      expect((await fetch(`${base}/api/focus`, { method: "POST", headers, body: "{}" })).status).toBe(200);
      expect((await fetch(`${base}/api/run`, { method: "POST", headers, body: "{}" })).status).toBe(200);
      expect((await fetch(`${base}/api/stop`, { method: "POST", headers, body: "{}" })).status).toBe(200);
      expect(controller.refreshAndPreview).toHaveBeenCalledTimes(1);
      expect(controller.focus).toHaveBeenCalledTimes(1);
      expect(controller.run).toHaveBeenCalledTimes(1);
      expect(controller.stop).toHaveBeenCalledTimes(1);
    } finally { server.close(); await once(server, "close"); }
  });
});
