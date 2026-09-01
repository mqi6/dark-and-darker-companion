import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MarketplaceCoordinatedSearchResult,
  MarketplaceSearchCoordinator
} from "../adapters/marketplaceSearch";
import {
  applyMarketplaceSpecLocally,
  canApplyMarketplaceSpecLocally
} from "../domain/marketplaceLocalFiltering";
import {
  DEFAULT_MARKETPLACE_RETRIEVED_LIMIT,
  createMarketplaceSearchPlan,
  parseMarketplaceSearchSpec,
  type MarketplaceSearchSpec
} from "../domain/marketplaceSearch";
import { MarketplaceSearchPanel } from "./MarketplaceSearchPanel";
import {
  MarketplaceSearchResults,
  type MarketplaceBusyAction,
  type MarketplaceSearchPresentation
} from "./MarketplaceSearchResults";
import type { MarketplaceFilterCatalog } from "./marketplaceFilterCatalog";

const MAX_MARKETPLACE_RETRIEVED_LIMIT = 5_000;

export interface MarketplaceSearchRuntime {
  search: MarketplaceSearchCoordinator["search"];
  refresh: MarketplaceSearchCoordinator["refresh"];
  cancel: MarketplaceSearchCoordinator["cancel"];
}

export interface MarketplaceSearchWorkspaceProps {
  catalog: MarketplaceFilterCatalog;
  runtime: MarketplaceSearchRuntime;
}

export function MarketplaceSearchWorkspace(props: MarketplaceSearchWorkspaceProps) {
  const [presentation, setPresentation] = useState<MarketplaceSearchPresentation>();
  const [busyAction, setBusyAction] = useState<MarketplaceBusyAction>();
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const lastAttempt = useRef<MarketplaceSearchSpec | undefined>(undefined);

  const run = useCallback(async (
    spec: MarketplaceSearchSpec,
    action: MarketplaceBusyAction,
    localDisplaySpec?: MarketplaceSearchSpec
  ) => {
    const currentGeneration = ++generation.current;
    lastAttempt.current = spec;
    setBusyAction(action);
    setError(undefined);
    try {
      const plan = createMarketplaceSearchPlan(spec, props.catalog.items);
      const coordinated: MarketplaceCoordinatedSearchResult = action === "refresh"
        ? await props.runtime.refresh(plan, props.catalog.items)
        : await props.runtime.search(plan, props.catalog.items);
      if (generation.current !== currentGeneration || coordinated.status !== "completed") return;
      const locallyFiltered = localDisplaySpec === undefined
        ? undefined
        : applyMarketplaceSpecLocally(
            coordinated.result,
            spec,
            localDisplaySpec,
            props.catalog.items
          );
      setPresentation({
        spec: locallyFiltered === undefined || localDisplaySpec === undefined
          ? spec
          : localDisplaySpec,
        sourceSpec: spec,
        result: locallyFiltered ?? coordinated.result,
        locallyApplied: locallyFiltered !== undefined
      });
    } catch (cause) {
      if (generation.current !== currentGeneration) return;
      setError(cause instanceof Error ? cause.message : "Unknown Marketplace search failure");
    } finally {
      if (generation.current === currentGeneration) setBusyAction(undefined);
    }
  }, [props.catalog.items, props.runtime]);

  const cancel = useCallback(() => {
    generation.current += 1;
    props.runtime.cancel();
    setBusyAction(undefined);
  }, [props.runtime]);

  useEffect(() => () => props.runtime.cancel(), [props.runtime]);

  const applyLocal = (draftSpec: MarketplaceSearchSpec) => {
    if (presentation === undefined) return;
    const result = applyMarketplaceSpecLocally(
      presentation.result,
      presentation.sourceSpec,
      draftSpec,
      props.catalog.items
    );
    if (result === undefined) return;
    setPresentation({
      ...presentation,
      spec: draftSpec,
      result,
      locallyApplied: true
    });
    setError(undefined);
  };

  const loadMore = () => {
    if (presentation === undefined) return;
    const sourceSpec = presentation.sourceSpec;
    const retrievedLimit = Math.min(
      MAX_MARKETPLACE_RETRIEVED_LIMIT,
      sourceSpec.budget.retrievedLimit + DEFAULT_MARKETPLACE_RETRIEVED_LIMIT
    );
    if (retrievedLimit <= sourceSpec.budget.retrievedLimit) return;
    const expanded = parseMarketplaceSearchSpec({
      ...sourceSpec,
      budget: { ...sourceSpec.budget, retrievedLimit }
    });
    void run(
      expanded,
      "load-more",
      presentation.locallyApplied ? presentation.spec : undefined
    );
  };

  const retry = () => {
    if (lastAttempt.current !== undefined) void run(lastAttempt.current, "refresh");
  };

  const canLoadMore = presentation !== undefined &&
    !presentation.result.complete &&
    presentation.sourceSpec.budget.retrievedLimit < MAX_MARKETPLACE_RETRIEVED_LIMIT &&
    !presentation.result.incompleteReasons.includes("authentication-error") &&
    !presentation.result.incompleteReasons.includes("rate-limited");

  return (
    <div className="marketplace-workspace">
      <MarketplaceSearchPanel
        catalog={props.catalog}
        busy={busyAction !== undefined}
        hasCandidateSnapshot={presentation !== undefined}
        canApplyLocal={(draftSpec) =>
          presentation !== undefined &&
          canApplyMarketplaceSpecLocally(
            presentation.sourceSpec,
            draftSpec,
            props.catalog.items
          )
        }
        onSearch={(spec) => void run(spec, "search")}
        onRefresh={(spec) => void run(spec, "refresh")}
        onApplyLocal={applyLocal}
        onCancel={cancel}
      />
      <MarketplaceSearchResults
        catalog={props.catalog}
        {...(presentation === undefined ? {} : { presentation })}
        {...(busyAction === undefined ? {} : { busyAction })}
        {...(error === undefined ? {} : { error })}
        canLoadMore={canLoadMore}
        onLoadMore={loadMore}
        onRetry={retry}
      />
    </div>
  );
}
