# 猫店德州结算 — 项目文档

## 项目背景

一群固定的朋友（通常4~6人）定期举办线下德州扑克牌局，使用实体筹码和扑克牌。每局结束后需要一个工具来帮助大家快速清点筹码、计算盈亏、验证总数是否持平。

项目部署地址：**https://pokerkk.netlify.app**  
代码仓库：**https://github.com/Reyes324/pokerkk**

---

## 用户场景

1. 牌局结束，庄家把链接发到微信群
2. 每个人用自己的手机打开同一个链接
3. 各自点击自己的玩家格子，输入手上的筹码数量
4. 页面实时同步所有人的数据，显示各自的盈亏
5. 庄家点"确认结算"，显示最终排名和零和验证
6. 下一局前点"重置"，清空筹码数据，名字保留

---

## 游戏规则

- **1底 = 1000分**
- 默认筹码分配（每人初始1底）：
  - 5 × 10分 = 50
  - 10 × 20分 = 200
  - 5 × 50分 = 250
  - 5 × 100分 = 500
  - 合计 = 1000 ✓
- 输光可以**借底**（每借一底追加1000分投入）

---

## 结算公式

```
chipTotal = n10×10 + n20×20 + n50×50 + n100×100
invested  = (1 + 借底次数) × 1000
pnl       = chipTotal - invested

验证：所有玩家 pnl 之和 = 0（零和游戏）
```

---

## 技术实现

### 技术栈
| 层 | 技术 |
|---|---|
| 前端 | Vanilla HTML/CSS/JS（无框架，无构建步骤） |
| 实时同步 | Firebase Realtime Database（免费 Spark 方案） |
| 托管 | Netlify（GitHub 自动部署） |

### Firebase 数据结构
```
currentGame/
  status: "waiting" | "settled"
  players/
    0/ { name, avatarId, avatarRef?, n10, n20, n50, n100, buyIns, confirmed, editing?:{deviceId:true} }
    1/ ...
    ...（最多15人）
  results/ { results, totalPnl, isBalanced }

sharedAvatars/            # 独立顶层路径，与 currentGame 分离
  {pushId}/ { data }      # 用户上传照片，160×160 JPEG 的 base64；全员共享
```
- `avatarRef` 指向 `sharedAvatars` 的 pushId，存在则优先于 `avatarId`（猫）渲染；失效时回退到猫
- 头像 base64 只存 `sharedAvatars/`，玩家对象只引用轻量 id，避免拖慢筹码实时同步

### 文件结构
```
poker-settle/
├── index.html              # 唯一页面（单页应用）
├── css/style.css           # Fluent Design 浅色主题
├── js/
│   ├── firebase-config.js  # Firebase 配置（需本地填写）
│   ├── avatars.js          # 25只猫头像元数据（图片在 img/avatars/cat-01..25.png）
│   ├── settlement.js       # 纯计算函数（无副作用）
│   └── app.js              # 全部业务逻辑
└── netlify.toml            # Netlify SPA 路由配置
```

---

## 核心功能

### 玩家管理
- 默认3个玩家（玩家1/2/3），最多15人
- 点击"＋添加玩家"按钮添加
- **左滑**玩家卡片 → 显示红色删除按钮（iOS风格）
- **长按**玩家卡片 → 弹出删除确认

### 筹码输入（半页弹窗）
- 点击任意玩家卡片 → 打开底部半页弹窗
- **模式A（默认）**：按面额步进器输入（100/50/20/10分各几个），支持点击数字直接键盘输入
- **模式B（切换）**：直接输入"最终剩余持筹"总分 + "借了几底"
- 实时显示持筹/投入/盈亏预览
- **必须点"完成"才写入 Firebase**；关闭/点蒙层会丢弃本次修改并还原到打开时的状态
- **模式切换联动规则**：
  - 步进器 → 直接输入：预填合计总分，保存面额快照
  - 直接输入未修改 → 步进器：还原面额快照（无损切换）
  - 直接输入已修改 → 步进器：清空面额，用户重新按面额录入

