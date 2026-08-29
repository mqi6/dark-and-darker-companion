import { useTranslation } from "react-i18next";
import type { StashSortEligibility } from "../domain/stashSortEligibility";

export interface StashExceptionAlertProps {
  eligibility: StashSortEligibility;
  pageName: (inventoryId: number) => string;
  exceptionCandidateInventoryIds?: readonly number[];
  onExceptionPageChange?: (inventoryId: number) => void;
}

export function StashExceptionAlert({
  eligibility,
  pageName,
  exceptionCandidateInventoryIds = [],
  onExceptionPageChange
}: StashExceptionAlertProps) {
  const { t } = useTranslation();
  const manualPages = eligibility.pages.filter((page) => page.status === "manual-relocation-required");

  if (!eligibility.configurationError && !eligibility.requiresExceptionSelection && manualPages.length === 0) {
    return null;
  }

  if (eligibility.configurationError) {
    return (
      <section className="stash-exception-alert" role="alert" aria-live="assertive">
        <h3>{t("stash.exceptionConfigurationTitle")}</h3>
        <p>{t(`stash.${eligibility.configurationError}`)}</p>
        <ExceptionPageSelect
          inventoryIds={exceptionCandidateInventoryIds}
          pageName={pageName}
          {...(onExceptionPageChange === undefined ? {} : { onChange: onExceptionPageChange })}
        />
      </section>
    );
  }

  const affectedPages = manualPages.map((page) => pageName(page.inventoryId)).join(", ");
  return (
    <section className="stash-exception-alert" role="alert" aria-live="assertive">
      <h3>{t("stash.unsupportedItemsTitle")}</h3>
      <p>
        {t("stash.unsupportedItemsDetail", {
          count: eligibility.unsupportedItemCount,
          pageCount: manualPages.length,
          pages: affectedPages
        })}
      </p>
      {eligibility.exceptionInventoryId === undefined ? (
        <>
          <p className="stash-exception-action">{t("stash.chooseExceptionPage")}</p>
          <ExceptionPageSelect
            inventoryIds={exceptionCandidateInventoryIds}
            pageName={pageName}
            {...(onExceptionPageChange === undefined ? {} : { onChange: onExceptionPageChange })}
          />
        </>
      ) : (
        <p className="stash-exception-action">
          {t("stash.moveToExceptionPage", { page: pageName(eligibility.exceptionInventoryId) })}
        </p>
      )}
      <p>{t("stash.refreshAfterManualMove")}</p>
    </section>
  );
}

function ExceptionPageSelect(props: {
  inventoryIds: readonly number[];
  pageName: (inventoryId: number) => string;
  onChange?: (inventoryId: number) => void;
}) {
  const { t } = useTranslation();
  if (!props.onChange || props.inventoryIds.length === 0) return null;
  return (
    <label className="stash-exception-select">
      {t("stash.exceptionSelectLabel")}
      <select
        value=""
        onChange={(event) => {
          const inventoryId = Number(event.target.value);
          if (Number.isInteger(inventoryId)) props.onChange?.(inventoryId);
        }}
      >
        <option value="" disabled>{t("stash.exceptionSelectPlaceholder")}</option>
        {props.inventoryIds.map((inventoryId) => (
          <option key={inventoryId} value={inventoryId}>{props.pageName(inventoryId)}</option>
        ))}
      </select>
    </label>
  );
}
