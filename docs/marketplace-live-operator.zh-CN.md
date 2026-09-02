# Marketplace 只读 live operator：运行与验收

日期：2026-09-01  
分支：`codex/marketplace-search-filter-analysis`

## 当前 checkpoint

Marketplace 搜索现在可以通过 localhost operator 连接真实 DarkerDB。operator 在 Node 进程中持有 API key，浏览器只获得规范化双语目录、查询结果和诊断；API key 不进入 renderer、URL、响应、日志或仓库。

普通 `npm run dev` 仍使用明确标注的脱敏 preview 数据。它适合检查布局，不代表在线结果。真实搜索使用下面的 operator。

## Windows PowerShell 运行

```powershell
npm install
npm run build
$env:DARKERDB_API_KEY = "在这里填入你的 key"
npm run marketplace:operator
```

operator 默认绑定 `127.0.0.1:4318` 并打开浏览器。若不自动打开：

```text
http://127.0.0.1:4318
```

不自动打开浏览器时：

```powershell
npm run marketplace:operator -- --open false
```

退出时在 PowerShell 按 `Ctrl+C`。最终独立客户端仍在后续 Electron 阶段；当前 localhost 页面是安全的过渡宿主。

## 24 小时目录缓存

- 首次启动需要分页获取英文/中文 Items、Attributes、Classes 和 Facets，通常约消耗 100 DarkerDB credits。
- 成功取得的规范化双语目录会写入本机磁盘并保留 24 小时；期间关闭并重新启动 operator 会直接读取磁盘缓存，通常消耗 0 个目录 credits。
- Windows 默认缓存位置：`%LOCALAPPDATA%\DarkAndDarkerCompanion\cache\marketplace-catalog-v1.json`。
- API contract 或中文 locale 配置改变时，旧缓存不会被错误复用。损坏、过期或无法读取的缓存会安全回退到 live 目录，不会被当作空目录。
- 如需明确绕过缓存：`npm run marketplace:operator -- --refresh-catalog true`。这会重新消耗完整目录请求 credits 并覆盖缓存。
- 可通过环境变量 `DARKERDB_CATALOG_CACHE_PATH` 指定其他缓存文件位置。

## 请求边界

- 启动时优先读取 24 小时磁盘目录缓存；首次、过期或明确刷新时才请求 Items、Attributes、Classes 和 Facets。这不是 listing 搜索。
- 只有点击“搜索”“刷新上次搜索”或“加载更多”才请求 `/v2/market`。
- 改过滤器、切语言、展开结果、复制游戏内搜索摘要均不请求 Market。
- 结果行不调用 Price Check。
- 默认一次搜索最多 20 个 live 请求、取回 1,000 行；加载更多每次显式增加 1,000，上限 5,000。
- Companion 不控制游戏 Marketplace，不点击购买，也不自动轮询。

## 建议验收顺序

1. 打开“市场搜索”，确认顶部 DarkerDB 状态为“已连接”，目录徽章为“DarkerDB 在线目录”或同一进程刚生成的“DarkerDB 缓存目录”。
2. 选择一个物品名和两个品质，点击搜索；检查每个具体 item ID 的 family diagnostics。
3. 选择两个物品名和一个品质；确认名称组内是 OR。
4. 清除名称，组合职业、物品类别和栏位；确认 retrieved 可以大于 evaluated，因为严格候选先从 API 拉取，剩余规则在本地完成。
5. 加两条随机词条并设 `K=N`；确认有范围的必选词条被下推。
   - 百分比词条直接输入游戏显示的百分点，例如 `2.2%` 输入 `2.2`，不要输入 `22`。
6. 把 K 改为小于 N，并点“本地应用”；确认不新增 live 请求，missing/自然不可能仅让对应规则不匹配。
7. 给当前筛选草稿命名并保存，刷新页面或重启 operator 后重新加载；确认名称、品质、价格、词条范围与 K 都恢复，且加载本身不增加 live 请求。
8. 同时搜索多个物品名称；在结果上方逐个取消/勾选物品复选框，确认只改变当前可见卡片，不改变原始匹配数，也不增加 live 请求。
9. 检查折叠卡片只突出显示物品名、品质和随机词条；展开后确认同时显示单位价和总价、完整属性及游戏内手动搜索摘要，且默认结果仍按单位价升序。
10. 若结果不完整，确认显示 matched/evaluated、retrieved/server-reported total、原因和每个 family 的 freshness。
11. 点“刷新上次搜索”，确认 live request 增加且 15 秒页面缓存被绕过。
12. 展开结果并复制“游戏内搜索摘要”，然后只在游戏中手动重建搜索。

## 本次 live 证据

2026-09-01 使用 pinned contract `2026-08-03` 完成：

- 双语目录：2,430 个具体变体、796 个物品名称族、10 个职业、58 个属性；
- 单名称双品质：Occultist Robe Rare + Epic，2 个请求取回 100，评估 100，匹配 100，server-reported 457；因 100 行上限而明确 incomplete；
- 双名称：2 个 family、2 个请求、取回/评估/匹配 100，server-reported 274；
- 职业 + 防具 + 胸部 + Rare：取回 100、实际评估 48、匹配 48，证明高级条件在本地收窄；
- K=N（Agility 与 Knowledge 均至少 1）：取回/评估/匹配 2，完整；
- K<N（上述两条至少一条）：取回/评估 92、匹配 29，完整，并命中 1 个页面缓存；
- live Market freshness 当时为 `stale`，UI 正确保留结果并明确显示 stale，没有把空结果宣称为权威；
- 最新脱敏样本通过当前 Market 与 Price Check Zod 合约。

真实响应还暴露并已修复两处合约漂移：cursor 目录的 `pagination.page/num_pages` 可以为 `null`；个别 attribute/item 本地化记录可以缺少显示文本。两者现在都按 canonical ID 安全回退，不会让整个目录失败。

## 已知限制

- DarkerDB 的 `zh-Hans` Facets 当前仍返回英文 label。筛选值始终来自 API；已知稳定 slug 只做中文显示映射，未知值回退英文。
- 全局 Attributes 不提供每件物品的 roll min/max。UI 允许用户配置范围；当一次带词条的搜索解析到不超过 24 个具体变体时，operator 会有界地读取 item detail 并缓存 possible-roll 数据。更宽的搜索仍按“缺失 roll = 单条不匹配”正确计算，但可能无法标成“自然不可能”。
- Market 是抓取数据，不保证目标 listing 仍在游戏内；stale/incomplete 必须按 UI 标识理解。
- 当前是 localhost 浏览器宿主。Electron、Stash 页 operator 集成和安装包按开发计划在 Marketplace checkpoint 后进行。

## 故障定位

- `DARKERDB_API_KEY is required`：当前 PowerShell 会话没有设置环境变量。
- `401/403`：key 或 scope 无效；UI 不会改成空市场。
- `429`：限流；UI 停止 family fan-out，并显示 rate-limit，不自动重试。
- 目录连接错误：检查终端错误后使用“重试目录连接”；不会悄悄切回 preview。
- 端口占用：使用 `npm run marketplace:operator -- --port 4319`，再打开输出的地址。
