# 汇总吸收对局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「汇总」吸收它的对局——汇总后那几局快照进汇总并从「对局」消失；汇总可释放（退回对局）或永久删除；详情显示各局明细+加总。

**Architecture:** 改 `js/app.js` 汇总相关函数 + `index.html` 加 ⋯/action-sheet + `css/style.css` 加表格/菜单样式。数据结构：汇总新增 `rounds` 字段快照原始单局（按原 roundId 作 key）。三操作用 Firebase 原子 `gameRef.update()`。**JS 同步逻辑主体、firebase 配置不动**。

**Tech Stack:** Vanilla JS + Firebase Realtime DB（compat）；无构建无测试框架 → 每任务以浏览器 巡检 验证（项目惯例）。

## Global Constraints
- 单一事实来源：`docs/specs/2026-06-aggregation-absorb.md`。
- 分支 `spotify-app`；本地 commit，**不 push**。
- 改 CSS/JS 必须把 `index.html` 里对应 `?v=` 自增破缓存（`style.css?v=` 与 `app.js?v=`）。
- 设计遵 `docs/LAMBORGHINI-DESIGN.md`：§2 数字用 `--font-display`(Montserrat)+tabular-nums、中文用 `--font`(Noto)、中文不大写不宽字距；§3 新 UI 无浅底漏色、`--brand` 底上文字用 `#000`。
- 新组件只用现有 Spotify token（`--bg/--surface/--brand/--lose/--ink-*/--n*/--rfull`）。
- 按原 roundId 作快照 key。原子 update 防半成品。一局最多属一个汇总。
- 本地预览：`cd /Users/reyes/poker-settle && python3 -m http.server 8080`，开 `http://127.0.0.1:8080/`（需 firebase-config 在位，已在位）。

## File Structure
| 文件 | 责任 |
|---|---|
| `js/app.js` | `saveAggregation` 改、`openAggDetailModal` 改、新增 `openAggActionSheet`/`releaseAggregation` + 事件接线 |
| `index.html` | `#agg-detail-modal` 头部加 ⋯；新增 `#agg-action-modal`；`?v=` 自增 |
| `css/style.css` | `.agg-table*` 明细表、`#agg-action-modal` 复用 modal-sheet、⋯ 按钮 |

---

## Task 1: 汇总吸收（saveAggregation 快照 + 原子删除选中局）

**Files:** Modify `js/app.js`（`saveAggregation` ~1495-1519）

**Interfaces:**
- Consumes: 全局 `selectedRoundIds:Set`、`rounds:{}`、`players:[]`、`calcNightSummary`、`formatDateWeekday`、`gameRef`。
- Produces: `aggregations/<id>` 新增 `rounds:{<roundId>:{timestamp,results}}` 字段；写 agg 同时删 `rounds/<id>`。

- [ ] **Step 1: 用新实现替换 `saveAggregation`**

把现有 `saveAggregation` 整个函数替换为：
```javascript
function saveAggregation() {
    const modal = document.getElementById('summary-result-modal');
    const summary = JSON.parse(modal.dataset.summaryJson || 'null');
    if (!summary) return;
    const ids = [...selectedRoundIds].filter(id => rounds[id]);
    if (ids.length === 0) return;
    const now = new Date();
    const playerData = {};
    summary.players.forEach((p, i) => {
        const live = players.find(lp => lp.name === p.name);
        const entry = { name: p.name, total: p.total, avatarId: live ? (live.avatarId || 0) : 0 };
        if (live && live.avatarRef) entry.avatarRef = live.avatarRef;
        playerData['p' + i] = entry;
    });
    const roundsSnapshot = {};
    ids.forEach(id => { roundsSnapshot[id] = rounds[id]; });
    const aggId = gameRef.child('aggregations').push().key;
    const updates = {};
    updates['aggregations/' + aggId] = {
        timestamp: now.getTime(),
        label: formatDateWeekday(now),
        roundCount: summary.roundCount,
        players: playerData,
        rounds: roundsSnapshot
    };
    ids.forEach(id => { updates['rounds/' + id] = null; });
    gameRef.update(updates, err => { if (err) showToast('汇总失败，请检查网络'); });
    closeModal('summary-result-modal', () => {
        isSelectMode = false;
        selectedRoundIds = new Set();
        renderRecordsPage();
        showToast('汇总已保存');
    });
}
```

