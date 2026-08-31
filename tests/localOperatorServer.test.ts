import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { once } from "node:events";
import { Script } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import type { PreparedSupervisedMove } from "../src/domain/supervisedMove";
import {
  createLocalOperatorServer,
  findOperatorPrivateDirectory,
  LocalOperatorController,
  preparedMovePowerShellArgs,
  SHARED_OPERATOR_LOG,
  shouldResumeItemFromBag,
  type LocalOperatorDependencies,
  type OperatorPlanSummary
} from "../tools/local-operator-server";

const plan: OperatorPlanSummary = {
  itemAlias: "item-private",
  tabIndex: 0,
  sourceCell: { x: 1, y: 2 },
  destinationCell: { x: 3, y: 4 },
  dragCount: 1,
  retry: false,
  inputMethod: "dndtools-virtual-desktop-drag-v2",
  canRun: true
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

describe("operator private runtime discovery", () => {
  it("keeps a stable gitignored log path for unattended Codex review", () => {
    expect(SHARED_OPERATOR_LOG.replace(/\\/g, "/"))
      .toMatch(/fixtures-private\/runtime\/operator-latest\.private\.jsonl$/);
  });

  it("recovers only when the latest terminal run left one drag in the bag", () => {
    const ambiguous = JSON.stringify({
      event: "run-failed",
      detail: 'exit=2: {"status":"ambiguous","diagnosticCode":"item-may-remain-in-bag","dragCount":1}'
    });
    expect(shouldResumeItemFromBag(ambiguous)).toBe(true);
    expect(shouldResumeItemFromBag(`${ambiguous}\n${JSON.stringify({
      event: "run-complete", detail: '{"status":"confirmed"}'
    })}`)).toBe(false);
  });

  it("selects the newest nested prepared runtime", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "companion-operator-"));
    try {
      const older = resolve(root, "profile-old");
      const newer = resolve(root, "profile-new");
      await Promise.all([mkdir(older), mkdir(newer)]);
      for (const directory of [older, newer]) {
        await Promise.all([
          writeFile(resolve(directory, "plan.private.json"), "{}"),
          writeFile(resolve(directory, "calibration.private.json"), "{}")
        ]);
      }
      await utimes(resolve(older, "plan.private.json"), new Date("2000-01-01"), new Date("2000-01-01"));
      await utimes(resolve(newer, "plan.private.json"), new Date("2001-01-01"), new Date("2001-01-01"));
      await expect(findOperatorPrivateDirectory(root)).resolves.toBe(newer);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails clearly when no prepared runtime exists", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "companion-operator-empty-"));
    try {
      await expect(findOperatorPrivateDirectory(root)).rejects.toThrow(/No prepared runtime/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

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

describe("prepared operator drag", () => {
  it("builds exactly one bounds-bound drag from cell 0,0 to cell 7,0", () => {
    const prepared = {
      windowBounds: { left: 0, top: 0, width: 1920, height: 1080 },
      source: { grid: { x: 0, y: 0 }, screen: { x: 1400.125, y: 220.175 } },
      destination: { grid: { x: 7, y: 0 }, screen: { x: 1681.875, y: 220.175 } }
    } as PreparedSupervisedMove;
    expect(preparedMovePowerShellArgs(prepared, "0x1234")).toEqual([
      "-Drag", "-ExpectedWindowHandle", "0x1234",
      "-ExpectedLeft", "0", "-ExpectedTop", "0", "-ExpectedWidth", "1920", "-ExpectedHeight", "1080",
      "-SourceX", "1400", "-SourceY", "220", "-DestinationX", "1682", "-DestinationY", "220",
      "-DurationMilliseconds", "350"
    ]);
  });
});

describe("local operator HTTP boundary", () => {
  it("serves browser JavaScript that parses so initial status polling can run", async () => {
    const { controller } = setup();
    const server = createLocalOperatorServer({ controller, token: "test-token" });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address.");
    try {
      const html = await (await fetch(`http://127.0.0.1:${address.port}/`)).text();
      const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
      if (!script) throw new Error("Expected inline operator script.");
      expect(() => new Script(script)).not.toThrow();
      expect(script).toContain("join('\\n')");
      expect(script).not.toContain("confirm(");
      expect(script).toContain("s.plan.crossTab");
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("blocks an old input-method plan before focus or move execution", async () => {
    const { controller, events } = setup();
    const oldPlan = { ...plan, inputMethod: "dndtools-absolute-drag-v1", canRun: false };
    const blocked = new LocalOperatorController(oldPlan, {
      async focusGame() { events.push("focus"); return { processName: "DungeonCrawler", isForeground: true }; },
      async runPreparedMove() { events.push("run"); return { exitCode: 0, stdout: "", stderr: "" }; },
      async persist(event) { events.push(`persist:${event.event}`); }
    });
    await expect(blocked.run()).rejects.toThrow("prepared-plan-input-method-unsupported");
    expect(events).toEqual(["persist:run-blocked"]);
    expect(blocked.snapshot().phase).toBe("failed");
  });

  it("records the helper failure detail when a drag stops before dispatch", async () => {
    const { controller } = setup({
      async runPreparedMove() { return { exitCode: 1, stdout: "", stderr: "Source cursor verification failed." }; }
    });
    const state = await controller.run();
    expect(state.phase).toBe("failed");
    expect(state.lastResult?.summary).toBe("Source cursor verification failed.");
    expect(state.events.at(-1)).toMatchObject({
      event: "run-failed",
      detail: "exit=1: Source cursor verification failed."
    });
  });

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
