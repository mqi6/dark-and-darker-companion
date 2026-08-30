import type { SpatialDiagnostic, SpatialProjection } from "./inventoryGeometry";

const unsupportedItemCodes = new Set<SpatialDiagnostic["code"]>([
  "item-id-unmapped",
  "item-metadata-missing"
]);

export type StashPageSortStatus =
  | "eligible"
  | "disabled"
  | "exception"
  | "manual-relocation-required"
  | "blocked"
  | "not-applicable";

export interface StashSortOptions {
  disabledInventoryIds?: readonly number[];
  exceptionInventoryId?: number;
}

export interface StashPageSortEligibility {
  inventoryId: number;
  status: StashPageSortStatus;
  enabledByUser: boolean;
  unsupportedItemCount: number;
  diagnosticCodes: readonly SpatialDiagnostic["code"][];
}

export interface StashSortEligibility {
  pages: readonly StashPageSortEligibility[];
  eligibleInventoryIds: readonly number[];
  disabledInventoryIds: readonly number[];
  blockedInventoryIds: readonly number[];
  totalUnsupportedItemCount: number;
  unsupportedItemCount: number;
  requiresExceptionSelection: boolean;
  requiresManualRelocation: boolean;
  exceptionInventoryId?: number;
  configurationError?: "exception-page-not-found" | "exception-page-not-rectangular";
}

/**
 * Converts strict spatial validation into page-scoped sort eligibility.
 *
 * All rectangular pages default to enabled. User-disabled pages are excluded
 * independently. An exception page is activated only while unsupported items
 * exist, and is forced out of sorting without changing the user's tab toggle.
 * Unknown footprints are never guessed and their source pages remain blocked.
 */
export function evaluateStashSortEligibility(
  projection: SpatialProjection,
  options: StashSortOptions = {}
): StashSortEligibility {
  const disabledInventoryIds = new Set(options.disabledInventoryIds ?? []);
  const unsupportedByInventory = new Map<number, number>();
  let totalUnsupportedItemCount = 0;
  for (const container of projection.containers) {
    const count = container.geometry.kind === "rectangular"
      ? container.diagnostics.filter((diagnostic) => unsupportedItemCodes.has(diagnostic.code)).length
      : 0;
    unsupportedByInventory.set(container.inventoryId, count);
    totalUnsupportedItemCount += count;
  }

  const exceptionContainer = totalUnsupportedItemCount === 0 || options.exceptionInventoryId === undefined
    ? undefined
    : projection.containers.find((container) => container.inventoryId === options.exceptionInventoryId);
  const configurationError = totalUnsupportedItemCount === 0 || options.exceptionInventoryId === undefined
    ? undefined
    : !exceptionContainer
      ? "exception-page-not-found" as const
      : exceptionContainer.geometry.kind !== "rectangular"
        ? "exception-page-not-rectangular" as const
        : undefined;
  const activeExceptionInventoryId = configurationError === undefined && totalUnsupportedItemCount > 0
    ? options.exceptionInventoryId
    : undefined;

  const pages = projection.containers.map((container): StashPageSortEligibility => {
    const diagnosticCodes = container.diagnostics.map((diagnostic) => diagnostic.code);
    const unsupportedItemCount = unsupportedByInventory.get(container.inventoryId) ?? 0;
    const enabledByUser = !disabledInventoryIds.has(container.inventoryId);

    if (container.status === "not-applicable" || container.geometry.kind === "bag") {
      return {
        inventoryId: container.inventoryId,
        status: "not-applicable",
        enabledByUser,
        unsupportedItemCount,
        diagnosticCodes
      };
    }

    if (container.inventoryId === activeExceptionInventoryId) {
      return {
        inventoryId: container.inventoryId,
        status: "exception",
        enabledByUser,
        unsupportedItemCount,
        diagnosticCodes
      };
    }

    if (container.status === "ready" && container.geometry.kind === "rectangular") {
      return {
        inventoryId: container.inventoryId,
        status: enabledByUser ? "eligible" : "disabled",
        enabledByUser,
        unsupportedItemCount,
        diagnosticCodes
      };
    }

    const onlyUnsupportedItems = diagnosticCodes.length > 0 &&
      diagnosticCodes.every((code) => unsupportedItemCodes.has(code));
    return {
      inventoryId: container.inventoryId,
      status: onlyUnsupportedItems ? "manual-relocation-required" : "blocked",
      enabledByUser,
      unsupportedItemCount,
      diagnosticCodes
    };
  });

  const unsupportedOutsideException = pages
    .filter((page) => page.inventoryId !== activeExceptionInventoryId)
    .reduce((total, page) => total + page.unsupportedItemCount, 0);
  return {
    pages,
    eligibleInventoryIds: pages
      .filter((page) => page.status === "eligible")
      .map((page) => page.inventoryId),
    disabledInventoryIds: pages
      .filter((page) => page.status === "disabled")
      .map((page) => page.inventoryId),
    blockedInventoryIds: pages
      .filter((page) => page.status === "blocked" || page.status === "manual-relocation-required")
      .map((page) => page.inventoryId),
    totalUnsupportedItemCount,
    unsupportedItemCount: unsupportedOutsideException,
    requiresExceptionSelection: totalUnsupportedItemCount > 0 && activeExceptionInventoryId === undefined,
    requiresManualRelocation: unsupportedOutsideException > 0,
    ...(activeExceptionInventoryId === undefined ? {} : { exceptionInventoryId: activeExceptionInventoryId }),
    ...(configurationError === undefined ? {} : { configurationError })
  };
}
