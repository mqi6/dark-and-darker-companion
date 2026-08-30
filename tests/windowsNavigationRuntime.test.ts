import { describe, expect, it } from "vitest";
import { GameInteractionLease } from "../src/tasks/taskMachine";
import {
  prepareNav001Sequence,
  WindowsNavigationSequenceRunner,
  type NavigationWindowState,
  type ScreenClassification,
  type WindowsNavigationAdapter
} from "../src/tasks/windowsNavigationRuntime";
import { classifyFeature } from "../tools/windowsNavigationAdapter";

const windowState: NavigationWindowState = {
  windowHandle: "0x1",
  processName: "DungeonCrawler",
  clientBounds: { left: 0, top: 0, width: 1920, height: 1080 },
  display: { left: 0, top: 0, width: 1920, height: 1080 },
  gameBuildFingerprint: "build"
};
const plan = prepareNav001Sequence({ window: windowState, visibleStashTabs: 4, startingScreen: "lobby" });
const approval = { kind: "human-confirmation" as const, planFingerprint: plan.planFingerprint };

function fakeAdapter(options: {
  window?: NavigationWindowState;
  classifications?: ScreenClassification[];
  reject?: boolean;
} = {}) {
  let index = 0;
  const calls = { clicks: 0 };
  const defaults: ScreenClassification[] = [
    { status: "classified", observation: { screen: "lobby" } },
    { status: "classified", observation: { screen: "stash" } },
    { status: "classified", observation: { screen: "stash" } },
    { status: "classified", observation: { screen: "lobby" } },
    { status: "classified", observation: { screen: "lobby" } },
    { status: "classified", observation: { screen: "character-selection" } },
    { status: "classified", observation: { screen: "character-selection" } },
    { status: "classified", observation: { screen: "lobby" } },
    { status: "classified", observation: { screen: "lobby" } },
    { status: "classified", observation: { screen: "stash" } }
  ];
  const values = options.classifications ?? defaults;
  const adapter: WindowsNavigationAdapter = {
    async inspectWindow() { return options.window ?? windowState; },
    async classifyScreen() { return values[Math.min(index++, values.length - 1)]!; },
    async clickForeground() {
      calls.clicks += 1;
      return options.reject ? { status: "rejected", diagnosticCode: "send-input-rejected" } : { status: "clicked" };
    }
  };
  return { adapter, calls };
}

