export const DEFAULT_RECENT_WINDOW_COUNT = 5;
export const DEFAULT_LOWEST_DEAL_COUNT = 3;

export interface RecentSaleSample {
  listingId: string;
  unitPrice: number;
  closedAt: string;
  confirmation: "confirmed" | "inferred-disappearance";
}

export interface RecentAveragePolicy {
  recentWindowCount: number;
  lowestDealCount: number;
  minimumUsableSamples: number;
}

export type RecentAverageResult =
  | {
      status: "available";
      unitReference: number;
      samplesUsed: number;
      dealsConsidered: number;
      recentWindowRequested: number;
      lowestDealsRequested: number;
      oldestSampleAt: string;
      newestSampleAt: string;
      includesInferredSamples: boolean;
    }
  | {
      status: "unknown";
      reason: "no-usable-samples" | "below-minimum-samples";
      samplesUsed: number;
      dealsConsidered: number;
      recentWindowRequested: number;
      lowestDealsRequested: number;
    };

export type PriceAdjustment =
  | { kind: "none" }
  | { kind: "percentage"; direction: "above" | "below"; value: number }
  | { kind: "fixed"; direction: "above" | "below"; value: number };

export interface PriceCalculationInput {
  quantity: number;
  unitReference?: number;
  manualFinalPrice?: number;
  adjustment: PriceAdjustment;
}

export type PriceCalculationResult =
  | {
      status: "ready";
      source: "manual-final" | "calculated";
      quantity: number;
      wholeStackReference?: number;
      finalPrice: number;
    }
  | {
      status: "needs-price";
      alertKey: "auction.priceUnknown";
      reason: "reference-unavailable";
    };

export function roundGoldHalfUp(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("Gold value must be a finite non-negative number.");
  }

  return Math.floor(value + 0.5 + Number.EPSILON);
}

export function averageRecentSales(
  samples: readonly RecentSaleSample[],
  policy: RecentAveragePolicy = {
    recentWindowCount: DEFAULT_RECENT_WINDOW_COUNT,
    lowestDealCount: DEFAULT_LOWEST_DEAL_COUNT,
    minimumUsableSamples: 1
  }
): RecentAverageResult {
  if (!Number.isInteger(policy.recentWindowCount) || policy.recentWindowCount < 1) {
    throw new RangeError("recentWindowCount must be a positive integer.");
  }
  if (
    !Number.isInteger(policy.lowestDealCount) ||
    policy.lowestDealCount < 1 ||
    policy.lowestDealCount > policy.recentWindowCount
  ) {
    throw new RangeError("lowestDealCount must be between 1 and recentWindowCount.");
  }
  if (
    !Number.isInteger(policy.minimumUsableSamples) ||
    policy.minimumUsableSamples < 1 ||
    policy.minimumUsableSamples > policy.lowestDealCount
  ) {
    throw new RangeError("minimumUsableSamples must be between 1 and lowestDealCount.");
  }

  const recentWindow = samples
    .filter((sample) => Number.isFinite(sample.unitPrice) && sample.unitPrice > 0)
    .filter((sample) => !Number.isNaN(Date.parse(sample.closedAt)))
    .sort((left, right) => Date.parse(right.closedAt) - Date.parse(left.closedAt))
    .slice(0, policy.recentWindowCount);

  if (recentWindow.length === 0) {
    return {
      status: "unknown",
      reason: "no-usable-samples",
      samplesUsed: 0,
      dealsConsidered: 0,
      recentWindowRequested: policy.recentWindowCount,
      lowestDealsRequested: policy.lowestDealCount
    };
  }

  if (recentWindow.length < policy.minimumUsableSamples) {
    return {
      status: "unknown",
      reason: "below-minimum-samples",
      samplesUsed: recentWindow.length,
      dealsConsidered: recentWindow.length,
      recentWindowRequested: policy.recentWindowCount,
      lowestDealsRequested: policy.lowestDealCount
    };
  }

  const selected = [...recentWindow]
    .sort(
      (left, right) =>
        left.unitPrice - right.unitPrice ||
        Date.parse(right.closedAt) - Date.parse(left.closedAt) ||
        left.listingId.localeCompare(right.listingId)
    )
    .slice(0, policy.lowestDealCount);
  const total = selected.reduce((sum, sample) => sum + sample.unitPrice, 0);
  const selectedByTime = [...selected].sort(
    (left, right) => Date.parse(right.closedAt) - Date.parse(left.closedAt)
  );
  const newest = selectedByTime[0];
  const oldest = selectedByTime[selectedByTime.length - 1];
  if (!newest || !oldest) {
    throw new Error("Usable sample calculation produced an impossible empty result.");
  }

  return {
    status: "available",
    unitReference: total / selected.length,
    samplesUsed: selected.length,
    dealsConsidered: recentWindow.length,
    recentWindowRequested: policy.recentWindowCount,
    lowestDealsRequested: policy.lowestDealCount,
    newestSampleAt: newest.closedAt,
    oldestSampleAt: oldest.closedAt,
    includesInferredSamples: selected.some(
      (sample) => sample.confirmation === "inferred-disappearance"
    )
  };
}

export function calculateListingPrice(input: PriceCalculationInput): PriceCalculationResult {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new RangeError("quantity must be a positive integer.");
  }

  if (input.manualFinalPrice !== undefined) {
    if (!Number.isFinite(input.manualFinalPrice) || input.manualFinalPrice <= 0) {
      throw new RangeError("manualFinalPrice must be positive.");
    }
    return {
      status: "ready",
      source: "manual-final",
      quantity: input.quantity,
      finalPrice: roundGoldHalfUp(input.manualFinalPrice)
    };
  }

  if (input.unitReference === undefined) {
    return {
      status: "needs-price",
      alertKey: "auction.priceUnknown",
      reason: "reference-unavailable"
    };
  }
  if (!Number.isFinite(input.unitReference) || input.unitReference <= 0) {
    throw new RangeError("unitReference must be positive when provided.");
  }

  const wholeStackReference = input.unitReference * input.quantity;
  let adjusted = wholeStackReference;

  if (input.adjustment.kind === "percentage") {
    validateAdjustmentValue(input.adjustment.value);
    const factor = input.adjustment.value / 100;
    adjusted =
      input.adjustment.direction === "above"
        ? wholeStackReference * (1 + factor)
        : wholeStackReference * (1 - factor);
  } else if (input.adjustment.kind === "fixed") {
    validateAdjustmentValue(input.adjustment.value);
    adjusted =
      input.adjustment.direction === "above"
        ? wholeStackReference + input.adjustment.value
        : wholeStackReference - input.adjustment.value;
  }

  if (adjusted <= 0) {
    throw new RangeError("Adjusted price must remain positive; minimum-price policy is unresolved.");
  }

  return {
    status: "ready",
    source: "calculated",
    quantity: input.quantity,
    wholeStackReference,
    finalPrice: roundGoldHalfUp(adjusted)
  };
}

function validateAdjustmentValue(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("Adjustment value must be finite and non-negative.");
  }
}
