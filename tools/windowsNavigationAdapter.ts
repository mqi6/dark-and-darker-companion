import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ScreenPoint } from "../src/domain/stashScreenCalibration";
import type { FixedCoordinateClickTiming } from "../src/tasks/fixedCoordinateCrossTabRuntime";
import {
  classifyNavigationFeature,
  NAVIGATION_FEATURE_VERSION,
  type NavigationScreenTemplate
} from "../src/tasks/navigationScreenClassifier";
import type {
  NavigationWindowState,
  ScreenClassification,
  WindowsNavigationAdapter
} from "../src/tasks/windowsNavigationRuntime";

const execFileAsync = promisify(execFile);

export type PrivateScreenTemplate = NavigationScreenTemplate;

export interface PrivateNavProfile {
  schemaVersion: 2;
  gameBuildFingerprint: string;
  visibleStashTabs: number;
  selectedCharacterSlotIndex: number | null;
  templates: PrivateScreenTemplate[];
}

interface HelperState {
  windowHandle: string;
  processName: string;
  clientBounds: { left: number; top: number; width: number; height: number };
  display: { left: number; top: number; width: number; height: number };
  primaryDisplay: { left: number; top: number; width: number; height: number };
  featureVersion?: number;
  feature?: number[];
}

export class PowerShellNavigationAdapter implements WindowsNavigationAdapter {
  constructor(
    private readonly helper: string,
    private readonly profile: PrivateNavProfile,
    private readonly expected: HelperState,
    private readonly capturePath: string
  ) {
    validatePrivateNavProfile(profile);
  }

  async inspectWindow(): Promise<NavigationWindowState> {
    const state = await this.run([
      "-FocusGame", "-ExpectedWindowHandle", this.expected.windowHandle
    ]);
    // Carry the handle resolved for this request into the remaining operations
    // in the same adapter session. Each Focus/Refresh/Run still begins with a
    // fresh inspect; clicks no longer repeat stale-handle enumeration.
    updateExpectedWindowState(this.expected, state);
    return { ...state, gameBuildFingerprint: this.profile.gameBuildFingerprint };
  }

  async classifyScreen(): Promise<ScreenClassification> {
    const state = await this.run(["-Capture", "-OutputPath", this.capturePath]);
    updateExpectedWindowState(this.expected, state);
    const window: NavigationWindowState = {
      windowHandle: state.windowHandle,
      processName: state.processName,
      clientBounds: state.clientBounds,
      display: state.display,
      primaryDisplay: state.primaryDisplay,
      gameBuildFingerprint: this.profile.gameBuildFingerprint
    };
    if (state.featureVersion !== NAVIGATION_FEATURE_VERSION || !state.feature) {
      return { status: "unknown", window };
    }
    const result = classifyNavigationFeature(state.feature, this.profile.templates);
    if (result.status !== "classified") return { ...result, window };
    return { status: "classified", observation: result.observation, window };
  }

  async clickForeground(
    point: ScreenPoint,
    timing?: FixedCoordinateClickTiming
  ) {
    const bounds = this.expected.clientBounds;
    try {
      const state = await this.run([
        "-Click",
        "-ExpectedWindowHandle", this.expected.windowHandle,
        "-ExpectedLeft", String(bounds.left),
        "-ExpectedTop", String(bounds.top),
        "-ExpectedWidth", String(bounds.width),
        "-ExpectedHeight", String(bounds.height),
        "-X", String(Math.round(point.x)),
        "-Y", String(Math.round(point.y)),
        ...(timing ? [
          "-PointerSettleMilliseconds", String(timing.pointerSettleMilliseconds),
          "-ClickHoldMilliseconds", String(timing.clickHoldMilliseconds),
          "-PostClickMilliseconds", String(timing.postClickMilliseconds)
        ] : [])
      ]);
      return state as unknown as { status: "clicked" };
    } catch {
      return { status: "rejected" as const, diagnosticCode: "send-input-rejected" };
    }
  }

  private async run(args: string[]): Promise<HelperState & Record<string, unknown>> {
    const result = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", this.helper, ...args],
      { encoding: "utf8", windowsHide: true, maxBuffer: 2 * 1024 * 1024 }
    );
    return JSON.parse(result.stdout) as HelperState & Record<string, unknown>;
  }
}

export function updateExpectedWindowState(expected: HelperState, current: HelperState): void {
  expected.windowHandle = current.windowHandle;
  expected.clientBounds = current.clientBounds;
  expected.display = current.display;
  expected.primaryDisplay = current.primaryDisplay;
}

export function classifyFeature(
  feature: number[],
  templates: PrivateScreenTemplate[]
): ScreenClassification {
  const result = classifyNavigationFeature(feature, templates);
  if (result.status !== "classified") return result;
  return { status: "classified", observation: result.observation };
}

export function validatePrivateNavProfile(
  profile: PrivateNavProfile,
  options: { requireRouteTemplates?: boolean } = {}
): void {
  if (profile.schemaVersion !== NAVIGATION_FEATURE_VERSION) {
    throw new Error("Private navigation profile must be migrated to schema version 2.");
  }
  if (!Number.isInteger(profile.visibleStashTabs) ||
      profile.visibleStashTabs < 2 || profile.visibleStashTabs > 10) {
    throw new Error("Visible stash tabs must be 2 through 10.");
  }
  if (profile.selectedCharacterSlotIndex !== null &&
      (!Number.isInteger(profile.selectedCharacterSlotIndex) ||
        profile.selectedCharacterSlotIndex < 0 || profile.selectedCharacterSlotIndex >= 6)) {
    throw new Error("Selected character slot must be null or 0 through 5.");
  }
  const requiredScreens: PrivateScreenTemplate["screen"][] = [
    "character-selection", "lobby", "stash"
  ];
  if (options.requireRouteTemplates !== false &&
      requiredScreens.some(screen => !profile.templates.some(template => template.screen === screen))) {
    throw new Error("Character-selection, Lobby, and Stash templates are required.");
  }
  if (profile.templates.some(template => template.featureVersion !== NAVIGATION_FEATURE_VERSION)) {
    throw new Error("Private navigation templates must use feature version 2.");
  }
  const featureLength = profile.templates[0]?.feature.length ?? 0;
  if (featureLength === 0 || profile.templates.some(template =>
    template.feature.length !== featureLength || template.feature.some(value => !Number.isFinite(value)))) {
    throw new Error("Private navigation features must have one consistent, finite shape.");
  }
  for (const screen of ["character-selection", "lobby", "stash", "merchant"] as const) {
    if (profile.templates.filter(template => template.screen === screen).length > 4) {
      throw new Error("At most four private templates are allowed per screen.");
    }
  }
}
