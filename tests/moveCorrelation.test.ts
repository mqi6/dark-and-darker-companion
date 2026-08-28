import { describe, expect, it } from "vitest";
import { correlateMove, type MoveEvidence } from "../src/domain/moveCorrelation";

const base: MoveEvidence = {
  intent: {
    alias: "item-001",
    source: { inventoryId: 20, slotId: 0 },
    destination: { inventoryId: 21, slotId: 12 }
  },
  matchingRequestCount: 1,
  acknowledgementCount: 1,
  beforeVersion: 1,
  afterVersion: 2,
  beforeItems: [{ alias: "item-001", inventoryId: 20, slotId: 0 }],
  afterItems: [{ alias: "item-001", inventoryId: 21, slotId: 12 }]
};

describe("move correlation", () => {
  it("confirms only the same alias in a newer protocol post-state", () => {
    expect(correlateMove(base)).toMatchObject({ status: "confirmed", reason: "post-state-confirmed" });
  });

  it("keeps acknowledgements and visual changes insufficient on their own", () => {
    const { afterVersion: _version, afterItems: _items, ...withoutPostState } = base;
    expect(correlateMove(withoutPostState)).toMatchObject({ status: "ambiguous", reason: "post-state-missing" });
  });

  it("fails explicit errors and treats duplicate or conflicting evidence as ambiguous", () => {
    expect(correlateMove({ ...base, explicitFailure: "server rejected" })).toMatchObject({ status: "failed" });
    expect(correlateMove({ ...base, matchingRequestCount: 2 })).toMatchObject({ status: "ambiguous", reason: "request-count-mismatch" });
    expect(correlateMove({ ...base, afterItems: [{ alias: "item-001", inventoryId: 20, slotId: 0 }] })).toMatchObject({ status: "ambiguous", reason: "identity-transition-mismatch" });
  });
});
