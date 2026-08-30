import { buildGameScreenLayout } from "../domain/gameScreenLayout";
import { buildNavigationPlan, type GameScreen, type NavigationClickStep } from "./gameNavigationMachine";
import { NAVIGATION_TRANSITION_POLL_MILLISECONDS, WINDOWS_NAVIGATION_INPUT_METHOD, WindowsNavigationSequenceRunner, compactNavigationFingerprint, type NavigationApproval, type NavigationRunResult, type NavigationWindowState, type PreparedNavigationSequence } from "./windowsNavigationRuntime";

export const MOVE003_CAPTURE_FILTER = "tcp portrange 20200-20300";
export const MOVE003_ORDINARY_DEADLINE_MILLISECONDS = 10_000;
export const MOVE003_ENTER_LOBBY_DEADLINE_MILLISECONDS = 30_000;
export const MOVE003_EXPECTED_STASH_CONTAINERS = 10;

export interface PreparedMove003Refresh extends PreparedNavigationSequence {
  taskId: "MOVE-003-REFRESH";
  approvalScope: "navigation-only-no-item-drag";
  captureFilter: typeof MOVE003_CAPTURE_FILTER;
  ordinaryDeadlineMilliseconds: typeof MOVE003_ORDINARY_DEADLINE_MILLISECONDS;
  enterLobbyDeadlineMilliseconds: typeof MOVE003_ENTER_LOBBY_DEADLINE_MILLISECONDS;
  pollingIntervalMilliseconds: typeof NAVIGATION_TRANSITION_POLL_MILLISECONDS;
  retryCount: 0;
}

export interface FreshCommand44Gate {
  observedAfterRefreshStart: boolean; result: number; complete: boolean; buildCompatible: boolean;
  stashContainerCount: number; spatialValidationReady: boolean; blockedContainerCount: number;
  overlapDiagnosticCount: number; boundsDiagnosticCount: number;
}

export function command44Ready(value: FreshCommand44Gate): boolean {
  return value.observedAfterRefreshStart && value.result === 1 && value.complete && value.buildCompatible &&
    value.stashContainerCount === MOVE003_EXPECTED_STASH_CONTAINERS && value.spatialValidationReady &&
    value.blockedContainerCount === 0 && value.overlapDiagnosticCount === 0 && value.boundsDiagnosticCount === 0;
}

export interface PassiveRefreshCapture {
  start(plan: PreparedMove003Refresh): Promise<void>;
  stop(reason: string): Promise<void>;
}
export interface FreshCommand44Observer {
  waitForFreshState(parameters: { refreshStartedAtUnixMilliseconds: number; timeoutMilliseconds: number; signal?: AbortSignal }): Promise<FreshCommand44Gate | undefined>;
}
export type Move003RefreshResult =
  | { status: "ready"; navigation: NavigationRunResult; state: FreshCommand44Gate }
  | { status: "blocked"; diagnosticCode: string; navigation?: NavigationRunResult };

export class Move003RefreshCoordinator {
  constructor(private navigation: WindowsNavigationSequenceRunner, private capture: PassiveRefreshCapture, private states: FreshCommand44Observer) {}
  async execute(parameters: { plan: PreparedMove003Refresh; approval: NavigationApproval; workflowTimeoutMilliseconds: number; signal?: AbortSignal }): Promise<Move003RefreshResult> {
    if (parameters.approval.planFingerprint !== parameters.plan.planFingerprint) return { status: "blocked", diagnosticCode: "stale-refresh-approval" };
    const started = Date.now();
    const controller = new AbortController();
    parameters.signal?.addEventListener("abort", () => controller.abort(), { once: true });
    await this.capture.start(parameters.plan);
    try {
      const statePromise = this.states.waitForFreshState({ refreshStartedAtUnixMilliseconds: started, timeoutMilliseconds: parameters.workflowTimeoutMilliseconds, signal: controller.signal });
      const navigation = await this.navigation.execute({ plan: parameters.plan, approval: parameters.approval, signal: controller.signal });
      if (navigation.status !== "completed") { controller.abort(); await statePromise.catch(() => undefined); return { status: "blocked", diagnosticCode: `navigation-${navigation.status}`, navigation }; }
      const state = await statePromise;
      if (!state || !command44Ready(state)) return { status: "blocked", diagnosticCode: "fresh-command44-gate-failed", navigation };
      return { status: "ready", navigation, state };
    } finally {
      controller.abort();
      await this.capture.stop("refresh-workflow-finished");
    }
  }
}

