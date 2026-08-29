import { describe, expect, it } from "vitest";
import {
  buildGameScreenLayout,
  dndToolsScreenTransform
} from "../src/domain/gameScreenLayout";

describe("game screen layout", () => {
  it("preserves the confirmed 1920x1080 coordinates and extends tabs to ten", () => {
    const layout = buildGameScreenLayout({
      clientBounds: { left: 0, top: 0, width: 1920, height: 1080 },
      visibleStashTabs: 10
    });
    expect(layout.controls).toMatchObject({
      startGame: { x: 240, y: 41 },
      stash: { x: 880, y: 41 },
      merchant: { x: 1040, y: 41 },
      returnToCharacterSelection: { x: 1856, y: 1016 },
      enterLobby: { x: 960, y: 1000 },
      characterPageNext: { x: 1758, y: 875 }
    });
    expect(layout.controls.characterSlots).toEqual([
      { x: 1696, y: 177 },
      { x: 1696, y: 297 },
      { x: 1696, y: 417 },
      { x: 1696, y: 537 },
      { x: 1696, y: 657 },
      { x: 1696, y: 777 }
    ]);
    expect(layout.stash).toMatchObject({
      gridTopLeft: { x: 1378, y: 199 },
      gridBottomRight: { x: 1864, y: 1009 },
      playerBagGridTopLeft: { x: 690, y: 626 },
      cellPitch: 40.5,
      tabSpacing: 45
    });
    expect(layout.stash.tabCenters).toHaveLength(10);
    expect(layout.stash.tabCenters[9]).toEqual({ x: 1328, y: 616 });
  });

  it("uses DnDTools's centered 16:9 viewport on ultrawide screens", () => {
    expect(dndToolsScreenTransform({ width: 2560, height: 1080 })).toEqual({
      mode: "centered-16:9-viewport",
      scaleX: 1,
      scaleY: 1,
      offsetX: 320
    });
    const layout = buildGameScreenLayout({
      clientBounds: { left: 100, top: 20, width: 2560, height: 1080 },
      visibleStashTabs: 4
    });
    expect(layout.controls.stash).toEqual({ x: 1300, y: 61 });
    expect(layout.stash.gridTopLeft).toEqual({ x: 1798, y: 219 });
    expect(layout.stash.tabCenters[3]).toEqual({ x: 1748, y: 366 });
  });

  it("keeps the DnDTools 1280x720 hand-tuned stash override", () => {
    const layout = buildGameScreenLayout({
      clientBounds: { left: 0, top: 0, width: 1280, height: 720 },
      visibleStashTabs: 8
    });
    expect(layout.stash).toMatchObject({
      gridTopLeft: { x: 918, y: 132 },
      playerBagGridTopLeft: { x: 457, y: 416 },
      cellPitch: 27,
      tabSpacing: 31
    });
    expect(layout.stash.tabCenters[0]).toEqual({ x: 881, y: 139 });
    expect(layout.stash.tabCenters[7]).toEqual({ x: 881, y: 356 });
  });

  it("rejects unsupported visible-tab counts", () => {
    expect(() => buildGameScreenLayout({
      clientBounds: { left: 0, top: 0, width: 1920, height: 1080 },
      visibleStashTabs: 1
    })).toThrow(/2 through 10/);
    expect(() => buildGameScreenLayout({
      clientBounds: { left: 0, top: 0, width: 1920, height: 1080 },
      visibleStashTabs: 11
    })).toThrow(/2 through 10/);
  });
});
