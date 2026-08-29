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
    chooseExceptionPage: "请选择一个矩形仓库页作为例外页。游戏伴侣永远不会整理该页面。",
    moveToExceptionPage: "请将它们手动移动到{{page}}。游戏伴侣不会移动这些物品，也不会整理例外页。",
    refreshAfterManualMove: "移动完成后，请重新选择当前角色，以刷新完整仓库状态。",
    exceptionConfigurationTitle: "例外页不可用",
    "exception-page-not-found": "当前角色的仓库中没有所选例外页。",
    "exception-page-not-rectangular": "所选目标不是经过验证的矩形仓库页。"
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
