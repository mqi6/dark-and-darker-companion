import { useTranslation } from "react-i18next";
import type { StashSortEligibility } from "../domain/stashSortEligibility";

export interface StashExceptionAlertProps {
  eligibility: StashSortEligibility;
  pageName: (inventoryId: number) => string;
}

export function StashExceptionAlert({ eligibility, pageName }: StashExceptionAlertProps) {
  const { t } = useTranslation();
  const manualPages = eligibility.pages.filter((page) => page.status === "manual-relocation-required");

  if (!eligibility.configurationError && manualPages.length === 0) return null;

  if (eligibility.configurationError) {
    return (
      <section className="stash-exception-alert" role="alert" aria-live="assertive">
        <h3>{t("stash.exceptionConfigurationTitle")}</h3>
        <p>{t(`stash.${eligibility.configurationError}`)}</p>
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
      <p className="stash-exception-action">
        {eligibility.exceptionInventoryId === undefined
          ? t("stash.chooseExceptionPage")
          : t("stash.moveToExceptionPage", { page: pageName(eligibility.exceptionInventoryId) })}
      </p>
      <p>{t("stash.refreshAfterManualMove")}</p>
    </section>
  );
}
