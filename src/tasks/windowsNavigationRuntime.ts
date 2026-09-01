import { buildGameScreenLayout, type GameScreenLayout } from "../domain/gameScreenLayout";
import type { ScreenPoint, ScreenRectangle } from "../domain/stashScreenCalibration";
import {
  buildNavigationPlan,
  type GameScreen,
  type NavigationClickStep,
  type NavigationObservation
} from "./gameNavigationMachine";
import { GameInteractionLease } from "./taskMachine";

export const WINDOWS_NAVIGATION_INPUT_METHOD = "dndtools-virtual-desktop-sendinput-v2" as const;
export const NAVIGATION_TRANSITION_POLL_MILLISECONDS = 500;

export interface DisplayGeometry { left: number; top: number; width: number; height: number }
export interface NavigationWindowState {
  windowHandle: string;
  processName: string;
  clientBounds: ScreenRectangle;
  display: DisplayGeometry;
  primaryDisplay: DisplayGeometry;
  gameBuildFingerprint: string;
}
export type ScreenClassification =
  | { status: "classified"; observation: NavigationObservation }
  | { status: "unknown" }
  | { status: "ambiguous" };
export interface WindowsNavigationAdapter {
  inspectWindow(): Promise<NavigationWindowState>;
  classifyScreen(): Promise<ScreenClassification>;
  clickForeground(point: ScreenPoint): Promise<{ status: "clicked" } | { status: "rejected"; diagnosticCode: string }>;
}

export interface PreparedNavigationSequence {
  taskId: "NAV-001" | "MOVE-003-REFRESH";
  inputMethod: typeof WINDOWS_NAVIGATION_INPUT_METHOD;
  gameBuildFingerprint: string;
  window: NavigationWindowState;
  visibleStashTabs: number;
  selectedCharacterSlotIndex: number | null;
  startingScreen: Exclude<GameScreen, "unknown">;
  layout: GameScreenLayout;
  steps: readonly NavigationClickStep[];
  planFingerprint: string;
}
export interface NavigationApproval { kind: "human-confirmation"; planFingerprint: string }
export type NavigationRunResult =
  | { status: "dry-run"; clickCount: 0 }
  | { status: "completed"; clickCount: number }
  | { status: "blocked"; diagnosticCode: string; clickCount: number }
  | { status: "cancelled"; clickCount: number };

export function prepareNav001Sequence(parameters: {
  window: NavigationWindowState;
  visibleStashTabs: number;
  selectedCharacterSlotIndex?: number | null;
  startingScreen: GameScreen;
}): PreparedNavigationSequence {
  if (parameters.window.processName.toLowerCase() !== "dungeoncrawler") {
    throw new Error("DungeonCrawler must be the foreground process.");
  }
  if (parameters.startingScreen !== "lobby") throw new Error("NAV-001 must start in lobby.");
  const layout = buildGameScreenLayout({
    clientBounds: parameters.window.clientBounds,
    visibleStashTabs: parameters.visibleStashTabs
  });
  assertInsideVirtualDisplay(parameters.window, layout);
  const route = [
    { from: "lobby" as const, target: { screen: "stash" as const } },
    { from: "stash" as const, target: { screen: "lobby" as const } },
    { from: "lobby" as const, target: { screen: "character-selection" as const } },
    { from: "character-selection" as const, target: { screen: "lobby" as const } },
    { from: "lobby" as const, target: { screen: "stash" as const } }
  ];
  const steps = route.flatMap(entry => {
    const plan = buildNavigationPlan({
      from: entry.from,
      target: entry.target,
      layout,
      characterSlotIndex: parameters.selectedCharacterSlotIndex ?? 0,
      useCurrentCharacterSelection: true
    });
    if (plan.status !== "ready") throw new Error(plan.diagnosticCode);
    return plan.steps;
  });
  const base = {
    taskId: "NAV-001" as const,
    inputMethod: WINDOWS_NAVIGATION_INPUT_METHOD,
    gameBuildFingerprint: parameters.window.gameBuildFingerprint,
    window: parameters.window,
    visibleStashTabs: parameters.visibleStashTabs,
    selectedCharacterSlotIndex: parameters.selectedCharacterSlotIndex ?? null,
    startingScreen: parameters.startingScreen,
    layout,
    steps
  };
  return { ...base, planFingerprint: compactNavigationFingerprint(base) };
}

export class WindowsNavigationSequenceRunner {
  constructor(
    private readonly lease: GameInteractionLease,
    private readonly adapter: WindowsNavigationAdapter,
    private readonly log: (event: { event: string; detail: string }) => void = () => undefined
  ) {}

  preview(): NavigationRunResult { return { status: "dry-run", clickCount: 0 }; }