- [ ] **Step 2: 破缓存**

`index.html`：把 `js/app.js?v=22` 改 `?v=23`。

- [ ] **Step 3: 浏览器验证**

起服务，开 `http://127.0.0.1:8080/` 强刷。造 ≥3 局对局（加玩家→录筹码→结束本局，重复）。进记录→对局 Tab→「选择」→勾 3 局→「汇总」→确认。
**Expected:**
- 汇总出现在「汇总」Tab。
- 被汇总的 3 局**从「对局」Tab 消失**。
- 记录按钮上的对局数角标 **减少 3**。
- 控制台无报错。

- [ ] **Step 4: Commit**
```bash
cd /Users/reyes/poker-settle
git add js/app.js index.html
git commit -m "feat(agg): 汇总吸收对局——快照原始单局+原子删除选中局

汇总时把选中局按原 roundId 快照进 agg.rounds,同一次 gameRef.update 写 agg+删 rounds/<id>。
那几局从对局消失、角标减少。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 详情明细表（openAggDetailModal 渲染表格 + 表格 CSS）

**Files:** Modify `js/app.js`（`openAggDetailModal` ~1522-1539）、`css/style.css`、`index.html`(?v)

**Interfaces:**
- Consumes: `aggregations`、`players`、`formatPnl`、`getAvatarContent`、`getAvatarBgFor`、`escHtml`、`openModal`。
- Produces: `#agg-detail-modal` 设 `dataset.aggId`（Task 3 用）；明细表 DOM（`.agg-table`）。

- [ ] **Step 1: 用新实现替换 `openAggDetailModal`**

把现有 `openAggDetailModal` 整个函数替换为：
```javascript
function openAggDetailModal(aggId) {
    const agg = aggregations[aggId];
    if (!agg) return;
    document.getElementById('agg-detail-modal').dataset.aggId = aggId;
    document.getElementById('agg-detail-title').textContent = agg.label || '汇总';
    document.getElementById('agg-detail-subtitle').textContent = '共 ' + (agg.roundCount || 0) + ' 局';
    const totals = agg.players ? Object.values(agg.players).slice().sort((a, b) => b.total - a.total) : [];
    const nameCell = (p) => {
        const live = players.find(lp => lp.name === p.name) || p;
        return '<td class="agg-name-cell"><div class="avatar-circle sm" style="background:' +
            getAvatarBgFor(live) + '">' + getAvatarContent(live) + '</div><span>' + escHtml(p.name) + '</span></td>';
    };
    const pnlCls = (v) => v > 0 ? 'win' : v < 0 ? 'lose' : 'zero';
    const hasSnapshot = agg.rounds && Object.keys(agg.rounds).length > 0;
    let html;
    if (!hasSnapshot) {
        // 老汇总降级:玩家 + 合计 两列
        html = '<div class="agg-table-wrap"><table class="agg-table"><thead><tr>' +
            '<th class="agg-name-cell">玩家</th><th class="agg-col total">合计</th></tr></thead><tbody>' +
            totals.map(p => '<tr>' + nameCell(p) +
                '<td class="agg-cell total ' + pnlCls(p.total) + '">' + formatPnl(p.total) + '</td></tr>').join('') +
            '</tbody></table></div>';
    } else {
        const roundEntries = Object.entries(agg.rounds).sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
        const roundMaps = roundEntries.map(([, r]) => {
            const m = {};
            if (r.results) Object.values(r.results).forEach(x => { m[x.name] = x.pnl; });
            return m;
        });
        const headCols = roundEntries.map((_, i) => '<th class="agg-col">局' + (i + 1) + '</th>').join('');
        const rowsHtml = totals.map(p => {
            const cells = roundMaps.map(m => {
                if (m[p.name] == null) return '<td class="agg-cell zero">—</td>';
                return '<td class="agg-cell ' + pnlCls(m[p.name]) + '">' + formatPnl(m[p.name]) + '</td>';
            }).join('');
            return '<tr>' + nameCell(p) + cells +
                '<td class="agg-cell total ' + pnlCls(p.total) + '">' + formatPnl(p.total) + '</td></tr>';
        }).join('');
        html = '<div class="agg-table-wrap"><table class="agg-table"><thead><tr>' +
            '<th class="agg-name-cell">玩家</th>' + headCols + '<th class="agg-col total">合计</th></tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody></table></div>';
    }
    document.getElementById('agg-detail-body').innerHTML = html;
    openModal('agg-detail-modal');
}
```

