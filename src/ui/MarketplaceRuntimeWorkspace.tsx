import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MarketplaceHttpRuntime,
  configuredMarketplaceRuntime,
  loadMarketplaceHttpCatalog
} from "./marketplaceHttpRuntime";
import { marketplacePreviewCatalog } from "./marketplacePreviewCatalog";
import { createMarketplacePreviewCoordinator } from "./marketplacePreviewMarket";
import { MarketplaceSearchWorkspace } from "./MarketplaceSearchWorkspace";
import type { MarketplaceFilterCatalog } from "./marketplaceFilterCatalog";

export type MarketplaceRuntimeStatus = "not-configured" | "connecting" | "connected" | "error";

export function MarketplaceRuntimeWorkspace(props: {
  onStatusChange?: (status: MarketplaceRuntimeStatus) => void;
}) {
  const { t } = useTranslation();
  const config = useMemo(() => configuredMarketplaceRuntime(), []);
  const previewRuntime = useMemo(() => createMarketplacePreviewCoordinator(), []);
  const liveRuntime = useMemo(
    () => config === undefined ? undefined : new MarketplaceHttpRuntime(config),
    [config]
  );
  const [catalog, setCatalog] = useState<MarketplaceFilterCatalog>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (config === undefined) {
      props.onStatusChange?.("not-configured");
      return;
    }
    const controller = new AbortController();
    props.onStatusChange?.("connecting");
    setCatalog(undefined);
    setError(undefined);
    void loadMarketplaceHttpCatalog(config, { signal: controller.signal })
      .then((loaded) => {
        setCatalog(loaded);
        props.onStatusChange?.("connected");
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause));
          props.onStatusChange?.("error");
        }
      });
    return () => controller.abort();
  }, [attempt, config, props.onStatusChange]);

  if (config === undefined || liveRuntime === undefined) {
    return <MarketplaceSearchWorkspace catalog={marketplacePreviewCatalog} runtime={previewRuntime} />;
  }
  if (catalog !== undefined) {
    return <MarketplaceSearchWorkspace catalog={catalog} runtime={liveRuntime} />;
  }
  return (
    <article className="card marketplace-runtime-state" aria-live="polite">
      <p className="eyebrow">{t("search.runtime.eyebrow")}</p>
      <h2>{error === undefined ? t("search.runtime.loadingTitle") : t("search.runtime.errorTitle")}</h2>
      <p>{error === undefined ? t("search.runtime.loadingDetail") : t("search.runtime.errorDetail")}</p>
      {error !== undefined && (
        <>
          <code>{error}</code>
          <div className="marketplace-actions">
            <button type="button" className="primary-button" onClick={() => setAttempt((value) => value + 1)}>
              {t("search.runtime.retry")}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
