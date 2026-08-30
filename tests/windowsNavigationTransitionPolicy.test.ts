import { afterEach, describe, expect, it, vi } from "vitest";
import { GameInteractionLease } from "../src/tasks/taskMachine";
import {
  prepareNav001Sequence,
  WindowsNavigationSequenceRunner,
  type NavigationWindowState,
  type ScreenClassification,
  type WindowsNavigationAdapter
} from "../src/tasks/windowsNavigationRuntime";

const windowState: NavigationWindowState = {
  windowHandle: "0x1",
  processName: "DungeonCrawler",
  clientBounds: { left: 0, top: 0, width: 1920, height: 1080 },
  display: { left: 0, top: 0, width: 1920, height: 1080 },
  primaryDisplay: { left: 0, top: 0, width: 1920, height: 1080 },
  gameBuildFingerprint: "build"
};

afterEach(() => vi.useRealTimers());

describe("Windows navigation transition waiting", () => {
  it("treats loading-time unknown and ambiguous frames as pending without another click", async () => {
    vi.useFakeTimers();
    const prepared = prepareNav001Sequence({
      window: windowState,
      visibleStashTabs: 4,
      startingScreen: "lobby"
    });
    const plan = { ...prepared, steps: [prepared.steps[0]!] };
    const observations: ScreenClassification[] = [
      { status: "classified", observation: { screen: "lobby" } },
      { status: "unknown" },
      { status: "ambiguous" },
      { status: "classified", observation: { screen: "stash" } }
    ];
    let classificationIndex = 0;
    let clicks = 0;
    const adapter: WindowsNavigationAdapter = {
      async inspectWindow() { return windowState; },
      async classifyScreen() {
        return observations[Math.min(classificationIndex++, observations.length - 1)]!;
      },
      async clickForeground() { clicks += 1; return { status: "clicked" }; }
    };
    const run = new WindowsNavigationSequenceRunner(
      new GameInteractionLease(),
      adapter
    ).execute({
      plan,
      approval: { kind: "human-confirmation", planFingerprint: plan.planFingerprint }
    });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(await run).toEqual({ status: "completed", clickCount: 1 });
    expect(clicks).toBe(1);
  });
});
