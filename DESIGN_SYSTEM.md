# 猫店德州结算 — 设计系统

> **规则**：所有 UI 改动必须先查这份文档，优先复用已有 token 和组件。确有必要新增或修改时，同步更新本文件。

---

## 一、设计原则

- **暖色调系统**：整体基于"猫咖暖米色"（Cat Café Warm），不是冷白，不是中性灰
- **一致性优先**：同类场景（导航栏、底部栏、卡片）颜色、高度、毛玻璃效果必须统一
- **触控友好**：所有可点击元素最小触控目标 44×44px
- **层级用颜色表达，不用尺寸**：按钮统一 48px 高，靠填充色/边框/透明度区分重要程度

---

## 二、颜色 Tokens

### 2.1 Surface（背景层级）

| Token | 值 | 用途 |
|---|---|---|
| `--bg` | `#F5F1EA` | 页面底色（body、push 页面背景） |
| `--surface` | `#FFFFFF` | 卡片、输入框、弹窗内容区 |
| `--surface-sunken` | `#FAF7F1` | 内嵌凹陷区域（别名 `--surface2`） |
| `--line` | `#ECE6DC` | 分隔线（所有 border、hr） |

**规则**：导航栏、底部栏不用纯色，用 `rgba(245,241,234,.92/.94)` + `backdrop-filter:blur(14px)` 实现毛玻璃效果。

### 2.2 Brand（主色）

| Token | 值 | 用途 |
|---|---|---|
| `--brand` | `#424343` | 主操作按钮、链接、激活态、图标 |
| `--brand-strong` | `#2E2F2F` | 品牌色深色版（hover/press） |
| `--brand-soft` | `#EAE8E5` | 品牌色浅底（轻量标签、激活背景） |
| `--brand-shadow` | `color-mix(in srgb, var(--brand) 26%, transparent)` | 主按钮阴影 |

> 如需切回琥珀版：`--brand:#C8894B; --brand-strong:#B5763A; --brand-soft:#F3E7D7`

### 2.3 P&L 语义色

| Token | 值 | 用途 |
|---|---|---|
| `--win` | `#3E8E4F` | 盈利（正数） |
| `--lose` | `#C8453A` | 亏损（负数） |
| `--flat` | `#A09A8E` | 持平（0） |
| `--red-lt` | `#F7E4E1` | 危险操作浅底（btn-danger 背景） |

### 2.4 Ink（文字层级）

| Token | 值 | 用途 |
|---|---|---|
| `--ink-1` | `#2B2722` | 主要内容（姓名、金额） |
| `--ink-2` | `#6B6358` | 次要内容（副标题） |
| `--ink-3` | `#A8A095` | 辅助说明（时间戳、提示文字） |

### 2.5 中性色（暖色调）

| Token | 值 | 用途 |
|---|---|---|
| `--n10` | `#F4F1EB` | 输入框背景、步进控件、浅底标签 |
| `--n20` | `#E9E3D9` | 边框、分隔、modal handle |
| `--n40` | `#D4CCBF` | 次级边框 |
| `--n60` | `#ABA395` | 占位符文字 |
| `--n80` | `#5C564C` | 深色辅助文字 |

---

## 三、字体与排版

```
--font: 'Noto Sans SC', 'Segoe UI Variable', 'PingFang SC', system-ui, sans-serif
```

| 场景 | 字号 | 字重 | 颜色 |
|---|---|---|---|
| 弹窗标题 / 页面标题 | 16–17px | 700 | `--ink-1` |
| 玩家名字 / 列表主标题 | 15px | 500 | `--ink-1` |
| 盈亏金额 | 15px | 600 | `--win` / `--lose` / `--flat` |
| 副标题 / 说明 | 13–14px | 400 | `--ink-2` |
| 时间戳 / 辅助标注 | 12px | 400 | `--ink-3` |
| 按钮文字 | 16px | 600 | 由按钮类型决定 |
| 导航文字按钮（选择/完成） | 15px | 600 | `--brand` |

