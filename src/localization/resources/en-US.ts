export const enUS = {
  app: {
    title: "Dark and Darker Companion",
    phaseLabel: "v0.1 · OFFLINE FOUNDATION"
  },
  nav: {
    primary: "Primary workflows",
    stash: "Stash",
    marketplaceSearch: "Marketplace Search",
    autoListing: "Auto Listing"
  },
  status: {
    game: "Game",
    notDetected: "Not detected",
    capture: "Capture",
    stopped: "Stopped",
    character: "Character",
    unknown: "Unknown",
    snapshot: "Snapshot",
    unavailable: "Unavailable",
    darkerdb: "DarkerDB",
    notConfigured: "Not configured",
    automation: "Automation",
    idle: "Idle",
    emergencyStop: "Emergency stop",
    emergencyStopUnavailable: "No game-changing automation is running."
  },
  stash: {
    eyebrow: "STASH · READ ONLY",
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
    eyebrow: "AUTO LISTING · DRY RUN",
    title: "Auto Listing foundation",
    unitReference: "Per-unit reference",
    quantity: "Quantity",
    adjustment: "Percent below",
    finalPrice: "Final stack price",
    priceUnknown: "Price unknown",
    priceUnknownDetail: "No automatic fallback was used. Refresh or enter a manual price.",
    gold: "gold"
  },
  search: {
    eyebrow: "MARKETPLACE SEARCH · LOCAL FILTER",
    title: "Marketplace item search",
    description: "Pull a bounded DarkerDB listing batch, then finish advanced filtering locally. You reproduce the selected item manually in the game.",
    resultSummary: "{{matches}} of {{evaluated}} evaluated listings match",
    incompleteSummary: "Incomplete: {{retrieved}} of {{reported}} reported listings retrieved",
    impossibleRoll: "A naturally impossible roll counts as not matched.",
    groups: {
      identity: "Item identity",
      equipment: "Category and equipment type",
      price: "Price range",
      attributes: "Random attributes and K-of-N"
    },
    filters: {
      itemNames: "Item names",
      classes: "Usable by class",
      rarities: "Rarity / quality",
      itemTypes: "Item category",
      slotTypes: "Equipment slot",
      armorTypes: "Armor type",
      weaponTypes: "Weapon type",
      handTypes: "Hand type",
      priceBasis: "Price basis",
      minimumPrice: "Minimum gold",
      maximumPrice: "Maximum gold",
      searchWithin: "Search within {{label}}",
      searchPlaceholder: "Filter options…",
      noOptions: "No catalog options match."
    },
    price: {
      unit: "Per-unit price",
      total: "Whole-stack total"
    },
    attributes: {
      help: "Search the naturally scrollable catalog, add any number of rules, and set an optional inclusive minimum and maximum for each.",
      search: "Search attributes",
      available: "Available attributes",
      choose: "Choose an attribute",
      add: "Add attribute",
      selected: "Selected attribute rules",
      none: "No attribute rules. Listings pass through this stage.",
      requiredCount: "Required matches (K)",
      passThrough: "No rules selected; K is 0.",
      kSummary: "At least {{k}} of {{n}} selected attributes must match.",
      possibleRange: "Possible range: {{minimum}}–{{maximum}}{{unit}}",
      minimum: "Minimum",
      maximum: "Maximum"
    },
    actions: {
      explicitOnly: "Requests are explicit",
      editNoRequest: "Editing filters never calls DarkerDB.",
      reset: "Reset draft",
      refresh: "Refresh last search",
      applyLocal: "Apply locally",
      search: "Search DarkerDB",
      remove: "Remove {{label}}"
    },
    activeFilters: {
      title: "Draft filter summary",
      none: "No filters selected. Search will use the bounded broad query.",
      semantic: "{{groups}} filter groups use AND; options inside each group use OR. {{attributes}} attribute rules, K={{k}}.",
      clear: "Clear all"
    },
    catalog: {
      "preview-fixture": "Offline preview catalog",
      "darkerdb-cache": "Cached DarkerDB catalog",
      "darkerdb-live": "Live DarkerDB catalog"
    },
    semantics: {
      title: "How matching works",
      groups: "Different filter groups use AND. Multiple choices inside one group use OR.",
      classes: "An item passes if any selected class can use it; unrestricted items also pass."
    },
    status: {
      title: "Search state",
      notRun: "No Marketplace search has been submitted yet.",
      search: "The current draft was submitted as a new explicit search.",
      refresh: "The last submitted search was explicitly refreshed.",
      local: "The current draft was applied to the existing candidate snapshot only.",
      previewCatalog: "This browser checkpoint uses a small sanitized catalog fixture; it does not claim live Marketplace results.",
      noSnapshot: "Apply locally remains unavailable until a candidate snapshot exists."
    },
    validation: {
      number: "Enter a valid finite number or leave the field blank.",
      nonnegative: "Price cannot be negative.",
      range: "Minimum must not exceed maximum.",
      k: "K must be between 1 and the number of selected rules, or 0 when no rules are selected."
    }
  },
  settings: {
    open: "Open settings",
    close: "Close settings",
    eyebrow: "GLOBAL SETTINGS",
    title: "Settings",
    language: "Language",
    english: "English",
    simplifiedChinese: "Simplified Chinese",
    dataTitle: "Data and connections",
    dataDescription: "DarkerDB, capture, cache, and diagnostics will be configured here as their live adapters are connected.",
    safetyTitle: "Automation safety",
    safetyDescription: "Input timing, screen calibration, and emergency-stop diagnostics remain global rather than belonging to one workflow."
  },
  activity: {
    title: "Activity",
    ready: "Offline development shell ready. Live game adapters are not connected.",
    expand: "Expand activity",
    collapse: "Collapse activity"
  }
} as const;