export function prepareMove003Refresh(parameters: { window: NavigationWindowState; visibleStashTabs: number; startingScreen: GameScreen }): PreparedMove003Refresh {
  if (parameters.startingScreen === "unknown") throw new Error("MOVE-003 refresh starting screen is unknown.");
  if (parameters.window.processName.toLowerCase() !== "dungeoncrawler") throw new Error("DungeonCrawler must be foreground.");
  const layout = buildGameScreenLayout({ clientBounds: parameters.window.clientBounds, visibleStashTabs: parameters.visibleStashTabs });
  assertPrimaryDisplay(parameters.window, layout);
  const steps: NavigationClickStep[] = [];
  let current = parameters.startingScreen;
  if (current !== "character-selection") {
    const toCharacter = buildNavigationPlan({ from: current, target: { screen: "character-selection" }, layout, useCurrentCharacterSelection: true, transitionTimeoutMilliseconds: MOVE003_ORDINARY_DEADLINE_MILLISECONDS, enterLobbyTimeoutMilliseconds: MOVE003_ENTER_LOBBY_DEADLINE_MILLISECONDS });
    if (toCharacter.status !== "ready") throw new Error(toCharacter.diagnosticCode);
    steps.push(...toCharacter.steps); current = "character-selection";
  }
  const toStash = buildNavigationPlan({ from: current, target: { screen: "stash" }, layout, useCurrentCharacterSelection: true, transitionTimeoutMilliseconds: MOVE003_ORDINARY_DEADLINE_MILLISECONDS, enterLobbyTimeoutMilliseconds: MOVE003_ENTER_LOBBY_DEADLINE_MILLISECONDS });
  if (toStash.status !== "ready") throw new Error(toStash.diagnosticCode);
  steps.push(...toStash.steps);
  const base = { taskId: "MOVE-003-REFRESH" as const, approvalScope: "navigation-only-no-item-drag" as const, inputMethod: WINDOWS_NAVIGATION_INPUT_METHOD, gameBuildFingerprint: parameters.window.gameBuildFingerprint, window: parameters.window, visibleStashTabs: parameters.visibleStashTabs, selectedCharacterSlotIndex: null, startingScreen: parameters.startingScreen, layout, steps, captureFilter: MOVE003_CAPTURE_FILTER as typeof MOVE003_CAPTURE_FILTER, ordinaryDeadlineMilliseconds: MOVE003_ORDINARY_DEADLINE_MILLISECONDS as typeof MOVE003_ORDINARY_DEADLINE_MILLISECONDS, enterLobbyDeadlineMilliseconds: MOVE003_ENTER_LOBBY_DEADLINE_MILLISECONDS as typeof MOVE003_ENTER_LOBBY_DEADLINE_MILLISECONDS, pollingIntervalMilliseconds: NAVIGATION_TRANSITION_POLL_MILLISECONDS as typeof NAVIGATION_TRANSITION_POLL_MILLISECONDS, retryCount: 0 as const };
  return { ...base, planFingerprint: compactNavigationFingerprint(base, "move003-refresh") };
}

function assertPrimaryDisplay(window: NavigationWindowState, layout: ReturnType<typeof buildGameScreenLayout>): void {
  const primary = window.primaryDisplay;
  const right = primary.left + primary.width, bottom = primary.top + primary.height;
  const bounds = window.clientBounds;
  if (bounds.left < primary.left || bounds.top < primary.top || bounds.left + bounds.width > right || bounds.top + bounds.height > bottom) throw new Error("MOVE-003 refresh requires the complete game client on the primary display.");
  const points = [layout.controls.startGame, layout.controls.stash, layout.controls.merchant, layout.controls.returnToCharacterSelection, layout.controls.enterLobby, ...layout.stash.tabCenters];
  if (!points.every(point => point.x >= primary.left && point.y >= primary.top && point.x < right && point.y < bottom)) throw new Error("MOVE-003 refresh planned point is outside the primary display.");
}
