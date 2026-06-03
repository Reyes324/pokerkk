const AVATARS = [
    // 人物 emoji
    { emoji: '👨', bg: '#E3F2FD' },
    { emoji: '👩', bg: '#FCE4EC' },
    { emoji: '👦', bg: '#F3E5F5' },
    { emoji: '👧', bg: '#FFF3E0' },
    { emoji: '👱', bg: '#FFF8E1' },
    { emoji: '🧔', bg: '#E8F5E9' },
    { emoji: '👴', bg: '#F1F8E9' },
    { emoji: '👵', bg: '#FBE9E7' },
    // 动物 emoji
    { emoji: '🐱', bg: '#FFF0F5' },
    { emoji: '🦊', bg: '#FFF3E8' },
    { emoji: '🐼', bg: '#F0F0F0' },
    { emoji: '🐯', bg: '#FFF8E0' },
    { emoji: '🐸', bg: '#EDFAF0' },
    { emoji: '🐧', bg: '#E8F4FF' },
    { emoji: '🦁', bg: '#FFF5E0' },
    { emoji: '🐻', bg: '#F5EDE0' },
    { emoji: '🦋', bg: '#F5E8FF' },
    { emoji: '🐨', bg: '#EBEBEB' },
    { emoji: '🦄', bg: '#FDE8FF' },
    { emoji: '🐙', bg: '#FFE8F0' },
    { emoji: '🐢', bg: '#E0F2F1' },
    { emoji: '🦅', bg: '#F5F5F5' },
];

function getAvatarSvg(avatarId) {
    const av = AVATARS[avatarId % AVATARS.length];
    return `<span class="emoji-avatar">${av.emoji}</span>`;
}

function getAvatarBg(avatarId) {
    return AVATARS[avatarId % AVATARS.length].bg;
}