  async execute(parameters: {
    plan: PreparedNavigationSequence;
    approval: NavigationApproval;
    signal?: AbortSignal;
    initialState?: {
      window: NavigationWindowState;
      classification: Extract<ScreenClassification, { status: "classified" }>;
    };
  }): Promise<NavigationRunResult> {
    const { plan } = parameters;
    if (parameters.approval.kind !== "human-confirmation" ||
        parameters.approval.planFingerprint !== plan.planFingerprint) {
      return { status: "blocked", diagnosticCode: "stale-action-confirmation", clickCount: 0 };
    }
    if (!this.lease.acquire(plan.taskId)) {
      return { status: "blocked", diagnosticCode: "game-interaction-lease-unavailable", clickCount: 0 };
    }
    let clickCount = 0;
    try {
      for (const [stepIndex, step] of plan.steps.entries()) {
        if (parameters.signal?.aborted) return { status: "cancelled", clickCount };
        const problem = stepIndex === 0 && parameters.initialState
          ? validateInitialState(plan, step.requiresScreen, parameters.initialState)
          : await this.preflight(plan, step.requiresScreen);
        if (problem) return { status: "blocked", diagnosticCode: problem, clickCount };
        this.log({ event: "dispatch", detail: step.control });
        const click = await this.adapter.clickForeground(step.point);
        if (click.status === "rejected") {
          return { status: "blocked", diagnosticCode: click.diagnosticCode, clickCount };
        }
        clickCount += 1;
        const transition = await this.waitForStep(step, plan, parameters.signal);
        if (transition !== undefined) return { status: transition === "cancelled" ? "cancelled" : "blocked", ...(transition === "cancelled" ? {} : { diagnosticCode: transition }), clickCount } as NavigationRunResult;
        this.log({ event: "transition", detail: `${step.requiresScreen}->${step.expectedScreen}` });
      }
      return { status: "completed", clickCount };
    } finally {
      this.lease.release(plan.taskId);
    }
  }

  private async preflight(plan: PreparedNavigationSequence, requiredScreen: Exclude<GameScreen, "unknown">): Promise<string | undefined> {
    const current = await this.adapter.inspectWindow();
    if (current.processName.toLowerCase() !== "dungeoncrawler" || current.windowHandle !== plan.window.windowHandle) return "foreground-window-mismatch";
    if (!sameRectangle(current.clientBounds, plan.window.clientBounds)) return "window-bounds-changed";
    if (!sameDisplay(current.display, plan.window.display)) return "display-geometry-changed";
    if (current.gameBuildFingerprint !== plan.gameBuildFingerprint) return "game-build-changed";
    const classified = await this.adapter.classifyScreen();
    if (classified.status !== "classified") return `screen-${classified.status}`;
    if (classified.observation.screen !== requiredScreen) return "unexpected-screen";
    return undefined;
  }

  private async waitForStep(step: NavigationClickStep, plan: PreparedNavigationSequence, signal?: AbortSignal): Promise<string | "cancelled" | undefined> {
    const deadline = Date.now() + step.timeoutMilliseconds;
    while (Date.now() < deadline) {
      if (signal?.aborted) return "cancelled";
      const current = await this.adapter.inspectWindow();
      if (current.windowHandle !== plan.window.windowHandle || current.processName.toLowerCase() !== "dungeoncrawler") return "foreground-window-mismatch";
      if (!sameRectangle(current.clientBounds, plan.window.clientBounds)) return "window-bounds-changed";
      if (!sameDisplay(current.display, plan.window.display)) return "display-geometry-changed";
      const result = await this.adapter.classifyScreen();
      if (result.status === "classified") {
        const observation = result.observation;
        if (observation.screen === step.expectedScreen &&
            (step.expectedCharacterSlotIndex === undefined ||
              observation.selectedCharacterSlotIndex === step.expectedCharacterSlotIndex) &&
            (step.expectedStashTabIndex === undefined ||
              observation.selectedStashTabIndex === step.expectedStashTabIndex)) return undefined;
      }
      await new Promise(resolve =>
        setTimeout(resolve, NAVIGATION_TRANSITION_POLL_MILLISECONDS));
    }
    return `transition-timeout-${step.control}`;
  }
}

function validateInitialState(
  plan: PreparedNavigationSequence,
  requiredScreen: Exclude<GameScreen, "unknown">,
  state: {
    window: NavigationWindowState;
    classification: Extract<ScreenClassification, { status: "classified" }>;
  }
): string | undefined {
  if (state.window.processName.toLowerCase() !== "dungeoncrawler" ||
      state.window.windowHandle !== plan.window.windowHandle) return "foreground-window-mismatch";
  if (!sameRectangle(state.window.clientBounds, plan.window.clientBounds)) return "window-bounds-changed";
  if (!sameDisplay(state.window.display, plan.window.display)) return "display-geometry-changed";
  if (state.window.gameBuildFingerprint !== plan.gameBuildFingerprint) return "game-build-changed";
  return state.classification.observation.screen === requiredScreen ? undefined : "unexpected-screen";
}

export function compactNavigationFingerprint(value: unknown, prefix = "nav001"): string {
  const payload = JSON.stringify(value);
  return `${prefix}-${fnv(`left:${payload}`)}${fnv(`right:${payload}`)}`;
}
function fnv(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return hash.toString(16).padStart(16, "0");
}
function sameRectangle(a: ScreenRectangle, b: ScreenRectangle) { return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height; }
function sameDisplay(a: DisplayGeometry, b: DisplayGeometry) { return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height; }

function assertInsideVirtualDisplay(window: NavigationWindowState, layout: GameScreenLayout): void {
  const display = window.display;
  const inside = (point: ScreenPoint) =>
    point.x >= display.left && point.y >= display.top &&
    point.x < display.left + display.width && point.y < display.top + display.height;
  const bounds = window.clientBounds;
  if (
    bounds.left < display.left || bounds.top < display.top ||
    bounds.left + bounds.width > display.left + display.width ||
    bounds.top + bounds.height > display.top + display.height
  ) {
    throw new Error("NAV-002 requires the complete game client inside the virtual desktop.");
  }
  const points = [
    layout.controls.startGame,
    layout.controls.stash,
    layout.controls.merchant,
    layout.controls.returnToCharacterSelection,
    layout.controls.enterLobby,
    ...layout.stash.tabCenters
  ];
  if (!points.every(inside)) {
    throw new Error("NAV-002 planned point is outside the virtual desktop.");
  }
}
