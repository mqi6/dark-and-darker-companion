import { once } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  createLocalOperatorServer,
  LocalOperatorController,
  type LocalOperatorDependencies,
  type OperatorPlanSummary
} from "../tools/local-operator-server";

const plan: OperatorPlanSummary = {
  itemAlias: "item-private",
  tabIndex: 0,
  sourceCell: { x: 1, y: 2 },
  destinationCell: { x: 3, y: 4 },
  dragCount: 1,
  retry: false
};

function setup(overrides: Partial<LocalOperatorDependencies> = {}) {
  const events: string[] = [];
  const dependencies: LocalOperatorDependencies = {
    async focusGame() { events.push("focus"); return { processName: "DungeonCrawler", isForeground: true }; },
    async runPreparedMove() { events.push("run"); return { exitCode: 0, stdout: '{"status":"confirmed"}\n', stderr: "" }; },
    async persist(event) { events.push(`persist:${event.event}`); },
    ...overrides
  };
  return { controller: new LocalOperatorController(plan, dependencies), events };
}

describe("local operator controller", () => {
  it("brings the game forward before one explicitly requested run", async () => {
    const { controller, events } = setup();
    const state = await controller.run();
    expect(events.indexOf("focus")).toBeLessThan(events.indexOf("run"));
    expect(events.filter(value => value === "run")).toHaveLength(1);
    expect(state).toMatchObject({
      phase: "completed",
      game: { processName: "DungeonCrawler", isForeground: true, coordinateSpace: "virtual-desktop" },
      plan: { dragCount: 1, retry: false },
      lastResult: { exitCode: 0 }
    });
  });

  it("does not run input when foreground restoration fails", async () => {
    const runPreparedMove = vi.fn();
    const { controller } = setup({
      async focusGame() { throw new Error("foreground-denied"); },
      runPreparedMove
    });
    await expect(controller.run()).rejects.toThrow("foreground-denied");
    expect(runPreparedMove).not.toHaveBeenCalled();
    expect(controller.snapshot().phase).toBe("failed");
  });
});

describe("local operator HTTP boundary", () => {
  it("serves status but requires the page token for actions", async () => {
    const { controller } = setup();
    const server = createLocalOperatorServer({ controller, token: "test-token" });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address.");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      expect((await fetch(`${base}/api/status`)).status).toBe(200);
      expect((await fetch(`${base}/api/focus`, { method: "POST" })).status).toBe(500);
      expect((await fetch(`${base}/api/focus`, {
        method: "POST", headers: { "x-operator-token": "test-token" }
      })).status).toBe(200);
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
