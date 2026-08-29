import type { SpatialDiagnostic, SpatialProjection } from "./inventoryGeometry";

const unsupportedItemCodes = new Set<SpatialDiagnostic["code"]>([
  "item-id-unmapped",
  "item-metadata-missing"
]);

export type StashPageSortStatus =
  | "eligible"
  | "exception"
  | "manual-relocation-required"
  | "blocked"
  | "not-applicable";

export interface StashPageSortEligibility {
  inventoryId: number;
  status: StashPageSortStatus;
  unsupportedItemCount: number;
  diagnosticCodes: readonly SpatialDiagnostic["code"][];
}

export interface StashSortEligibility {
  pages: readonly StashPageSortEligibility[];
  eligibleInventoryIds: readonly number[];
  blockedInventoryIds: readonly number[];
  unsupportedItemCount: number;
  requiresManualRelocation: boolean;
  exceptionInventoryId?: number;
  configurationError?: "exception-page-not-found" | "exception-page-not-rectangular";
}

/**
 * Converts strict spatial validation into page-scoped sort eligibility.
 *
 * Unsupported item metadata never receives a guessed footprint. A page that
 * contains such an item is excluded until the user moves the item manually.
 * Other independently validated pages remain eligible. A configured exception
 * page is always excluded from sorting, even after it becomes spatially valid.
 */
export function evaluateStashSortEligibility(
  projection: SpatialProjection,
  exceptionInventoryId?: number
): StashSortEligibility {
  const exceptionContainer = exceptionInventoryId === undefined
    ? undefined
    : projection.containers.find((container) => container.inventoryId === exceptionInventoryId);
  const configurationError = exceptionInventoryId === undefined
    ? undefined
    : !exceptionContainer
      ? "exception-page-not-found" as const
      : exceptionContainer.geometry.kind !== "rectangular"
        ? "exception-page-not-rectangular" as const
        : undefined;

  const validExceptionInventoryId = configurationError === undefined
    ? exceptionInventoryId
    : undefined;

  const pages = projection.containers.map((container): StashPageSortEligibility => {
    const diagnosticCodes = container.diagnostics.map((diagnostic) => diagnostic.code);
    const unsupportedItemCount = diagnosticCodes.filter((code) => unsupportedItemCodes.has(code)).length;

    if (container.status === "not-applicable") {
      return {
        inventoryId: container.inventoryId,
        status: "not-applicable",
        unsupportedItemCount,
        diagnosticCodes
      };
    }

    if (container.inventoryId === validExceptionInventoryId) {
      return {
        inventoryId: container.inventoryId,
        status: "exception",
        unsupportedItemCount,
        diagnosticCodes
      };
    }

    if (container.status === "ready" && container.geometry.kind === "rectangular") {
      return {
        inventoryId: container.inventoryId,
        status: "eligible",
        unsupportedItemCount,
        diagnosticCodes
      };
    }

    const onlyUnsupportedItems = diagnosticCodes.length > 0 &&
      diagnosticCodes.every((code) => unsupportedItemCodes.has(code));
    return {
      inventoryId: container.inventoryId,
      status: onlyUnsupportedItems ? "manual-relocation-required" : "blocked",
      unsupportedItemCount,
      diagnosticCodes
    };
  });

  const manualPages = pages.filter((page) => page.status === "manual-relocation-required");
  return {
    pages,
    eligibleInventoryIds: pages
      .filter((page) => page.status === "eligible")
      .map((page) => page.inventoryId),
    blockedInventoryIds: pages
      .filter((page) => page.status === "blocked" || page.status === "manual-relocation-required")
      .map((page) => page.inventoryId),
    unsupportedItemCount: manualPages.reduce((total, page) => total + page.unsupportedItemCount, 0),
    requiresManualRelocation: manualPages.length > 0,
    ...(validExceptionInventoryId === undefined ? {} : { exceptionInventoryId: validExceptionInventoryId }),
    ...(configurationError === undefined ? {} : { configurationError })
  };
}
