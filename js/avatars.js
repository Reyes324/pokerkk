// 12 anime-style SVG avatars, each as an inline SVG string
// Colors: bg (pastel), hair, skin tone consistent per character
const AVATARS = [
    // 0 — 粉发少女
    { bg: "#FFE4F0", svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#FFE4F0"/>
      <ellipse cx="40" cy="52" rx="18" ry="14" fill="#FFDAB9"/>
      <ellipse cx="40" cy="38" rx="16" ry="18" fill="#FFDAB9"/>
      <path d="M24 34 Q24 16 40 16 Q56 16 56 34 Q56 20 40 18 Q24 20 24 34Z" fill="#FF9EC4"/>
      <path d="M24 36 Q20 30 22 24 Q24 16 40 14 Q56 16 58 24 Q60 30 56 36" fill="#FF9EC4" stroke="#FF9EC4" stroke-width="2"/>
      <ellipse cx="33" cy="40" rx="3.5" ry="4" fill="#1a1a2e"/>
      <ellipse cx="47" cy="40" rx="3.5" ry="4" fill="#1a1a2e"/>
      <circle cx="34.5" cy="39" r="1" fill="white"/>
      <circle cx="48.5" cy="39" r="1" fill="white"/>
      <path d="M35 48 Q40 52 45 48" stroke="#cc7a8a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <circle cx="30" cy="44" r="3" fill="#FFB3C6" opacity="0.6"/>
      <circle cx="50" cy="44" r="3" fill="#FFB3C6" opacity="0.6"/>
    </svg>` },

    // 1 — 蓝发少年
    { bg: "#E4F0FF", svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#E4F0FF"/>
      <ellipse cx="40" cy="52" rx="18" ry="14" fill="#FFDAB9"/>
      <ellipse cx="40" cy="38" rx="16" ry="18" fill="#FFDAB9"/>
      <path d="M24 36 Q22 22 30 18 Q40 12 50 18 Q58 22 56 36" fill="#4A90D9"/>
      <path d="M24 36 Q26 28 24 24 L22 34Z" fill="#4A90D9"/>
      <path d="M56 36 Q54 28 56 24 L58 34Z" fill="#4A90D9"/>
      <ellipse cx="33" cy="40" rx="3.5" ry="4" fill="#1a1a2e"/>
      <ellipse cx="47" cy="40" rx="3.5" ry="4" fill="#1a1a2e"/>
      <circle cx="34.5" cy="39" r="1" fill="white"/>
      <circle cx="48.5" cy="39" r="1" fill="white"/>
      <path d="M36 48 Q40 50 44 48" stroke="#cc7a8a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>` },

    // 2 — 黄发活泼
    { bg: "#FFF9E4", svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#FFF9E4"/>
      <ellipse cx="40" cy="52" rx="18" ry="14" fill="#FFDAB9"/>
      <ellipse cx="40" cy="38" rx="16" ry="18" fill="#FFDAB9"/>
      <path d="M24 36 Q22 20 40 16 Q58 20 56 36" fill="#FFD700"/>
      <path d="M24 36 Q20 32 22 26 L26 32Z" fill="#FFD700"/>
      <path d="M56 36 Q60 32 58 26 L54 32Z" fill="#FFD700"/>
      <path d="M30 36 Q28 28 26 24 L24 30Z" fill="#FFC200"/>
      <ellipse cx="33" cy="40" rx="3.5" ry="4.5" fill="#1a1a2e"/>
      <ellipse cx="47" cy="40" rx="3.5" ry="4.5" fill="#1a1a2e"/>
      <circle cx="34.5" cy="38.5" r="1.2" fill="white"/>
      <circle cx="48.5" cy="38.5" r="1.2" fill="white"/>
      <path d="M34 49 Q40 54 46 49" stroke="#cc6666" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <circle cx="29" cy="44" r="3.5" fill="#FFB3C6" opacity="0.5"/>
      <circle cx="51" cy="44" r="3.5" fill="#FFB3C6" opacity="0.5"/>
    </svg>` },

    // 3 — 紫发神秘
    { bg: "#F0E4FF", svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#F0E4FF"/>
      <ellipse cx="40" cy="52" rx="18" ry="14" fill="#FFDAB9"/>
      <ellipse cx="40" cy="38" rx="16" ry="18" fill="#FFDAB9"/>
      <path d="M24 38 Q22 20 40 15 Q58 20 56 38" fill="#9B59B6"/>
      <path d="M56 38 Q60 42 58 50 Q54 44 56 38Z" fill="#9B59B6"/>
      <path d="M24 38 Q20 42 22 50 Q26 44 24 38Z" fill="#9B59B6"/>
      <ellipse cx="33" cy="40" rx="3.5" ry="4" fill="#2c1654"/>
      <ellipse cx="47" cy="40" rx="3.5" ry="4" fill="#2c1654"/>
      <circle cx="34.5" cy="39" r="1" fill="white"/>
      <circle cx="48.5" cy="39" r="1" fill="white"/>
      <path d="M36 48 Q40 51 44 48" stroke="#9B59B6" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>` },

    // 4 — 黑发冷静
    { bg: "#E8F5E9", svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#E8F5E9"/>
      <ellipse cx="40" cy="52" rx="18" ry="14" fill="#FFDAB9"/>
      <ellipse cx="40" cy="38" rx="16" ry="18" fill="#FFDAB9"/>
      <path d="M24 38 Q22 18 40 15 Q58 18 56 38 Q50 30 40 30 Q30 30 24 38Z" fill="#2d2d2d"/>
      <path d="M24 38 Q26 32 28 38" fill="#2d2d2d"/>
      <ellipse cx="33" cy="41" rx="3.5" ry="4" fill="#1a1a2e"/>
      <ellipse cx="47" cy="41" rx="3.5" ry="4" fill="#1a1a2e"/>
      <circle cx="34.5" cy="40" r="1" fill="white"/>
      <circle cx="48.5" cy="40" r="1" fill="white"/>
      <path d="M36 49 Q40 52 44 49" stroke="#996644" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>` },

    // 5 — 橙发活力
    { bg: "#FFF0E4", svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#FFF0E4"/>
      <ellipse cx="40" cy="52" rx="18" ry="14" fill="#FFDAB9"/>
      <ellipse cx="40" cy="38" rx="16" ry="18" fill="#FFDAB9"/>
      <path d="M24 36 Q22 18 40 15 Q58 18 56 36" fill="#FF7F00"/>
      <path d="M56 36 Q62 38 60 48 Q56 40 56 36Z" fill="#FF7F00"/>
      <path d="M24 36 Q18 38 20 48 Q24 40 24 36Z" fill="#FF7F00"/>
      <path d="M40 15 Q46 12 52 16 L50 22 Q46 18 40 18Z" fill="#FF9F20"/>
      <ellipse cx="33" cy="40" rx="3.5" ry="4.5" fill="#1a1a2e"/>
      <ellipse cx="47" cy="40" rx="3.5" ry="4.5" fill="#1a1a2e"/>
      <circle cx="34.5" cy="38.5" r="1.2" fill="white"/>
      <circle cx="48.5" cy="38.5" r="1.2" fill="white"/>
      <path d="M34 49 Q40 53 46 49" stroke="#cc5500" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <circle cx="29" cy="45" r="3" fill="#FFB3C6" opacity="0.5"/>
      <circle cx="51" cy="45" r="3" fill="#FFB3C6" opacity="0.5"/>
    </svg>` },

    // 6 — 银发老成
    { bg: "#F0F4FF", svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#F0F4FF"/>
      <ellipse cx="40" cy="52" rx="18" ry="14" fill="#FFDAB9"/>
      <ellipse cx="40" cy="38" rx="16" ry="18" fill="#FFDAB9"/>
      <path d="M24 36 Q22 18 40 14 Q58 18 56 36" fill="#C8C8DC"/>
      <path d="M56 36 Q60 40 58 50 Q55 42 56 36Z" fill="#C8C8DC"/>
      <path d="M24 36 Q20 40 22 50 Q25 42 24 36Z" fill="#C8C8DC"/>
      <ellipse cx="33" cy="40" rx="3.5" ry="4" fill="#334"/>
      <ellipse cx="47" cy="40" rx="3.5" ry="4" fill="#334"/>
      <circle cx="34.5" cy="39" r="1" fill="white"/>
      <circle cx="48.5" cy="39" r="1" fill="white"/>
      <path d="M35 48 Q40 52 45 48" stroke="#8888aa" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>` },

    // 7 — 红发热情
    { bg: "#FFE4E4", svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#FFE4E4"/>
      <ellipse cx="40" cy="52" rx="18" ry="14" fill="#FFDAB9"/>
      <ellipse cx="40" cy="38" rx="16" ry="18" fill="#FFDAB9"/>
      <path d="M24 36 Q22 18 40 14 Q58 18 56 36 Q48 22 40 22 Q32 22 24 36Z" fill="#CC2200"/>
      <path d="M56 36 Q60 36 62 42 Q58 40 56 36Z" fill="#CC2200"/>
      <path d="M24 36 Q20 36 18 42 Q22 40 24 36Z" fill="#CC2200"/>
      <ellipse cx="33" cy="41" rx="3.5" ry="4" fill="#1a1a2e"/>
      <ellipse cx="47" cy="41" rx="3.5" ry="4" fill="#1a1a2e"/>
      <circle cx="34.5" cy="40" r="1" fill="white"/>
      <circle cx="48.5" cy="40" r="1" fill="white"/>
      <path d="M34 49 Q40 54 46 49" stroke="#cc2244" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="29" cy="45" r="4" fill="#FFB3C6" opacity="0.6"/>
      <circle cx="51" cy="45" r="4" fill="#FFB3C6" opacity="0.6"/>
    </svg>` },

    // 8 — 绿发元气
    { bg: "#E4FFE8", svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#E4FFE8"/>
      <ellipse cx="40" cy="52" rx="18" ry="14" fill="#FFDAB9"/>
      <ellipse cx="40" cy="38" rx="16" ry="18" fill="#FFDAB9"/>
      <path d="M24 36 Q22 20 40 15 Q58 20 56 36" fill="#2ECC71"/>
      <path d="M24 36 Q22 32 20 38 L24 36Z" fill="#27AE60"/>
      <path d="M56 36 Q58 32 60 38 L56 36Z" fill="#27AE60"/>
      <path d="M40 15 Q34 10 28 14 L30 20 Q34 15 40 16Z" fill="#27AE60"/>
      <ellipse cx="33" cy="40" rx="3.5" ry="4.5" fill="#1a3a2e"/>
      <ellipse cx="47" cy="40" rx="3.5" ry="4.5" fill="#1a3a2e"/>
      <circle cx="34.5" cy="38.5" r="1.2" fill="white"/>
      <circle cx="48.5" cy="38.5" r="1.2" fill="white"/>
      <path d="M35 49 Q40 53 45 49" stroke="#1a8044" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>` },

    // 9 — 棕发稳重
    { bg: "#F5EDE0", svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#F5EDE0"/>
      <ellipse cx="40" cy="52" rx="18" ry="14" fill="#FFDAB9"/>
      <ellipse cx="40" cy="38" rx="16" ry="18" fill="#FFDAB9"/>
      <path d="M24 38 Q22 20 40 16 Q58 20 56 38 Q52 26 40 26 Q28 26 24 38Z" fill="#7B4F2E"/>
      <ellipse cx="33" cy="41" rx="3.5" ry="4" fill="#1a1a2e"/>
      <ellipse cx="47" cy="41" rx="3.5" ry="4" fill="#1a1a2e"/>
      <circle cx="34.5" cy="40" r="1" fill="white"/>
      <circle cx="48.5" cy="40" r="1" fill="white"/>
      <path d="M36 48 Q40 51 44 48" stroke="#994422" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>` },

    // 10 — 双马尾
    { bg: "#FFE4FA", svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#FFE4FA"/>
      <ellipse cx="17" cy="38" rx="7" ry="10" fill="#E040A0"/>
      <ellipse cx="63" cy="38" rx="7" ry="10" fill="#E040A0"/>
      <ellipse cx="40" cy="52" rx="18" ry="14" fill="#FFDAB9"/>
      <ellipse cx="40" cy="38" rx="16" ry="18" fill="#FFDAB9"/>
      <path d="M24 36 Q22 18 40 14 Q58 18 56 36" fill="#E040A0"/>
      <ellipse cx="33" cy="40" rx="3.5" ry="4" fill="#1a1a2e"/>
      <ellipse cx="47" cy="40" rx="3.5" ry="4" fill="#1a1a2e"/>
      <circle cx="34.5" cy="39" r="1" fill="white"/>
      <circle cx="48.5" cy="39" r="1" fill="white"/>
      <path d="M34 49 Q40 53 46 49" stroke="#E040A0" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="29" cy="44" r="3" fill="#FFB3C6" opacity="0.6"/>
      <circle cx="51" cy="44" r="3" fill="#FFB3C6" opacity="0.6"/>
    </svg>` },

    // 11 — 猫耳
    { bg: "#FFF4E4", svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="40" fill="#FFF4E4"/>
      <polygon points="22,30 28,16 34,30" fill="#D4A050"/>
      <polygon points="46,30 52,16 58,30" fill="#D4A050"/>
      <polygon points="24,29 28,18 32,29" fill="#FFB3C6"/>
      <polygon points="48,29 52,18 56,29" fill="#FFB3C6"/>
      <ellipse cx="40" cy="52" rx="18" ry="14" fill="#FFDAB9"/>
      <ellipse cx="40" cy="38" rx="16" ry="18" fill="#FFDAB9"/>
      <path d="M24 36 Q22 22 40 18 Q58 22 56 36" fill="#D4A050"/>
      <ellipse cx="33" cy="40" rx="3.5" ry="5" fill="#2d1a00"/>
      <ellipse cx="47" cy="40" rx="3.5" ry="5" fill="#2d1a00"/>
      <circle cx="34.5" cy="38.5" r="1" fill="white"/>
      <circle cx="48.5" cy="38.5" r="1" fill="white"/>
      <path d="M37 49 Q40 52 43 49" stroke="#cc7744" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <line x1="28" y1="46" x2="22" y2="44" stroke="#aa8855" stroke-width="1" stroke-linecap="round"/>
      <line x1="28" y1="48" x2="21" y2="48" stroke="#aa8855" stroke-width="1" stroke-linecap="round"/>
      <line x1="52" y1="46" x2="58" y2="44" stroke="#aa8855" stroke-width="1" stroke-linecap="round"/>
      <line x1="52" y1="48" x2="59" y2="48" stroke="#aa8855" stroke-width="1" stroke-linecap="round"/>
    </svg>` }
];

function getAvatarSvg(avatarId) {
    return AVATARS[avatarId % AVATARS.length].svg;
}

function getAvatarBg(avatarId) {
    return AVATARS[avatarId % AVATARS.length].bg;
}