### 头像与名字
- 点击头像 → 打开头像选择器（半页，标题栏固定、网格区可滚动）
- 选择器布局：`[+ 上传] [共享照片…] [25只猫]`
- **共享头像库**：上传的照片进入全局共享库，任何玩家都能点选任意一张（不绑定某个玩家）
- 第一格「+ 上传」始终是上传入口，点击调起相册/拍照；上传成功后自动选中并加入库供他人使用
- 每张共享照片右上角有「⋯」管理小图标 → action sheet（重新上传 / 删除照片）；点照片本身 = 选中
- 删除某张共享照片时，正在使用它的玩家自动回退到猫头像（avatarRef 失效则按 avatarId 渲染）
- 共享照片存入 Firebase `sharedAvatars/{photoId}` 独立路径，仅 base64 数据放这里；玩家对象里只存一个轻量 `avatarRef`（photoId），不污染筹码实时同步
- 完全重置时清空共享照片库；重置筹码不影响
- 点击"编辑"按钮 → 弹窗修改名字

### 结算
- 页面底部"确认结算" → 写入 Firebase，所有设备同步显示结果
- 结果表按盈亏排序，显示零和验证
- "重置筹码"：清空数字，保留名字和头像
- "完全重置"：恢复默认3人局

### 导出结果
- 点"导出结果" → 打开半页弹窗，展示结算卡片
- **只纳入已点过"完成"的玩家**；未确认玩家不计入
- 可生成图片保存到相册

---

## 设计规范

> **完整设计系统见 [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)**，包含颜色 token、排版、圆角、阴影、所有组件规格（导航栏、底部栏、卡片、按钮、半页、Push 导航、列表行）及 z-index 层级表。
>
> **规则**：做任何 UI 改动前先查 DESIGN_SYSTEM.md，优先复用已有 token 和组件模式。

以下为快速参考：

- **背景层级**：`--bg`（#F5F1EA 暖米）→ body；`--surface`（#FFF）→ 卡片；`--surface-sunken`（#FAF7F1）→ 凹陷区
- **主色**：`--brand: #424343`（猫爪灰黑）
- **字体**：Noto Sans SC + Segoe UI，主内容 15px/500，标题 16px/700，辅助 12–13px/400
- **圆角**：卡片 `--r12`（12px）/ 输入框 `--r8`（8px）/ 全宽按钮 `--r12`
- **Toast**：居中显示（页面中央，非底部）
- **删除**：左滑或长按，无常驻删除按钮，统一弹 `delete-modal`（z-index 200）
- **半页弹窗动画**：所有弹窗通过 `openModal()` / `closeModal()` 统一管理，打开/关闭均有 sheet slideUp/slideDown + overlay fade 动画
- **半页弹窗关闭**：所有半页都支持点击蒙层关闭（含删除确认）

### 半页弹窗结构规范

所有包含列表（或内容可能超出屏幕）的半页，**必须使用三段式可滚动结构**：

```
modal-sheet.has-scroll-body
├── .modal-handle          ← 固定，flex-shrink:0
├── .modal-header          ← 固定，flex-shrink:0（标题 + 关闭按钮）
├── .modal-scroll-body     ← 可滚动区（flex:1, overflow-y:auto，隐藏滚动条）
└── .modal-footer          ← 固定（仅在有底部按钮时添加）
```

**HTML 模板**（有底部按钮）：
```html
<div class="modal-sheet has-scroll-body">
    <div class="modal-handle"></div>
    <div class="modal-header">
        <span>标题</span>
        <button class="btn-icon" id="btn-close-xxx">✕</button>
    </div>
    <div id="xxx-body" class="modal-scroll-body">
        <!-- 列表内容 -->
    </div>
    <div class="modal-footer">
        <button class="btn btn-primary" style="margin-bottom:8px">主操作</button>
        <button class="btn btn-ghost">取消</button>
    </div>
</div>
```

