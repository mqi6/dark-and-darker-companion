import type { CanonicalId, MarketCandidate } from "./models";

export interface RollRule {
  id: string;
  attributeId: CanonicalId;
  enabled: boolean;
  minimum?: number;
  maximum?: number;
}

export type RollEvaluationReason =
  | "matched"
  | "below-minimum"
  | "above-maximum"
  | "missing"
  | "naturally-impossible";

export interface RollEvaluation {
  ruleId: string;
  attributeId: CanonicalId;
  matched: boolean;
  reason: RollEvaluationReason;
  actualValue?: number;
}

export interface CandidateEvaluation {
  candidate: MarketCandidate;
  passed: boolean;
  matchCount: number;
  enabledRuleCount: number;
  evaluations: readonly RollEvaluation[];
}

export interface FilterSummary {
  matches: readonly CandidateEvaluation[];
  evaluatedCount: number;
  retrievedCount: number;
  reportedTotal?: number;
  incomplete: boolean;
}

export interface FilterOptions {
  requiredMatchCount: number;
  reportedTotal?: number;
  stoppedEarly?: boolean;
}

export function evaluateCandidate(
  candidate: MarketCandidate,
  rules: readonly RollRule[],
  requiredMatchCount: number
): CandidateEvaluation {
  const enabled = rules.filter((rule) => rule.enabled);
  validateRequiredCount(requiredMatchCount, enabled.length);

  const possible = candidate.item.possibleSecondaryAttributeIds
    ? new Set(candidate.item.possibleSecondaryAttributeIds)
    : undefined;

  const evaluations = enabled.map((rule): RollEvaluation => {
    const roll = candidate.item.rolls.find(
      (candidateRoll) => candidateRoll.attributeId === rule.attributeId
    );

    if (!roll) {
      return {
        ruleId: rule.id,
        attributeId: rule.attributeId,
        matched: false,
        reason:
          possible !== undefined && !possible.has(rule.attributeId)
            ? "naturally-impossible"
            : "missing"
      };
    }

    if (rule.minimum !== undefined && roll.value < rule.minimum) {
      return {
        ruleId: rule.id,
        attributeId: rule.attributeId,
        matched: false,
        reason: "below-minimum",
        actualValue: roll.value
      };
    }
    if (rule.maximum !== undefined && roll.value > rule.maximum) {
      return {
        ruleId: rule.id,
        attributeId: rule.attributeId,
        matched: false,
        reason: "above-maximum",
        actualValue: roll.value
      };
    }

    return {
      ruleId: rule.id,
      attributeId: rule.attributeId,
      matched: true,
      reason: "matched",
      actualValue: roll.value
    };
  });

  const matchCount = evaluations.filter((evaluation) => evaluation.matched).length;
  return {
    candidate,
    passed: matchCount >= requiredMatchCount,
    matchCount,
    enabledRuleCount: enabled.length,
    evaluations
  };
}

export function filterCandidates(
  candidates: readonly MarketCandidate[],
  rules: readonly RollRule[],
  options: FilterOptions
): FilterSummary {
  const deduplicated = new Map<string, MarketCandidate>();
  for (const candidate of candidates) {
    if (!deduplicated.has(candidate.listingId)) {
      deduplicated.set(candidate.listingId, candidate);
    }
  }

  const evaluated = [...deduplicated.values()].map((candidate) =>
    evaluateCandidate(candidate, rules, options.requiredMatchCount)
  );
  const reportedTotal = options.reportedTotal;
  const incomplete =
    options.stoppedEarly === true ||
    (reportedTotal !== undefined && reportedTotal > evaluated.length);

  return {
    matches: evaluated.filter((candidate) => candidate.passed),
    evaluatedCount: evaluated.length,
    retrievedCount: candidates.length,
    ...(reportedTotal === undefined ? {} : { reportedTotal }),
    incomplete
  };
}

function validateRequiredCount(required: number, enabledRuleCount: number): void {
  if (!Number.isInteger(required) || required < 1 || required > enabledRuleCount) {
    throw new RangeError("requiredMatchCount must be between 1 and enabled rule count.");
  }
}
