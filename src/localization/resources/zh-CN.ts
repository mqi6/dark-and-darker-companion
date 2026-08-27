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
    description: "这里将显示已捕获的仓库、固定区域、排序规则和预览。",
    reservedTitle: "固定区域",
    reservedDescription: "排序器不会移动固定区域中的物品，也不会使用其中的格子。"
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
