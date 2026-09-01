import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CanonicalId } from "../domain/models";
import {
  parseMarketplaceSearchSpec,
  type MarketplaceSearchSpec
} from "../domain/marketplaceSearch";
import {
  marketplaceOptionLabel,
  type MarketplaceAttributeOption,
  type MarketplaceFilterCatalog,
  type MarketplaceOption
} from "./marketplaceFilterCatalog";

interface AttributeRuleDraft {
  attributeId: CanonicalId;
  minimum: string;
  maximum: string;
}

interface MarketplaceDraft {
  classIds: CanonicalId[];
  familyIds: CanonicalId[];
  itemTypes: string[];
  slotTypes: string[];
  armorTypes: string[];
  weaponTypes: string[];
  handTypes: string[];
  rarities: string[];
  priceBasis: "unit" | "total";
  minimumPrice: string;
  maximumPrice: string;
  rules: AttributeRuleDraft[];
  requiredMatchCount: number;
}

export interface MarketplaceSearchPanelProps {
  catalog: MarketplaceFilterCatalog;
  hasCandidateSnapshot?: boolean;
  onSearch?: (spec: MarketplaceSearchSpec) => void;
  onRefresh?: (spec: MarketplaceSearchSpec) => void;
  onApplyLocal?: (spec: MarketplaceSearchSpec) => void;
}