- [ ] **Step 2: 加表格 CSS**

在 `css/style.css` 末尾追加（Spotify 暗场 + §2 数字 Montserrat + §3 安全色）：
```css
/* ─── 汇总明细表 ─── */
.agg-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.agg-table-wrap::-webkit-scrollbar{display:none}
.agg-table{border-collapse:collapse;width:100%;font-size:13px}
.agg-table th,.agg-table td{padding:9px 10px;white-space:nowrap;text-align:right}
.agg-table thead th{
  font-family:var(--font);font-size:11px;font-weight:500;color:var(--ink-3);
  border-bottom:1px solid var(--n20);position:sticky;top:0;background:var(--surface);
}
.agg-table tbody tr+tr td{border-top:1px solid rgba(255,255,255,.06)}
.agg-name-cell{
  text-align:left;position:sticky;left:0;background:var(--surface);z-index:1;
  display:flex;align-items:center;gap:8px;min-width:120px;
}
thead .agg-name-cell{display:table-cell}
.agg-name-cell .avatar-circle.sm{width:28px;height:28px;flex-shrink:0}
.agg-name-cell span{font-family:var(--font);font-size:14px;color:var(--ink-1);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:84px}
.agg-cell{font-family:var(--font-display);font-weight:600;font-variant-numeric:tabular-nums}
.agg-col.total,.agg-cell.total{background:rgba(30,215,96,.08);font-weight:700}
.agg-cell.win{color:var(--win)} .agg-cell.lose{color:var(--lose)} .agg-cell.zero{color:var(--ink-3)}
```
> 注：`.agg-name-cell` 在 `thead` 里是 `<th>`（table-cell），在 `tbody` 里我用 flex 对齐头像+名字——上面 `thead .agg-name-cell{display:table-cell}` 覆盖回表格单元，避免表头错位。

- [ ] **Step 3: 破缓存**

`index.html`：`style.css?v=` 自增、`app.js?v=23`→`?v=24`。

- [ ] **Step 4: 浏览器验证**

强刷。进「汇总」Tab→点开 Task 1 造的那个汇总。
**Expected:**
- body 是**紧凑表格**：行=玩家（按合计降序），列=局1/局2/局3 + 合计。
- 数字 Montserrat 等宽对齐；正绿 `#1ed760` / 负粉红 `#f0617a` / 缺该局显「—」灰。
- 合计列淡绿底强调，数值=各局加总（手算核对一致）。
- 玩家名列随横向滚动**固定在左**（局多时）。
- 中文（玩家名/表头）是 Noto、无大写。

- [ ] **Step 5: Commit**
```bash
git add js/app.js css/style.css index.html
git commit -m "feat(agg): 汇总详情明细表(各局+合计) + Spotify 暗场表格样式

行=玩家列=各局明细+合计;Montserrat 等宽数字、绿/粉红/灰语义色、合计列淡绿强调、
玩家名 sticky-left。老汇总(无快照)降级为 玩家+合计 两列。遵 §2/§3。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: ⋯ 菜单 + 释放/删除（detail 头部 ⋯ + #agg-action-modal + releaseAggregation）

**Files:** Modify `index.html`、`js/app.js`、`css/style.css`

**Interfaces:**
- Consumes: `aggregations`、`gameRef`、`openModal`/`closeModal`、`showToast`、`showAggDeleteConfirm`（现有，设 `pendingDeleteAggId` 并开 delete-modal）。
- Produces: `#agg-action-modal`（dataset.aggId）；`openAggActionSheet()`/`releaseAggregation()`。

