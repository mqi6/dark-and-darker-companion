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
    reservedDescription: "Reserved cells and their items remain untouched by the planner."
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
