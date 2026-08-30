import { describe, expect, it } from "vitest";
import {
  classifyNavigationFeature,
  type NavigationScreenTemplate
} from "../src/tasks/navigationScreenClassifier";

const template = (
  screen: NavigationScreenTemplate["screen"],
  feature: number[]
): NavigationScreenTemplate => ({ screen, featureVersion: 2, feature });

describe("navigation screen classifier v2", () => {
  it("chooses the closest stable-UI feature", () => {
    expect(classifyNavigationFeature([12, 11, 9], [
      template("lobby", [10, 10, 10]),
      template("stash", [60, 60, 60])
    ])).toMatchObject({
      status: "classified",
      observation: { screen: "lobby" }
    });
  });

  it("allows multiple animation samples for one screen without false ambiguity", () => {
    expect(classifyNavigationFeature([15, 15, 15], [
      template("lobby", [10, 10, 10]),
      template("lobby", [16, 16, 16]),
      template("stash", [70, 70, 70])
    ])).toMatchObject({
      status: "classified",
      observation: { screen: "lobby" }
    });
  });

  it("compares ambiguity only across distinct screens", () => {
    expect(classifyNavigationFeature([30, 30, 30], [
      template("lobby", [29, 29, 29]),
      template("stash", [31, 31, 31])
    ])).toEqual({ status: "ambiguous" });
  });

  it("ignores stale feature versions and rejects distant samples", () => {
    const stale = { screen: "lobby" as const, featureVersion: 1 as 2, feature: [5, 5, 5] };
    expect(classifyNavigationFeature([5, 5, 5], [stale])).toEqual({ status: "unknown" });
    expect(classifyNavigationFeature([250, 250, 250], [
      template("lobby", [5, 5, 5])
    ])).toEqual({ status: "unknown" });
  });
});