**无底部按钮时**，省略 `.modal-footer`，`.modal-scroll-body` 自带 safe-area bottom padding。

**已应用此结构的半页**：`end-round-modal`、`round-detail-modal`、`summary-result-modal`、`agg-detail-modal`。

**不需要此结构的半页**：内容固定短小（如 `delete-modal`、`reset-modal`、`name-modal`）。

### 二级页面（Push 导航）

记录页（`records-page`）使用 Push 导航，从右侧滑入/滑出，**不是**底部弹起的半页：
- overlay 加 `push` class：`class="modal-overlay push hidden"`
- `openModal()` / `closeModal()` 检测到 `.push` 后自动用 `slideInRight`（300ms）/ `slideOutRight`（260ms）
- overlay `background:transparent`（无暗色遮罩），`.modal-sheet.full` 带左侧阴影

### 导航文字按钮（`.btn-nav-text`）

用于二级页面右上角的「选择」/「完成」等文字操作按钮（非图标）：
- 44px 触控高度，15px/600，品牌色，无背景无边框
- 区别于 `.btn-icon`（图标专用）和 `.btn`（全宽底部按钮）

### 按钮设计系统

半页弹窗内的全宽按钮**统一 48px 高度**，只用颜色/样式区分层级，不用高度区分（48px 是舒适的触控目标，避免误触）：

| Class | Height | 样式 | 用途 |
|---|---|---|---|
| `.btn-primary` | 48px | 品牌色填充 | 主操作（完成、保存、生成） |
| `.btn-secondary` | 48px | 描边 | 中性操作（重置筹码、重新上传） |
| `.btn-danger` | 48px | 浅红底+红字 | 破坏性操作（删除、完全重置、确认删除） |
| `.btn-ghost` | 48px | 透明无边框、灰字 | 取消/关闭（最低层级，但同高便于点击） |

> 已废弃 `.btn-danger-action`（并入 48px 的 `.btn-danger`）和 `.btn-sm`（取消按钮改用 `.btn-ghost`）。原则：层级靠颜色和填充表达，不靠按钮高度降级。

---

## 部署方式

### 本地开发
无需构建，直接打开 `index.html`（需配置 Firebase）。

### Firebase 配置
编辑 `js/firebase-config.js`，填入 Firebase 项目配置：
```js
const FIREBASE_CONFIG = {
    apiKey: "...",
    databaseURL: "https://pocker-value-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "pocker-value",
    // ...
};
```
Firebase 项目：`pocker-value`（已配置，Spark免费方案）

### 发布
```bash
git add . && git commit -m "描述改动" && git push
# Netlify 自动部署，约20秒上线
```

---

## 已知问题 / 待优化

| 优先级 | 问题 | 说明 |
|---|---|---|
| LOW | 并发写入竞争 | 两人同时点"完成"可能互相覆盖（极低概率，友人场景下可接受） |
| HIGH | 按面额分解误差 | 直接输入总分时按100/50/20/10分解，不能整除10时会丢失零头 |
| MEDIUM | 无离线支持 | 依赖实时网络连接 |
| LOW | 无历史记录 | 每局重置后数据不保留 |

---

## 测试方法

1. 两台设备同时打开 https://pokerkk.netlify.app
2. 设备A修改玩家名字 → 设备B应实时看到变化
3. 设备A输入筹码并点"完成" → 设备B底部验证区应实时更新
4. 左滑玩家卡片 → 确认红色删除按钮出现
5. 长按玩家卡片 → 确认删除弹窗出现
6. 确认结算 → 两台设备同步显示结果
7. 重置筹码 → 数字清空，名字保留

---

## 资源 / Assets

玩家头像：项目方提供的一套插画猫脸(5×5 共 25 只),用 node + sharp 从整图切片为 `img/avatars/cat-01..25.png`(取每格中心 94% 以贴合圆形蒙版,缩放至 160×160)。柔和底色已烘焙在图内。
头部图标：`img/paw.png`(项目方提供的猫爪)。
