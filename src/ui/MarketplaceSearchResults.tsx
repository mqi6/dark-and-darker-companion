import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MarketplaceSearchExecutionResult } from "../adapters/marketplaceSearch";
import type { MarketplaceListingEvaluation, MarketplaceSearchSpec } from "../domain/marketplaceSearch";
import {
  marketplaceOptionLabel,
  type MarketplaceFilterCatalog
} from "./marketplaceFilterCatalog";

export interface MarketplaceSearchPresentation {
  spec: MarketplaceSearchSpec;
  sourceSpec: MarketplaceSearchSpec;
  result: MarketplaceSearchExecutionResult;
  locallyApplied: boolean;
}

export type MarketplaceBusyAction = "search" | "refresh" | "load-more";

export interface MarketplaceSearchResultsProps {
  catalog: MarketplaceFilterCatalog;
  presentation?: MarketplaceSearchPresentation;
  busyAction?: MarketplaceBusyAction;
  error?: string;
  canLoadMore?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
}

export function MarketplaceSearchResults(props: MarketplaceSearchResultsProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "zh-CN" ? "zh-CN" : "en-US";
  const result = props.presentation?.result;
  const staleFamilies = result?.families.filter(
    (family) => family.freshness !== undefined && family.freshness.status !== "fresh"
  ) ?? [];
  const failedFamilies = result?.families.filter((family) => family.error !== undefined) ?? [];
  const rateLimited = result?.incompleteReasons.includes("rate-limited") === true;
  const authenticationError = result?.incompleteReasons.includes("authentication-error") === true;

  return (
    <section className="marketplace-results" aria-labelledby="marketplace-results-title">
      <header className="marketplace-results-heading">
        <div>
          <p className="eyebrow">{t("search.results.eyebrow")}</p>
          <h2 id="marketplace-results-title">{t("search.results.title")}</h2>
        </div>
        {result && (
          <div className="marketplace-counts" aria-live="polite">
            <strong>{t("search.resultSummary", {
              matches: result.matchedCount,
              evaluated: result.evaluatedCount
            })}</strong>
            <span>
              {result.complete
                ? t("search.results.completeCount", { retrieved: result.retrievedCount })
                : t("search.results.incompleteCount", {
                    retrieved: result.retrievedCount,
                    reported: result.reportedTotal ?? t("search.results.totalUnavailable")
                  })}
            </span>
          </div>
        )}
      </header>

      {props.busyAction && (
        <>
          <div className="marketplace-notice information" role="status">
            <div>
              <strong>{t(`search.results.loading.${props.busyAction}`)}</strong>
              <span>{t("search.results.loading.detail")}</span>
            </div>
          </div>
          {!props.presentation && (
            <div className="marketplace-result-skeleton" aria-hidden="true">
              <span /><span /><span />
            </div>
          )}
        </>
      )}

      {props.error && (
        <div className="marketplace-notice danger" role="alert">
          <div>
            <strong>{t("search.results.fatal.title")}</strong>
            <span>{props.presentation
              ? t("search.results.fatal.preserved")
              : t("search.results.fatal.noResults")}</span>
            <code>{props.error}</code>
          </div>
          <button type="button" className="secondary-action" onClick={props.onRetry}>
            {t("search.actions.refresh")}
          </button>
        </div>
      )}

      {!props.presentation && !props.busyAction && !props.error && (
        <div className="marketplace-empty-state">
          <strong>{t("search.results.initial.title")}</strong>
          <p>{t("search.results.initial.detail")}</p>
        </div>
      )}

      {result && (
        <>
          {authenticationError && (
            <Notice tone="danger" title={t("search.results.auth.title")} detail={t("search.results.auth.detail")} />
          )}
          {rateLimited && (
            <Notice tone="warning" title={t("search.results.rate.title")} detail={t("search.results.rate.detail")} />
          )}
          {!result.complete && (
            <Notice
              tone="warning"
              title={t("search.results.incomplete.title")}
              detail={t("search.results.incomplete.detail", {
                retrieved: result.retrievedCount,
                reported: result.reportedTotal ?? t("search.results.totalUnavailable")
              })}
            />
          )}
          {staleFamilies.length > 0 && (
            <Notice
              tone="warning"
              title={t("search.results.stale.title")}
              detail={t("search.results.stale.detail", {
                count: staleFamilies.length,
                age: Math.max(...staleFamilies.map((family) => family.freshness?.age_seconds ?? 0))
              })}
            />
          )}
          {failedFamilies.length > 0 && (
            <Notice
              tone="danger"
              title={t("search.results.partial.title")}
              detail={t("search.results.partial.detail", { count: failedFamilies.length })}
            />
          )}
          {props.presentation?.locallyApplied === true && (
            <Notice tone="information" title={t("search.results.localApplied.title")} detail={t("search.results.localApplied.detail")} />
          )}

          {result.matchedCount === 0 ? (
            <MarketplaceEmptyResult result={result} stale={staleFamilies.length > 0} />
          ) : (
            <MarketplaceResultTable
              catalog={props.catalog}
              matches={result.matches}
              locale={locale}
            />
          )}

          <div className="marketplace-result-footer">
            <div>
              <span>{t("search.results.fetchedAt", {
                value: new Date(result.fetchedAt).toLocaleString(locale)
              })}</span>
              <span>{t("search.results.requestCounts", {
                live: result.liveRequestCount,
                cache: result.cacheHitCount
              })}</span>
            </div>
            {props.canLoadMore && (
              <button
                type="button"
                className="secondary-action"
                disabled={props.busyAction !== undefined}
                onClick={props.onLoadMore}
              >
                {t("search.results.loadMore")}
              </button>
            )}
          </div>

          {result.families.length > 0 && (
            <details className="marketplace-family-diagnostics">
              <summary>{t("search.results.diagnostics.title")}</summary>
              <div>
                {result.families.map((family) => (
                  <article key={family.id}>
                    <strong>{family.id}</strong>
                    <span>{t("search.results.diagnostics.counts", {
                      retrieved: family.retrievedCount,
                      reported: family.reportedTotal ?? t("search.results.totalUnavailable")
                    })}</span>
                    <span>{family.complete
                      ? t("search.results.diagnostics.complete")
                      : t("search.results.diagnostics.incomplete")}</span>
                    {family.freshness && (
                      <span>{t("search.results.diagnostics.freshness", {
                        status: family.freshness.status,
                        age: family.freshness.age_seconds
                      })}</span>
                    )}
                    {family.error && <code>{family.error.status ?? family.error.kind}: {family.error.message}</code>}
                  </article>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function MarketplaceEmptyResult(props: {
  result: MarketplaceSearchExecutionResult;
  stale: boolean;
}) {
  const { t } = useTranslation();
  let title: string;
  let detail: string;
  if (props.result.authoritativeEmpty) {
    title = t("search.results.empty.catalogTitle");
    detail = t("search.results.empty.catalogDetail");
  } else if (props.result.evaluatedCount > 0) {
    title = t("search.results.empty.localTitle");
    detail = t("search.results.empty.localDetail");
  } else if (props.stale || !props.result.complete) {
    title = t("search.results.empty.staleTitle");
    detail = t("search.results.empty.staleDetail");
  } else {
    title = t("search.results.empty.authoritativeTitle");
    detail = t("search.results.empty.authoritativeDetail");
  }
  return <div className="marketplace-empty-state"><strong>{title}</strong><p>{detail}</p></div>;
}

function MarketplaceResultTable(props: {
  catalog: MarketplaceFilterCatalog;
  matches: readonly MarketplaceListingEvaluation[];
  locale: "en-US" | "zh-CN";
}) {
  const { t } = useTranslation();
  return (
    <div className="marketplace-result-table-wrap">
      <table className="marketplace-result-table">
        <thead>
          <tr>
            <th>{t("search.results.columns.item")}</th>
            <th>{t("search.results.columns.rolls")}</th>
            <th>{t("search.results.columns.quantity")}</th>
            <th>{t("search.results.columns.unitPrice")}</th>
            <th>{t("search.results.columns.totalPrice")}</th>
            <th>{t("search.results.columns.manual")}</th>
          </tr>
        </thead>
        <tbody>
          {props.matches.map((entry) => (
            <MarketplaceResultRow
              key={entry.listing.id}
              entry={entry}
              catalog={props.catalog}
              locale={props.locale}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarketplaceResultRow(props: {
  entry: MarketplaceListingEvaluation;
  catalog: MarketplaceFilterCatalog;
  locale: "en-US" | "zh-CN";
}) {
  const { t } = useTranslation();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const listing = props.entry.listing;
  const family = props.catalog.families.find((option) => option.value === listing.archetype);
  const rarity = props.catalog.rarities.find((option) => option.value === listing.rarity);
  const itemName = family ? marketplaceOptionLabel(family, props.locale) : listing.name || listing.item_id;
  const rarityName = rarity ? marketplaceOptionLabel(rarity, props.locale) : listing.rarity;
  const listingAttributes = Object.entries(listing.attributes);
  const summary = manualSearchSummary(props.entry, props.catalog, props.locale, {
    item: t("search.results.manual.item"),
    rarity: t("search.results.manual.rarity"),
    rolls: t("search.results.manual.rolls"),
    maximum: t("search.results.manual.maximum"),
    unit: t("search.results.manual.unit"),
    total: t("search.results.manual.total"),
    gold: t("auction.gold")
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <tr>
      <td data-label={t("search.results.columns.item")}>
        <strong>{itemName}</strong>
        <span className={`rarity-label rarity-${listing.rarity}`}>{rarityName}</span>
        <small>{listing.item_id}</small>
      </td>
      <td data-label={t("search.results.columns.rolls")}>
        <span>{t("search.results.matchK", {
          matched: props.entry.evaluation.matchCount,
          total: props.entry.evaluation.enabledRuleCount
        })}</span>
        <details>
          <summary>{t("search.results.details")}</summary>
          <ul>
            {listingAttributes.length === 0 ? <li>{t("search.results.noRolls")}</li> : listingAttributes.map(([key, value]) => {
              const slug = key.replace(/^(primary|secondary)_/, "");
              const option = props.catalog.attributes.find(
                (attribute) => attribute.value === `id.attribute.${slug}`
              );
              const label = option ? marketplaceOptionLabel(option, props.locale) : key;
              const group = key.startsWith("primary_")
                ? t("search.results.attributeGroups.primary")
                : key.startsWith("secondary_")
                  ? t("search.results.attributeGroups.secondary")
                  : t("search.results.attributeGroups.other");
              return <li key={key}>{group} · {label}: {value}{option?.isPercentage ? "%" : ""}</li>;
            })}
          </ul>
        </details>
      </td>
      <td data-label={t("search.results.columns.quantity")}>{listing.quantity}</td>
      <td data-label={t("search.results.columns.unitPrice")}><strong>{listing.price_per_unit}</strong> {t("auction.gold")}</td>
      <td data-label={t("search.results.columns.totalPrice")}><strong>{listing.price}</strong> {t("auction.gold")}</td>
      <td data-label={t("search.results.columns.manual")}>
        <details className="manual-search-details">
          <summary>{t("search.results.manual.open")}</summary>
          <pre>{summary}</pre>
          <button type="button" className="secondary-action" onClick={() => void copy()}>
            {copyState === "copied"
              ? t("search.results.manual.copied")
              : copyState === "failed"
                ? t("search.results.manual.copyFailed")
                : t("search.results.manual.copy")}
          </button>
        </details>
      </td>
    </tr>
  );
}

export function manualSearchSummary(
  entry: MarketplaceListingEvaluation,
  catalog: MarketplaceFilterCatalog,
  locale: "en-US" | "zh-CN",
  labels: { item: string; rarity: string; rolls: string; maximum: string; unit: string; total: string; gold: string }
): string {
  const listing = entry.listing;
  const family = catalog.families.find((option) => option.value === listing.archetype);
  const rarity = catalog.rarities.find((option) => option.value === listing.rarity);
  const itemName = family ? marketplaceOptionLabel(family, locale) : listing.name || listing.item_id;
  const rarityName = rarity ? marketplaceOptionLabel(rarity, locale) : listing.rarity;
  const rolls = entry.evaluation.candidate.item.rolls.map((roll) => {
    const option = catalog.attributes.find((attribute) => attribute.value === roll.attributeId);
    return `${option ? marketplaceOptionLabel(option, locale) : roll.attributeId} ${roll.value}${option?.isPercentage ? "%" : ""}`;
  });
  return [
    `${labels.item}: ${itemName}`,
    `${labels.rarity}: ${rarityName}`,
    `${labels.rolls}: ${rolls.length === 0 ? "—" : rolls.join(", ")}`,
    `${labels.maximum}: ${listing.price_per_unit} ${labels.gold} ${labels.unit} / ${listing.price} ${labels.gold} ${labels.total}`
  ].join("\n");
}

function Notice(props: { tone: "information" | "warning" | "danger"; title: string; detail: string }) {
  return <div className={`marketplace-notice ${props.tone}`}><div><strong>{props.title}</strong><span>{props.detail}</span></div></div>;
}
