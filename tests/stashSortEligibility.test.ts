import { describe, expect, it } from "vitest";
import type { SpatialContainer, SpatialDiagnostic, SpatialProjection } from "../src/domain/inventoryGeometry";
import { evaluateStashSortEligibility } from "../src/domain/stashSortEligibility";

function diagnostic(code: SpatialDiagnostic["code"], inventoryId: number, alias?: string): SpatialDiagnostic {
  return { code, inventoryId, ...(alias === undefined ? {} : { alias }), message: code };
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
  it("defaults verified tabs on and independently excludes user-disabled tabs", () => {
    const result = evaluateStashSortEligibility(
      projection([container(4), container(5), container(6)]),
      { disabledInventoryIds: [5] }
    );
    expect(result).toMatchObject({
      eligibleInventoryIds: [4, 6],
      disabledInventoryIds: [5],
      totalUnsupportedItemCount: 0,
      requiresExceptionSelection: false
    });
    expect(result.pages.map((page) => [page.inventoryId, page.status])).toEqual([
      [4, "eligible"],
      [5, "disabled"],
      [6, "eligible"]
    ]);
  });

  it("requests an exception page only after unsupported items are encountered", () => {
    const unsupported = projection([
      container(4),
      container(5, [diagnostic("item-metadata-missing", 5, "item-001")])
    ]);
    const result = evaluateStashSortEligibility(unsupported);
    expect(result).toMatchObject({
      eligibleInventoryIds: [4],
      blockedInventoryIds: [5],
      totalUnsupportedItemCount: 1,
      unsupportedItemCount: 1,
      requiresExceptionSelection: true,
      requiresManualRelocation: true
    });
    expect(result).not.toHaveProperty("exceptionInventoryId");

    const noUnsupported = evaluateStashSortEligibility(
      projection([container(4), container(5)]),
      { exceptionInventoryId: 5 }
    );
    expect(noUnsupported.pages.map((page) => page.status)).toEqual(["eligible", "eligible"]);
    expect(noUnsupported).not.toHaveProperty("exceptionInventoryId");
    expect(noUnsupported).not.toHaveProperty("configurationError");
  });

  it("forces an on-demand exception page off without overwriting its user toggle", () => {
    const result = evaluateStashSortEligibility(projection([
      container(4, [diagnostic("item-metadata-missing", 4, "item-001")]),
      container(5),
      container(30)
    ]), { exceptionInventoryId: 30 });

    expect(result).toMatchObject({
      exceptionInventoryId: 30,
      eligibleInventoryIds: [5],
      blockedInventoryIds: [4],
      totalUnsupportedItemCount: 1,
      unsupportedItemCount: 1,
      requiresExceptionSelection: false,
      requiresManualRelocation: true
    });
    expect(result.pages[2]).toMatchObject({ status: "exception", enabledByUser: true });
  });

  it("clears relocation once all unsupported items are on the exception page", () => {
    const result = evaluateStashSortEligibility(projection([
      container(4),
      container(30, [diagnostic("item-metadata-missing", 30, "item-001")])
    ]), { exceptionInventoryId: 30 });
    expect(result).toMatchObject({
      eligibleInventoryIds: [4],
      blockedInventoryIds: [],
      totalUnsupportedItemCount: 1,
      unsupportedItemCount: 0,
      requiresExceptionSelection: false,
      requiresManualRelocation: false
    });
    expect(result.pages[1]).toMatchObject({ status: "exception" });
  });

  it("does not downgrade mixed spatial failures and validates an active exception target", () => {
    const state = projection([
      container(3, [], "equipment"),
      container(4, [
        diagnostic("item-metadata-missing", 4, "item-001"),
        diagnostic("item-overlap", 4, "item-002")
      ])
    ]);
    expect(evaluateStashSortEligibility(state).pages[1]).toMatchObject({ status: "blocked" });
    expect(evaluateStashSortEligibility(state, { exceptionInventoryId: 99 }).configurationError)
      .toBe("exception-page-not-found");
    expect(evaluateStashSortEligibility(state, { exceptionInventoryId: 3 }).configurationError)
      .toBe("exception-page-not-rectangular");
  });

  it("does not request a stash exception for non-rectangular inventories", () => {
    const equipment = container(3, [], "equipment");
    const state = projection([{
      ...equipment,
      diagnostics: [diagnostic("item-metadata-missing", 3, "item-001")]
    }]);
    expect(evaluateStashSortEligibility(state)).toMatchObject({
      totalUnsupportedItemCount: 0,
      requiresExceptionSelection: false
    });
  });
});