export function MarketplaceSearchPanel(props: MarketplaceSearchPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "zh-CN" ? "zh-CN" : "en-US";
  const [draft, setDraft] = useState<MarketplaceDraft>(emptyDraft);
  const [submittedSpec, setSubmittedSpec] = useState<MarketplaceSearchSpec>();
  const [attributeQuery, setAttributeQuery] = useState("");
  const [attributeToAdd, setAttributeToAdd] = useState<CanonicalId | "">("");
  const [lastAction, setLastAction] = useState<"search" | "refresh" | "local" | undefined>();

  const validation = useMemo(
    () => validateDraft(draft, (key) => t(key)),
    [draft, t]
  );
  const currentSpec = useMemo(
    () => (validation.valid ? buildSpec(draft, locale) : undefined),
    [draft, locale, validation.valid]
  );
  const availableAttributes = useMemo(() => {
    const selected = new Set(draft.rules.map((rule) => rule.attributeId));
    const query = attributeQuery.trim().toLocaleLowerCase(locale);
    return props.catalog.attributes.filter((attribute) => {
      if (selected.has(attribute.value)) return false;
      return (
        query === "" ||
        attribute.en.toLocaleLowerCase("en-US").includes(query) ||
        attribute.zhCN?.toLocaleLowerCase("zh-CN").includes(query) === true
      );
    });
  }, [attributeQuery, draft.rules, locale, props.catalog.attributes]);

  const updateSelection = <K extends SelectionKey>(key: K, value: MarketplaceDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submitSearch = () => {
    if (currentSpec === undefined) return;
    setSubmittedSpec(currentSpec);
    setLastAction("search");
    props.onSearch?.(currentSpec);
  };

  const refreshSearch = () => {
    if (submittedSpec === undefined) return;
    const refreshedSpec = parseMarketplaceSearchSpec({ ...submittedSpec, locale });
    setSubmittedSpec(refreshedSpec);
    setLastAction("refresh");
    props.onRefresh?.(refreshedSpec);
  };

  const applyLocal = () => {
    if (currentSpec === undefined || props.hasCandidateSnapshot !== true) return;
    setLastAction("local");
    props.onApplyLocal?.(currentSpec);
  };

  const addAttribute = () => {
    if (attributeToAdd === "") return;
    setDraft((current) => {
      const rules = [
        ...current.rules,
        { attributeId: attributeToAdd, minimum: "", maximum: "" }
      ];
      return {
        ...current,
        rules,
        requiredMatchCount: Math.max(1, current.requiredMatchCount)
      };
    });
    setAttributeToAdd("");
  };

  const removeAttribute = (attributeId: CanonicalId) => {
    setDraft((current) => {
      const rules = current.rules.filter((rule) => rule.attributeId !== attributeId);
      return {
        ...current,
        rules,
        requiredMatchCount:
          rules.length === 0 ? 0 : Math.min(current.requiredMatchCount, rules.length)
      };
    });
  };

  const reset = () => {
    setDraft(emptyDraft);
    setAttributeQuery("");
    setAttributeToAdd("");
    setLastAction(undefined);
  };

  return (
    <div className="marketplace-layout">
      <section className="marketplace-main" aria-labelledby="marketplace-title">
        <header className="marketplace-heading">
          <div>
            <p className="eyebrow">{t("search.eyebrow")}</p>
            <h2 id="marketplace-title">{t("search.title")}</h2>
            <p>{t("search.description")}</p>
          </div>
          <CatalogBadge source={props.catalog.source} generatedAt={props.catalog.generatedAt} />
        </header>

        <ActiveFilterSummary
          draft={draft}
          catalog={props.catalog}
          locale={locale}
          onRemove={(key, value) => {
            if (key === "rules") removeAttribute(value as CanonicalId);
            else if (key === "price") {
              setDraft((current) => ({
                ...current,
                minimumPrice: "",
                maximumPrice: ""
              }));
            }
            else {
              const selectionKey = key as SelectionKey;
              updateSelection(
                selectionKey,
                (draft[selectionKey] as string[]).filter((selected) => selected !== value) as MarketplaceDraft[typeof selectionKey]
              );
            }
          }}
          onClear={reset}
        />

        <div className="marketplace-filter-grid">
          <FilterSection title={t("search.groups.identity")}>
            <MarketplaceMultiSelect
              id="marketplace-family"
              label={t("search.filters.itemNames")}
              options={props.catalog.families}
              selected={draft.familyIds}
              locale={locale}
              onChange={(familyIds) => updateSelection("familyIds", familyIds as CanonicalId[])}
            />
            <MarketplaceMultiSelect
              id="marketplace-class"
              label={t("search.filters.classes")}
              options={props.catalog.classes}
              selected={draft.classIds}
              locale={locale}
              onChange={(classIds) => updateSelection("classIds", classIds as CanonicalId[])}
            />
            <MarketplaceMultiSelect
              id="marketplace-rarity"
              label={t("search.filters.rarities")}
              options={props.catalog.rarities}
              selected={draft.rarities}
              locale={locale}
              onChange={(rarities) => updateSelection("rarities", rarities)}
            />
          </FilterSection>

          <FilterSection title={t("search.groups.equipment")}>
            <MarketplaceMultiSelect
              id="marketplace-category"
              label={t("search.filters.itemTypes")}
              options={props.catalog.itemTypes}
              selected={draft.itemTypes}
              locale={locale}
              onChange={(itemTypes) => updateSelection("itemTypes", itemTypes)}
            />
            <MarketplaceMultiSelect
              id="marketplace-slot"
              label={t("search.filters.slotTypes")}
              options={props.catalog.slotTypes}
              selected={draft.slotTypes}
              locale={locale}
              onChange={(slotTypes) => updateSelection("slotTypes", slotTypes)}
            />
            <MarketplaceMultiSelect
              id="marketplace-armor"
              label={t("search.filters.armorTypes")}
              options={props.catalog.armorTypes}
              selected={draft.armorTypes}
              locale={locale}
              onChange={(armorTypes) => updateSelection("armorTypes", armorTypes)}
            />
            <MarketplaceMultiSelect
              id="marketplace-weapon"
              label={t("search.filters.weaponTypes")}
              options={props.catalog.weaponTypes}
              selected={draft.weaponTypes}
              locale={locale}
              onChange={(weaponTypes) => updateSelection("weaponTypes", weaponTypes)}
            />
            <MarketplaceMultiSelect
              id="marketplace-hand"
              label={t("search.filters.handTypes")}
              options={props.catalog.handTypes}
              selected={draft.handTypes}
              locale={locale}
              onChange={(handTypes) => updateSelection("handTypes", handTypes)}
            />
          </FilterSection>
        </div>

        <FilterSection title={t("search.groups.price")} className="marketplace-price-section">
          <div className="marketplace-price-grid">
            <label>
              {t("search.filters.priceBasis")}
              <select
                value={draft.priceBasis}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    priceBasis: event.target.value as "unit" | "total"
                  }))
                }
              >
                <option value="unit">{t("search.price.unit")}</option>
                <option value="total">{t("search.price.total")}</option>
              </select>
            </label>
            <label>
              {t("search.filters.minimumPrice")}
              <input
                inputMode="decimal"
                value={draft.minimumPrice}
                aria-invalid={validation.priceError !== undefined}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, minimumPrice: event.target.value }))
                }
              />
            </label>
            <label>
              {t("search.filters.maximumPrice")}
              <input
                inputMode="decimal"
                value={draft.maximumPrice}
                aria-invalid={validation.priceError !== undefined}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, maximumPrice: event.target.value }))
                }
              />
            </label>
          </div>
          {validation.priceError && <p className="field-error" role="alert">{validation.priceError}</p>}
        </FilterSection>

        <FilterSection title={t("search.groups.attributes")}>
          <p className="section-help">{t("search.attributes.help")}</p>
          <div className="attribute-picker">
            <label>
              {t("search.attributes.search")}
              <input
                type="search"
                value={attributeQuery}
                onChange={(event) => setAttributeQuery(event.target.value)}
              />
            </label>
            <label>
              {t("search.attributes.available")}
              <select
                value={attributeToAdd}
                size={Math.min(6, Math.max(2, availableAttributes.length + 1))}
                onChange={(event) => setAttributeToAdd(event.target.value as CanonicalId)}
              >
                <option value="">{t("search.attributes.choose")}</option>
                {availableAttributes.map((attribute) => (
                  <option value={attribute.value} key={attribute.value}>
                    {marketplaceOptionLabel(attribute, locale)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary-action"
              disabled={attributeToAdd === ""}
              onClick={addAttribute}
            >
              {t("search.attributes.add")}
            </button>
          </div>

          <div className="attribute-rule-list" aria-label={t("search.attributes.selected")}>
            {draft.rules.length === 0 ? (
              <p className="empty-hint">{t("search.attributes.none")}</p>
            ) : (
              draft.rules.map((rule) => {
                const option = props.catalog.attributes.find(
                  (attribute) => attribute.value === rule.attributeId
                );
                return (
                  <AttributeRuleEditor
                    key={rule.attributeId}
                    rule={rule}
                    {...(option === undefined ? {} : { option })}
                    locale={locale}
                    {...(validation.ruleErrors.get(rule.attributeId) === undefined
                      ? {}
                      : { error: validation.ruleErrors.get(rule.attributeId)! })}
                    onChange={(next) =>
                      setDraft((current) => ({
                        ...current,
                        rules: current.rules.map((currentRule) =>
                          currentRule.attributeId === next.attributeId ? next : currentRule
                        )
                      }))
                    }
                    onRemove={() => removeAttribute(rule.attributeId)}
                  />
                );
              })
            )}
          </div>

          <div className="k-of-n-control">
            <label>
              {t("search.attributes.requiredCount")}
              <input
                type="number"
                min={draft.rules.length === 0 ? 0 : 1}
                max={draft.rules.length}
                disabled={draft.rules.length === 0}
                value={draft.requiredMatchCount}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    requiredMatchCount: Number(event.target.value)
                  }))
                }
              />
            </label>
            <p>
              {draft.rules.length === 0
                ? t("search.attributes.passThrough")
                : t("search.attributes.kSummary", {
                    k: draft.requiredMatchCount,
                    n: draft.rules.length
                  })}
            </p>
          </div>
          {validation.kError && <p className="field-error" role="alert">{validation.kError}</p>}
        </FilterSection>

        <div className="marketplace-action-bar">
          <div>
            <strong>{t("search.actions.explicitOnly")}</strong>
            <span>{t("search.actions.editNoRequest")}</span>
          </div>
          <div className="marketplace-actions">
            <button type="button" className="ghost-action" onClick={reset}>
              {t("search.actions.reset")}
            </button>
            <button
              type="button"
              className="secondary-action"
              disabled={submittedSpec === undefined}
              onClick={refreshSearch}
            >
              {t("search.actions.refresh")}
            </button>
            <button
              type="button"
              className="secondary-action"
              disabled={!validation.valid || props.hasCandidateSnapshot !== true}
              onClick={applyLocal}
            >
              {t("search.actions.applyLocal")}
            </button>
            <button
              type="button"
              className="primary-action"
              disabled={!validation.valid}
              onClick={submitSearch}
            >
              {t("search.actions.search")}
            </button>
          </div>
        </div>
      </section>

      <aside className="marketplace-side">
        <article className="card accent-card">
          <h3>{t("search.semantics.title")}</h3>
          <p>{t("search.semantics.groups")}</p>
          <p>{t("search.semantics.classes")}</p>
          <p>{t("search.impossibleRoll")}</p>
        </article>
        <article className="card marketplace-status-card" aria-live="polite">
          <h3>{t("search.status.title")}</h3>
          {lastAction === undefined ? (
            <p>{t("search.status.notRun")}</p>
          ) : (
            <p>{t(`search.status.${lastAction}`)}</p>
          )}
          {props.catalog.source === "preview-fixture" && (
            <p className="incomplete">{t("search.status.previewCatalog")}</p>
          )}
          {props.hasCandidateSnapshot !== true && (
            <p className="muted-note">{t("search.status.noSnapshot")}</p>
          )}
        </article>
      </aside>
    </div>
  );
}

