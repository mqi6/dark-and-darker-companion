import { describe, expect, it } from "vitest";
import type { SpatialContainer, SpatialDiagnostic, SpatialProjection } from "../src/domain/inventoryGeometry";
import { evaluateStashSortEligibility } from "../src/domain/stashSortEligibility";

function diagnostic(code: SpatialDiagnostic["code"], inventoryId: number, alias?: string): SpatialDiagnostic {
  return {
    code,
    inventoryId,
    ...(alias === undefined ? {} : { alias }),
    message: code
  };
}

function container(
  inventoryId: number,
  diagnostics: readonly SpatialDiagnostic[] = [],
  kind: "rectangular" | "equipment" = "rectangular"
): SpatialContainer {
  return {
    inventoryId,
    status: kind === "equipment" ? "not-applicable" : diagnostics.length === 0 ? "ready" : "blocked",
    geometry: kind === "equipment"
      ? { kind: "equipment" }
      : { kind: "rectangular", columns: 12, rows: 20 },
    placements: [],
    diagnostics
  };
}

function projection(containers: readonly SpatialContainer[]): SpatialProjection {
  return {
    sourceSnapshotHash: "snapshot",
    sourceVersion: 1,
    containers,
    ready: containers.every((value) => value.status !== "blocked")
  };
}

describe("stash sort eligibility", () => {
  it("keeps verified pages eligible while unsupported-item pages require a manual move", () => {
    const result = evaluateStashSortEligibility(projection([
      container(4),
      container(5, [
        diagnostic("item-metadata-missing", 5, "item-001"),
        diagnostic("item-metadata-missing", 5, "item-002")
      ]),
      container(6),
      container(7, [diagnostic("item-id-unmapped", 7, "item-003")])
    ]));

    expect(result).toMatchObject({
      eligibleInventoryIds: [4, 6],
      blockedInventoryIds: [5, 7],
      unsupportedItemCount: 3,
      requiresManualRelocation: true
    });
    expect(result.pages.map((page) => [page.inventoryId, page.status])).toEqual([
      [4, "eligible"],
      [5, "manual-relocation-required"],
      [6, "eligible"],
      [7, "manual-relocation-required"]
    ]);
  });

  it("always excludes the configured exception page and clears relocation after unsupported items reach it", () => {
    const result = evaluateStashSortEligibility(projection([
      container(4),
      container(5),
      container(30, [diagnostic("item-metadata-missing", 30, "item-001")])
    ]), 30);

    expect(result).toMatchObject({
      exceptionInventoryId: 30,
      eligibleInventoryIds: [4, 5],
      blockedInventoryIds: [],
      unsupportedItemCount: 0,
      requiresManualRelocation: false
    });
    expect(result.pages[2]).toMatchObject({ status: "exception", unsupportedItemCount: 1 });
  });

  it("does not downgrade overlap or geometry failures to manual relocation", () => {
    const result = evaluateStashSortEligibility(projection([
      container(4, [
        diagnostic("item-metadata-missing", 4, "item-001"),
        diagnostic("item-overlap", 4, "item-002")
      ])
    ]), 4);

    expect(result.pages[0]).toMatchObject({ status: "exception" });
    const withoutException = evaluateStashSortEligibility(projection([
      container(4, [diagnostic("item-overlap", 4, "item-002")])
    ]));
    expect(withoutException.pages[0]).toMatchObject({ status: "blocked" });
  });

  it("rejects an exception target that is absent or non-rectangular", () => {
    const state = projection([container(3, [], "equipment"), container(4)]);
    expect(evaluateStashSortEligibility(state, 99).configurationError).toBe("exception-page-not-found");
    expect(evaluateStashSortEligibility(state, 3).configurationError).toBe("exception-page-not-rectangular");
    expect(evaluateStashSortEligibility(state, 99).eligibleInventoryIds).toEqual([4]);
  });
});
