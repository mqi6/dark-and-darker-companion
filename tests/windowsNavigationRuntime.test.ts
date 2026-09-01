import { describe, expect, it, vi } from "vitest";
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
  primaryDisplay: { left: 0, top: 0, width: 1920, height: 1080 },
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
  it("uses a freshly validated initial state without repeating focus and classification", async () => {
    const inspectWindow = vi.fn(async () => windowState);
    const classifyScreen = vi.fn(async () => ({ status: "classified" as const, observation: { screen: "stash" as const } }));
    const clickForeground = vi.fn(async () => ({ status: "clicked" as const }));
    const oneStepPlan = { ...plan, steps: [plan.steps[0]!] };
    const runner = new WindowsNavigationSequenceRunner(new GameInteractionLease(), { inspectWindow, classifyScreen, clickForeground });
    const result = await runner.execute({
      plan: oneStepPlan,
      approval: { kind: "human-confirmation", planFingerprint: oneStepPlan.planFingerprint },
      initialState: { window: windowState, classification: { status: "classified", observation: { screen: oneStepPlan.steps[0]!.requiresScreen } } }
    });
    expect(clickForeground).toHaveBeenCalledOnce();
    expect(inspectWindow).not.toHaveBeenCalledBefore(clickForeground);
    expect(classifyScreen).not.toHaveBeenCalledBefore(clickForeground);
    expect(result.status).not.toBe("blocked");
  });
  it("does not repeat a full preflight between already verified adjacent steps", async () => {
    const screens = ["lobby", "stash", "lobby", "character-selection", "lobby", "stash"] as const;
    let screenIndex = 0;
    const adapter: WindowsNavigationAdapter = {
      async inspectWindow() { return windowState; },
      async classifyScreen() { return { status: "classified", observation: { screen: screens[screenIndex]! } }; },
      async clickForeground() { screenIndex += 1; return { status: "clicked" }; }
    };
    const inspectWindow = vi.spyOn(adapter, "inspectWindow");
    const classifyScreen = vi.spyOn(adapter, "classifyScreen");
    const result = await new WindowsNavigationSequenceRunner(new GameInteractionLease(), adapter)
      .execute({ plan, approval });
    expect(result.status).toBe("completed");
    // Five transition waits still verify state, but only the first action needs
    // a separate preflight. Adjacent actions reuse the preceding verification.
    expect(inspectWindow).toHaveBeenCalledTimes(6);
    expect(classifyScreen).toHaveBeenCalledTimes(6);
  });
  it("prepares the exact navigation-only sequence and compact fingerprint", () => {
    expect(plan.steps.map(step => step.control)).toEqual([
      "open-stash", "start-game", "return-to-character-selection",
      "enter-lobby", "open-stash"
    ]);
    expect(plan.inputMethod).toBe("dndtools-virtual-desktop-sendinput-v2");
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

  it("prepares navigation when the complete client is on a secondary display", () => {
    const secondaryWindow: NavigationWindowState = {
      ...windowState,
      clientBounds: { left: 1920, top: 0, width: 1920, height: 1080 },
      display: { left: 0, top: 0, width: 3840, height: 1080 }
    };
    const secondaryPlan = prepareNav001Sequence({
      window: secondaryWindow,
      visibleStashTabs: 4,
      startingScreen: "lobby"
    });
    expect(secondaryPlan.window.clientBounds.left).toBe(1920);
    expect(secondaryPlan.steps.every(step => step.point.x >= 1920)).toBe(true);
  });

  it("rejects a client that extends outside the virtual desktop", () => {
    expect(() => prepareNav001Sequence({
      window: {
        ...windowState,
        clientBounds: { left: 3000, top: 0, width: 1920, height: 1080 },
        display: { left: 0, top: 0, width: 3840, height: 1080 }
      },
      visibleStashTabs: 4,
      startingScreen: "lobby"
    })).toThrow(/complete game client inside the virtual desktop/);
  });

  it("classifies private features and fails closed for unknown or ambiguous samples", () => {
    const templates = [
      { screen: "lobby" as const, featureVersion: 2 as const, feature: [10, 10, 10] },
      { screen: "stash" as const, featureVersion: 2 as const, feature: [50, 50, 50] }
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
