export const enUS = {
  app: {
    title: "Dark and Darker Companion"
  },
  nav: {
    stash: "Stash",
    auction: "Auction",
    gearSearch: "Gear Search",
    settings: "Settings"
  },
  status: {
    game: "Game",
    notDetected: "Not detected",
    capture: "Capture",
    stopped: "Stopped",
    darkerdb: "DarkerDB",
    notConfigured: "Not configured",
    automation: "Automation",
    idle: "Idle"
  },
  stash: {
    title: "Stash workspace",
    description: "Logical storage preview uses protocol slots and validated item footprints; it does not use screen coordinates.",
    previewSource: "Synthetic offline footprint fixture",
    previewLabel: "12 by 20 logical stash preview",
    reservedTitle: "Reserved regions",
    reservedDescription: "Reserved cells and their items remain untouched by the planner.",
    unsupportedItemsTitle: "Unsupported items found",
    unsupportedItemsDetail: "{{count}} unsupported items on {{pageCount}} page(s) have no verified size. Affected pages: {{pages}}. Those pages are excluded; other verified pages remain available.",
    chooseExceptionPage: "Select an exception page now. It will stay out of automatic sorting while unsupported items exist.",
    moveToExceptionPage: "Move them manually to {{page}}. The companion will never move unsupported items or sort the exception page.",
    refreshAfterManualMove: "After moving them, reselect the current character to refresh the full stash state.",
    exceptionSelectLabel: "Exception page",
    exceptionSelectPlaceholder: "Select a visible tab",
    exceptionConfigurationTitle: "Exception page is unavailable",
    "exception-page-not-found": "The selected exception page is not present in the current character's stash.",
    "exception-page-not-rectangular": "The selected exception target is not a verified rectangular stash page.",
    sortTabsTitle: "Automatic sorting by tab",
    sortTabsDescription: "Choose which visible tabs participate whenever automatic sorting runs.",
    sortPolicyTitle: "Allowed items by tab",
    sortPolicyDescription: "Enable each tab and choose which item types it may receive. Disabled tabs are never used as a source or destination.",
    sortSettingsTitle: "Sorting layout and speed",
    packingMode: "Layout",
    packingModes: {
      "compact-top-left": "Compact from top-left",
      "category-rows": "One category per row group"
    },
    sortSpeed: "Input speed",
    speedPresets: {
      fast: "Fast",
      balanced: "Balanced",
      reliable: "Reliable",
      custom: "Custom"
    },
    timing: {
      pointerSettleMilliseconds: "Pointer settle (ms)",
      clickHoldMilliseconds: "Click hold (ms)",
      postClickMilliseconds: "After click (ms)",
      tabSettleMilliseconds: "Tab load wait (ms)",
      dragDurationMilliseconds: "Drag duration (ms)",
      postDragMilliseconds: "After drag (ms)"
    },
    singleSnapshotVerification: "The complete plan uses one initial stash state and performs one automatic full refresh after all moves.",
    allowedCategories: "Allowed item types",
    tabPolicyToggleLabel: "{{page}}: {{state}}",
    itemCategory: {
      gear: "Gear",
      weapon: "Weapons",
      jewelry: "Necklaces and rings",
      currency: "Money",
      "currency-container": "Money containers",
      utility: "Utility",
      misc: "Other"
    },
    bagCapacity: "{{items}} items · {{free}} of 50 cells free",
    autoSortOn: "On",
    autoSortOff: "Off",
    exceptionForcedOff: "Exception page",
    tabSortToggleLabel: "{{page}}: {{state}}",
    sortStatus: {
      eligible: "Ready for sorting",
      disabled: "Disabled by you",
      exception: "Forced off while unsupported items exist",
      "manual-relocation-required": "Unsupported items must be moved manually",
      blocked: "Blocked by spatial validation",
      "not-applicable": "Not a stash tab"
    }
  },
  auction: {
    title: "Auction pricing foundation",
    unitReference: "Per-unit reference",
    quantity: "Quantity",
    adjustment: "Percent below",
    finalPrice: "Final stack price",
    priceUnknown: "Price unknown",
    priceUnknownDetail: "No automatic fallback was used. Refresh or enter a manual price."
  },
  search: {
    title: "Gear Search foundation",
    description: "K-of-N is evaluated locally across multiple item families.",
    resultSummary: "{{matches}} of {{evaluated}} evaluated listings match",
    incompleteSummary: "Incomplete: {{retrieved}} of {{reported}} reported listings retrieved",
    impossibleRoll: "A naturally impossible roll counts as not matched."
  },
  settings: {
    title: "Settings",
    language: "Language",
    english: "English",
    simplifiedChinese: "Simplified Chinese"
  },
  activity: {
    title: "Activity",
    ready: "Offline development shell ready. Live game adapters are not connected."
  }
} as const;
