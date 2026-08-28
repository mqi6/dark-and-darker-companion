import { describe, expect, it } from "vitest";
import { correlateMove, type MoveEvidence } from "../src/domain/moveCorrelation";

const base: MoveEvidence = {
  intent: {
    alias: "item-001",
    source: { inventoryId: 20, slotId: 0 },
    destination: { inventoryId: 21, slotId: 12 },
    expectedQuantity: 1,
    expectedGameDesignItemId: "DesignDataItem:Id_Item_Test_1001"
  },
  matchingRequestCount: 1,
  acknowledgementCount: 1,
  requestAtMilliseconds: 200,
  beforeVersion: 1,
  beforeObservedAtMilliseconds: 100,
  afterVersion: 2,
  afterObservedAtMilliseconds: 300,
  beforeItems: [{ alias: "item-001", inventoryId: 20, slotId: 0, quantity: 1, gameDesignItemId: "DesignDataItem:Id_Item_Test_1001" }],
  afterItems: [{ alias: "item-001", inventoryId: 21, slotId: 12, quantity: 1, gameDesignItemId: "DesignDataItem:Id_Item_Test_1001" }]
};

describe("move correlation", () => {
  it("confirms only the same alias in a newer protocol post-state", () => {
    expect(correlateMove(base)).toMatchObject({ status: "confirmed", reason: "post-state-confirmed" });
  });

  it("keeps acknowledgements and visual changes insufficient on their own", () => {
    const { afterVersion: _version, afterItems: _items, afterObservedAtMilliseconds: _time, ...withoutPostState } = base;
    expect(correlateMove(withoutPostState)).toMatchObject({ status: "ambiguous", reason: "post-state-missing" });
  });

  it("requires a complete pre-state from before the exact move request", () => {
    expect(correlateMove({ ...base, beforeItems: [] })).toMatchObject({ status: "ambiguous", reason: "pre-state-missing" });
    expect(correlateMove({ ...base, beforeObservedAtMilliseconds: 200 })).toMatchObject({ status: "ambiguous", reason: "pre-state-not-before-request" });
  });

  it("rejects a candidate state captured before or at the move request", () => {
    expect(correlateMove({ ...base, afterObservedAtMilliseconds: 200 })).toMatchObject({ status: "ambiguous", reason: "post-state-not-after-request" });
    const { afterObservedAtMilliseconds: _time, ...withoutPostTime } = base;
    expect(correlateMove(withoutPostTime)).toMatchObject({ status: "ambiguous", reason: "post-state-not-after-request" });
  });

  it("rejects stale, wrong-destination, source-retained, and identity-mismatched post-states", () => {
    expect(correlateMove({ ...base, afterVersion: 1 })).toMatchObject({ status: "ambiguous", reason: "post-state-stale" });
    const moved = base.afterItems![0]!;
    expect(correlateMove({ ...base, afterItems: [{ ...moved, slotId: 13 }] })).toMatchObject({ status: "ambiguous", reason: "identity-transition-mismatch" });
    expect(correlateMove({ ...base, afterItems: [moved, { ...moved, inventoryId: 20, slotId: 0 }] })).toMatchObject({ status: "ambiguous", reason: "identity-transition-mismatch" });
    expect(correlateMove({ ...base, afterItems: [{ ...moved, gameDesignItemId: "wrong" }] })).toMatchObject({ status: "ambiguous", reason: "identity-transition-mismatch" });
  });

  it("fails explicit errors and treats duplicate or conflicting evidence as ambiguous", () => {
    expect(correlateMove({ ...base, explicitFailure: "server rejected" })).toMatchObject({ status: "failed" });
    expect(correlateMove({ ...base, matchingRequestCount: 2 })).toMatchObject({ status: "ambiguous", reason: "request-count-mismatch" });
    expect(correlateMove({ ...base, afterItems: [{ alias: "item-001", inventoryId: 20, slotId: 0 }] })).toMatchObject({ status: "ambiguous", reason: "identity-transition-mismatch" });
    expect(correlateMove({ ...base, afterItems: [{ ...base.afterItems![0]!, quantity: 2 }] })).toMatchObject({ status: "ambiguous", reason: "identity-transition-mismatch" });
  });
});
