import { useTranslation } from "react-i18next";
import {
  STASH_ITEM_CATEGORIES,
  type StashItemCategory,
  type StashTabItemPolicy
} from "../domain/stashRouting";
import type { StashSortEligibility } from "../domain/stashSortEligibility";

export interface StashTabItemPolicyControlsProps {
  eligibility: StashSortEligibility;
  visibleInventoryIds: readonly number[];
  policies: readonly StashTabItemPolicy[];
  pageName: (inventoryId: number) => string;
  onPolicyChange: (policy: StashTabItemPolicy) => void;
}

export function StashTabItemPolicyControls(props: StashTabItemPolicyControlsProps) {
  const { t } = useTranslation();
  const policyByInventory = new Map(
    props.policies.map((policy) => [policy.inventoryId, policy])
  );

  return (
    <section className="stash-tab-policy-controls" aria-labelledby="stash-tab-policy-title">
      <h3 id="stash-tab-policy-title">{t("stash.sortPolicyTitle")}</h3>
      <p>{t("stash.sortPolicyDescription")}</p>
      <div className="stash-tab-policy-list">
        {props.visibleInventoryIds.map((inventoryId) => {
          const policy = policyByInventory.get(inventoryId);
          const eligibility = props.eligibility.pages.find(
            (page) => page.inventoryId === inventoryId
          );
          if (!policy || !eligibility || eligibility.status === "not-applicable") return null;

          const forcedOff = eligibility.status === "exception" ||
            eligibility.status === "blocked" ||
            eligibility.status === "manual-relocation-required";
          const enabled = policy.enabled && !forcedOff;
          const page = props.pageName(inventoryId);

          return (
            <fieldset className="stash-tab-policy-card" key={inventoryId}>
              <legend>{page}</legend>
              <div className="stash-tab-policy-header">
                <small>{t(`stash.sortStatus.${eligibility.status}`)}</small>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={t("stash.tabPolicyToggleLabel", {
                    page,
                    state: forcedOff
                      ? t("stash.exceptionForcedOff")
                      : enabled
                        ? t("stash.autoSortOn")
                        : t("stash.autoSortOff")
                  })}
                  disabled={forcedOff}
                  onClick={() => props.onPolicyChange({
                    ...policy,
                    enabled: !policy.enabled
                  })}
                >
                  {forcedOff
                    ? t("stash.exceptionForcedOff")
                    : enabled
                      ? t("stash.autoSortOn")
                      : t("stash.autoSortOff")}
                </button>
              </div>
              <span className="stash-tab-policy-label">{t("stash.allowedCategories")}</span>
              <div className="stash-tab-category-grid">
                {STASH_ITEM_CATEGORIES.map((category) => {
                  const checked = policy.allowedCategories.includes(category);
                  return (
                    <label key={category}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!enabled}
                        onChange={() => props.onPolicyChange({
                          ...policy,
                          allowedCategories: toggleCategory(
                            policy.allowedCategories,
                            category
                          )
                        })}
                      />
                      <span>{t(`stash.itemCategory.${category}`)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}

function toggleCategory(
  current: readonly StashItemCategory[],
  category: StashItemCategory
): StashItemCategory[] {
  return current.includes(category)
    ? current.filter((value) => value !== category)
    : STASH_ITEM_CATEGORIES.filter((value) =>
        value === category || current.includes(value)
      );
}
