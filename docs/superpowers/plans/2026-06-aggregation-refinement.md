# 汇总视图统一 + 成绩单设计 + 导出图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 汇总「预览」与「详情」内容统一为同一份各局明细表（成绩单设计语言）；按钮改名「汇总」；修表头对齐；导出图做成真的汇总成绩单。

**Architecture:** `js/app.js` 新增共享渲染器 `renderAggView` 供预览/详情复用；`doAggregate` 预览时冻结快照（决策A）；新增离屏 `#agg-export-card` + `generateAggImage` 用 html2canvas 出真图。CSS 加成绩单渐变头/领先高亮/对齐修复/导出卡样式。**firebase 同步主体、释放/删除逻辑不动**。

**Tech Stack:** Vanilla JS + Firebase + html2canvas 1.4.1；无构建无测试框架 → 每任务浏览器 巡检（项目惯例）。

## Global Constraints
- 单一事实来源：`docs/specs/2026-06-aggregation-absorb.md`（§6 本批决策）。
- 分支 `spotify-app`；本地 commit，**不 push**。
- 改 CSS/JS 必把 `index.html` 对应 `?v=` 自增（`style.css?v=` 与 `app.js?v=`，当前 app.js?v=26、style.css?v=32）。
- §2：数字用 `--font-display`(Montserrat)+tabular-nums；中文用 `--font`(Noto)，不大写不宽字距。
- §3：新 UI 无浅底漏色；`--brand`(#1ed760) 底上文字用黑；导出卡值全写死、暗场安全。
- 导出卡 html2canvas 安全：**禁** `var(--*)`、`clip-path`、`backdrop-filter`；头像用 `border-radius` 圆形。
- 决策A：预览时把 `summaryJson`+`roundsSnapshot` 同刻冻结进 `#summary-result-modal` dataset；`saveAggregation` 只用冻结快照。无静默：每失败/边界给 toast。
- 成绩单渐变头颜色：`linear-gradient(160deg,#1f6b3a 0%,#18341f 38%,#181818 100%)`（复用结算导出头）。
- 本地预览：`cd /Users/reyes/poker-settle && python3 -m http.server 8080` → `http://127.0.0.1:8080/`（firebase 已配）。

## File Structure
| 文件 | 责任 |
|---|---|
| `js/app.js` | `renderAggView`(新)、`doAggregate`/`saveAggregation`/`openAggDetailModal`(重写)、`buildAggExportCard`/`generateAggImage`(新)、`btn-export-summary` 接线 |
| `index.html` | 改名 2 处；`#agg-export-card` 离屏卡；export-modal 加 agg 模式隐藏存档钮；`?v=` 自增 |
| `css/style.css` | `.agg-view-hero` 渐变头、`.agg-name-inner` 对齐、`.agg-table tr.lead` 领先高亮、`#agg-export-card` 成绩单样式 |

---

## Task 1: 改名 + 决策A(冻结快照) + 对齐修复

**Files:** Modify `js/app.js`、`index.html`、`css/style.css`

**Interfaces:**
- Produces: `#summary-result-modal` dataset 含 `summaryJson` + `roundsSnapshot`（Task 2/3 用）；`.agg-name-cell`/`.agg-name-inner` 对齐结构（Task 2 沿用）。

- [ ] **Step 1: 改名（index.html）**

把 `<button class="btn btn-primary" id="btn-do-aggregate" disabled>加总</button>` 的 `加总` 改为 `汇总`。
把 `#summary-result-modal` 里 `<div style="font-size:16px;font-weight:500">加总结果</div>` 的 `加总结果` 改为 `汇总预览`。

- [ ] **Step 2: doAggregate 冻结快照 + 无静默守卫（js/app.js）**

把现有 `doAggregate` 函数整体替换为（保留预览 body 渲染不变，仅加守卫 toast + 冻结 roundsSnapshot）：
```javascript
function doAggregate() {
    if (selectedRoundIds.size < 2) { showToast('请至少选择 2 局'); return; }
    const selectedEntries = Object.entries(rounds).filter(([id]) => selectedRoundIds.has(id));
    if (selectedEntries.length < 2) { showToast('所选对局已不存在，请刷新重试'); return; }
    const selected = selectedEntries.map(([, r]) => r);
    const summary = calcNightSummary(selected);
    const titleByName = {};
    calcNightTitles(selected).forEach(t => { titleByName[t.name] = t; });
    document.getElementById('summary-result-info').textContent = '共 ' + summary.roundCount + ' 局';
    document.getElementById('summary-result-body').innerHTML = summary.players.map(p => {
        const cls = p.total > 0 ? 'positive' : p.total < 0 ? 'negative' : 'neutral';
        const live = players.find(lp => lp.name === p.name) || p;
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--n10)">' +
            '<div style="display:flex;align-items:center;gap:8px;min-width:0">' +
            '<div class="avatar-circle sm" style="background:' + getAvatarBgFor(live) + ';flex-shrink:0">' + getAvatarContent(live) + '</div>' +
            '<span class="agg-name-wrap"><span class="agg-name">' + escHtml(p.name) + '</span>' + renderTitleBadge(titleByName[p.name]) + '</span>' +
            '</div>' +
            '<span class="pnl-inline ' + cls + '">' + formatPnl(p.total) + ' 分</span></div>';
    }).join('');
    const roundsSnapshot = {};
    selectedEntries.forEach(([id, r]) => { roundsSnapshot[id] = r; });
    const modal = document.getElementById('summary-result-modal');
    modal.dataset.summaryJson = JSON.stringify(summary);
    modal.dataset.roundsSnapshot = JSON.stringify(roundsSnapshot);
    openModal('summary-result-modal');
}
```
> 注：此步预览 body 仍是旧的简单列表；Task 2 会把它换成共享渲染器。这一步只先把决策A的冻结接上，保证后续可用。

- [ ] **Step 3: saveAggregation 用冻结快照（js/app.js）**

把现有 `saveAggregation` 函数整体替换为：
```javascript
function saveAggregation() {
    const modal = document.getElementById('summary-result-modal');
    const summary = JSON.parse(modal.dataset.summaryJson || 'null');
    const roundsSnapshot = JSON.parse(modal.dataset.roundsSnapshot || 'null');
    if (!summary || !roundsSnapshot || Object.keys(roundsSnapshot).length === 0) {
        showToast('汇总数据异常，请重试');
        closeModal('summary-result-modal', () => { isSelectMode = false; selectedRoundIds = new Set(); renderRecordsPage(); });
        return;
    }
    const now = new Date();
    const playerData = {};
    summary.players.forEach((p, i) => {
        const live = players.find(lp => lp.name === p.name);
        const entry = { name: p.name, total: p.total, avatarId: live ? (live.avatarId || 0) : 0 };
        if (live && live.avatarRef) entry.avatarRef = live.avatarRef;
        playerData['p' + i] = entry;
    });
    const aggId = gameRef.child('aggregations').push().key;
    const updates = {};
    updates['aggregations/' + aggId] = {
        timestamp: now.getTime(),
        label: formatDateWeekday(now),
        roundCount: summary.roundCount,
        players: playerData,
        rounds: roundsSnapshot
    };
    Object.keys(roundsSnapshot).forEach(id => { updates['rounds/' + id] = null; });
    gameRef.update(updates, err => { if (err) showToast('汇总失败，请检查网络'); });
    closeModal('summary-result-modal', () => {
        isSelectMode = false;
        selectedRoundIds = new Set();
        renderRecordsPage();
        showToast('汇总已保存');
    });
}
```

- [ ] **Step 4: 对齐修复（js/app.js + css）**

在 `openAggDetailModal` 里，把 `nameCell` 改为内层 flex（头像+名字包进 `.agg-name-inner`）：
找到
```javascript
        return '<td class="agg-name-cell"><div class="avatar-circle sm" style="background:' +
            getAvatarBgFor(live) + '">' + getAvatarContent(live) + '</div><span>' + escHtml(p.name) + '</span></td>';
```
替换为
```javascript
        return '<td class="agg-name-cell"><div class="agg-name-inner"><div class="avatar-circle sm" style="background:' +
            getAvatarBgFor(live) + '">' + getAvatarContent(live) + '</div><span>' + escHtml(p.name) + '</span></div></td>';
```
`css/style.css` 里把现有 `.agg-name-cell{...}` 规则与 `thead .agg-name-cell{display:table-cell}` 替换为：
```css
.agg-name-cell{
  text-align:left;position:sticky;left:0;background:var(--surface);z-index:1;
  min-width:120px;
}
.agg-name-inner{display:flex;align-items:center;gap:8px}
.agg-name-cell .avatar-circle.sm{width:28px;height:28px;flex-shrink:0}
.agg-name-cell span{font-family:var(--font);font-size:14px;color:var(--ink-1);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:84px}
```
> 关键：`.agg-name-cell` 不再 `display:flex`（恢复 table-cell 默认），表头/内容同为单元格 → 列宽一致、对齐。

- [ ] **Step 5: 破缓存（index.html）**

`app.js?v=26`→`?v=27`；`style.css?v=32`→`?v=33`。

- [ ] **Step 6: 浏览器验证**

起服务强刷。① 底部按钮显示「汇总」。② 造 ≥2 局，选中→点「汇总」→预览标题「汇总预览」、能弹出（body 暂仍简单列表，正常）。③ 保存→进汇总→详情→表头「玩家」与下面头像名字**对齐**（不再错位）。④ `node --check js/app.js` 干净、css 花括号配平。

- [ ] **Step 7: Commit**
```bash
cd /Users/reyes/poker-settle
git add js/app.js index.html css/style.css
git commit -m "feat(agg): 改名汇总 + 决策A冻结快照(无静默) + 明细表对齐修复

按钮加总→汇总、标题加总结果→汇总预览;doAggregate 预览时冻结 roundsSnapshot、
saveAggregation 只用冻结快照(合计=明细永远一致)、各边界 toast;
玩家列改 table-cell + 内层 agg-name-inner flex,修表头/内容错位。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 共享成绩单渲染器（预览 = 详情）

**Files:** Modify `js/app.js`、`css/style.css`、`index.html`(?v)

**Interfaces:**
- Consumes: 决策A 的 `roundsSnapshot`（Task 1）；`.agg-table`/`.agg-name-inner`（Task 1）。
- Produces: `renderAggView(opts)`（预览/详情/导出共用的数据→HTML）。

- [ ] **Step 1: 新增 `renderAggView`（js/app.js）**

在 `openAggDetailModal` 之前新增：
```javascript
// 共享:汇总视图(成绩单语言) —— 预览与详情同款。opts:{rounds, totals, roundCount}
function renderAggView(opts) {
    const totals = opts.totals;
    const roundsObj = opts.rounds || {};
    const hasSnapshot = Object.keys(roundsObj).length > 0;
    const memberCount = totals.length;
    const leaderName = totals.length ? totals[0].name : '';
    const pnlCls = (v) => v > 0 ? 'win' : v < 0 ? 'lose' : 'zero';
    const nameCell = (p, isLead) => {
        const live = players.find(lp => lp.name === p.name) || p;
        const champ = isLead ? '<span class="agg-champ">🏆</span>' : '';
        return '<td class="agg-name-cell"><div class="agg-name-inner"><div class="avatar-circle sm" style="background:' +
            getAvatarBgFor(live) + '">' + getAvatarContent(live) + '</div><span>' + escHtml(p.name) + '</span>' + champ + '</div></td>';
    };
    let table;
    if (!hasSnapshot) {
        table = '<table class="agg-table"><thead><tr><th class="agg-name-cell">玩家</th><th class="agg-col total">合计</th></tr></thead><tbody>' +
            totals.map((p, i) => '<tr' + (i === 0 ? ' class="lead"' : '') + '>' + nameCell(p, i === 0) +
                '<td class="agg-cell total ' + pnlCls(p.total) + '">' + formatPnl(p.total) + '</td></tr>').join('') +
            '</tbody></table>';
    } else {
        const roundEntries = Object.entries(roundsObj).sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
        const roundMaps = roundEntries.map(([, r]) => {
            const m = {};
            if (r.results) Object.values(r.results).forEach(x => { m[x.name] = x.pnl; });
            return m;
        });
        const headCols = roundEntries.map((_, i) => '<th class="agg-col">局' + (i + 1) + '</th>').join('');
        const rowsHtml = totals.map((p, i) => {
            const cells = roundMaps.map(m => {
                if (m[p.name] == null) return '<td class="agg-cell zero">—</td>';
                return '<td class="agg-cell ' + pnlCls(m[p.name]) + '">' + formatPnl(m[p.name]) + '</td>';
            }).join('');
            return '<tr' + (i === 0 ? ' class="lead"' : '') + '>' + nameCell(p, i === 0) + cells +
                '<td class="agg-cell total ' + pnlCls(p.total) + '">' + formatPnl(p.total) + '</td></tr>';
        }).join('');
        table = '<table class="agg-table"><thead><tr><th class="agg-name-cell">玩家</th>' + headCols +
            '<th class="agg-col total">合计</th></tr></thead><tbody>' + rowsHtml + '</tbody></table>';
    }
    return '<div class="agg-view">' +
        '<div class="agg-view-hero">' +
        '<div class="agg-view-eyebrow">汇总 · 共 ' + (opts.roundCount || 0) + ' 局 · ' + memberCount + ' 人</div>' +
        '<div class="agg-view-title">' + (leaderName ? '累计领先 · ' + escHtml(leaderName) : '本晚汇总') + '</div>' +
        '</div>' +
        '<div class="agg-table-wrap">' + table + '</div></div>';
}
```

- [ ] **Step 2: 预览改用 renderAggView（js/app.js）**

在 `doAggregate` 里，把第 1 任务那段 `summary.players.map(...)` 渲染 `summary-result-body` 的整块，替换为调用共享渲染器：
找到 `doAggregate` 中
```javascript
    document.getElementById('summary-result-info').textContent = '共 ' + summary.roundCount + ' 局';
    document.getElementById('summary-result-body').innerHTML = summary.players.map(p => {
```
直到该 `.join('');` 结束的整段，替换为：
```javascript
    document.getElementById('summary-result-info').textContent = '共 ' + summary.roundCount + ' 局';
    const previewRounds = {};
    selectedEntries.forEach(([id, r]) => { previewRounds[id] = r; });
    document.getElementById('summary-result-body').innerHTML = renderAggView({
        rounds: previewRounds, totals: summary.players, roundCount: summary.roundCount
    });
```
> `summary.players` 已是按 total 降序（calcNightSummary 返回降序）。`totals[0]` = 领先者。

- [ ] **Step 3: 详情改用 renderAggView（js/app.js）**

把 `openAggDetailModal` 整体替换为（瘦身，复用渲染器；保留 dataset.aggId 给 ⋯ 菜单）：
```javascript
function openAggDetailModal(aggId) {
    const agg = aggregations[aggId];
    if (!agg) return;
    document.getElementById('agg-detail-modal').dataset.aggId = aggId;
    document.getElementById('agg-detail-title').textContent = agg.label || '汇总';
    document.getElementById('agg-detail-subtitle').textContent = '共 ' + (agg.roundCount || 0) + ' 局';
    const totals = agg.players ? Object.values(agg.players).slice().sort((a, b) => b.total - a.total) : [];
    document.getElementById('agg-detail-body').innerHTML = renderAggView({
        rounds: agg.rounds || {}, totals: totals, roundCount: agg.roundCount || 0
    });
    openModal('agg-detail-modal');
}
```

- [ ] **Step 4: 成绩单头 + 领先高亮 CSS（css/style.css）**

末尾追加：
```css
/* ─── 汇总视图:成绩单头 + 领先高亮 ─── */
.agg-view-hero{
  margin:-4px -4px 14px;padding:18px 18px 16px;
  background:linear-gradient(160deg,#1f6b3a 0%,#18341f 38%,#181818 100%);
  border-radius:10px;
}
.agg-view-eyebrow{font-size:11px;font-weight:600;letter-spacing:.02em;color:rgba(255,255,255,.7);margin-bottom:6px}
.agg-view-title{font-family:var(--font);font-size:18px;font-weight:800;color:#fff}
.agg-table tr.lead .agg-name-cell span{color:var(--win)}
.agg-table tr.lead .agg-cell.total{color:var(--win)}
.agg-champ{margin-left:2px;font-size:12px}
```

- [ ] **Step 5: 破缓存** `app.js?v=27`→`?v=28`；`style.css?v=33`→`?v=34`。

- [ ] **Step 6: 浏览器验证**

强刷。① 选中 ≥2 局→点「汇总」→预览里现在是**各局明细表 + 合计**（不再是简单列表），上方绿色渐变头「汇总·共N局·M人 / 累计领先·X」，领先者绿名 + 🏆。② 保存→详情→**内容与预览一致**（同表 + 同渐变头 + 同高亮）。③ 老汇总降级两列、渐变头照常、不报错。④ §2 数字 Montserrat/中文 Noto；§3 无浅底。

- [ ] **Step 7: Commit**
```bash
git add js/app.js css/style.css index.html
git commit -m "feat(agg): 预览=详情 共享成绩单渲染器(renderAggView)

renderAggView 统一预览/详情:绿色渐变头(汇总·共N局·M人/累计领先) + 各局明细表 +
领先者绿名🏆高亮。doAggregate 预览与 openAggDetailModal 同款渲染。老汇总降级两列。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 导出真图（汇总成绩单）

**Files:** Modify `index.html`、`js/app.js`、`css/style.css`

**Interfaces:**
- Consumes: 冻结的 `summaryJson`（Task 1）；`html2canvas`、`#export-modal`/`#export-image`（结算复用）。
- Produces: `#agg-export-card` 离屏卡；`generateAggImage()` 接 `#btn-export-summary`。

- [ ] **Step 1: 离屏汇总成绩单卡（index.html）**

在 `#export-capture-zone` 内、`#export-card` 之后（仍在 capture-zone 里）加：
```html
    <div id="agg-export-card">
        <div class="aggx-header">
            <div class="aggx-eyebrow" id="aggx-eyebrow">汇总成绩单</div>
            <div class="aggx-title" id="aggx-title">本晚汇总</div>
        </div>
        <div class="aggx-list" id="aggx-list"></div>
        <div class="aggx-footer" id="aggx-footer"></div>
    </div>
```

- [ ] **Step 2: export-modal 加 agg 模式（隐藏存档钮）（index.html）**

`#export-modal` 的「确认存档」按钮 `#btn-confirm-archive` 加一个可隐藏标记——不改其结构，只在 JS 里按模式 toggle。无需改 HTML（Step 3 的 JS 控制 `style.display`）。

- [ ] **Step 3: generateAggImage + 接线（js/app.js）**

在 `generateImage`（结算）之后新增：
```javascript
function buildAggExportCard() {
    const modal = document.getElementById('summary-result-modal');
    const summary = JSON.parse(modal.dataset.summaryJson || 'null');
    if (!summary) return false;
    const totals = summary.players;
    const medal = (i) => i === 0 ? '#1ed760' : '#7a7a7a';
    document.getElementById('aggx-eyebrow').textContent = '汇总成绩单 · 共 ' + summary.roundCount + ' 局';
    document.getElementById('aggx-title').textContent = totals.length ? '累计领先 · ' + totals[0].name : '本晚汇总';
    document.getElementById('aggx-list').innerHTML = totals.map((p, i) => {
        const live = players.find(lp => lp.name === p.name) || p;
        const cls = p.total > 0 ? 'win' : p.total < 0 ? 'lose' : 'zero';
        const ring = i === 0 ? 'box-shadow:0 0 0 2px #1ed760;' : '';
        return '<div class="aggx-row' + (i === 0 ? ' lead' : '') + '">' +
            '<span class="aggx-rank" style="color:' + medal(i) + '">' + (i + 1) + '</span>' +
            '<div class="aggx-ava" style="' + ring + 'background:' + getAvatarBgFor(live) + '">' + getAvatarContent(live) + '</div>' +
            '<span class="aggx-name">' + escHtml(p.name) + (i === 0 ? '<span class="aggx-tag">今晚领先</span>' : '') + '</span>' +
            '<span class="aggx-pnl ' + cls + '">' + formatPnl(p.total) + '</span></div>';
    }).join('');
    document.getElementById('aggx-footer').innerHTML =
        '<span class="aggx-fstat">' + totals.length + ' 人</span><span class="aggx-fsep"></span>' +
        '<span class="aggx-fstat">共 ' + summary.roundCount + ' 局</span>';
    return true;
}
function generateAggImage() {
    if (!buildAggExportCard()) { showToast('暂无可导出的汇总'); return; }
    const card = document.getElementById('agg-export-card');
    html2canvas(card, { scale: 2, backgroundColor: null, useCORS: true, logging: false }).then(canvas => {
        document.getElementById('export-image').src = canvas.toDataURL('image/png');
        const arch = document.getElementById('btn-confirm-archive');
        if (arch) arch.style.display = 'none';   // agg 模式:不存档
        openModal('export-modal');
    }).catch(() => showToast('生成图片失败，请截图保存'));
}
```
把现有 `btn-export-summary` 接线
```javascript
document.getElementById('btn-export-summary').addEventListener('click', () => showToast('长按截图保存到相册'));
```
替换为
```javascript
document.getElementById('btn-export-summary').addEventListener('click', generateAggImage);
```
并在结算导出按钮 `#btn-export` 的 `openExportModal`（或其打开 export-modal 处）恢复存档钮显示——在 `generateImage` 的 `.then` 里、`openModal('export-modal')` 之前加一行 `const a=document.getElementById('btn-confirm-archive'); if(a) a.style.display='';`，避免 agg 模式隐藏后影响结算导出。

- [ ] **Step 4: 汇总成绩单卡 CSS（css/style.css，值全写死=html2canvas 安全）**

末尾追加：
```css
/* ─── 汇总导出成绩单(离屏,html2canvas 安全:写死值/圆头像/无 var) ─── */
#agg-export-card{width:340px;background:#181818;border-radius:14px;overflow:hidden}
.aggx-header{padding:18px 18px 16px;background:linear-gradient(160deg,#1f6b3a 0%,#18341f 38%,#181818 100%)}
.aggx-eyebrow{font-family:'Montserrat','Noto Sans SC',sans-serif;font-size:11px;font-weight:600;color:rgba(255,255,255,.7);margin-bottom:6px}
.aggx-title{font-family:'Noto Sans SC',sans-serif;font-size:20px;font-weight:800;color:#fff;line-height:1.15}
.aggx-list{padding:4px 0}
.aggx-row{display:flex;align-items:center;gap:12px;padding:11px 18px}
.aggx-row+.aggx-row{border-top:1px solid rgba(255,255,255,.05)}
.aggx-rank{font-family:'Montserrat','Noto Sans SC',sans-serif;font-size:15px;font-weight:700;width:18px;text-align:center;flex-shrink:0}
.aggx-ava{width:40px;height:40px;border-radius:50%;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.aggx-ava img{width:100%;height:100%;object-fit:cover}
.aggx-name{flex:1;min-width:0;font-family:'Noto Sans SC',sans-serif;font-size:15px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aggx-row.lead .aggx-name{color:#1ed760}
.aggx-tag{margin-left:6px;font-size:10px;font-weight:700;color:#1ed760}
.aggx-pnl{font-family:'Montserrat','Noto Sans SC',sans-serif;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;flex-shrink:0;text-align:right;min-width:64px}
.aggx-pnl.win{color:#1ed760}.aggx-pnl.lose{color:#f0617a}.aggx-pnl.zero{color:#7a7a7a}
.aggx-footer{display:flex;align-items:center;justify-content:center;gap:10px;padding:12px 18px 14px;background:#0d0d0d;border-top:1px solid #2a2a2a;font-family:'Montserrat','Noto Sans SC',sans-serif;font-size:12px;color:#b3b3b3}
.aggx-fsep{width:3px;height:3px;border-radius:50%;background:#4a4a4a}
```

- [ ] **Step 5: 破缓存** `app.js?v=28`→`?v=29`；`style.css?v=34`→`?v=35`。

- [ ] **Step 6: 浏览器验证（真机截图）**

强刷。选中 ≥2 局→「汇总」→预览底部「导出图片」→ **生成真图**（汇总成绩单：渐变头·领先冠军绿环绿名·名次·页脚 N人·共M局），可长按保存；图渲染正常（Montserrat 数字不糊、头像圆、无错位、无浅底）。再点结算导出（结束本局流程）确认**存档钮仍在**（agg 模式没污染结算导出）。`node --check js/app.js` 干净、css 配平。

- [ ] **Step 7: Commit**
```bash
git add index.html js/app.js css/style.css
git commit -m "feat(agg): 导出真图——汇总成绩单(html2canvas)

btn-export-summary 由假提示改为真出图:离屏 #agg-export-card(绿渐变头+名次行+
领先绿环绿名+页脚N人共M局),值全写死/圆头像/无 var,html2canvas 安全;
export-modal agg 模式隐藏存档钮、结算导出复原。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review
- **Spec(§6) 覆盖**：6.1 决策A(T1 doAggregate/saveAggregation)、6.2 改名(T1)、6.3 预览=详情+成绩单(T2 renderAggView)、6.4 对齐(T1 agg-name-inner)、6.5 导出真图(T3)、无静默(T1 toasts)——逐条有任务。
- **占位符**：无；每步含完整可粘贴代码。
- **类型/命名一致**：`renderAggView({rounds,totals,roundCount})`(T2 定义)↔ T2 预览/详情调用一致；`roundsSnapshot` dataset(T1 写)↔ T3 `buildAggExportCard` 读 `summaryJson`(同 dataset)；`.agg-name-inner`(T1 CSS+T2 nameCell)一致；`generateAggImage`/`buildAggExportCard`(T3)前后一致；export-modal 存档钮 toggle 在 T3 两处(隐藏/复原)成对。
