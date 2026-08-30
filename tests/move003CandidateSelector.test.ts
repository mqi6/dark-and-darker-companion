import { describe, expect, it } from "vitest";
import { selectMove003Candidate } from "../src/domain/move003CandidateSelector";
import type { SpatialProjection } from "../src/domain/inventoryGeometry";
import type { StashSortEligibility } from "../src/domain/stashSortEligibility";
import { createStashTabMapping } from "../src/domain/stashTabMapping";

const projection: SpatialProjection = { sourceSnapshotHash: "hash", sourceVersion: 2, ready: true, containers: [{ inventoryId: 4, status: "ready", geometry: { kind: "rectangular", columns: 12, rows: 20 }, diagnostics: [], placements: [{ alias: "item-001", inventoryId: 4, slotId: 0, x: 0, y: 0, width: 1, height: 1, stackQuantity: 1, metadata: {} as never }] }] };
const mapping = createStashTabMapping({ runtimeProfileKey: "profile", gameBuildFingerprint: "build", availableInventoryIds: [4], entries: [{ tabIndex: 0, inventoryId: 4 }] });
const eligibility = { eligibleInventoryIds: [4], pages: [{ inventoryId: 4, status: "eligible", enabledByUser: true, unsupportedItemCount: 0, diagnosticCodes: [] }], disabledInventoryIds: [], blockedInventoryIds: [], totalUnsupportedItemCount: 0, unsupportedItemCount: 0, requiresExceptionSelection: false, requiresManualRelocation: false } as StashSortEligibility;
describe("MOVE-003 candidate selector", () => {
  it("chooses one deterministic same-tab unstacked 1x1 move", () => expect(selectMove003Candidate({ projection, eligibility, mapping })).toMatchObject({ itemAlias: "item-001", inventoryId: 4, tabIndex: 0, source: { x: 0, y: 0 }, destination: { x: 1, y: 0 }, quantity: 1, footprint: { width: 1, height: 1 } }));
  it("respects disabled pages and reserved cells", () => {
    expect(selectMove003Candidate({ projection, eligibility: { ...eligibility, eligibleInventoryIds: [] }, mapping })).toBeUndefined();
    expect(selectMove003Candidate({ projection, eligibility, mapping, reservedByInventory: new Map([[4, [{ x: 0, y: 0, width: 12, height: 20 }]]]) })).toBeUndefined();
  });
});