describe("NAV-001 Windows navigation runtime", () => {
  it("prepares the exact navigation-only sequence and compact fingerprint", () => {
    expect(plan.steps.map(step => step.control)).toEqual([
      "open-stash", "start-game", "return-to-character-selection",
      "enter-lobby", "open-stash"
    ]);
    expect(plan.inputMethod).toBe("dndtools-sendinput-v1");
    expect(plan.planFingerprint).toMatch(/^nav001-[a-f0-9]{32}$/);
  });

  it("accepts visible tab counts 2 and 10 and rejects 1 and 11", () => {
    for (const visibleStashTabs of [2, 10]) {
      expect(prepareNav001Sequence({ window: windowState, visibleStashTabs, selectedCharacterSlotIndex: 0, startingScreen: "lobby" }).visibleStashTabs).toBe(visibleStashTabs);
    }
    for (const visibleStashTabs of [1, 11]) {
      expect(() => prepareNav001Sequence({ window: windowState, visibleStashTabs, selectedCharacterSlotIndex: 0, startingScreen: "lobby" })).toThrow(/2 through 10/);
    }
  });

  it("classifies private features and fails closed for unknown or ambiguous samples", () => {
    const templates = [
      { screen: "lobby" as const, feature: [10, 10, 10] },
      { screen: "stash" as const, feature: [50, 50, 50] }
    ];
    expect(classifyFeature([11, 10, 9], templates)).toMatchObject({ status: "classified", observation: { screen: "lobby" } });
    expect(classifyFeature([250, 250, 250], templates)).toEqual({ status: "unknown" });
    expect(classifyFeature([30, 30, 30], templates)).toEqual({ status: "ambiguous" });
  });

  it("previews with zero input", () => {
    const { adapter, calls } = fakeAdapter();
    expect(new WindowsNavigationSequenceRunner(new GameInteractionLease(), adapter).preview())
      .toEqual({ status: "dry-run", clickCount: 0 });
    expect(calls.clicks).toBe(0);
  });

  it("executes each valid transition with one click per step", async () => {
    const lease = new GameInteractionLease();
    const { adapter, calls } = fakeAdapter();
    expect(await new WindowsNavigationSequenceRunner(lease, adapter).execute({ plan, approval }))
      .toEqual({ status: "completed", clickCount: 5 });
    expect(calls.clicks).toBe(5);
    expect(lease.currentOwner()).toBeUndefined();
  });

  it.each([
    ["foreground", { ...windowState, windowHandle: "0x2" }, "foreground-window-mismatch"],
    ["bounds", { ...windowState, clientBounds: { ...windowState.clientBounds, width: 1919 } }, "window-bounds-changed"],
    ["display", { ...windowState, display: { ...windowState.display, width: 2560 } }, "display-geometry-changed"],
    ["build", { ...windowState, gameBuildFingerprint: "changed" }, "game-build-changed"]
  ])("blocks %s mismatch before input", async (_name, changed, code) => {
    const { adapter, calls } = fakeAdapter({ window: changed });
    expect(await new WindowsNavigationSequenceRunner(new GameInteractionLease(), adapter).execute({ plan, approval }))
      .toEqual({ status: "blocked", diagnosticCode: code, clickCount: 0 });
    expect(calls.clicks).toBe(0);
  });

  it.each(["unknown", "ambiguous"] as const)("blocks a %s screen", async status => {
    const { adapter, calls } = fakeAdapter({ classifications: [{ status }] });
    expect(await new WindowsNavigationSequenceRunner(new GameInteractionLease(), adapter).execute({ plan, approval }))
      .toEqual({ status: "blocked", diagnosticCode: `screen-${status}`, clickCount: 0 });
    expect(calls.clicks).toBe(0);
  });

  it("rejects stale approval without input", async () => {
    const { adapter, calls } = fakeAdapter();
    expect(await new WindowsNavigationSequenceRunner(new GameInteractionLease(), adapter).execute({
      plan, approval: { ...approval, planFingerprint: "stale" }
    })).toEqual({ status: "blocked", diagnosticCode: "stale-action-confirmation", clickCount: 0 });
    expect(calls.clicks).toBe(0);
  });

  it("cancels before input and releases the lease", async () => {
    const controller = new AbortController(); controller.abort();
    const lease = new GameInteractionLease();
    const { adapter, calls } = fakeAdapter();
    expect(await new WindowsNavigationSequenceRunner(lease, adapter).execute({ plan, approval, signal: controller.signal }))
      .toEqual({ status: "cancelled", clickCount: 0 });
    expect(calls.clicks).toBe(0);
    expect(lease.currentOwner()).toBeUndefined();
  });

  it("does not retry rejected input", async () => {
    const { adapter, calls } = fakeAdapter({ reject: true });
    expect(await new WindowsNavigationSequenceRunner(new GameInteractionLease(), adapter).execute({ plan, approval }))
      .toEqual({ status: "blocked", diagnosticCode: "send-input-rejected", clickCount: 0 });
    expect(calls.clicks).toBe(1);
  });

  it("times out without another click", async () => {
    const timeoutPlan = { ...plan, steps: [{ ...plan.steps[0]!, timeoutMilliseconds: 1000 }] };
    const { adapter, calls } = fakeAdapter({ classifications: [
      { status: "classified", observation: { screen: "lobby" } },
      { status: "classified", observation: { screen: "lobby" } }
    ] });
    expect(await new WindowsNavigationSequenceRunner(new GameInteractionLease(), adapter).execute({ plan: timeoutPlan, approval: { ...approval, planFingerprint: timeoutPlan.planFingerprint } }))
      .toEqual({ status: "blocked", diagnosticCode: "transition-timeout-open-stash", clickCount: 1 });
    expect(calls.clicks).toBe(1);
  });
});
