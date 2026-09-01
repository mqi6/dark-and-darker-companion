import { useTranslation } from "react-i18next";
import {
  AUTOMATION_SPEED_PRESETS,
  SORT_INPUT_TIMING_LIMITS,
  type AutomationSpeedPreset,
  type SortInputTiming
} from "../domain/automationTiming";
import {
  STASH_PACKING_MODES,
  type StashPackingMode
} from "../domain/stashPacking";

export interface StashSortSettingsProps {
  mode: StashPackingMode;
  speedPreset: AutomationSpeedPreset;
  timing: SortInputTiming;
  disabled?: boolean;
  onModeChange: (mode: StashPackingMode) => void;
  onSpeedPresetChange: (preset: AutomationSpeedPreset) => void;
  onTimingChange: (timing: SortInputTiming) => void;
}

export function StashSortSettings(props: StashSortSettingsProps) {
  const { t } = useTranslation();
  return (
    <section className="stash-sort-settings" aria-labelledby="stash-sort-settings-title">
      <h3 id="stash-sort-settings-title">{t("stash.sortSettingsTitle")}</h3>
      <label>
        {t("stash.packingMode")}
        <select
          value={props.mode}
          disabled={props.disabled}
          onChange={(event) =>
            props.onModeChange(event.target.value as StashPackingMode)}
        >
          {STASH_PACKING_MODES.map((mode) => (
            <option value={mode} key={mode}>
              {t(`stash.packingModes.${mode}`)}
            </option>
          ))}
        </select>
      </label>

      <label>
        {t("stash.sortSpeed")}
        <select
          value={props.speedPreset}
          disabled={props.disabled}
          onChange={(event) =>
            props.onSpeedPresetChange(event.target.value as AutomationSpeedPreset)}
        >
          {AUTOMATION_SPEED_PRESETS.map((preset) => (
            <option value={preset} key={preset}>
              {t(`stash.speedPresets.${preset}`)}
            </option>
          ))}
        </select>
      </label>

      {props.speedPreset === "custom" && (
        <div className="sort-timing-grid">
          {TIMING_FIELDS.map((field) => {
            const limits = SORT_INPUT_TIMING_LIMITS[field];
            return (
              <label key={field}>
                {t(`stash.timing.${field}`)}
                <input
                  type="number"
                  min={limits.minimum}
                  max={limits.maximum}
                  step={1}
                  value={props.timing[field]}
                  disabled={props.disabled}
                  onChange={(event) => props.onTimingChange({
                    ...props.timing,
                    [field]: Number(event.target.value)
                  })}
                />
              </label>
            );
          })}
        </div>
      )}
      <p className="muted">{t("stash.singleSnapshotVerification")}</p>
    </section>
  );
}

const TIMING_FIELDS: readonly (keyof SortInputTiming)[] = [
  "pointerSettleMilliseconds",
  "clickHoldMilliseconds",
  "postClickMilliseconds",
  "tabSettleMilliseconds",
  "dragDurationMilliseconds",
  "postDragMilliseconds"
];
