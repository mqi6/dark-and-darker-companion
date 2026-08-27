import { describe, expect, it } from "vitest";
import {
  averageRecentSales,
  calculateListingPrice,
  roundGoldHalfUp,
  type RecentSaleSample
} from "../src/domain/pricing";

const samples: RecentSaleSample[] = [
  { listingId: "outside-window", unitPrice: 1, closedAt: "2026-08-17T00:00:00Z", confirmation: "confirmed" },
  { listingId: "one", unitPrice: 100, closedAt: "2026-08-18T00:00:00Z", confirmation: "confirmed" },
  { listingId: "two", unitPrice: 120, closedAt: "2026-08-19T00:00:00Z", confirmation: "confirmed" },
  { listingId: "three", unitPrice: 90, closedAt: "2026-08-20T00:00:00Z", confirmation: "confirmed" },
  { listingId: "outlier", unitPrice: 5000, closedAt: "2026-08-21T00:00:00Z", confirmation: "confirmed" },
  { listingId: "five", unitPrice: 110, closedAt: "2026-08-22T00:00:00Z", confirmation: "inferred-disappearance" }
];

describe("averageRecentSales", () => {
  it("averages the three lowest prices within the latest five usable deals", () => {
    const result = averageRecentSales(samples, {
      recentWindowCount: 5,
      lowestDealCount: 3,
      minimumUsableSamples: 1
    });
    expect(result).toMatchObject({
      status: "available",
      unitReference: 100,
      samplesUsed: 3,
      dealsConsidered: 5,
      recentWindowRequested: 5,
      lowestDealsRequested: 3,
      includesInferredSamples: true
    });
  });

  it("uses all available recent deals when fewer than three exist", () => {
    expect(
      averageRecentSales(samples.slice(-2), {
        recentWindowCount: 5,
        lowestDealCount: 3,
        minimumUsableSamples: 1
      })
    ).toMatchObject({
      status: "available",
      unitReference: 2555,
      samplesUsed: 2,
      dealsConsidered: 2
    });
  });

  it("returns unknown when no usable price exists", () => {
    expect(averageRecentSales([], {
      recentWindowCount: 5,
      lowestDealCount: 3,
      minimumUsableSamples: 1
    })).toEqual({
      status: "unknown",
      reason: "no-usable-samples",
      samplesUsed: 0,
      dealsConsidered: 0,
      recentWindowRequested: 5,
      lowestDealsRequested: 3
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
