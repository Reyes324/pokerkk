# SDD：汇总「吸收对局」+ 可逆 + 详情明细表

> 单一事实来源。本次需求、工程设计、组件设计决策都记于此，驱动实现。
> 分支 `spotify-app`。日期 2026-06。

---

## 1. 需求（Why）

当前「汇总」三个缺口：
1. 汇总后被选中的几局**仍留在「对局」**（应消失——已被吸收）。
2. 汇总只存每人总和，**没存原始单局** → 详情看不到被汇总各局明细。
3. 没有**可逆路径**：误选汇总后无法撤销重选。

**目标**：汇总「吸收」它的那几局 —— 快照进汇总、从「对局」消失；汇总可**释放**（退回对局重选）或**永久删除**；详情显示**各局明细 + 加总**。

---

## 2. 工程设计决策

### 2.1 数据结构（汇总快照原始单局，按原 roundId 作 key）
```
aggregations/<aggId>: {
  timestamp, label, roundCount,
  players: { p0:{name,total,avatarId,avatarRef?}, ... },   // 加总:列表显示 + 详情合计列
  rounds:  { "<原roundId>": { timestamp, results:{ p0:{name,pnl,buyIns,avatarId,avatarRef?} } }, ... }
}
```
- `rounds/<roundId>` 结构不变。
- **按原 roundId 作 key** 是可逆的关键：释放时原样写回（同 id/时间戳→回原位置）；一局最多属一个汇总。

### 2.2 三操作（Firebase 原子 multi-path update）
| 操作 | 行为 |
|---|---|
| **汇总** `saveAggregation` | 算 `players` 总和（复用 `calcNightSummary`）+ 快照选中 `rounds[id]`→`agg.rounds[id]`；一次 `gameRef.update`：写 `aggregations/<newId>` + 各 `rounds/<id>=null` |
| **释放** `releaseAggregation` | 一次 `gameRef.update`：`agg.rounds` 各条按原 id 写回 `rounds/<id>` + `aggregations/<aggId>=null` |
| **删除** `deleteAggregation` | `aggregations/<aggId>=null`（含快照）→ 那几局永久消失 |

- newId 用 `gameRef.child('aggregations').push().key` 预取，便于放进同一次原子 update。
- saveAggregation 保存时全局 `selectedRoundIds`+`rounds` 仍在，直接读。

### 2.3 边界 / 不变量
- **老汇总**（无 `rounds` 快照）：只能删除；详情只显示合计列；⋯ 菜单隐藏「释放」。
- 原子 update 防半成品。
- 释放用原 id 还原 → 回原位置。
- 记录按钮角标（计 `rounds`）汇总后减少 = 未汇总对局数（符合预期）。

---

## 3. 设计决策（新 UI 长在 Spotify 系统上，遵 LAMBORGHINI-DESIGN.md §2/§3）

设计原则：用 frontend-design 的克制判断 + Spotify「内容优先暗场」语言；二级/破坏性操作藏进 ⋯（不抢主）。
所有新组件用现有 token：`--bg #121212`/`--surface #181818`/`--brand #1ed760`/`--lose #f0617a`/`--ink-*`/圆角/pill。
数字 Montserrat 等宽（`--font-display` + tabular-nums），中文 Noto，不大写不宽字距。

### 3.1 详情明细表（`#agg-detail-body`）
- **结构**：行=玩家（按 total 降序），列=各局明细 + 末列「合计」。容器 `overflow-x:auto`，局多横向滚动。
- **列头**：首列空（玩家列）；各局列头「局1…局N」（按 timestamp 升序的相对序）；末列「合计」。列头 11px `--ink-3`，不大写。
- **玩家列（首列）**：`position:sticky;left:0`，头像(sm 圆)+名字，背景 `--surface` 盖住滚动内容。名字 Noto 14px `--ink-1`。
- **数值单元**：Montserrat 600 tabular-nums；正=`--win` 负=`--lose` 零/缺=`--ink-3`（缺席该局显「—」）。
- **合计列**：略强调（字重 700 或淡绿底 `rgba(30,215,96,.08)`），数值同色规则。
- 行间 hairline `rgba(255,255,255,.06)`；单元 padding 紧凑（~8px 10px）。
- **老汇总降级**：无 `rounds` → 只渲染 玩家列 + 合计列（两列表）。

### 3.2 详情头部 ⋯ 按钮（`#agg-detail-modal` header）
- 头部右上放 ⋯（水平三点，Lucide `more-horizontal`）：`btn-icon` 40×40 圆，`--ink-2`，active 提亮。
- 左侧保留 title（`agg.label`，Noto 16/700）+ subtitle（共 N 局，`--ink-3`）。

### 3.3 ⋯ 菜单 = 底部 action sheet（`#agg-action-modal`）
- 复用 modal-sheet 底部弹起；z-index 高于详情（参 `#delete-modal{z-index:200}`，用 ≥210）。
- 三项纵向：
  - **释放汇总**：`btn-secondary`（描边 pill），副标「退回对局，可重新选择」12px `--ink-3`。
  - **删除汇总**：`btn-danger`（`--lose` 描边/字，pill）。
  - **取消**：`btn-ghost`。
- 老汇总：隐藏「释放汇总」。
- 打开时记住当前 aggId（dataset 或全局）。

### 3.4 §3 对比度自检（提交前必扫新表/菜单/sheet）
新增的写死色仅限 Spotify 暗场安全值；绿底用半透（非浅底）；任何 `--brand` 底上文字用 `#000`。

---

## 4. 受影响文件
- `js/app.js`：`saveAggregation` 改、`openAggDetailModal` 改（表格+⋯）、新增 `releaseAggregation`/`openAggActionSheet`、沿用 pendingDeleteAggId 删除。复用 `calcNightSummary`/`formatPnl`/`getAvatarContent`/`escHtml`/`getAvatarBgFor`。
- `index.html`：`#agg-detail-modal` 头部加 ⋯；新增 `#agg-action-modal`；`style.css?v=` 自增。
- `css/style.css`：明细表、⋯、action sheet 样式（Spotify token + §2/§3）。
- 不动：firebase 配置、同步主体。

---

## 5. 验收（功能 + 设计）
功能：造 3 局 → 汇总（3 局消失、角标-3、进汇总 Tab）→ 详情表（3 局明细+合计正确）→ 释放（3 局原样回对局）→ 再汇总→删除（永久不回）→ 老汇总降级不报错 → 双端同步一致。
设计：§2（表内数字 Montserrat、中文 Noto、无大写）；§3（新表/菜单/sheet 无浅底漏色、绿底黑字）；整体长在 Spotify 语言里。