type SelectionKey =
  | "classIds"
  | "familyIds"
  | "itemTypes"
  | "slotTypes"
  | "armorTypes"
  | "weaponTypes"
  | "handTypes"
  | "rarities";

const emptyDraft: MarketplaceDraft = {
  classIds: [],
  familyIds: [],
  itemTypes: [],
  slotTypes: [],
  armorTypes: [],
  weaponTypes: [],
  handTypes: [],
  rarities: [],
  priceBasis: "unit",
  minimumPrice: "",
  maximumPrice: "",
  rules: [],
  requiredMatchCount: 0
};

function FilterSection(props: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`marketplace-filter-section ${props.className ?? ""}`}>
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}

function MarketplaceMultiSelect<T extends string>(props: {
  id: string;
  label: string;
  options: readonly MarketplaceOption<T>[];
  selected: readonly T[];
  locale: "en-US" | "zh-CN";
  onChange: (values: T[]) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const visible = props.options.filter((option) => {
    const normalizedQuery = query.trim().toLocaleLowerCase(props.locale);
    return (
      normalizedQuery === "" ||
      option.en.toLocaleLowerCase("en-US").includes(normalizedQuery) ||
      option.zhCN?.toLocaleLowerCase("zh-CN").includes(normalizedQuery) === true
    );
  });
  return (
    <fieldset className="marketplace-multiselect">
      <legend>
        {props.label}
        <span>{props.selected.length}</span>
      </legend>
      <label className="visually-hidden" htmlFor={`${props.id}-search`}>
        {t("search.filters.searchWithin", { label: props.label })}
      </label>
      <input
        id={`${props.id}-search`}
        type="search"
        placeholder={t("search.filters.searchPlaceholder")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="marketplace-option-list">
        {visible.length === 0 ? (
          <p>{t("search.filters.noOptions")}</p>
        ) : (
          visible.map((option) => {
            const checked = props.selected.includes(option.value);
            return (
              <label key={option.value}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    props.onChange(
                      checked
                        ? props.selected.filter((value) => value !== option.value)
                        : [...props.selected, option.value]
                    )
                  }
                />
                <span>{marketplaceOptionLabel(option, props.locale)}</span>
              </label>
            );
          })
        )}
      </div>
    </fieldset>
  );
}

function AttributeRuleEditor(props: {
  rule: AttributeRuleDraft;
  option?: MarketplaceAttributeOption;
  locale: "en-US" | "zh-CN";
  error?: string;
  onChange: (rule: AttributeRuleDraft) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const label = props.option
    ? marketplaceOptionLabel(props.option, props.locale)
    : props.rule.attributeId;
  const unit = props.option?.isPercentage ? "%" : "";
  return (
    <article className="attribute-rule-card">
      <header>
        <div>
          <strong>{label}</strong>
          {props.option?.minimum !== undefined && props.option.maximum !== undefined && (
            <small>
              {t("search.attributes.possibleRange", {
                minimum: props.option.minimum,
                maximum: props.option.maximum,
                unit
              })}
            </small>
          )}
        </div>
        <button type="button" className="remove-action" onClick={props.onRemove}>
          {t("search.actions.remove", { label })}
        </button>
      </header>
      <div className="attribute-range-grid">
        <label>
          {t("search.attributes.minimum")}
          <input
            aria-label={`${label} ${t("search.attributes.minimum")}`}
            inputMode="decimal"
            value={props.rule.minimum}
            aria-invalid={props.error !== undefined}
            onChange={(event) => props.onChange({ ...props.rule, minimum: event.target.value })}
          />
        </label>
        <label>
          {t("search.attributes.maximum")}
          <input
            aria-label={`${label} ${t("search.attributes.maximum")}`}
            inputMode="decimal"
            value={props.rule.maximum}
            aria-invalid={props.error !== undefined}
            onChange={(event) => props.onChange({ ...props.rule, maximum: event.target.value })}
          />
        </label>
      </div>
      {props.error && <p className="field-error" role="alert">{props.error}</p>}
    </article>
  );
}

function ActiveFilterSummary(props: {
  draft: MarketplaceDraft;
  catalog: MarketplaceFilterCatalog;
  locale: "en-US" | "zh-CN";
  onRemove: (key: SelectionKey | "rules" | "price", value: string) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const chips: { key: SelectionKey | "rules" | "price"; value: string; label: string }[] = [];
  const addSelections = <T extends string>(
    key: SelectionKey,
    selected: readonly T[],
    options: readonly MarketplaceOption<T>[]
  ) => {
    for (const value of selected) {
      const option = options.find((candidate) => candidate.value === value);
      chips.push({ key, value, label: option ? marketplaceOptionLabel(option, props.locale) : value });
    }
  };
  addSelections("familyIds", props.draft.familyIds, props.catalog.families);
  addSelections("classIds", props.draft.classIds, props.catalog.classes);
  addSelections("rarities", props.draft.rarities, props.catalog.rarities);
  addSelections("itemTypes", props.draft.itemTypes, props.catalog.itemTypes);
  addSelections("slotTypes", props.draft.slotTypes, props.catalog.slotTypes);
  addSelections("armorTypes", props.draft.armorTypes, props.catalog.armorTypes);
  addSelections("weaponTypes", props.draft.weaponTypes, props.catalog.weaponTypes);
  addSelections("handTypes", props.draft.handTypes, props.catalog.handTypes);
  for (const rule of props.draft.rules) {
    const option = props.catalog.attributes.find((candidate) => candidate.value === rule.attributeId);
    chips.push({
      key: "rules",
      value: rule.attributeId,
      label: option ? marketplaceOptionLabel(option, props.locale) : rule.attributeId
    });
  }
  const hasPrice = props.draft.minimumPrice.trim() !== "" || props.draft.maximumPrice.trim() !== "";
  if (hasPrice) {
    const range = `${props.draft.minimumPrice.trim() || "…"}–${props.draft.maximumPrice.trim() || "…"}`;
    chips.push({
      key: "price",
      value: "price",
      label: `${t(`search.price.${props.draft.priceBasis}`)} ${range}`
    });
  }
  return (
    <section className="active-filter-summary" aria-label={t("search.activeFilters.title")}>
      <div>
        <strong>{t("search.activeFilters.title")}</strong>
        <span>
          {chips.length === 0 && !hasPrice
            ? t("search.activeFilters.none")
            : t("search.activeFilters.semantic", {
                groups: new Set(chips.map((chip) => chip.key)).size,
                attributes: props.draft.rules.length,
                k: props.draft.requiredMatchCount
              })}
        </span>
      </div>
      <div className="active-filter-chips">
        {chips.map((chip) => (
          <button
            type="button"
            key={`${chip.key}:${chip.value}`}
            onClick={() => props.onRemove(chip.key, chip.value)}
            aria-label={t("search.actions.remove", { label: chip.label })}
          >
            {chip.label}<span aria-hidden="true">×</span>
          </button>
        ))}
        {(chips.length > 0 || hasPrice) && (
          <button type="button" className="clear-filter-action" onClick={props.onClear}>
            {t("search.activeFilters.clear")}
          </button>
        )}
      </div>
    </section>
  );
}

function CatalogBadge(props: {
  source: MarketplaceFilterCatalog["source"];
  generatedAt: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={`catalog-badge ${props.source}`}>
      <strong>{t(`search.catalog.${props.source}`)}</strong>
      <span>{new Date(props.generatedAt).toLocaleDateString()}</span>
    </div>
  );
}

function buildSpec(draft: MarketplaceDraft, locale: "en-US" | "zh-CN"): MarketplaceSearchSpec {
  const minimumPrice = optionalNumber(draft.minimumPrice);
  const maximumPrice = optionalNumber(draft.maximumPrice);
  return parseMarketplaceSearchSpec({
    version: 1,
    classIds: draft.classIds,
    familyIds: draft.familyIds,
    itemTypes: draft.itemTypes,
    slotTypes: draft.slotTypes,
    armorTypes: draft.armorTypes,
    weaponTypes: draft.weaponTypes,
    handTypes: draft.handTypes,
    rarities: draft.rarities,
    ...(minimumPrice === undefined && maximumPrice === undefined
      ? {}
      : {
          price: {
            basis: draft.priceBasis,
            range: {
              ...(minimumPrice === undefined ? {} : { minimum: minimumPrice }),
              ...(maximumPrice === undefined ? {} : { maximum: maximumPrice })
            }
          }
        }),
    rollRules: draft.rules.map((rule) => {
      const minimum = optionalNumber(rule.minimum);
      const maximum = optionalNumber(rule.maximum);
      return {
        id: `rule:${rule.attributeId}`,
        attributeId: rule.attributeId,
        enabled: true,
        ...(minimum === undefined ? {} : { minimum }),
        ...(maximum === undefined ? {} : { maximum })
      };
    }),
    requiredMatchCount: draft.requiredMatchCount,
    locale
  });
}

function validateDraft(
  draft: MarketplaceDraft,
  t: (key: string, options?: Record<string, unknown>) => string
): {
  valid: boolean;
  priceError?: string;
  kError?: string;
  ruleErrors: ReadonlyMap<CanonicalId, string>;
} {
  let priceError: string | undefined;
  const minimumPrice = checkedNumber(draft.minimumPrice);
  const maximumPrice = checkedNumber(draft.maximumPrice);
  if (minimumPrice === "invalid" || maximumPrice === "invalid") {
    priceError = t("search.validation.number");
  } else if ((minimumPrice ?? 0) < 0 || (maximumPrice ?? 0) < 0) {
    priceError = t("search.validation.nonnegative");
  } else if (
    minimumPrice !== undefined &&
    maximumPrice !== undefined &&
    minimumPrice > maximumPrice
  ) {
    priceError = t("search.validation.range");
  }

  const ruleErrors = new Map<CanonicalId, string>();
  for (const rule of draft.rules) {
    const minimum = checkedNumber(rule.minimum);
    const maximum = checkedNumber(rule.maximum);
    if (minimum === "invalid" || maximum === "invalid") {
      ruleErrors.set(rule.attributeId, t("search.validation.number"));
    } else if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      ruleErrors.set(rule.attributeId, t("search.validation.range"));
    }
  }

  const kValid =
    draft.rules.length === 0
      ? draft.requiredMatchCount === 0
      : Number.isInteger(draft.requiredMatchCount) &&
        draft.requiredMatchCount >= 1 &&
        draft.requiredMatchCount <= draft.rules.length;
  const kError = kValid ? undefined : t("search.validation.k");
  return {
    valid: priceError === undefined && ruleErrors.size === 0 && kError === undefined,
    ...(priceError === undefined ? {} : { priceError }),
    ...(kError === undefined ? {} : { kError }),
    ruleErrors
  };
}

function checkedNumber(value: string): number | undefined | "invalid" {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "invalid";
}

function optionalNumber(value: string): number | undefined {
  const parsed = checkedNumber(value);
  return typeof parsed === "number" ? parsed : undefined;
}
