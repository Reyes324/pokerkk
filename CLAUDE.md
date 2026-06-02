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
    0/ { name, avatarId, n10, n20, n50, n100, buyIns }
    1/ ...
    ...（最多8人）
  results/ { results, totalPnl, isBalanced }
```

### 文件结构
```
poker-settle/
├── index.html              # 唯一页面（单页应用）
├── css/style.css           # Fluent Design 浅色主题
├── js/
│   ├── firebase-config.js  # Firebase 配置（需本地填写）
│   ├── avatars.js          # 12个内嵌SVG动漫头像
│   ├── settlement.js       # 纯计算函数（无副作用）
│   └── app.js              # 全部业务逻辑
└── netlify.toml            # Netlify SPA 路由配置
```

---

## 核心功能

### 玩家管理
- 默认3个玩家（玩家1/2/3），最多8人
- 点击"＋添加玩家"按钮添加
- **左滑**玩家卡片 → 显示红色删除按钮（iOS风格）
- **长按**玩家卡片 → 弹出删除确认

### 筹码输入（半页弹窗）
- 点击任意玩家卡片 → 打开底部半页弹窗
- **模式A（默认）**：按面额步进器输入（100/50/20/10分各几个），支持点击数字直接键盘输入
- **模式B（切换）**：直接输入持筹总分
- 实时显示持筹/投入/盈亏预览

### 头像与名字
- 点击头像 → 打开头像选择器（12个动漫头像）
- 点击"编辑"按钮 → 弹窗修改名字

### 结算
- 页面底部"确认结算" → 写入 Firebase，所有设备同步显示结果
- 结果表按盈亏排序，显示零和验证
- "重置筹码"：清空数字，保留名字和头像
- "完全重置"：恢复默认3人局

---

## 设计规范

- **主题**：Fluent Design 浅色（白底，非深色）
- **主色**：绿色 `#107C10` + 金色 `#C19A00`
- **字体**：Noto Sans SC + Segoe UI
- **圆角**：12px（卡片）/ 8px（输入框/按钮）
- **Toast**：居中显示（页面中央，非底部）
- **删除**：左滑或长按，无常驻删除按钮

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
| HIGH | 并发写入竞争 | 两人同时调整筹码可能互相覆盖（小概率，友人场景下可接受） |
| HIGH | 按面额分解误差 | 直接输入总分时按100/50/20/10分解，不能整除10时会丢失零头 |
| MEDIUM | 无离线支持 | 依赖实时网络连接 |
| LOW | 无历史记录 | 每局重置后数据不保留 |

---

## 测试方法

1. 两台设备同时打开 https://pokerkk.netlify.app
2. 设备A修改玩家名字 → 设备B应实时看到变化
3. 设备A输入筹码 → 底部验证区应实时更新
4. 左滑玩家卡片 → 确认红色删除按钮出现
5. 长按玩家卡片 → 确认删除弹窗出现
6. 确认结算 → 两台设备同步显示结果
7. 重置筹码 → 数字清空，名字保留
