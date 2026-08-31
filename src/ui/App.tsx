import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { calculateListingPrice } from "../domain/pricing";
import {
  SORT_INPUT_TIMING_PRESETS,
  type AutomationSpeedPreset
} from "../domain/automationTiming";
import type { StashPackingMode } from "../domain/stashPacking";
import type { SpatialContainer, SpatialPlacement } from "../domain/inventoryGeometry";
import { StashPreviewGrid } from "./StashPreviewGrid";
import { StashSortSettings } from "./StashSortSettings";

type Tab = "stash" | "auction" | "gearSearch" | "settings";

const tabs: readonly Tab[] = ["stash", "auction", "gearSearch", "settings"];

export function App() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("stash");

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">v0.1 · OFFLINE FOUNDATION</p>
          <h1>{t("app.title")}</h1>
        </div>
        <StatusStrip />
      </header>

      <nav className="tabs" aria-label="Primary">
        {tabs.map((tab) => (
          <button
            type="button"
            className={activeTab === tab ? "tab active" : "tab"}
            onClick={() => setActiveTab(tab)}
            key={tab}
          >
            {t(`nav.${tab}`)}
          </button>
        ))}
      </nav>

      <section className="workspace">
        {activeTab === "stash" && <StashPanel />}
        {activeTab === "auction" && <AuctionPanel />}
        {activeTab === "gearSearch" && <GearSearchPanel />}
        {activeTab === "settings" && (
          <SettingsPanel
            language={i18n.language}
            onLanguageChange={(language) => void i18n.changeLanguage(language)}
          />
        )}
      </section>

      <ActivityPanel />
    </main>
  );
}

function StatusStrip() {
  const { t } = useTranslation();
  const statuses = [
    [t("status.game"), t("status.notDetected"), "danger"],
    [t("status.capture"), t("status.stopped"), "muted"],
    [t("status.darkerdb"), t("status.notConfigured"), "warning"],
    [t("status.automation"), t("status.idle"), "success"]
  ] as const;

  return (
    <div className="status-strip">
      {statuses.map(([label, value, tone]) => (
        <div className="status-item" key={label}>
          <span className={`dot ${tone}`} />
          <span>
            <small>{label}</small>
            <strong>{value}</strong>
          </span>
        </div>
      ))}
    </div>
  );
}

function StashPanel() {
  const { t } = useTranslation();
  const [packingMode, setPackingMode] = useState<StashPackingMode>("compact-top-left");
  const [speedPreset, setSpeedPreset] = useState<AutomationSpeedPreset>("balanced");
  const [timing, setTiming] = useState({ ...SORT_INPUT_TIMING_PRESETS.balanced });

  const changeSpeedPreset = (preset: AutomationSpeedPreset) => {
    setSpeedPreset(preset);
    if (preset !== "custom") setTiming({ ...SORT_INPUT_TIMING_PRESETS[preset] });
  };

  return (
    <div className="panel-grid">
      <article className="card span-two">
        <p className="eyebrow">STASH · READ ONLY</p>
        <h2>{t("stash.title")}</h2>
        <p>{t("stash.description")}</p>
        <div className="stash-preview-toolbar">
          <span>{t("stash.previewSource")}</span>
          <strong>12 × 20</strong>
        </div>
        <StashPreviewGrid
          container={demoSpatialContainer}
          label={t("stash.previewLabel")}
          reservedRegions={[{ x: 9, y: 17, width: 3, height: 3 }]}
        />
      </article>
      <article className="card accent-card">
        <h3>{t("stash.reservedTitle")}</h3>
        <p>{t("stash.reservedDescription")}</p>
        <div className="reserved-demo">
          <span>3 × 2</span>
        </div>
      </article>
      <article className="card">
        <StashSortSettings
          mode={packingMode}
          speedPreset={speedPreset}
          timing={timing}
          onModeChange={setPackingMode}
          onSpeedPresetChange={changeSpeedPreset}
          onTimingChange={setTiming}
        />
      </article>
    </div>
  );
}

const demoPlacement = (
  alias: string,
  slotId: number,
  width: number,
  height: number,
  rarity: string,
  stackQuantity = 1
): SpatialPlacement => ({
  alias,
  inventoryId: 20,
  slotId,
  x: slotId % 12,
  y: Math.floor(slotId / 12),
  width,
  height,
  stackQuantity,
  metadata: {
    id: `id.item.synthetic_${alias.replace("-", "_")}`,
    rarity,
    inventoryWidth: width,
    inventoryHeight: height,
    maxStackSize: Math.max(1, stackQuantity)
  }
});