- [ ] **Step 1: detail 头部加 ⋯ 按钮**

`index.html` 的 `#agg-detail-modal` 头部，在关闭按钮 `#btn-close-agg-detail` **之前**插入 ⋯（Lucide more-horizontal）：
```html
                <button class="btn-icon" id="btn-agg-more" aria-label="更多">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                </button>
```
> 头部那个 `<button class="btn-icon" id="btn-close-agg-detail" ...>` 保持不变，让 ⋯ 在它左边。把这两个按钮用一个 `<div style="display:flex;gap:2px">` 包起来（替换原来只有关闭按钮的位置），即：
```html
            <div style="display:flex;gap:2px">
                <button class="btn-icon" id="btn-agg-more" aria-label="更多">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                </button>
                <button class="btn-icon" id="btn-close-agg-detail" aria-label="关闭">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
```

- [ ] **Step 2: 新增 `#agg-action-modal`**

`index.html` 在 `#avatar-action-modal` 之后插入：
```html
<!-- ── Aggregation action sheet（⋯ 菜单：释放/删除） ── -->
<div id="agg-action-modal" class="modal-overlay hidden">
    <div class="modal-sheet">
        <div class="modal-handle"></div>
        <button class="btn btn-secondary" id="btn-agg-release" style="margin-bottom:8px;flex-direction:column;height:auto;padding:10px">
            <span>释放汇总</span>
            <span style="font-size:12px;color:var(--ink-3);font-weight:400">退回对局，可重新选择</span>
        </button>
        <button class="btn btn-danger" id="btn-agg-delete" style="margin-bottom:8px">删除汇总</button>
        <button class="btn btn-ghost" id="btn-agg-action-cancel">取消</button>
    </div>
</div>
```

- [ ] **Step 3: 加 JS 函数 + 接线**

在 `js/app.js` 的 `openAggDetailModal` 之后加：
```javascript
function openAggActionSheet() {
    const aggId = document.getElementById('agg-detail-modal').dataset.aggId;
    if (!aggId) return;
    const agg = aggregations[aggId];
    const hasSnapshot = agg && agg.rounds && Object.keys(agg.rounds).length > 0;
    document.getElementById('agg-action-modal').dataset.aggId = aggId;
    document.getElementById('btn-agg-release').style.display = hasSnapshot ? '' : 'none';
    openModal('agg-action-modal');
}
function releaseAggregation() {
    const aggId = document.getElementById('agg-action-modal').dataset.aggId;
    const agg = aggregations[aggId];
    if (!agg || !agg.rounds) return;
    const updates = {};
    Object.entries(agg.rounds).forEach(([rid, r]) => { updates['rounds/' + rid] = r; });
    updates['aggregations/' + aggId] = null;
    gameRef.update(updates, err => { if (err) showToast('释放失败，请检查网络'); });
    closeModal('agg-action-modal', () => {
        closeModal('agg-detail-modal');
        showToast('已释放，对局已退回');
    });
}
```

在 `js/app.js` 事件接线区（`btn-delete-confirm` 附近）加：
```javascript
document.getElementById('btn-agg-more').addEventListener('click', openAggActionSheet);
document.getElementById('btn-agg-release').addEventListener('click', releaseAggregation);
document.getElementById('btn-agg-delete').addEventListener('click', () => {
    const aggId = document.getElementById('agg-action-modal').dataset.aggId;
    closeModal('agg-action-modal', () => { if (aggId) showAggDeleteConfirm(aggId); });
});
document.getElementById('btn-agg-action-cancel').addEventListener('click', () => closeModal('agg-action-modal'));
document.getElementById('agg-action-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('agg-action-modal'); });
```

