# 牌诀功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增底部 2-Tab 导航（结算 / 牌诀）和「牌诀」翻牌抽签功能（50 张德州格言卡片随机翻牌）

**Architecture:** 纯静态扩展——卡片内容存入新文件 `js/cards.js`，页面结构在 `index.html` 增加底部导航 + `#paijue-view` 容器，CSS 用 `--nav-h: 56px` 变量管理底部层叠间距，JS Tab 切换通过 show/hide 两个视图实现，无路由。

**Tech Stack:** Vanilla HTML/CSS/JS，无框架，无构建步骤，已有 Spotify 暗色 design tokens（`var(--brand)`, `var(--surface)`, `var(--ink-3)` 等），CSS 3D transform 实现翻牌动画。

## Global Constraints

- 无框架、无构建步骤，所有 JS 直接写在 `js/app.js` 或对应独立文件，引入 `index.html`
- 设计语言遵循 `DESIGN_SYSTEM.md`：Spotify 暗色主题，`--brand: #1ed760`（暗绿），`--bg: #121212`，`--surface: #181818`，`--ink-1/#fff` 主文字，`--ink-3` 辅助文字
- 触控目标 ≥ 48px
- 每次改动后递增版本号：`style.css?v=N`，`app.js?v=N`，新文件 `cards.js?v=1`
- 不得破坏现有结算、记录、汇总等功能
- 不推送到远程（push 由用户决定）
- 卡片内容用户将后续补全；实现阶段先用截图中可见的 16 条真实格言，数组结构需支持任意条数（≥ 2）

---

## 文件变动总览

| 文件 | 操作 | 说明 |
|---|---|---|
| `js/cards.js` | 新建 | 存放 `PAIJUE_CARDS` 字符串数组 |
| `index.html` | 修改 | 新增底部导航 HTML、`#paijue-view` 容器、引入 `cards.js` |
| `css/style.css` | 修改 | 底部导航样式、翻牌卡片样式、间距调整 |
| `js/app.js` | 修改 | Tab 切换逻辑、翻牌交互逻辑 |

---

## Task 1: 创建 `js/cards.js`

**Files:**
- Create: `js/cards.js`

**Interfaces:**
- Produces: `window.PAIJUE_CARDS` — 字符串数组，供 Task 3 的 `randomPaijueIdx()` 读取

- [ ] **Step 1: 创建文件，写入已知格言**

```js
// js/cards.js
// 用户将补全至 50 条；现有 16 条来自正式内容，数组可任意条数。
const PAIJUE_CARDS = [
  '翻牌前少入池，翻牌后多弃牌。',
  '价值下注要薄，诈唬要厚。',
  '没有位置等于半盲打。',
  '范围比手牌更重要。',
  '打牌是打人，不是打牌。',
  '翻前跟注太多是最大的漏洞。',
  '每一手弃牌都在省钱。',
  '强牌快打，中等牌控制。',
  '对手的弃牌率是你最好的朋友。',
  '不要爱上你的牌。',
  '下注要有目的，别为下注而下注。',
  '鱼在limp，你在隔离。',
  '读牌先读范围，再读故事。',
  '别用中等牌玩大底池。',
  'C-bet是工具，不是义务。',
  '尊重对手的再加注。',
];
```

- [ ] **Step 2: 验证文件有效**

在浏览器控制台打开 `index.html`（引入 cards.js 后）确认：
```
console.log(PAIJUE_CARDS.length); // 期望输出: 16
```

- [ ] **Step 3: Commit**

```bash
git add js/cards.js
git commit -m "feat(paijue): 创建卡片数据文件 cards.js"
```

---

## Task 2: 底部导航 HTML + CSS + Tab 切换

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `js/app.js`

**Interfaces:**
- Consumes: 无（此 Task 独立）
- Produces:
  - `switchMainTab(tab: 'settle' | 'paijue'): void` — 切换视图，供 Task 3 测试时直接调用
  - `#main-view` — 结算视图容器（原 `.container`）
  - `#paijue-view` — 牌诀视图容器（空壳，Task 3 填充内容）

- [ ] **Step 1: 给现有 `.container` 加 id，新增 `#paijue-view` 和底部导航 HTML**

在 `index.html` 中，找到 `<div class="container">` 改为：
```html
<div class="container" id="main-view">
```

找到 `</div><!-- ── Floating bottom bar ── -->` 之前（即 `.container` 的结尾 `</div>` 后），新增 `#paijue-view`：
```html
<!-- ── 牌诀视图 ── -->
<div id="paijue-view" class="paijue-view hidden">
  <!-- 内容由 Task 3 填充 -->
</div>
```

