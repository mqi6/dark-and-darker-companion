import { describe, expect, it } from "vitest";
import {
  validatePrivateNavProfile,
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
