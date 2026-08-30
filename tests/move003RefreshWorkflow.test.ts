import { describe, expect, it } from "vitest";
import { Move003RefreshCoordinator, command44Ready, prepareMove003Refresh } from "../src/tasks/move003RefreshWorkflow";
import { GameInteractionLease } from "../src/tasks/taskMachine";
import { WindowsNavigationSequenceRunner, type WindowsNavigationAdapter } from "../src/tasks/windowsNavigationRuntime";
import type { NavigationWindowState } from "../src/tasks/windowsNavigationRuntime";

const window: NavigationWindowState = { windowHandle: "0x1", processName: "DungeonCrawler", clientBounds: { left: 0, top: 0, width: 1920, height: 1080 }, display: { left: 0, top: 0, width: 1920, height: 1080 }, primaryDisplay: { left: 0, top: 0, width: 1920, height: 1080 }, gameBuildFingerprint: "build" };

describe("MOVE-003 productive refresh workflow", () => {
  it.each([
    ["lobby", ["return-to-character-selection", "enter-lobby", "open-stash"]],
    ["stash", ["start-game", "return-to-character-selection", "enter-lobby", "open-stash"]],
    ["character-selection", ["enter-lobby", "open-stash"]],
    ["merchant", ["start-game", "return-to-character-selection", "enter-lobby", "open-stash"]]
  ] as const)("uses the minimal %s route", (startingScreen, controls) => {
    const plan = prepareMove003Refresh({ window, visibleStashTabs: 10, startingScreen });
    expect(plan.steps.map(step => step.control)).toEqual(controls);
    expect(plan.steps.find(step => step.control === "enter-lobby")?.timeoutMilliseconds).toBe(30_000);
    expect(plan.steps.filter(step => step.control !== "enter-lobby").every(step => step.timeoutMilliseconds === 10_000)).toBe(true);
    expect(plan.pollingIntervalMilliseconds).toBe(500); expect(plan.retryCount).toBe(0);
    expect(plan.approvalScope).toBe("navigation-only-no-item-drag");
    expect(plan.planFingerprint).toMatch(/^move003-refresh-[a-f0-9]{32}$/);
  });
  it("never includes the NAV-only lobby-stash-lobby prefix", () => {
    expect(prepareMove003Refresh({ window, visibleStashTabs: 10, startingScreen: "lobby" }).steps.slice(0, 2).map(step => step.control)).not.toEqual(["open-stash", "start-game"]);
  });
  it("requires every fresh command-44 and spatial gate", () => {
    const ready = { observedAfterRefreshStart: true, result: 1, complete: true, buildCompatible: true, stashContainerCount: 10, spatialValidationReady: true, blockedContainerCount: 0, overlapDiagnosticCount: 0, boundsDiagnosticCount: 0 };
    expect(command44Ready(ready)).toBe(true);
    for (const key of ["observedAfterRefreshStart", "complete", "buildCompatible", "spatialValidationReady"] as const) expect(command44Ready({ ...ready, [key]: false })).toBe(false);
    expect(command44Ready({ ...ready, stashContainerCount: 9 })).toBe(false);
    expect(command44Ready({ ...ready, blockedContainerCount: 1 })).toBe(false);
    expect(command44Ready({ ...ready, overlapDiagnosticCount: 1 })).toBe(false);
    expect(command44Ready({ ...ready, boundsDiagnosticCount: 1 })).toBe(false);
  });
  it("starts capture before navigation and stops after both navigation and state gates", async () => {
    const events: string[] = [], screens = ["lobby", "character-selection", "character-selection", "lobby", "lobby", "stash"] as const; let index = 0;
    const adapter: WindowsNavigationAdapter = { async inspectWindow() { return window; }, async classifyScreen() { return { status: "classified", observation: { screen: screens[Math.min(index++, screens.length - 1)]! } }; }, async clickForeground() { events.push("click"); return { status: "clicked" }; } };
    const plan = prepareMove003Refresh({ window, visibleStashTabs: 10, startingScreen: "lobby" });
    const ready = { observedAfterRefreshStart: true, result: 1, complete: true, buildCompatible: true, stashContainerCount: 10, spatialValidationReady: true, blockedContainerCount: 0, overlapDiagnosticCount: 0, boundsDiagnosticCount: 0 };
    const coordinator = new Move003RefreshCoordinator(new WindowsNavigationSequenceRunner(new GameInteractionLease(), adapter), { async start() { events.push("capture-start"); }, async stop() { events.push("capture-stop"); } }, { async waitForFreshState() { events.push("state-wait"); return ready; } });
    expect((await coordinator.execute({ plan, approval: { kind: "human-confirmation", planFingerprint: plan.planFingerprint }, workflowTimeoutMilliseconds: 60_000 })).status).toBe("ready");
    expect(events[0]).toBe("capture-start"); expect(events.at(-1)).toBe("capture-stop"); expect(events.filter(value => value === "click")).toHaveLength(3);
  });
});