在 `</body>` 之前（toast div 之后）新增底部导航：
```html
<!-- ── 底部导航 ── -->
<nav class="bottom-nav" id="bottom-nav">
  <button class="bottom-nav-tab active" data-tab="settle" onclick="switchMainTab('settle')">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
    </svg>
    <span>结算</span>
  </button>
  <button class="bottom-nav-tab" data-tab="paijue" onclick="switchMainTab('paijue')">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 7h6M9 12h6M9 17h4"/>
    </svg>
    <span>牌诀</span>
  </button>
</nav>
```

在 `index.html` `</body>` 前的 script 列表里，在 `app.js` 之前新增：
```html
<script src="js/cards.js?v=1"></script>
```

- [ ] **Step 2: 更新 `css/style.css`**

在 style.css 末尾（`/* ─── Toast ─── */` 之前）追加以下样式：

```css
/* ─── 底部导航 ─── */
:root { --nav-h: 56px; }

.bottom-nav {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  z-index: 25;
  display: flex;
  height: calc(var(--nav-h) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--surface);
  border-top: 1px solid var(--line);
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
}
.bottom-nav-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: none;
  background: none;
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 500;
  font-family: var(--font);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: color .15s;
}
.bottom-nav-tab.active { color: var(--brand); }
.bottom-nav-tab svg { flex-shrink: 0; }

/* float-bar 上移到底部导航之上 */
.float-bar {
  bottom: calc(var(--nav-h) + env(safe-area-inset-bottom)) !important;
  padding-bottom: 10px !important;
}

/* body 底部间距：float-bar 高度(~64px) + nav 高度 */
body { padding-bottom: calc(144px + env(safe-area-inset-bottom)) !important; }

/* 牌诀视图容器 */
.paijue-view {
  position: fixed;
  top: 56px;
  bottom: calc(var(--nav-h) + env(safe-area-inset-bottom));
  left: 0; right: 0;
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.paijue-view.hidden { display: none; }
```

更新版本号：找到 `style.css?v=48` 改为 `style.css?v=49`。

- [ ] **Step 3: 在 `js/app.js` 末尾追加 Tab 切换函数**

```js
// ── 底部导航 Tab 切换 ──────────────────────────────────────────
function switchMainTab(tab) {
    const mainView = document.getElementById('main-view');
    const paijueView = document.getElementById('paijue-view');
    const floatBar = document.getElementById('float-bar');
    document.querySelectorAll('.bottom-nav-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    if (tab === 'settle') {
        mainView.style.display = '';
        paijueView.classList.add('hidden');
        floatBar.style.display = '';
    } else {
        mainView.style.display = 'none';
        paijueView.classList.remove('hidden');
        floatBar.style.display = 'none';
    }
}
```

更新版本号：找到 `app.js?v=40` 改为 `app.js?v=41`。

- [ ] **Step 4: 手动验证**

在浏览器打开 `index.html`（需要 Firebase 连接）：
- 底部显示「结算」「牌诀」两个 Tab
- 默认激活「结算」，内容正常显示
- 点「牌诀」Tab：结算内容消失，出现空的 `#paijue-view`（暗色背景）
- float-bar 在牌诀 Tab 隐藏，切回结算 Tab 后重新出现
- float-bar 位置在 nav 之上，无重叠

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css js/app.js
git commit -m "feat(paijue): 底部 2-Tab 导航 + 视图切换骨架"
```

---

## Task 3: 牌诀翻牌视觉 + 交互逻辑

**Files:**
- Modify: `index.html` — 填充 `#paijue-view` 内容
- Modify: `css/style.css` — 翻牌卡片样式
- Modify: `js/app.js` — 翻牌 + 随机抽取逻辑

**Interfaces:**
- Consumes:
  - `window.PAIJUE_CARDS: string[]` — 来自 `js/cards.js`（Task 1）
  - `#paijue-view.paijue-view` — 来自 Task 2，此 Task 填充内容
- Produces: 完整可用的牌诀翻牌功能

- [ ] **Step 1: 填充 `#paijue-view` 内容**

把 Task 2 Step 1 里的 `#paijue-view` 内部替换为：

```html
<div id="paijue-view" class="paijue-view hidden">
  <div class="paijue-scene">
    <div class="paijue-card" id="paijue-card">
      <div class="paijue-card-inner" id="paijue-card-inner">
        <!-- 背面 -->
        <div class="paijue-card-back">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="var(--brand)" opacity=".18">
            <path d="M12 2C9 6 4 7 4 11c0 2.5 2 4 4 4-.5 2-2 3-2 3h12s-1.5-1-2-3c2 0 4-1.5 4-4 0-4-5-5-8-9z"/>
          </svg>
        </div>
        <!-- 正面 -->
        <div class="paijue-card-front">
          <p class="paijue-text" id="paijue-text"></p>
        </div>
      </div>
    </div>
    <p class="paijue-hint" id="paijue-hint">点击翻牌</p>
    <button class="btn btn-secondary paijue-redraw hidden" id="btn-paijue-redraw">再抽一张</button>
  </div>
</div>
```