- [ ] **Step 4: action sheet z-index 高于详情**

`css/style.css` 末尾加（详情是普通 modal z=100，让 sheet 盖住它）：
```css
#agg-action-modal{z-index:210}
```

- [ ] **Step 5: 破缓存**

`index.html`：`style.css?v=` 自增、`app.js?v=24`→`?v=25`。

- [ ] **Step 6: 浏览器验证**

强刷。点开一个**有快照**的汇总（Task 1 造的）→ 点右上 ⋯。
**Expected:**
- 底部弹出 sheet：「释放汇总（退回对局，可重新选择）」+「删除汇总」(粉红) +「取消」。
- 点**释放** → 那几局**原样回到「对局」Tab**（位置/时间一致），汇总消失，toast「已释放」。
- 重新汇总 → ⋯ → **删除** → 走「确认删除」弹窗 → 确认 → 汇总消失、那几局**不**回来。
- ⋯ 菜单/sheet 在暗场可读、绿/粉红正常、无浅底漏色。

- [ ] **Step 7: Commit**
```bash
git add index.html js/app.js css/style.css
git commit -m "feat(agg): ⋯ 菜单 + 释放(退回对局)/删除(永久)

详情头部 ⋯ 开底部 action sheet:释放=原子写回 rounds/+删 agg(原样退回对局);
删除=走现有确认弹窗(永久)。老汇总无快照时隐藏释放。⋯ 二级菜单(Spotify 习惯)。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 老数据降级验证 + §3 对比度扫 + 总验收

**Files:** 无新增改动（验证 + 必要的小修）

- [ ] **Step 1: §3 对比度自检（新 UI）**
```bash
cd /Users/reyes/poker-settle
node -e "const c=require('fs').readFileSync('css/style.css','utf8'); const o=(c.match(/{/g)||[]).length,x=(c.match(/}/g)||[]).length; console.log('braces',o===x?'OK':'MISMATCH')"
grep -nE "agg-(table|cell|col|name)|#agg-action" css/style.css | grep -iE "#fff|#f[0-9a-f]{5}|background:#[ef]" || echo "✓ 新表/菜单无浅底漏色"
```
Expected: braces OK；无浅底漏色（绿底用 rgba 半透 = 安全）。

- [ ] **Step 2: 老汇总降级验证**

若有旧的（无 `rounds` 快照的）汇总：点开 → 详情**只显示 玩家+合计 两列**、不报错；⋯ → sheet **无「释放」**、只「删除」「取消」。
（若无老数据，可临时在 firebase 控制台造一条无 rounds 的 aggregation 验证，或跳过并记录。）

- [ ] **Step 3: 端到端总验收（对照 spec §5）**

造 3 局 → 汇总（3 局消失/角标-3/进汇总）→ 详情表（明细+合计正确）→ ⋯释放（原样回对局）→ 再汇总 → ⋯删除（永久不回）→ 双设备同步一致。

- [ ] **Step 4: Commit（仅当有小修）**
```bash
git add -A
git commit -m "chore(agg): 老数据降级 + §3 对比度 + 总验收通过"
```

---

## Self-Review
- **Spec 覆盖**：数据结构(T1 快照字段)、汇总吸收(T1)、详情明细表(T2)、释放(T3)、删除(T3 复用确认)、老数据降级(T2 两列 + T3 隐藏释放)、§2(T2 Montserrat/Noto)、§3(T4 扫)、原子 update(T1/T3 `gameRef.update`)、边界(角标/一局一汇总=吸收自动保证)——逐条有任务。
- **占位符**：无 TBD；每步含可粘贴完整代码。
- **类型/命名一致**：`agg.rounds` 快照(T1 写)↔ T2/T3 读；`dataset.aggId`(T2 设)↔ T3 读；`showAggDeleteConfirm`(现有)复用；`releaseAggregation`/`openAggActionSheet` 命名前后一致。
