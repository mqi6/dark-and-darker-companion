import { describe, expect, it } from "vitest";
import { buildGameScreenLayout } from "../src/domain/gameScreenLayout";
import {
  buildNavigationPlan,
  GameNavigationStateMachine
} from "../src/tasks/gameNavigationMachine";

const layout = buildGameScreenLayout({
  clientBounds: { left: 0, top: 0, width: 1920, height: 1080 },
  visibleStashTabs: 10
});

describe("game navigation planning", () => {
  it("routes stash to character selection through lobby", () => {
    const plan = buildNavigationPlan({
      from: "stash",
      target: { screen: "character-selection" },
      layout
    });
    expect(plan).toMatchObject({
      status: "ready",
      steps: [
        {
          control: "start-game",
          point: { x: 240, y: 41 },
          requiresScreen: "stash",
          expectedScreen: "lobby"
        },
        {
          control: "return-to-character-selection",
          point: { x: 1856, y: 1016 },
          requiresScreen: "lobby",
          expectedScreen: "character-selection"
        }
      ]
    });
  });

  it("routes character selection to the tenth stash tab", () => {
    const plan = buildNavigationPlan({
      from: "character-selection",
      target: { screen: "stash", tabIndex: 9 },
      characterSlotIndex: 2,
      layout
    });
    expect(plan).toMatchObject({
      status: "ready",
      steps: [
        { control: "select-character", point: { x: 1696, y: 417 } },
        { control: "enter-lobby", point: { x: 960, y: 1000 } },
        { control: "open-stash", point: { x: 880, y: 41 } },
        {
          control: "select-stash-tab",
          point: { x: 1328, y: 616 },
          expectedStashTabIndex: 9
        }
      ]
    });
  });

  it("blocks unknown screens and tabs outside the visible range", () => {
    expect(buildNavigationPlan({
      from: "unknown",
      target: { screen: "stash" },
      layout
    })).toEqual({ status: "blocked", diagnosticCode: "screen-unknown" });
    expect(buildNavigationPlan({
      from: "lobby",
      target: { screen: "stash", tabIndex: 10 },
      layout
    })).toEqual({ status: "blocked", diagnosticCode: "stash-tab-invalid" });
  });
});

describe("game navigation state machine", () => {
  it("requires each expected screen and selected tab before completing", () => {
    const plan = buildNavigationPlan({
      from: "lobby",
      target: { screen: "stash", tabIndex: 3 },
      layout
    });
    if (plan.status !== "ready") throw new Error("Expected ready navigation plan.");
    const machine = new GameNavigationStateMachine(plan);

    const openStash = machine.next({ screen: "lobby" });
    expect(openStash).toMatchObject({ status: "action-required", action: { control: "open-stash" } });
    if (openStash.status !== "action-required") throw new Error("Expected open-stash action.");

    const selectTab = machine.confirm(openStash.action.id, { screen: "stash", selectedStashTabIndex: 0 });
    expect(selectTab).toMatchObject({
      status: "action-required",
      action: { control: "select-stash-tab", expectedStashTabIndex: 3 }
    });
    if (selectTab.status !== "action-required") throw new Error("Expected tab action.");

    expect(machine.confirm(selectTab.action.id, {
      screen: "stash",
      selectedStashTabIndex: 3
    })).toEqual({ status: "complete" });
  });

  it("fails closed on an unexpected screen", () => {
    const plan = buildNavigationPlan({
      from: "lobby",
      target: { screen: "stash" },
      layout
    });
    if (plan.status !== "ready") throw new Error("Expected ready navigation plan.");
    const machine = new GameNavigationStateMachine(plan);
    expect(machine.next({ screen: "merchant" })).toEqual({
      status: "blocked",
      diagnosticCode: "unexpected-screen-before-open-stash"
    });
  });

  it("fails closed on timeout and keeps the terminal result stable", () => {
    const plan = buildNavigationPlan({
      from: "lobby",
      target: { screen: "character-selection" },
      layout
    });
    if (plan.status !== "ready") throw new Error("Expected ready navigation plan.");
    const machine = new GameNavigationStateMachine(plan);
    const action = machine.next({ screen: "lobby" });
    if (action.status !== "action-required") throw new Error("Expected navigation action.");
    const timeout = machine.timeout(action.action.id);
    expect(timeout).toEqual({
      status: "blocked",
      diagnosticCode: `navigation-timeout-${action.action.id}`
    });
    expect(machine.next({ screen: "character-selection" })).toEqual(timeout);
  });
});