- [ ] **Step 2: 在 `css/style.css` 追加翻牌卡片样式**

```css
/* ─── 牌诀翻牌卡片 ─── */
.paijue-scene {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  padding: 0 24px;
}
.paijue-card {
  width: min(300px, 80vw);
  height: min(200px, 53vw);
  perspective: 900px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.paijue-card-inner {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform .45s ease-in-out;
}
.paijue-card-inner.flipped { transform: rotateY(180deg); }
.paijue-card-back,
.paijue-card-front {
  position: absolute;
  inset: 0;
  border-radius: var(--r16);
  box-shadow: var(--sh8);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.paijue-card-back {
  background: var(--surface);
  border: 1px solid var(--line);
}
.paijue-card-front {
  background: var(--brand);
  transform: rotateY(180deg);
  padding: 24px;
}
.paijue-text {
  font-size: 18px;
  font-weight: 600;
  color: #121212;
  text-align: center;
  line-height: 1.6;
  font-family: var(--font);
  margin: 0;
}
.paijue-hint {
  font-size: 13px;
  color: var(--ink-3);
  margin: 0;
  min-height: 18px;
}
.paijue-redraw { min-width: 140px; }
```

- [ ] **Step 3: 在 `js/app.js` 追加翻牌逻辑，并在 DOMContentLoaded 或初始化处调用 `initPaijue()`**

在 app.js 末尾（`switchMainTab` 函数之后）追加：

```js
// ── 牌诀翻牌 ──────────────────────────────────────────────────
let _paijueLastIdx = -1;
let _paijueFlipped = false;

function initPaijue() {
    document.getElementById('paijue-card').addEventListener('click', function() {
        if (!_paijueFlipped) _flipPaijue();
    });
    document.getElementById('btn-paijue-redraw').addEventListener('click', _redrawPaijue);
}

function _flipPaijue() {
    const idx = _randomPaijueIdx();
    _paijueLastIdx = idx;
    document.getElementById('paijue-text').textContent = PAIJUE_CARDS[idx];
    document.getElementById('paijue-card-inner').classList.add('flipped');
    document.getElementById('paijue-hint').textContent = '';
    document.getElementById('btn-paijue-redraw').classList.remove('hidden');
    _paijueFlipped = true;
}

function _redrawPaijue() {
    const inner = document.getElementById('paijue-card-inner');
    inner.classList.remove('flipped');
    _paijueFlipped = false;
    setTimeout(_flipPaijue, 460);
}

function _randomPaijueIdx() {
    if (PAIJUE_CARDS.length <= 1) return 0;
    let idx;
    do { idx = Math.floor(Math.random() * PAIJUE_CARDS.length); }
    while (idx === _paijueLastIdx);
    return idx;
}
```

在 app.js 里找到页面初始化的位置（通常是 `document.addEventListener('DOMContentLoaded', ...)` 或文件末尾的初始化调用区），追加 `initPaijue();`。

如果没有集中的 DOMContentLoaded 块，直接在 `initPaijue` 定义之后追加：
```js
initPaijue();
```

版本号：`app.js?v=41` → `app.js?v=42`，`style.css?v=49` → `style.css?v=50`。

- [ ] **Step 4: 手动验证翻牌功能**

1. 点「牌诀」Tab → 看到背面朝上的卡片，显示「点击翻牌」
2. 点击卡片 → 3D 翻转动画，正面显示一条格言（绿色底，深色字）
3. 点「再抽一张」→ 卡片翻回背面后自动翻出新格言，不与上条相同
4. 「点击翻牌」提示在翻开后消失
5. 切回「结算」Tab → 结算功能、P&L 浮动条全部正常

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css js/app.js
git commit -m "feat(paijue): 翻牌抽签功能完整实现"
```

---

## 验收检查清单（实现者自检）

- [ ] 底部导航两个 Tab 切换正常，激活态 `--brand` 色高亮
- [ ] 牌诀 Tab 进入后看到背面卡片 + 「点击翻牌」提示
- [ ] 点击翻牌动画流畅（约 0.45s），无闪烁
- [ ] 「再抽一张」不出现连续相同格言
- [ ] 现有结算、记录、汇总功能无回归
- [ ] float-bar 在结算 Tab 可见且位置在 nav 之上，在牌诀 Tab 隐藏
- [ ] 无 JS 控制台报错
