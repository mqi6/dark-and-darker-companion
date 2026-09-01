import { describe, expect, it } from "vitest";
import { prepareCompleteStashScreenPlan } from "../src/domain/completeStashScreenPlan";
import { buildGameScreenLayout } from "../src/domain/gameScreenLayout";
import type { ScheduledStashSort } from "../src/domain/stashMoveScheduler";

const layout = buildGameScreenLayout({
  clientBounds: { left: 1920, top: 0, width: 1920, height: 1080 },
  visibleStashTabs: 4
});

const schedule: Extract<ScheduledStashSort, { status: "ready" }> = {
  status: "ready",
  actions: [
    { kind: "select-stash-tab", tabIndex: 1, inventoryId: 20 },
    {
      kind: "drag-stash-to-stash",
      itemAlias: "same",
      width: 1,
      height: 1,
      source: { inventoryId: 20, point: { x: 0, y: 0 }, slotId: 0 },
      destination: { inventoryId: 20, point: { x: 1, y: 0 }, slotId: 1 }
    },
    {
      kind: "drag-stash-to-bag",
      itemAlias: "cross",
      width: 2,
      height: 2,
      source: { inventoryId: 20, point: { x: 2, y: 0 }, slotId: 2 },
      destination: { inventoryId: 2, point: { x: 0, y: 0 }, slotId: 0 }
    },
    {
      kind: "drag-bag-to-stash",
      itemAlias: "cross",
      width: 2,
      height: 2,
      source: { inventoryId: 2, point: { x: 0, y: 0 }, slotId: 0 },
      destination: { inventoryId: 4, point: { x: 0, y: 2 }, slotId: 24 }
    }
  ],
  itemMoveCount: 2,
  dragCount: 3,
  temporaryBufferCount: 0,
  usesSingleInitialSnapshot: true
};

describe("complete stash screen plan", () => {
  it("converts same-page and bag-backed actions using secondary-monitor coordinates", () => {
    const actions = prepareCompleteStashScreenPlan(schedule, layout);
    expect(actions[0]).toEqual({
      kind: "select-stash-tab",
      tabIndex: 1,
      inventoryId: 20,
      point: { x: 3248, y: 256 }
    });
    expect(actions[1]).toMatchObject({
      kind: "drag-stash-to-stash",
      source: { x: 3318.25, y: 219.25 },
      destination: { x: 3358.75, y: 219.25 }
    });
    expect(actions[2]).toMatchObject({
      kind: "drag-stash-to-bag",
      destination: { x: 2648.2, y: 664.6 }
    });
    expect(actions[3]).toMatchObject({
      kind: "drag-bag-to-stash",
      source: { x: 2648.2, y: 664.6 }
    });
  });

  it("rejects a tab that is not visible", () => {
    const invalid = {
      ...schedule,
      actions: [{ kind: "select-stash-tab", tabIndex: 4, inventoryId: 8 }]
    } satisfies Extract<ScheduledStashSort, { status: "ready" }>;
    expect(() => prepareCompleteStashScreenPlan(invalid, layout)).toThrow(/not visible/);
  });
});