---

## 四、圆角

| Token | 值 | 用途 |
|---|---|---|
| `--r4` | `4px` | 极小元素（chip dot） |
| `--r8` | `8px` | 输入框、步进控件、小按钮 |
| `--r12` | `12px` | 卡片、全宽按钮 |
| `--r16` | `16px` | 半页弹窗顶部圆角 |
| `--rfull` | `9999px` | 胶囊标签、徽标 |

---

## 五、阴影

| Token | 值 | 用途 |
|---|---|---|
| `--sh2` | `0 1px 2px rgba(74,56,30,.10), 0 0 1px rgba(74,56,30,.06)` | 分段控件激活项 |
| `--sh4` | `0 2px 8px rgba(74,56,30,.08), 0 0 1px rgba(74,56,30,.05)` | 卡片、汇总栏 |
| `--sh8` | `0 6px 16px rgba(74,56,30,.10), 0 1px 3px rgba(74,56,30,.06)` | 浮动元素 |

---

## 六、布局

| 项目 | 值 |
|---|---|
| 最大宽度 | `480px`（居中） |
| 页面横向 padding | `12px` |
| 固定顶部高度 | `56px` |
| 固定底部高度 | `~80px + safe-area-inset-bottom` |
| body 顶部 padding | `56px`（为 fixed header 让位） |
| body 底部 padding | `calc(80px + env(safe-area-inset-bottom))` |

---

## 七、导航栏 / 顶部栏

所有顶部固定栏（首页 `app-header`、记录页 `records-header`）使用同一规格：

```css
height: 56px;
background: rgba(245,241,234,.92);
backdrop-filter: blur(14px);
-webkit-backdrop-filter: blur(14px);
border-bottom: 1px solid var(--line);
```

- 左侧：返回/图标按钮（`.btn-icon`，40×40px）
- 中间：页面标题（17px/600，`--ink-1`，居中）
- 右侧：文字操作按钮（`.btn-nav-text`）或图标按钮（`.btn-icon`）

### 导航文字按钮 `.btn-nav-text`
用于导航栏右侧的「选择」「完成」等文字操作：
```css
height: 44px; min-width: 44px;
font-size: 15px; font-weight: 600;
color: var(--brand);
background: none; border: none;
```

---

## 八、底部栏

所有底部固定栏（首页 `float-bar`、记录页 `records-action-bar`）使用同一规格：

```css
background: rgba(245,241,234,.94);
backdrop-filter: blur(14px);
-webkit-backdrop-filter: blur(14px);
border-top: 1px solid var(--line);
padding-bottom: max(20px, calc(8px + env(safe-area-inset-bottom)));
```

---

## 九、卡片

```css
background: var(--surface);   /* 白色 */
border-radius: var(--r12);    /* 12px */
box-shadow: var(--sh4);
border: 1px solid rgba(0,0,0,.04);
```

卡片内 padding：`12–16px`。卡片放置在 `--bg` 暖米色背景上，形成层次感。

---

## 十、按钮系统

半页弹窗内全宽按钮统一 **48px 高**，只靠颜色区分层级：

| Class | 样式 | 用途 |
|---|---|---|
| `.btn-primary` | 品牌色填充 `--brand`，白字，`box-shadow:brand-shadow` | 主操作（完成、保存、确认） |
| `.btn-secondary` | `--n10` 底 + `--n40` 描边，`--ink-2` 字 | 中性操作（重置筹码、重新上传） |
| `.btn-danger` | `--red-lt` 底 + 红色描边，`--lose` 字 | 破坏性操作（删除、完全重置） |
| `.btn-ghost` | 透明底无边框，`--ink-3` 字 | 取消 / 关闭（最低优先级） |

所有按钮：`border-radius: var(--r12)；font-size: 16px; font-weight: 600`。

