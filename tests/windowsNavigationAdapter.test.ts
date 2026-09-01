import { describe, expect, it } from "vitest";
import {
  validatePrivateNavProfile,
  updateExpectedWindowState,
  type PrivateNavProfile,
  type PrivateScreenTemplate
} from "../tools/windowsNavigationAdapter";

const template = (
  screen: PrivateScreenTemplate["screen"],
  feature = [1, 2, 3]
): PrivateScreenTemplate => ({ screen, featureVersion: 2, feature });

const profile = (templates: PrivateScreenTemplate[]): PrivateNavProfile => ({
  schemaVersion: 2,
  gameBuildFingerprint: "build",
  visibleStashTabs: 4,
  selectedCharacterSlotIndex: null,
  templates
});

describe("private navigation profile v2", () => {
  it("carries a freshly resolved window into later operations", () => {
    const expected = { windowHandle: "0x1", processName: "DungeonCrawler", clientBounds: { left: 0, top: 0, width: 1, height: 1 }, display: { left: 0, top: 0, width: 1, height: 1 }, primaryDisplay: { left: 0, top: 0, width: 1, height: 1 } };
    const current = { ...expected, windowHandle: "0x2", clientBounds: { left: 10, top: 20, width: 1920, height: 1080 } };
    updateExpectedWindowState(expected, current);
    expect(expected).toMatchObject({ windowHandle: "0x2", clientBounds: current.clientBounds });
  });
  it("accepts complete, consistently shaped reference sets", () => {
    expect(() => validatePrivateNavProfile(profile([
      template("character-selection"),
      template("lobby"),
      template("lobby", [2, 3, 4]),
      template("stash")
    ]))).not.toThrow();
  });

  it("requires every screen used by the refresh route", () => {
    expect(() => validatePrivateNavProfile(profile([
      template("lobby"), template("stash")
    ]))).toThrow(/required/);
  });

  it("rejects inconsistent feature shapes", () => {
    expect(() => validatePrivateNavProfile(profile([
      template("character-selection"), template("lobby", [1, 2]), template("stash")
    ]))).toThrow(/consistent/);
  });
});