const demoSpatialContainer: SpatialContainer = {
  inventoryId: 20,
  status: "ready",
  geometry: { kind: "rectangular", columns: 12, rows: 20 },
  placements: [
    demoPlacement("sample-1x1", 0, 1, 1, "common", 5),
    demoPlacement("sample-1x2", 2, 1, 2, "uncommon"),
    demoPlacement("sample-1x3", 4, 1, 3, "rare"),
    demoPlacement("sample-1x4", 6, 1, 4, "epic"),
    demoPlacement("sample-2x2", 8, 2, 2, "legendary"),
    demoPlacement("sample-2x3", 36, 2, 3, "unique"),
    demoPlacement("sample-3x2", 65, 3, 2, "rare")
  ],
  diagnostics: []
};

function AuctionPanel() {
  const { t } = useTranslation();
  const [unitReferenceText, setUnitReferenceText] = useState("120");
  const [quantity, setQuantity] = useState(3);
  const [percentageBelow, setPercentageBelow] = useState(5);

  const calculation = useMemo(() => {
    const unitReference = unitReferenceText.trim()
      ? Number(unitReferenceText)
      : undefined;
    try {
      return calculateListingPrice({
        quantity,
        ...(unitReference === undefined ? {} : { unitReference }),
        adjustment: { kind: "percentage", direction: "below", value: percentageBelow }
      });
    } catch {
      return undefined;
    }
  }, [percentageBelow, quantity, unitReferenceText]);

  return (
    <div className="panel-grid">
      <article className="card span-two">
        <p className="eyebrow">AUCTION · DRY RUN</p>
        <h2>{t("auction.title")}</h2>
        <div className="form-grid">
          <label>
            {t("auction.unitReference")}
            <input
              value={unitReferenceText}
              inputMode="decimal"
              onChange={(event) => setUnitReferenceText(event.target.value)}
            />
          </label>
          <label>
            {t("auction.quantity")}
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
          <label>
            {t("auction.adjustment")}
            <input
              type="number"
              min={0}
              value={percentageBelow}
              onChange={(event) => setPercentageBelow(Number(event.target.value))}
            />
          </label>
        </div>
      </article>
      <article className={calculation?.status === "ready" ? "card price-card" : "card warning-card"}>
        {calculation?.status === "ready" ? (
          <>
            <p>{t("auction.finalPrice")}</p>
            <strong className="price">{calculation.finalPrice}</strong>
            <span>gold</span>
          </>
        ) : (
          <>
            <h3>{t("auction.priceUnknown")}</h3>
            <p>{t("auction.priceUnknownDetail")}</p>
          </>
        )}
      </article>
    </div>
  );
}

function GearSearchPanel() {
  const { t } = useTranslation();
  return (
    <div className="panel-grid">
      <article className="card span-two">
        <p className="eyebrow">GEAR SEARCH · LOCAL FILTER</p>
        <h2>{t("search.title")}</h2>
        <p>{t("search.description")}</p>
        <div className="query-chips">
          <span>Ranger</span>
          <span>Chest</span>
          <span>Epic + Legendary</span>
          <span>2 of 4 rolls</span>
        </div>
        <div className="summary-line">
          <strong>{t("search.resultSummary", { matches: 37, evaluated: 284 })}</strong>
          <span className="incomplete">
            {t("search.incompleteSummary", { retrieved: 284, reported: 612 })}
          </span>
        </div>
      </article>
      <article className="card accent-card">
        <h3>K-of-N</h3>
        <p>{t("search.impossibleRoll")}</p>
      </article>
    </div>
  );
}

function SettingsPanel(props: {
  language: string;
  onLanguageChange: (language: "en-US" | "zh-CN") => void;
}) {
  const { t } = useTranslation();
  return (
    <article className="card settings-card">
      <p className="eyebrow">SETTINGS</p>
      <h2>{t("settings.title")}</h2>
      <label>
        {t("settings.language")}
        <select
          value={props.language}
          onChange={(event) => props.onLanguageChange(event.target.value as "en-US" | "zh-CN")}
        >
          <option value="en-US">{t("settings.english")}</option>
          <option value="zh-CN">{t("settings.simplifiedChinese")}</option>
        </select>
      </label>
    </article>
  );
}

function ActivityPanel() {
  const { t } = useTranslation();
  return (
    <footer className="activity-panel">
      <div>
        <p className="eyebrow">{t("activity.title")}</p>
        <p>{t("activity.ready")}</p>
      </div>
      <span className="activity-time">00:00:00</span>
    </footer>
  );
}
