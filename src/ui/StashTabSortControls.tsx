import { useTranslation } from "react-i18next";
import type { StashSortEligibility } from "../domain/stashSortEligibility";

export interface StashTabSortControlsProps {
  eligibility: StashSortEligibility;
  visibleInventoryIds: readonly number[];
  pageName: (inventoryId: number) => string;
  onTabEnabledChange: (inventoryId: number, enabled: boolean) => void;
}

export function StashTabSortControls(props: StashTabSortControlsProps) {
  const { t } = useTranslation();
  const pages = props.visibleInventoryIds
    .map((inventoryId) => props.eligibility.pages.find((page) => page.inventoryId === inventoryId))
    .filter((page): page is NonNullable<typeof page> =>
      page !== undefined && page.status !== "not-applicable"
    );

  return (
    <section className="stash-tab-sort-controls" aria-labelledby="stash-tab-sort-title">
      <h3 id="stash-tab-sort-title">{t("stash.sortTabsTitle")}</h3>
      <p>{t("stash.sortTabsDescription")}</p>
      <div className="stash-tab-sort-list">
        {pages.map((page) => {
          const forcedOff = page.status === "exception";
          const checked = page.enabledByUser && !forcedOff;
          const switchText = forcedOff
            ? t("stash.exceptionForcedOff")
            : checked
              ? t("stash.autoSortOn")
              : t("stash.autoSortOff");
          return (
            <div className="stash-tab-sort-row" key={page.inventoryId}>
              <span>
                <strong>{props.pageName(page.inventoryId)}</strong>
                <small>{t(`stash.sortStatus.${page.status}`)}</small>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={t("stash.tabSortToggleLabel", {
                  page: props.pageName(page.inventoryId),
                  state: switchText
                })}
                disabled={forcedOff}
                onClick={() => props.onTabEnabledChange(page.inventoryId, !page.enabledByUser)}
              >
                {switchText}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
