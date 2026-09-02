export const zhCN = {
  app: {
    title: "Dark and Darker 游戏伴侣",
    phaseLabel: "v0.1 · 离线开发基础"
  },
  nav: {
    primary: "主要工作流",
    stash: "仓库",
    marketplaceSearch: "市场搜索",
    autoListing: "自动上架"
  },
  status: {
    game: "游戏",
    notDetected: "未检测到",
    capture: "数据捕获",
    stopped: "已停止",
    character: "当前角色",
    unknown: "未知",
    snapshot: "仓库数据",
    unavailable: "不可用",
    darkerdb: "DarkerDB",
    notConfigured: "未配置",
    connecting: "连接中",
    connected: "已连接",
    connectionError: "连接错误",
    automation: "自动任务",
    idle: "空闲",
    emergencyStop: "紧急停止",
    emergencyStopUnavailable: "当前没有正在运行的游戏操作任务。"
  },
  stash: {
    eyebrow: "仓库 · 只读预览",
    title: "仓库工作区",
    description: "逻辑仓库预览使用协议槽位和已验证的物品尺寸，不依赖屏幕像素坐标。",
    previewSource: "离线合成尺寸样本",
    previewLabel: "12 列 20 行逻辑仓库预览",
    reservedTitle: "固定区域",
    reservedDescription: "排序器不会移动固定区域中的物品，也不会使用其中的格子。",
    unsupportedItemsTitle: "发现暂不支持的物品",
    unsupportedItemsDetail: "{{pageCount}} 个页面中有 {{count}} 件暂不支持的物品，系统没有已验证的尺寸。受影响页面：{{pages}}。这些页面会被排除，其他已验证页面仍可使用。",
    chooseExceptionPage: "请现在选择一个例外页。只要未知物品仍然存在，该页就不会参与自动整理。",
    moveToExceptionPage: "请将它们手动移动到{{page}}。游戏伴侣不会移动这些物品，也不会整理例外页。",
    refreshAfterManualMove: "移动完成后，请重新选择当前角色，以刷新完整仓库状态。",
    exceptionSelectLabel: "例外页",
    exceptionSelectPlaceholder: "选择一个可见页面",
    exceptionConfigurationTitle: "例外页不可用",
    "exception-page-not-found": "当前角色的仓库中没有所选例外页。",
    "exception-page-not-rectangular": "所选目标不是经过验证的矩形仓库页。",
    sortTabsTitle: "按页面设置自动整理",
    sortTabsDescription: "选择每次自动整理时哪些可见页面参与任务。",
    sortPolicyTitle: "各页允许的物品",
    sortPolicyDescription: "逐页开启或关闭，并选择该页可接收的物品类型。关闭的页不会作为来源或目标。",
    sortSettingsTitle: "整理布局与速度",
    packingMode: "排列方式",
    packingModes: {
      "compact-top-left": "左上角紧凑排列",
      "category-rows": "同类物品同行，不足一行留空"
    },
    sortSpeed: "输入速度",
    speedPresets: {
      fast: "快速",
      balanced: "平衡",
      reliable: "可靠",
      custom: "自定义"
    },
    timing: {
      pointerSettleMilliseconds: "鼠标到位等待（毫秒）",
      clickHoldMilliseconds: "点击按住时间（毫秒）",
      postClickMilliseconds: "点击后等待（毫秒）",
      tabSettleMilliseconds: "页签加载等待（毫秒）",
      dragDurationMilliseconds: "拖动时间（毫秒）",
      postDragMilliseconds: "拖动后等待（毫秒）"
    },
    singleSnapshotVerification: "整个计划只使用一次初始仓库数据，并在所有移动完成后自动刷新一次进行完整核对。",
    allowedCategories: "允许的物品类型",
    tabPolicyToggleLabel: "{{page}}：{{state}}",
    itemCategory: {
      gear: "防具",
      weapon: "武器",
      jewelry: "项链与戒指",
      currency: "金币",
      "currency-container": "金币容器",
      utility: "消耗品与工具",
      misc: "其他"
    },
    bagCapacity: "{{items}} 件物品 · 50 格中剩余 {{free}} 格",
    autoSortOn: "开启",
    autoSortOff: "关闭",
    exceptionForcedOff: "例外页",
    tabSortToggleLabel: "{{page}}：{{state}}",
    sortStatus: {
      eligible: "可以整理",
      disabled: "已由你关闭",
      exception: "未知物品存在期间强制关闭",
      "manual-relocation-required": "需要手动移动未知物品",
      blocked: "空间验证未通过",
      "not-applicable": "不是仓库页"
    }
  },
  auction: {
    eyebrow: "自动上架 · 模拟运行",
    title: "自动上架基础",
    unitReference: "单件参考价",
    quantity: "数量",
    adjustment: "下调百分比",
    finalPrice: "整组最终价格",
    priceUnknown: "价格未知",
    priceUnknownDetail: "系统没有自动回退到其他价格来源。请刷新或手动输入价格。",
    gold: "金币"
  },
  search: {
    eyebrow: "市场搜索 · 本地筛选",
    title: "Marketplace 物品搜索",
    description: "先从 DarkerDB 有界拉取 listing，再在本地完成高级筛选；用户根据结果自行在游戏内重建搜索。",
    resultSummary: "{{evaluated}} 件已计算候选中有 {{matches}} 件符合",
    incompleteSummary: "结果不完整：DarkerDB 报告 {{reported}} 件，仅获取 {{retrieved}} 件",
    impossibleRoll: "装备天然不可能出现的词条按未匹配处理。",
    groups: {
      identity: "物品身份",
      equipment: "类别与装备类型",
      price: "价格范围",
      attributes: "随机词条与 K-of-N"
    },
    filters: {
      itemNames: "物品名称",
      classes: "可用职业",
      rarities: "品质",
      itemTypes: "物品类别",
      slotTypes: "装备栏位",
      armorTypes: "护甲类型",
      weaponTypes: "武器类型",
      handTypes: "持握类型",
      priceBasis: "价格口径",
      minimumPrice: "最低金币",
      maximumPrice: "最高金币",
      searchWithin: "在{{label}}中搜索",
      searchPlaceholder: "筛选选项…",
      noOptions: "目录中没有符合的选项。"
    },
    price: {
      unit: "单位价格",
      total: "整组总价"
    },
    attributes: {
      help: "在自然滚动的目录中搜索并添加任意数量词条；每条规则可设置包含边界的最低值和最高值。",
      search: "搜索词条",
      available: "可选词条",
      choose: "选择一个词条",
      add: "添加词条",
      selected: "已选词条规则",
      none: "尚未选择词条，本阶段直接通过所有 listing。",
      requiredCount: "至少匹配数量（K）",
      passThrough: "没有词条规则，K 为 0。",
      kSummary: "所选 {{n}} 条词条中至少需要 {{k}} 条匹配。",
      possibleRange: "可能范围：{{minimum}}–{{maximum}}{{unit}}",
      minimum: "最低值",
      maximum: "最高值",
      percentHint: "请输入游戏显示的百分比数字：2.2% 填 2.2，不要填 22。"
    },
    savedFilters: {
      title: "已保存的筛选方案",
      help: "把当前完整草稿保存在本机；加载方案不会调用 DarkerDB。",
      name: "方案名称",
      namePlaceholder: "例如：术士施法装备",
      saved: "已保存方案",
      choose: "选择一个已保存方案",
      save: "保存当前草稿",
      load: "加载",
      delete: "删除",
      status: {
        saved: "筛选方案已保存在本机。",
        loaded: "筛选方案已载入草稿，没有发送 API 请求。",
        deleted: "已删除筛选方案。",
        error: "无法在本机保存筛选方案。"
      }
    },
    actions: {
      explicitOnly: "请求只由明确操作触发",
      editNoRequest: "编辑筛选条件不会调用 DarkerDB。",
      reset: "重置草稿",
      refresh: "刷新上次搜索",
      applyLocal: "仅在本地应用",
      search: "搜索 DarkerDB",
      cancel: "取消请求",
      remove: "移除{{label}}"
    },
    activeFilters: {
      title: "筛选草稿摘要",
      none: "尚未选择筛选条件；搜索将使用有界的宽泛查询。",
      semantic: "{{groups}} 个筛选组之间使用 AND，组内选项使用 OR；共 {{attributes}} 条词条规则，K={{k}}。",
      clear: "全部清除"
    },
    catalog: {
      "preview-fixture": "离线预览目录",
      "darkerdb-cache": "DarkerDB 缓存目录",
      "darkerdb-live": "DarkerDB 在线目录"
    },
    runtime: {
      eyebrow: "DarkerDB 只读连接",
      loadingTitle: "正在加载在线市场目录",
      loadingDetail: "本地 Companion runtime 正在读取以 canonical ID 关联的英文和简体中文目录。只有点击“搜索”后才会请求 Marketplace listing。",
      errorTitle: "在线 Marketplace runtime 不可用",
      errorDetail: "请检查本地 operator 与 API key 后重试。应用不会悄悄用预览结果冒充在线数据。",
      retry: "重试目录连接"
    },
    semantics: {
      title: "匹配规则",
      groups: "不同筛选组之间使用 AND；同一组中的多个选择使用 OR。",
      classes: "物品可被任意一个所选职业使用即可通过；无职业限制的物品也通过。"
    },
    status: {
      title: "搜索状态",
      notRun: "尚未提交 Marketplace 搜索。",
      search: "当前草稿已作为一次新的明确搜索提交。",
      refresh: "已明确刷新上次提交的搜索。",
      local: "当前草稿只应用于已有候选快照，没有调用 API。",
      previewCatalog: "此浏览器 checkpoint 使用小型脱敏目录夹具，不代表 live Marketplace 结果。",
      noSnapshot: "取得候选快照后才能使用“仅在本地应用”。",
      localRequiresSearch: "当前草稿会改变服务端候选查询，需要点击“搜索”，不能只在本地应用。"
    },
    validation: {
      number: "请输入有效的有限数字，或将字段留空。",
      nonnegative: "价格不能为负数。",
      range: "最低值不能高于最高值。",
      k: "有词条时 K 必须在 1 到词条数量之间；没有词条时 K 必须为 0。"
    },
    results: {
      eyebrow: "只读购买辅助",
      title: "符合条件的 Marketplace listings",
      completeCount: "已获取 {{retrieved}} 条 listing · 本批完整",
      incompleteCount: "已获取 {{retrieved}} / 服务端报告 {{reported}}",
      totalUnavailable: "总数未知",
      initial: {
        title: "明确点击搜索后显示符合条件的 listing",
        detail: "结果来自有界 DarkerDB Market 分页和本地筛选；Companion 不会在游戏内输入或购买。"
      },
      loading: {
        search: "正在搜索 DarkerDB…",
        refresh: "正在刷新上次搜索…",
        "load-more": "正在加载下一批有界结果…",
        detail: "加载时仍可编辑筛选草稿；已取消或被替代的响应无法覆盖新结果。"
      },
      fatal: {
        title: "Marketplace 搜索失败",
        preserved: "上一次成功结果仍会保留，但现在可能已经过期。",
        noResults: "没有发布任何结果快照；此错误不会被当作市场为空。"
      },
      auth: {
        title: "DarkerDB 身份验证失败",
        detail: "请检查运行时 API key 配置；系统不会因此判断市场为空。"
      },
      rate: {
        title: "已达到 DarkerDB 速率限制",
        detail: "部分结果快照会被保留；请等待服务限额恢复后再刷新。"
      },
      incomplete: {
        title: "当前结果不完整",
        detail: "服务端报告 {{reported}} 条，实际获取 {{retrieved}} 条；匹配数仅来自已计算快照。"
      },
      stale: {
        title: "DarkerDB 来源数据已经过期",
        detail: "{{count}} 个查询族报告陈旧数据，最久为 {{age}} 秒；这些 listing 只能作为参考。"
      },
      partial: {
        title: "部分物品族查询失败",
        detail: "{{count}} 个查询族失败；成功物品族仍会显示，并保留逐族诊断。"
      },
      localApplied: {
        title: "已应用本地筛选",
        detail: "系统只重新计算已有的不可变候选快照，没有调用 DarkerDB。"
      },
      empty: {
        catalogTitle: "目录中没有满足筛选条件的具体物品",
        catalogDetail: "canonical 目录得到权威空集合，因此没有回退发送宽泛 Market 请求。",
        localTitle: "服务端找到了候选，但没有 listing 通过本地筛选",
        localDetail: "可调整 K-of-N 或数值范围；server 候选集仍兼容时可直接在本地应用。",
        staleTitle: "没有取得可用 listing，但不能据此认定市场为空",
        staleDetail: "来源过期或结果不完整；请明确刷新后再判断。",
        authoritativeTitle: "没有符合条件的 active listing",
        authoritativeDetail: "有界查询已经完整结束，且没有 listing 通过本地筛选。"
      },
      columns: {
        item: "物品",
        rolls: "词条与匹配",
        quantity: "数量",
        unitPrice: "单位价",
        totalPrice: "总价",
        manual: "游戏内手动搜索"
      },
      matchK: "所选规则匹配 {{matched}} / {{total}}",
      details: "查看 listing 词条",
      noRolls: "没有 listing 词条",
      noRandomRolls: "没有随机词条",
      card: {
        open: "展开{{item}} listing 详情",
        itemId: "Canonical 物品 ID",
        allAttributes: "全部 listing 属性"
      },
      familyFilter: {
        title: "选择要显示的物品结果",
        showing: "正在显示 {{visible}} / {{total}} 条匹配 listing",
        all: "全选",
        none: "全部取消",
        emptyTitle: "当前没有选择任何物品结果",
        emptyDetail: "请在上方勾选一个或多个物品名称，以显示对应的结果卡片。"
      },
      attributeGroups: {
        primary: "主要属性",
        secondary: "随机词条",
        other: "其他"
      },
      manual: {
        open: "查看搜索摘要",
        item: "物品",
        rarity: "品质",
        rolls: "词条",
        maximum: "Listing 价格参考",
        unit: "每件",
        total: "总价",
        copy: "复制摘要",
        copied: "已复制",
        copyFailed: "复制失败"
      },
      fetchedAt: "快照计算时间：{{value}}",
      requestCounts: "{{live}} 次在线请求 · {{cache}} 次缓存命中",
      loadMore: "加载下一批有界结果",
      diagnostics: {
        title: "逐物品族获取诊断",
        counts: "已获取 {{retrieved}} / 报告 {{reported}}",
        complete: "完整",
        incomplete: "不完整",
        freshness: "新鲜度：{{status}} · {{age}} 秒"
      }
    }
  },
  settings: {
    open: "打开设置",
    close: "关闭设置",
    eyebrow: "全局设置",
    title: "设置",
    language: "语言",
    english: "English",
    simplifiedChinese: "简体中文",
    dataTitle: "数据与连接",
    dataDescription: "DarkerDB、数据捕获、缓存和诊断会随着真实适配器接入统一配置在这里。",
    safetyTitle: "自动化安全",
    safetyDescription: "输入速度、屏幕校准和紧急停止诊断属于全局设置，不从属于某一个工作流。"
  },
  activity: {
    title: "活动记录",
    ready: "离线开发外壳已就绪；尚未连接真实游戏适配器。",
    expand: "展开活动记录",
    collapse: "收起活动记录"
  }
} as const;
