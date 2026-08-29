import type { ScreenPoint } from "../domain/stashScreenCalibration";
import type { GameScreenLayout } from "../domain/gameScreenLayout";

export type GameScreen = "unknown" | "character-selection" | "lobby" | "stash" | "merchant";

export interface NavigationObservation {
  screen: GameScreen;
  selectedCharacterSlotIndex?: number;
  selectedStashTabIndex?: number;
}

export type GameNavigationTarget =
  | { screen: "character-selection" }
  | { screen: "lobby" }
  | { screen: "merchant" }
  | { screen: "stash"; tabIndex?: number };

export type NavigationControl =
  | "start-game"
  | "return-to-character-selection"
  | "select-character"
  | "enter-lobby"
  | "open-stash"
  | "open-merchant"
  | "select-stash-tab";

export interface NavigationClickStep {
  id: string;
  kind: "click";
  control: NavigationControl;
  point: ScreenPoint;
  requiresScreen: Exclude<GameScreen, "unknown">;
  expectedScreen: Exclude<GameScreen, "unknown">;
  timeoutMilliseconds: number;
  expectedCharacterSlotIndex?: number;
  expectedStashTabIndex?: number;
}

export interface NavigationPlan {
  status: "ready";
  sourceScreen: Exclude<GameScreen, "unknown">;
  target: GameNavigationTarget;
  steps: readonly NavigationClickStep[];
}

export type NavigationPlanResult = NavigationPlan | {
  status: "blocked";
  diagnosticCode: "screen-unknown" | "character-slot-invalid" | "stash-tab-invalid";
};

export type NavigationMachineResult =
  | { status: "action-required"; action: NavigationClickStep }
  | { status: "complete" }
  | { status: "blocked"; diagnosticCode: string }
  | { status: "cancelled"; reason: string };

export function buildNavigationPlan(parameters: {
  from: GameScreen;
  target: GameNavigationTarget;
  layout: GameScreenLayout;
  characterSlotIndex?: number;
  transitionTimeoutMilliseconds?: number;
}): NavigationPlanResult {
  if (parameters.from === "unknown") {
    return { status: "blocked", diagnosticCode: "screen-unknown" };
  }
  const timeoutMilliseconds = boundedTimeout(parameters.transitionTimeoutMilliseconds ?? 10_000);
  const characterSlotIndex = parameters.characterSlotIndex ?? 0;
  if (!Number.isInteger(characterSlotIndex) || characterSlotIndex < 0 || characterSlotIndex >= 6) {
    return { status: "blocked", diagnosticCode: "character-slot-invalid" };
  }
  if (parameters.target.screen === "stash" && parameters.target.tabIndex !== undefined &&
      (!Number.isInteger(parameters.target.tabIndex) || parameters.target.tabIndex < 0 ||
        parameters.target.tabIndex >= parameters.layout.stash.tabCenters.length)) {
    return { status: "blocked", diagnosticCode: "stash-tab-invalid" };
  }

  const steps: NavigationClickStep[] = [];
  let current = parameters.from;
  const addStep = (
    control: NavigationControl,
    point: ScreenPoint,
    expectedScreen: Exclude<GameScreen, "unknown">,
    expectations: Pick<NavigationClickStep, "expectedCharacterSlotIndex" | "expectedStashTabIndex"> = {}
  ) => {
    steps.push({
      id: `navigation-${steps.length + 1}-${control}`,
      kind: "click",
      control,
      point: { ...point },
      requiresScreen: current,
      expectedScreen,
      timeoutMilliseconds,
      ...expectations
    });
    current = expectedScreen;
  };
  const enterLobbyFromCharacterSelection = () => {
    addStep(
      "select-character",
      parameters.layout.controls.characterSlots[characterSlotIndex]!,
      "character-selection",
      { expectedCharacterSlotIndex: characterSlotIndex }
    );
    addStep("enter-lobby", parameters.layout.controls.enterLobby, "lobby");
  };
  const normalizeToLobby = () => {
    if (current === "character-selection") {
      enterLobbyFromCharacterSelection();
    } else if (current === "stash" || current === "merchant") {
      addStep("start-game", parameters.layout.controls.startGame, "lobby");
    }
  };

  if (parameters.target.screen === "character-selection") {
    normalizeToLobby();
    if (current === "lobby") {
      addStep(
        "return-to-character-selection",
        parameters.layout.controls.returnToCharacterSelection,
        "character-selection"
      );
    }
  } else if (parameters.target.screen === "lobby") {
    normalizeToLobby();
  } else if (parameters.target.screen === "merchant") {
    normalizeToLobby();
    if (current === "lobby" || current === "stash") {
      addStep("open-merchant", parameters.layout.controls.merchant, "merchant");
    }
  } else {
    normalizeToLobby();
    if (current === "lobby" || current === "merchant") {
      addStep("open-stash", parameters.layout.controls.stash, "stash");
    }
    if (parameters.target.tabIndex !== undefined) {
      addStep(
        "select-stash-tab",
        parameters.layout.stash.tabCenters[parameters.target.tabIndex]!,
        "stash",
        { expectedStashTabIndex: parameters.target.tabIndex }
      );
    }
  }

  return {
    status: "ready",
    sourceScreen: parameters.from,
    target: { ...parameters.target },
    steps
  };
}

