# 主题配色备份 / Theme Backup

设计系统已 token 化:改 `css/style.css` 顶部 `:root` 里 `--brand / --brand-strong / --brand-soft` 三个值即可整站换肤(按钮、胶囊、阴影、聚焦、选中环等都会跟着变,阴影由 `--brand-shadow` 用 color-mix 自动派生)。

下面两套随时可互换。

## A. 琥珀版(原版 / 备用 backup)
```css
--brand:         #C8894B;
--brand-strong:  #B5763A;
--brand-soft:    #F3E7D7;
--brand-shadow:  color-mix(in srgb, var(--brand) 30%, transparent);
```

## B. 猫爪灰黑版(当前启用)
取自 `img/paw.png` 的灰黑(深主垫 #424343 / 平均 #505151)。
```css
--brand:         #424343;
--brand-strong:  #2E2F2F;
--brand-soft:    #EAE8E5;
--brand-shadow:  color-mix(in srgb, var(--brand) 26%, transparent);
```

## 不随主色变化的固定语义色(两版通用)
```css
--win:  #3E8E4F;   /* 盈利绿 */
--lose: #C8453A;   /* 亏损红 */
--bg:   #F5F1EA;   /* 暖奶油背景(暖纸 + 灰黑墨色的组合) */
/* 筹码点:100=#1C1B1A 黑 / 50=#2E8B57 绿 / 20=#E08A2C 橙 / 10=#C0392B 红 */
/* 借底"底"点:#C8894B 暖琥珀(语义强调) */
```

> 还原琥珀版:把 A 段四个值粘回 `:root`,并把 `css/style.css?v=` 版本号 +1 即可。
