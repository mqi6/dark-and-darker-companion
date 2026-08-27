import { describe, expect, it } from "vitest";
import { windowsBuildBaselineSchema } from "../src/fixtures/windowsBuildBaseline";

describe("Windows game build baseline", () => {
  it("accepts a sanitized BUILD-001 record without a local path", () => {
    const baseline = windowsBuildBaselineSchema.parse({
      schemaVersion: 1,
      sampleId: "BUILD-001",
      capturedAt: "2026-08-27T12:00:00.000Z",
      gameBuildLabel: "live-test-build",
      gameExecutableName: "Game.exe",
      gameExecutableSha256: "a".repeat(64),
      gameExecutableSize: 123456789,
      fileVersion: null,
      productVersion: "1.0.0",
      windowsVersion: "Microsoft Windows NT 10.0.26100.0",
      screen: {
        width: 2560,
        height: 1440,
        windowsScalingPercent: 125,
        windowMode: "borderless"
      },
      gameLanguage: "en",
      sanitized: true
    });

    expect(baseline.sampleId).toBe("BUILD-001");
    expect(JSON.stringify(baseline)).not.toContain(":\\");
  });
});
