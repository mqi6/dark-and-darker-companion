import type { GameScreen, NavigationObservation } from "./gameNavigationMachine";

export const NAVIGATION_FEATURE_VERSION = 2 as const;

export interface NavigationScreenTemplate {
  screen: Exclude<GameScreen, "unknown">;
  featureVersion: typeof NAVIGATION_FEATURE_VERSION;
  feature: readonly number[];
  selectedCharacterSlotIndex?: number;
  selectedStashTabIndex?: number;
}

export type NavigationScreenClassification =
  | { status: "classified"; observation: NavigationObservation; meanDifference: number }
  | { status: "unknown" }
  | { status: "ambiguous" };

export function classifyNavigationFeature(
  feature: readonly number[],
  templates: readonly NavigationScreenTemplate[],
  options: { maximumMeanDifference?: number; ambiguityMargin?: number } = {}
): NavigationScreenClassification {
  const maximumMeanDifference = options.maximumMeanDifference ?? 32;
  const ambiguityMargin = options.ambiguityMargin ?? 4;
  if (feature.length === 0 || templates.length === 0) return { status: "unknown" };
  if (!Number.isFinite(maximumMeanDifference) || maximumMeanDifference <= 0 ||
      !Number.isFinite(ambiguityMargin) || ambiguityMargin < 0) {
    throw new RangeError("Classifier thresholds must be finite and non-negative.");
  }

  const bestByScreen = new Map<NavigationScreenTemplate["screen"], {
    template: NavigationScreenTemplate;
    score: number;
  }>();
  for (const template of templates) {
    if (template.featureVersion !== NAVIGATION_FEATURE_VERSION) continue;
    const score = meanDifference(feature, template.feature);
    const current = bestByScreen.get(template.screen);
    if (!current || score < current.score) {
      bestByScreen.set(template.screen, { template, score });
    }
  }
  const scored = [...bestByScreen.values()].sort((left, right) => left.score - right.score);
  const best = scored[0];
  if (!best || best.score > maximumMeanDifference) return { status: "unknown" };
  const runnerUp = scored[1];
  if (runnerUp && runnerUp.score - best.score < ambiguityMargin) return { status: "ambiguous" };

  const template = best.template;
  return {
    status: "classified",
    observation: {
      screen: template.screen,
      ...(template.selectedCharacterSlotIndex === undefined
        ? {}
        : { selectedCharacterSlotIndex: template.selectedCharacterSlotIndex }),
      ...(template.selectedStashTabIndex === undefined
        ? {}
        : { selectedStashTabIndex: template.selectedStashTabIndex })
    },
    meanDifference: best.score
  };
}

function meanDifference(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length === 0) return Infinity;
  return left.reduce((sum, value, index) => sum + Math.abs(value - right[index]!), 0) /
    left.length;
}
