export const zhCN = {
  app: {
    title: "Dark and Darker 游戏伴侣"
  },
  nav: {
    stash: "仓库",
    auction: "拍卖行",
    gearSearch: "装备搜索",
    settings: "设置"
  },
  status: {
    game: "游戏",
    notDetected: "未检测到",
    capture: "数据捕获",
    stopped: "已停止",
    darkerdb: "DarkerDB",
    notConfigured: "未配置",
    automation: "自动任务",
    idle: "空闲"
  },
  stash: {
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
    title: "拍卖定价基础",
    unitReference: "单件参考价",
    quantity: "数量",
    adjustment: "下调百分比",
    finalPrice: "整组最终价格",
    priceUnknown: "价格未知",
    priceUnknownDetail: "系统没有自动回退到其他价格来源。请刷新或手动输入价格。"
  },
  search: {
    title: "装备搜索基础",
    description: "K-of-N 条件会在多个装备系列的候选结果上进行本地计算。",
    resultSummary: "{{evaluated}} 件已计算候选中有 {{matches}} 件符合",
    incompleteSummary: "结果不完整：DarkerDB 报告 {{reported}} 件，仅获取 {{retrieved}} 件",
    impossibleRoll: "装备天然不可能出现的词条按未匹配处理。"
  },
  settings: {
    title: "设置",
    language: "语言",
    english: "English",
    simplifiedChinese: "简体中文"
  },
  activity: {
    title: "活动记录",
    ready: "离线开发外壳已就绪；尚未连接真实游戏适配器。"
  }
} as const;
