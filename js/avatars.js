// Cat avatars — illustrated cat-face set provided by the project owner,
// sliced from a 5×5 sheet into 25 individual circular avatars (img/avatars/cat-01..25.png).
// Pastel backgrounds are baked into each image; the circle bg below is a neutral fallback.
const AV_COUNT = 25;
const AV_VER = 9;
const AVATARS = Array.from({ length: AV_COUNT }, (_, i) => ({
    img: `img/avatars/cat-${String(i + 1).padStart(2, '0')}.png`,
    bg: '#F3EDE3',
}));

function getAvatarSvg(avatarId) {
    const a = AVATARS[avatarId % AVATARS.length];
    return `<img class="avatar-img" src="${a.img}?v=${AV_VER}" alt="" draggable="false">`;
}

function getAvatarBg(avatarId) {
    return AVATARS[avatarId % AVATARS.length].bg;
}
