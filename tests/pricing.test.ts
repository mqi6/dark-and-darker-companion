import { describe, expect, it } from "vitest";
import {
  averageRecentSales,
  calculateListingPrice,
  roundGoldHalfUp,
  type RecentSaleSample
} from "../src/domain/pricing";

const samples: RecentSaleSample[] = [
  { listingId: "old", unitPrice: 90, closedAt: "2026-08-20T00:00:00Z", confirmation: "confirmed" },
  { listingId: "new", unitPrice: 110, closedAt: "2026-08-22T00:00:00Z", confirmation: "inferred-disappearance" },
  { listingId: "middle", unitPrice: 100, closedAt: "2026-08-21T00:00:00Z", confirmation: "confirmed" }
];

describe("averageRecentSales", () => {
  it("uses only the latest K usable samples", () => {
    const result = averageRecentSales(samples, { requestedSampleCount: 2, minimumUsableSamples: 1 });
    expect(result).toMatchObject({
      status: "available",
      unitReference: 105,
      samplesUsed: 2,
      samplesRequested: 2,
      includesInferredSamples: true
    });
  });

  it("returns unknown when no usable price exists", () => {
    expect(averageRecentSales([], { requestedSampleCount: 5, minimumUsableSamples: 1 })).toEqual({
      status: "unknown",
      reason: "no-usable-samples",
      samplesUsed: 0,
      samplesRequested: 5
    });
  });
});

describe("calculateListingPrice", () => {
  it("multiplies the unit reference by quantity before percentage adjustment", () => {
    expect(
      calculateListingPrice({
        unitReference: 120,
        quantity: 3,
        adjustment: { kind: "percentage", direction: "below", value: 5 }
      })
    ).toEqual({
      status: "ready",
      source: "calculated",
      quantity: 3,
      wholeStackReference: 360,
      finalPrice: 342
    });
  });

  it("does not silently fall back when the reference is missing", () => {
    expect(calculateListingPrice({ quantity: 1, adjustment: { kind: "none" } })).toEqual({
      status: "needs-price",
      alertKey: "auction.priceUnknown",
      reason: "reference-unavailable"
    });
  });

  it("rounds an exact half upward", () => {
    expect(roundGoldHalfUp(10.5)).toBe(11);
    expect(roundGoldHalfUp(10.49)).toBe(10);
  });
});