图标按钮 `.btn-icon`：40×40px，`border-radius: var(--r8)`，`--ink-2` 颜色。

---

## 十一、半页弹窗（Half-Sheet）

### 标准结构

**所有含列表或内容可能超屏的半页，必须用三段式结构：**

```html
<div class="modal-sheet has-scroll-body">
    <div class="modal-handle"></div>          <!-- 固定，36×4px 暖灰把手 -->
    <div class="modal-header">                <!-- 固定，标题 + 关闭按钮 -->
        <span>标题</span>
        <button class="btn-icon" id="btn-close-xxx">✕</button>
    </div>
    <div id="xxx-body" class="modal-scroll-body">  <!-- 唯一可滚动区 -->
        <!-- 列表内容 -->
    </div>
    <div class="modal-footer">                <!-- 固定，有按钮时才加 -->
        <button class="btn btn-primary" style="margin-bottom:8px">主操作</button>
        <button class="btn btn-ghost">取消</button>
    </div>
</div>
```

- `max-height: 82dvh`
- `modal-handle`：宽 36px，高 4px，`--n20` 颜色，居中
- `modal-header`：16px/700，含关闭按钮（右侧），`margin-bottom:16px`
- 蒙层颜色：`rgba(0,0,0,.42)`

### 无底部按钮的半页
省略 `.modal-footer`，`.modal-scroll-body` 自带 `padding-bottom: max(16px, env(safe-area-inset-bottom))`。

### 内容简短不滚动的半页
直接用 `.modal-sheet`（无 `has-scroll-body`）：`delete-modal`、`reset-modal`、`name-modal` 等。

### 动画
打开：`slideUp 220ms`；关闭：`slideDown 180ms`；蒙层同步 fade。

---

## 十二、Push 导航（二级页面）

记录页等全屏二级页面使用 Push 导航，**不是**底部弹起的半页：

```html
<div id="records-page" class="modal-overlay push hidden">
    <div class="modal-sheet full">...</div>
</div>
```

- overlay：`background: transparent`（无暗色遮罩）
- modal-sheet：`height: 100%; border-radius: 0; box-shadow: -4px 0 24px rgba(0,0,0,.12)`（左侧阴影）
- 进入：`slideInRight 300ms cubic-bezier(.25,0,.25,1)`
- 退出：`slideOutRight 260ms cubic-bezier(.4,0,1,1)`

---

## 十三、列表行（可删除）

```
.swipe-row
├── .swipe-delete-btn    ← 左滑后露出（红色，绝对定位在右侧外）
└── .player-card         ← 可左滑 / 长按触发删除确认
```

- 左滑阈值：移动超过 40px 则锁定，露出 80px 的删除按钮
- 长按阈值：600ms，有轻微抖动反馈（`.long-press-active`）
- 删除确认：统一弹 `delete-modal`（z-index 200，高于所有其他遮罩）
- 方向锁定：先判断水平/垂直方向，水平才拦截 `preventDefault`

---

## 十四、Z-index 层级表

| 元素 | z-index |
|---|---|
| 页面内容 | 0 |
| sticky / relative 卡片 | 1 |
| `app-header`（固定顶栏） | 20 |
| `float-bar`（固定底栏） | 30 |
| `.modal-overlay`（普通半页 / Push 页） | 100 |
| `#delete-modal`（删除确认，需覆盖 records 页） | 200 |
| `.toast`（Toast 提示） | 999 |

---

## 十五、新增 / 修改规则

1. **新颜色**：先判断是否能用现有 token。如果确实需要新值，在 `:root` 里添加语义 token，同步更新本文件
2. **新组件**：描述结构、使用场景、复用的 token；已有类似组件的直接继承
3. **修改已有 token**：说明原因，检查所有使用该 token 的地方是否需要联动调整
4. **设计与代码同步**：每次改动后更新本文件对应条目