export class GameNavigationStateMachine {
  private cursor = 0;
  private pendingActionId: string | undefined;
  private terminal: NavigationMachineResult | undefined;

  constructor(private readonly plan: NavigationPlan) {}

  next(observation: NavigationObservation): NavigationMachineResult {
    if (this.terminal) return this.terminal;
    if (this.cursor >= this.plan.steps.length) {
      return this.finishIfTargetObserved(observation);
    }
    const action = this.plan.steps[this.cursor]!;
    if (observation.screen !== action.requiresScreen) {
      return this.block(`unexpected-screen-before-${action.control}`);
    }
    if (stepAlreadySatisfied(action, observation)) {
      this.cursor += 1;
      this.pendingActionId = undefined;
      return this.next(observation);
    }
    this.pendingActionId = action.id;
    return { status: "action-required", action };
  }

  confirm(actionId: string, observation: NavigationObservation): NavigationMachineResult {
    if (this.terminal) return this.terminal;
    const action = this.plan.steps[this.cursor];
    if (!action || this.pendingActionId !== actionId || action.id !== actionId) {
      return this.block("stale-or-unexpected-action-confirmation");
    }
    const verificationProblem = observationProblem(action, observation);
    if (verificationProblem) return this.block(verificationProblem);
    this.cursor += 1;
    this.pendingActionId = undefined;
    return this.next(observation);
  }

  timeout(actionId: string): NavigationMachineResult {
    if (this.terminal) return this.terminal;
    if (this.pendingActionId !== actionId) {
      return this.block("stale-or-unexpected-timeout");
    }
    return this.block(`navigation-timeout-${actionId}`);
  }

  cancel(reason = "operator-cancelled"): NavigationMachineResult {
    if (!this.terminal) this.terminal = { status: "cancelled", reason };
    return this.terminal;
  }

  private finishIfTargetObserved(observation: NavigationObservation): NavigationMachineResult {
    if (observation.screen !== this.plan.target.screen) {
      return this.block("target-screen-not-observed");
    }
    if (this.plan.target.screen === "stash" && this.plan.target.tabIndex !== undefined &&
        observation.selectedStashTabIndex !== this.plan.target.tabIndex) {
      return this.block("target-stash-tab-not-observed");
    }
    this.terminal = { status: "complete" };
    return this.terminal;
  }

  private block(diagnosticCode: string): NavigationMachineResult {
    this.terminal = { status: "blocked", diagnosticCode };
    return this.terminal;
  }
}

function stepAlreadySatisfied(
  action: NavigationClickStep,
  observation: NavigationObservation
): boolean {
  return action.requiresScreen === action.expectedScreen &&
    observationProblem(action, observation) === undefined;
}

function observationProblem(
  action: NavigationClickStep,
  observation: NavigationObservation
): string | undefined {
  if (observation.screen !== action.expectedScreen) {
    return `expected-screen-not-observed-${action.control}`;
  }
  if (action.expectedCharacterSlotIndex !== undefined &&
      observation.selectedCharacterSlotIndex !== action.expectedCharacterSlotIndex) {
    return "selected-character-not-observed";
  }
  if (action.expectedStashTabIndex !== undefined &&
      observation.selectedStashTabIndex !== action.expectedStashTabIndex) {
    return "selected-stash-tab-not-observed";
  }
  return undefined;
}

function boundedTimeout(value: number): number {
  if (!Number.isFinite(value) || value < 1000 || value > 60_000) {
    throw new RangeError("Navigation transition timeout must be between 1000 and 60000 milliseconds.");
  }
  return value;
}
