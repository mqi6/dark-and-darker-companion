import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
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
import { MarketplaceSearchWorkspace } from "./MarketplaceSearchWorkspace";
import { marketplacePreviewCatalog } from "./marketplacePreviewCatalog";
import { createMarketplacePreviewCoordinator } from "./marketplacePreviewMarket";

type Tab = "stash" | "marketplaceSearch" | "autoListing";

const tabs: readonly Tab[] = ["stash", "marketplaceSearch", "autoListing"];

export function App() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("stash");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const marketplaceRuntime = useMemo(() => createMarketplacePreviewCoordinator(), []);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    settingsButtonRef.current?.focus();
  }, []);
  const moveTabFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, tab: Tab) => {
    const currentIndex = tabs.indexOf(tab);
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex]!;
    setActiveTab(nextTab);
    document.getElementById(`tab-${nextTab}`)?.focus();
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="app-identity">
          <p className="eyebrow">{t("app.phaseLabel")}</p>
          <h1>{t("app.title")}</h1>
        </div>
        <div className="topbar-controls">
          <StatusStrip />
          <div className="global-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={t("settings.open")}
              title={t("settings.open")}
              ref={settingsButtonRef}
              onClick={() => setSettingsOpen(true)}
            >
              <span aria-hidden="true">⚙</span>
            </button>
            <button
              type="button"
              className="emergency-stop"
              disabled
              title={t("status.emergencyStopUnavailable")}
            >
              {t("status.emergencyStop")}
            </button>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label={t("nav.primary")} role="tablist">
        {tabs.map((tab) => (
          <button
            type="button"
            role="tab"
            id={`tab-${tab}`}
            aria-controls={`panel-${tab}`}
            aria-selected={activeTab === tab}
            tabIndex={activeTab === tab ? 0 : -1}
            className={activeTab === tab ? "tab active" : "tab"}
            onClick={() => setActiveTab(tab)}
            onKeyDown={(event) => moveTabFocus(event, tab)}
            key={tab}
          >
            {t(`nav.${tab}`)}
          </button>
        ))}
      </nav>

      <section className="workspace">
        <section
          role="tabpanel"
          id="panel-stash"
          aria-labelledby="tab-stash"
          hidden={activeTab !== "stash"}
        >
          <StashPanel />
        </section>
        <section
          role="tabpanel"
          id="panel-marketplaceSearch"
          aria-labelledby="tab-marketplaceSearch"
          hidden={activeTab !== "marketplaceSearch"}
        >
          <MarketplaceSearchWorkspace
            catalog={marketplacePreviewCatalog}
            runtime={marketplaceRuntime}
          />
        </section>
        <section
          role="tabpanel"
          id="panel-autoListing"
          aria-labelledby="tab-autoListing"
          hidden={activeTab !== "autoListing"}
        >
          <AutoListingPanel />
        </section>
      </section>

      <ActivityPanel
        collapsed={activityCollapsed}
        onToggle={() => setActivityCollapsed((collapsed) => !collapsed)}
      />
      {settingsOpen && (
        <SettingsDrawer
          language={i18n.language}
          onLanguageChange={(language) => void i18n.changeLanguage(language)}
          onClose={closeSettings}
        />
      )}
    </main>
  );
}

function StatusStrip() {
  const { t } = useTranslation();
  const statuses = [
    [t("status.game"), t("status.notDetected"), "danger"],
    [t("status.capture"), t("status.stopped"), "muted"],
    [t("status.character"), t("status.unknown"), "muted"],
    [t("status.snapshot"), t("status.unavailable"), "muted"],
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
        <p className="eyebrow">{t("stash.eyebrow")}</p>
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

function AutoListingPanel() {
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
        <p className="eyebrow">{t("auction.eyebrow")}</p>
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
            <span>{t("auction.gold")}</span>
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

function SettingsDrawer(props: {
  language: string;
  onLanguageChange: (language: "en-US" | "zh-CN") => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [props.onClose]);

  const keepFocusInside = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])"
    );
    if (!focusable?.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="settings-layer">
      <div
        className="settings-backdrop"
        aria-hidden="true"
        onClick={props.onClose}
      />
      <aside
        className="settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        ref={drawerRef}
        onKeyDown={keepFocusInside}
      >
        <header className="settings-header">
          <div>
            <p className="eyebrow">{t("settings.eyebrow")}</p>
            <h2 id="settings-title">{t("settings.title")}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={t("settings.close")}
            ref={closeButtonRef}
            onClick={props.onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="settings-content">
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
          <section className="settings-section" aria-labelledby="settings-data-title">
            <h3 id="settings-data-title">{t("settings.dataTitle")}</h3>
            <p>{t("settings.dataDescription")}</p>
          </section>
          <section className="settings-section" aria-labelledby="settings-safety-title">
            <h3 id="settings-safety-title">{t("settings.safetyTitle")}</h3>
            <p>{t("settings.safetyDescription")}</p>
          </section>
        </div>
      </aside>
    </div>
  );
}

function ActivityPanel(props: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <footer className={props.collapsed ? "activity-panel collapsed" : "activity-panel"}>
      <div className="activity-summary">
        <div>
          <p className="eyebrow">{t("activity.title")}</p>
          {!props.collapsed && <p aria-live="polite">{t("activity.ready")}</p>}
        </div>
        {!props.collapsed && <span className="activity-time">00:00:00</span>}
      </div>
      <button
        type="button"
        className="activity-toggle"
        aria-expanded={!props.collapsed}
        onClick={props.onToggle}
      >
        {props.collapsed ? t("activity.expand") : t("activity.collapse")}
      </button>
    </footer>
  );
}
