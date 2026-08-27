export const DEFAULT_RECENT_SAMPLE_COUNT = 5;

export interface RecentSaleSample {
  listingId: string;
  unitPrice: number;
  closedAt: string;
  confirmation: "confirmed" | "inferred-disappearance";
}

export interface RecentAveragePolicy {
  requestedSampleCount: number;
  minimumUsableSamples: number;
}

export type RecentAverageResult =
  | {
      status: "available";
      unitReference: number;
      samplesUsed: number;
      samplesRequested: number;
      oldestSampleAt: string;
      newestSampleAt: string;
      includesInferredSamples: boolean;
    }
  | {
      status: "unknown";
      reason: "no-usable-samples" | "below-minimum-samples";
      samplesUsed: number;
      samplesRequested: number;
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
    requestedSampleCount: DEFAULT_RECENT_SAMPLE_COUNT,
    minimumUsableSamples: 1
  }
): RecentAverageResult {
  if (!Number.isInteger(policy.requestedSampleCount) || policy.requestedSampleCount < 1) {
    throw new RangeError("requestedSampleCount must be a positive integer.");
  }
  if (
    !Number.isInteger(policy.minimumUsableSamples) ||
    policy.minimumUsableSamples < 1 ||
    policy.minimumUsableSamples > policy.requestedSampleCount
  ) {
    throw new RangeError("minimumUsableSamples must be between 1 and requestedSampleCount.");
  }

  const usable = samples
    .filter((sample) => Number.isFinite(sample.unitPrice) && sample.unitPrice > 0)
    .filter((sample) => !Number.isNaN(Date.parse(sample.closedAt)))
    .sort((left, right) => Date.parse(right.closedAt) - Date.parse(left.closedAt))
    .slice(0, policy.requestedSampleCount);

  if (usable.length === 0) {
    return {
      status: "unknown",
      reason: "no-usable-samples",
      samplesUsed: 0,
      samplesRequested: policy.requestedSampleCount
    };
  }

  if (usable.length < policy.minimumUsableSamples) {
    return {
      status: "unknown",
      reason: "below-minimum-samples",
      samplesUsed: usable.length,
      samplesRequested: policy.requestedSampleCount
    };
  }

  const total = usable.reduce((sum, sample) => sum + sample.unitPrice, 0);
  const newest = usable[0];
  const oldest = usable[usable.length - 1];
  if (!newest || !oldest) {
    throw new Error("Usable sample calculation produced an impossible empty result.");
  }

  return {
    status: "available",
    unitReference: total / usable.length,
    samplesUsed: usable.length,
    samplesRequested: policy.requestedSampleCount,
    newestSampleAt: newest.closedAt,
    oldestSampleAt: oldest.closedAt,
    includesInferredSamples: usable.some(
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
