// 成就称号 —— 彩色行内徽标渲染。纯函数，无 Firebase / 无全局状态依赖。
// 同一份代码被 index.html（线上）和 preview-titles.html（预览）共用，
// 保证预览所见 === 线上所得。
//
// 每个称号有专属低饱和彩色身份 + 定制线性图标；「今晚大赢家」为填充主角。
// 颜色取自 css 里的 --title-*-bg / --title-*-ink 语义 token（见 DESIGN_SYSTEM.md）。

// 定制线性图标（viewBox 24，描边随 currentColor=徽标字色，和项目图标语言统一）
const TITLE_ICONS = {
    trophy:  '<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4.5a2 2 0 0 0 0 4H7M17 6h2.5a2 2 0 0 1 0 4H17"/><path d="M9.5 15.5 9 18h6l-.5-2.5M8 21h8"/>',
    smile:   '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8"/><path d="M9 9.5h.01M15 9.5h.01"/>',
    target:  '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/>',
    mountain:'<path d="M2 19h20"/><path d="M5 19l4-7 3 4 3-6 5 9"/>',
    flame:   '<path d="M12 3s5 3.5 5 9a5 5 0 0 1-10 0c0-2 1-3.6 2-4.6.3 1.3 1 1.9 2 1.9C12 9 10.5 6 12 3Z"/>',
    heart:   '<path d="M12 20s-7-4.4-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 2.5C19 15.6 12 20 12 20Z"/>',
    flag:    '<path d="M6 21V4M6 4h11l-2.5 3.5L17 11H6"/>',
};

// 称号 key → { 图标, 颜色 token, 是否主角 }
const TITLE_STYLE = {
    winner:   { icon: 'trophy',   tok: 'champ',    champ: true },  // 今晚大赢家（填充主角）
    fish:     { icon: 'smile',    tok: 'fish' },                   // 快乐源泉
    streak:   { icon: 'target',   tok: 'streak' },                 // 常胜将军
    steady:   { icon: 'mountain', tok: 'steady' },                 // 稳如泰山
    comeback: { icon: 'flame',    tok: 'comeback' },               // 后程发力
    bigheart: { icon: 'heart',    tok: 'bigheart' },               // 大心脏
    fighter:  { icon: 'flag',     tok: 'fighter' },                // 不服就干
};

// title 为 calcNightTitles() 数组里的一项；传入空值时返回空串（该玩家本期无称号）。
function renderTitleBadge(title) {
    if (!title) return '';
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const st = TITLE_STYLE[title.key] || { icon: 'trophy', tok: 'streak' };
    const svg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + TITLE_ICONS[st.icon] + '</svg>';
    const style = '--tb-bg:var(--title-' + st.tok + '-bg);--tb-ink:var(--title-' + st.tok + '-ink)';
    return '<span class="title-badge' + (st.champ ? ' champ' : '') + '" style="' + style + '">' + svg + esc(title.text) + '</span>';
}
