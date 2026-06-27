// WeChat WebView: fix position:fixed scrolling away bug
// When body scrolls in WeChat, re-pin the float bar
(function fixWechatFixed() {
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const bar = document.getElementById('float-bar');
            if (bar) {
                bar.style.bottom = '0px';
            }
            ticking = false;
        });
    }, { passive: true });
})();

firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.database();
const gameRef = db.ref('currentGame');

// ── Device identity ────────────────────────────────────────────
const deviceId = (() => {
    let id = sessionStorage.getItem('pokerkk-device');
    if (!id) { id = Math.random().toString(36).slice(2); sessionStorage.setItem('pokerkk-device', id); }
    return id;
})();

// ── State ──────────────────────────────────────────────────────
let players = [];
let isLoading = true; // true until first Firebase response
let chipModalIdx = -1;
let chipModalSnapshot = null;
let chipInputMode = 'stepper'; // 'stepper' | 'direct'
let stepperSnapshot = null;    // denomination values saved when entering direct mode
let directBaseTotal = 0;       // pre-filled total when entering direct mode (for change detection)
let pendingAvatarIdx = -1;
let pendingAvatarActionId = null; // photoId being managed in the action sheet
let pendingNameIdx = -1;
let pendingDeleteIdx = -1;
let pendingDeleteRoundId = null;
let pendingDeleteAggId = null;
const writeTimers = {};
let sharedAvatars = {}; // shared photo library: { photoId: { data } } — any player can pick any photo
let sharedAvatarsLoaded = false; // true once Firebase returns the library at least once

// ── Multi-round state ───────────────────────────────────────────
let rounds = {};       // { pushId: { timestamp, results: {pushId: {name, pnl}} } }
let aggregations = {}; // { pushId: { timestamp, label, roundCount, players: {pushId: {name, total}} } }
let recordsTab = 'rounds'; // 'rounds' | 'aggregations'
let isSelectMode = false;
let selectedRoundIds = new Set();

function defaultPlayers(count) {
    return Array.from({ length: count }, (_, i) => ({
        name: '玩家' + (i + 1),
        avatarId: i % AVATARS.length,
        n10: 0, n20: 0, n50: 0, n100: 0, buyIns: 0, confirmed: false
    }));
}

// Coerce a raw Firebase player object into a complete, well-typed shape.
// Old/partial DB records may lack fields — default them so logic never sees undefined.
function normalizePlayer(raw) {
    return {
        name: raw.name ?? '玩家',
        avatarId: raw.avatarId ?? 0,
        n10: raw.n10 || 0,
        n20: raw.n20 || 0,
        n50: raw.n50 || 0,
        n100: raw.n100 || 0,
        buyIns: raw.buyIns || 0,
        confirmed: raw.confirmed === true,
        // Set of devices currently editing this row: { deviceId: true }.
        // A set (not a single value) so EVERY concurrent editor sees the warning,
        // not just whoever's id happened to be stored last.
        editing: raw.editing || {},
        avatarRef: raw.avatarRef || null, // points into sharedAvatars; takes precedence over avatarId
    };
}

// "Someone else is editing this row" — true if the editing set has any device
// that isn't me with a fresh timestamp (< 60s). Legacy boolean `true` entries
// and stale timestamps are treated as inactive to handle crashed/backgrounded sessions.
function isEditingByOther(idx) {
    const editing = players[idx]?.editing;
    if (!editing) return false;
    const now = Date.now();
    return Object.entries(editing).some(([id, ts]) => {
        if (id === deviceId) return false;
        if (typeof ts !== 'number') return false; // legacy true — treat as stale
        if (now - ts > 60000) return false;        // older than 60s — stale
        return true;
    });
}

let editingHeartbeat = null;

function setEditingBy(idx) {
    const ref = gameRef.child('players/' + idx + '/editing/' + deviceId);
    ref.set(Date.now());
    ref.onDisconnect().remove();
    clearInterval(editingHeartbeat);
    editingHeartbeat = setInterval(() => {
        if (chipModalIdx >= 0)
            gameRef.child('players/' + chipModalIdx + '/editing/' + deviceId).set(Date.now());
    }, 20000);
}

function clearEditingBy(idx) {
    clearInterval(editingHeartbeat);
    editingHeartbeat = null;
    const ref = gameRef.child('players/' + idx + '/editing/' + deviceId);
    ref.onDisconnect().cancel();
    ref.remove();
}

// ── Firebase ───────────────────────────────────────────────────
gameRef.child('players').on('value', snap => {
    isLoading = false;
    const data = snap.val();
    if (!data) {
        gameRef.set({ status: 'waiting', players: defaultPlayers(3) });
        return;
    }
    const incoming = Object.keys(data)
        .sort((a, b) => Number(a) - Number(b))
        .map(k => normalizePlayer(data[k]));

    // While a chip modal is open, the player being edited is owned by local
    // state — don't let a (possibly stale, mid-debounce) remote echo clobber
    // the in-progress edits. Other players still sync live.
    if (chipModalIdx >= 0 && players[chipModalIdx] && incoming[chipModalIdx]) {
        // Keep local chip edits but take the editing set from Firebase so we see others editing
        incoming[chipModalIdx] = { ...players[chipModalIdx], editing: incoming[chipModalIdx].editing };
    }

    players = incoming;
    render();
    if (chipModalIdx >= 0 && players[chipModalIdx]) syncChipModal(chipModalIdx);
});

// Rounds and aggregations — separate paths so they don't pollute the hot sync
gameRef.child('rounds').on('value', snap => {
    rounds = snap.val() || {};
    renderFloatBar();
    renderHeader();
    renderRecordsPageIfOpen();
});
gameRef.child('aggregations').on('value', snap => {
    aggregations = snap.val() || {};
    renderRecordsPageIfOpen();
});

// Shared avatar library lives in a separate path so the heavy base64 never
// pollutes the game sync hot path — players only reference a tiny photoId.
db.ref('sharedAvatars').on('value', snap => {
    sharedAvatars = snap.val() || {};
    sharedAvatarsLoaded = true;
    renderPlayers();
    renderRecordsPageIfOpen();
    if (chipModalIdx >= 0 && players[chipModalIdx]) renderChipModal(chipModalIdx);
    // Live-refresh the open picker grid (e.g. someone else uploaded/deleted a photo)
    if (!document.getElementById('avatar-modal').classList.contains('hidden') && pendingAvatarIdx >= 0) {
        renderAvatarGrid(pendingAvatarIdx);
    }
});

// Connection status — surface "重连中…" when WebSocket drops (common in WeChat WebView)
db.ref('.info/connected').on('value', snap => {
    const el = document.getElementById('conn-indicator');
    if (el) el.classList.toggle('hidden', snap.val() === true);
});

// WeChat backgrounds and kills the WebSocket — force reconnect on resume
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) db.goOnline();
});

// Show skeleton immediately on load
renderPlayers();

// ── Avatar helpers ─────────────────────────────────────────────
// A player's avatar is a shared photo (if avatarRef resolves) else a cat.
// If avatarRef points to a deleted photo, it gracefully falls back to the cat.
function getPlayerPhoto(p) {
    return (p.avatarRef && sharedAvatars[p.avatarRef]?.data) || null;
}
// A player references a photo, but the shared library hasn't loaded yet — show a
// neutral placeholder rather than flashing the cat then correcting to the photo.
function isPhotoPending(p) {
    return p.avatarRef && !sharedAvatars[p.avatarRef]?.data && !sharedAvatarsLoaded;
}
function getAvatarContent(p) {
    if (isPhotoPending(p)) return '';
    const photo = getPlayerPhoto(p);
    return photo ? `<img src="${photo}" alt="">` : getAvatarSvg(p.avatarId);
}
function getAvatarBgFor(p) {
    if (isPhotoPending(p)) return 'var(--n10)';
    return getPlayerPhoto(p) ? '#f0ede8' : getAvatarBg(p.avatarId);
}

// ── Render ─────────────────────────────────────────────────────
function render() {
    renderPlayers();
    renderFloatBar();
}

function renderPlayers() {
    const list = document.getElementById('player-list');

    // Show skeleton while Firebase hasn't responded yet
    if (isLoading) {
        list.innerHTML = [0,1,2].map(() => `
            <div class="swipe-row">
                <div class="player-card skeleton-card">
                    <div class="player-card-main">
                        <div class="skeleton-avatar"></div>
                        <div class="player-info">
                            <div class="skeleton-line wide"></div>
                            <div class="skeleton-line narrow" style="margin-top:6px"></div>
                        </div>
                    </div>
                </div>
            </div>`).join('');
        return;
    }

    list.innerHTML = players.map((p, i) => {
        const chipTotal = calcChipTotal(p.n10, p.n20, p.n50, p.n100);
        const invested = calcInvested(p.buyIns);
        const pnl = calcPnl(chipTotal, invested);
        const isConfirmed = p.confirmed === true;
        const pnlClass = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral';
        const otherEditing = isEditingByOther(i);
        const settled = false;

        return `
        <div class="swipe-row" data-idx="${i}">
            <div class="swipe-delete-btn" data-del="${i}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                删除
            </div>
            <div class="player-card ${settled ? 'settled' : ''}" data-idx="${i}"
                 ${settled ? '' : `onclick="openChipModal(${i})"`}>
                <div class="player-card-main">
                    <div class="avatar-circle ${settled ? '' : 'clickable'}"
                         style="background:${getAvatarBgFor(p)}"
                         ${settled ? '' : `onclick="event.stopPropagation();openAvatarModal(${i})"`}>
                        ${getAvatarContent(p)}
                        ${settled ? '' : '<div class="avatar-edit-hint">换</div>'}
                    </div>
                    <!-- name col -->
                    <div class="player-name-col">
                        <div class="player-name-row">
                            <span class="player-name">${escHtml(p.name)}</span>
                            ${settled ? '' : `
                            <button class="btn-edit-name" onclick="event.stopPropagation();openNameModal(${i})" aria-label="编辑名字">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>
                                </svg>
                            </button>`}
                        </div>
                    </div>
                    <!-- pnl + chevron — right side -->
                    <div class="player-pnl-col">
                        <div class="pnl-stack">
                            ${isConfirmed
                                ? `<div class="pnl-confirmed-row">
                                       <span class="pnl-inline ${pnlClass}">${formatPnl(pnl)} 分</span>
                                       ${otherEditing ? '<span class="editing-dot"></span>' : ''}
                                   </div>`
                                : `<span class="pnl-inline placeholder">${otherEditing ? '录入中…' : '录入筹码'}</span>`
                            }
                        </div>
                        <div class="card-chevron">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');

    setupSwipeDelete();
    setupLongPress();
}

function renderFloatBar() {
    // Only count confirmed players — unconfirmed ones haven't submitted yet
    const confirmed = players.filter(p => p.confirmed === true);
    const total = confirmed.reduce((sum, p) =>
        sum + calcPnl(calcChipTotal(p.n10, p.n20, p.n50, p.n100), calcInvested(p.buyIns)), 0);
    const hasAnyData = confirmed.length > 0;
    const balanced = total === 0;

    const pnlEl = document.getElementById('total-pnl');
    const tag = document.getElementById('balance-tag');
    const endBtn = document.getElementById('btn-end-round');
    const exportBtn = document.getElementById('btn-export');

    if (!hasAnyData) {
        pnlEl.textContent = '— 分';
        pnlEl.className = 'float-bar-value neutral';
        tag.classList.add('hidden');
        if (endBtn) { endBtn.disabled = true; }
        if (exportBtn) { exportBtn.disabled = true; }
        return;
    }

    pnlEl.textContent = formatPnl(total) + ' 分';
    pnlEl.className = 'float-bar-value ' + (balanced ? 'balanced' : total > 0 ? 'positive' : 'negative');

    tag.classList.remove('hidden');
    tag.textContent = balanced ? '已持平' : '未持平';
    tag.className = 'balance-tag ' + (balanced ? 'ok' : 'warn');

    if (endBtn) endBtn.disabled = !(balanced && hasAnyData);
    if (exportBtn) exportBtn.disabled = !balanced;
}

// ── Export results ─────────────────────────────────────────────
function openExportModal() {
    const sorted = players
        .filter(p => p.confirmed === true)
        .map(r => {
            const chipTotal = calcChipTotal(r.n10, r.n20, r.n50, r.n100);
            const invested = calcInvested(r.buyIns);
            return { ...r, chipTotal, invested, pnl: calcPnl(chipTotal, invested) };
        })
        .sort((a, b) => b.pnl - a.pnl);
    const totalPnl = sorted.reduce((s, r) => s + r.pnl, 0);
    const isBalanced = totalPnl === 0;

    // Set date + time with seconds
    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    document.getElementById('export-date').textContent =
        `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${timeStr}`;

    // Build player rows — Spotify 成绩单:大赢家=正在播放(绿) + Montserrat 排名
    const pot = sorted.reduce((s, r) => s + r.invested, 0);
    const rowsHtml = sorted.map((r, i) => {
        const pnlClass = r.pnl > 0 ? 'win' : r.pnl < 0 ? 'lose' : 'zero';
        const lead = i === 0 ? ' lead' : '';
        const champTag = (i === 0 && r.pnl > 0)
            ? `<span class="export-champ-tag">今晚大赢家</span>` : '';
        return `<div class="export-player-row${lead}">
            <span class="export-rank">${i + 1}</span>
            <div class="export-ava"><div class="avatar-circle sm" style="background:${getAvatarBgFor(r)}">${getAvatarContent(r)}</div></div>
            <div class="export-name-col">
                <span class="export-player-name">${escHtml(r.name)}</span>
                ${champTag}
            </div>
            <div class="export-pnl ${pnlClass}">${formatPnl(r.pnl)}</div>
        </div>`;
    }).join('');
    document.getElementById('export-table-wrap').innerHTML =
        `<div class="export-player-list">${rowsHtml}</div>`;

    const checkSvg = `<svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#1ed760" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    document.getElementById('export-badge').innerHTML = isBalanced
        ? `<div class="export-card-footer balanced">
               <span class="export-foot-stat">${sorted.length} 人</span>
               <span class="export-foot-sep"></span>
               <span class="export-foot-stat">底池 ${pot}</span>
               <span class="export-foot-sep"></span>
               <span class="export-foot-verify"><span class="export-check-circle">${checkSvg}</span>零和通过</span>
           </div>`
        : `<div class="export-card-footer unbalanced">✗ 总盈亏 = ${formatPnl(totalPnl)}，请检查</div>`;

    generateImage();
}

function generateImage() {
    const card = document.getElementById('export-card');
    html2canvas(card, {
        scale: 2,
        backgroundColor: null,
        useCORS: true,
        logging: false
    }).then(canvas => {
        document.getElementById('export-image').src = canvas.toDataURL('image/png');
        openModal('export-modal');
    }).catch(() => {
        showToast('生成图片失败，请截图保存');
    });
}

// ── iOS swipe-left delete ──────────────────────────────────────
function setupSwipeDelete() {
    // Close all swiped rows when tapping elsewhere
    document.addEventListener('click', closeAllSwiped, { once: false });

    document.querySelectorAll('.swipe-row').forEach(row => {
        const card = row.querySelector('.player-card');
        const delBtn = row.querySelector('.swipe-delete-btn');
        const idx = parseInt(row.dataset.idx);
        let startX = 0, startY = 0, currentX = 0;
        let tracking = false, directionLocked = false, isHorizontal = false;

        card.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            currentX = 0;
            tracking = true;
            directionLocked = false;
            isHorizontal = false;
            card.style.transition = 'none';
        }, { passive: true });

        card.addEventListener('touchmove', e => {
            if (!tracking) return;
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;

            if (!directionLocked) {
                if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
                directionLocked = true;
                isHorizontal = Math.abs(dx) > Math.abs(dy);
            }

            if (!isHorizontal) return;
            e.preventDefault(); // prevent vertical scroll during horizontal swipe

            currentX = Math.max(-80, Math.min(0, dx));
            card.style.transform = `translateX(${currentX}px)`;
        }, { passive: false });

        card.addEventListener('touchend', () => {
            if (!tracking) return;
            tracking = false;
            card.style.transition = 'transform .22s cubic-bezier(.4,0,.2,1)';

            if (currentX < -40) {
                card.style.transform = 'translateX(-80px)';
                row.classList.add('swiped');
            } else {
                card.style.transform = 'translateX(0)';
                row.classList.remove('swiped');
            }
        });

        delBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (players.length <= 2) { showToast('至少保留2位玩家'); closeAllSwiped(); return; }
            removePlayer(idx);
            closeAllSwiped();
        });
    });
}

function closeAllSwiped() {
    document.querySelectorAll('.swipe-row.swiped').forEach(row => {
        row.classList.remove('swiped');
        const card = row.querySelector('.player-card');
        if (card) { card.style.transition = 'transform .22s cubic-bezier(.4,0,.2,1)'; card.style.transform = 'translateX(0)'; }
    });
}

// ── Long-press delete ──────────────────────────────────────────
function setupLongPress() {
    document.querySelectorAll('.player-card[data-idx]').forEach(card => {
        let timer = null, startX = 0, startY = 0;
        card.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            timer = setTimeout(() => {
                const idx = parseInt(card.dataset.idx);
                if (players.length <= 2) { showToast('至少保留2位玩家'); return; }
                card.classList.add('long-press-active');
                showDeleteConfirm(idx);
            }, 600);
        }, { passive: true });
        const cancel = (e) => {
            if (e && e.touches) {
                const dx = Math.abs(e.touches[0].clientX - startX);
                const dy = Math.abs(e.touches[0].clientY - startY);
                if (dx < 8 && dy < 8) return;
            }
            clearTimeout(timer); timer = null;
            card.classList.remove('long-press-active');
        };
        card.addEventListener('touchmove', cancel, { passive: true });
        card.addEventListener('touchend', () => { clearTimeout(timer); timer = null; card.classList.remove('long-press-active'); });
        card.addEventListener('touchcancel', () => { clearTimeout(timer); timer = null; card.classList.remove('long-press-active'); });
    });
}

function showDeleteConfirm(idx) {
    pendingDeleteIdx = idx;
    document.getElementById('delete-modal-text').textContent = `删除「${players[idx].name}」？`;
    openModal('delete-modal');
}

// ── Chip half-sheet ────────────────────────────────────────────
function openChipModal(idx) {
    chipModalIdx = idx;
    chipInputMode = 'stepper';
    chipModalSnapshot = { ...players[idx] };
    setEditingBy(idx);
    renderChipModal(idx);
    openModal('chip-modal');
}

function renderChipModal(idx) {
    const p = players[idx];
    // Header — tap avatar to change, tap name to edit
    document.getElementById('chip-modal-header').innerHTML = `
        <div class="avatar-circle clickable" style="background:${getAvatarBgFor(p)}"
             onclick="openAvatarModal(${idx})">
            ${getAvatarContent(p)}
            <div class="avatar-edit-hint">换</div>
        </div>
        <div style="flex:1;min-width:0">
            <div class="chip-modal-name" onclick="openNameModal(${idx})">
                ${escHtml(p.name)}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>
                </svg>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
                <span style="font-size:12px;color:var(--text3)">1底 = 1000分</span>
                <span class="editing-tag${isEditingByOther(idx) ? '' : ' hidden'}" id="chip-modal-editing-tag">有人录入中</span>
            </div>
        </div>
        <button class="mode-toggle-btn" id="btn-mode-toggle" onclick="toggleChipMode(${idx})">
            ${chipInputMode === 'stepper' ? '直接输入' : '按筹码输入'}
        </button>`;
    renderChipModalBody(idx);
}

function renderChipModalBody(idx) {
    const p = players[idx];
    const body = document.getElementById('chip-modal-body');

    if (chipInputMode === 'stepper') {
        const chips = [
            { key: 'n100', label: '100 分筹码', cls: 'c100', val: p.n100 },
            { key: 'n50',  label: '50 分筹码',  cls: 'c50',  val: p.n50 },
            { key: 'n20',  label: '20 分筹码',  cls: 'c20',  val: p.n20 },
            { key: 'n10',  label: '10 分筹码',  cls: 'c10',  val: p.n10 },
        ];
        const rows = chips.map(c => `
            <div class="stepper-row">
                <div class="chip-dot ${c.cls}">${c.key.slice(1)}</div>
                <div class="stepper-label">${c.label}</div>
                <div class="stepper-ctrl">
                    <button class="stepper-btn" onclick="adjustChip(${idx},'${c.key}',-1)">−</button>
                    <input class="stepper-count" id="mc-${c.key}" type="number" inputmode="numeric"
                        value="${c.val}" min="0" max="999"
                        onchange="setChip(${idx},'${c.key}',this.value)"
                        onclick="this.select()">
                    <button class="stepper-btn" onclick="adjustChip(${idx},'${c.key}',1)">＋</button>
                </div>
            </div>`).join('');
        const buyIn = `
            <div class="stepper-row buyin-row">
                <div class="chip-dot" style="background:#C8894B;font-size:9px">底</div>
                <div class="stepper-label">借了几底<span>每借一底 = 额外1000分投入</span></div>
                <div class="stepper-ctrl">
                    <button class="stepper-btn" onclick="adjustChip(${idx},'buyIns',-1)">−</button>
                    <input class="stepper-count" id="mc-buyIns" type="number" inputmode="numeric"
                        value="${p.buyIns}" min="0" max="99"
                        onchange="setChip(${idx},'buyIns',this.value)"
                        onclick="this.select()">
                    <button class="stepper-btn" onclick="adjustChip(${idx},'buyIns',1)">＋</button>
                </div>
            </div>`;
        body.innerHTML = `<div class="stepper-rows">${rows}${buyIn}</div>`;
    } else {
        // Direct input mode
        const chipTotal = calcChipTotal(p.n10, p.n20, p.n50, p.n100);
        body.innerHTML = `
            <div class="direct-input-wrap">
                <div class="direct-input-row">
                    <span style="font-size:13px;color:var(--text2);flex:1">最终剩余持筹</span>
                    <input class="direct-input-field" id="direct-chip-total" type="number"
                        inputmode="numeric" placeholder="0" value="${chipTotal || ''}"
                        style="width:130px;text-align:right"
                        oninput="previewDirectInput(${idx})">
                </div>
                <div class="direct-input-row buyin-row">
                    <span style="font-size:13px;color:var(--text2);flex:1">借了几底</span>
                    <input class="direct-input-field" id="direct-buyin" type="number"
                        inputmode="numeric" placeholder="0" value="${p.buyIns || ''}"
                        style="width:80px;text-align:right"
                        oninput="previewDirectInput(${idx})">
                </div>
                <p style="font-size:11px;color:var(--text3);text-align:center">直接输入本局最终持有的筹码总分</p>
            </div>`;
    }
    // PnL preview — always show real calculation
    const chipTotal = calcChipTotal(p.n10, p.n20, p.n50, p.n100);
    const invested = calcInvested(p.buyIns);
    const pnl = calcPnl(chipTotal, invested);
    const pnlClass = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : '';
    body.innerHTML += `
        <div class="pnl-preview-row" id="mc-pnl">
            <span>持筹<strong>${chipTotal}</strong></span>
            <span>投入<strong>${invested}</strong></span>
            <span class="${pnlClass}">盈亏<strong>${formatPnl(pnl)}</strong></span>
        </div>`;
}

function toggleChipMode(idx) {
    if (chipInputMode === 'stepper') {
        // Stepper → Direct: snapshot current denominations, pre-fill total
        const p = players[idx];
        stepperSnapshot = { n10: p.n10||0, n20: p.n20||0, n50: p.n50||0, n100: p.n100||0 };
        directBaseTotal = calcChipTotal(p.n10, p.n20, p.n50, p.n100);
        chipInputMode = 'direct';
    } else {
        // Direct → Stepper
        const totalEl = document.getElementById('direct-chip-total');
        const currentTotal = Math.max(0, parseInt(totalEl?.value) || 0);
        const buyInEl = document.getElementById('direct-buyin');
        const currentBuyIns = Math.max(0, parseInt(buyInEl?.value) || 0);
        if (stepperSnapshot && currentTotal === directBaseTotal) {
            // Unmodified: restore original denominations
            players[idx] = { ...players[idx], ...stepperSnapshot, buyIns: currentBuyIns };
        } else {
            // Modified: clear denominations, user counts again from scratch
            players[idx] = { ...players[idx], n10: 0, n20: 0, n50: 0, n100: 0, buyIns: currentBuyIns };
        }
        stepperSnapshot = null;
        directBaseTotal = 0;
        chipInputMode = 'stepper';
    }
    renderChipModalBody(idx);
}

function previewDirectInput(idx) {
    const totalEl = document.getElementById('direct-chip-total');
    const buyInEl = document.getElementById('direct-buyin');
    const chipTotal = parseInt(totalEl?.value) || 0;
    const buyIns = parseInt(buyInEl?.value) || 0;
    const invested = calcInvested(buyIns);
    const pnl = calcPnl(chipTotal, invested);
    const pnlClass = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : '';
    const pnlEl = document.getElementById('mc-pnl');
    if (pnlEl) pnlEl.innerHTML = `
        <span>持筹<strong>${chipTotal}</strong></span>
        <span>投入<strong>${invested}</strong></span>
        <span class="${pnlClass}">盈亏<strong>${formatPnl(pnl)}</strong></span>`;
    // Realtime update float bar while previewing direct input
    renderFloatBar();
}

// Read the typed total + buy-ins from the direct-input fields, decompose into
// denominations, and write into local state. Caller is responsible for the
// Firebase write (the atomic close handles it).
function applyDirectInputLocal(idx) {
    const totalEl = document.getElementById('direct-chip-total');
    const buyInEl = document.getElementById('direct-buyin');
    if (!totalEl) return;
    const chipTotal = Math.max(0, parseInt(totalEl.value) || 0);
    const newBuyIns = Math.max(0, parseInt(buyInEl?.value) || 0);
    let rem = chipTotal;
    const n100 = Math.floor(rem / 100); rem -= n100 * 100;
    const n50  = Math.floor(rem / 50);  rem -= n50  * 50;
    const n20  = Math.floor(rem / 20);  rem -= n20  * 20;
    const n10  = Math.floor(rem / 10);
    players[idx] = { ...players[idx], n100, n50, n20, n10, buyIns: newBuyIns };
}

// ── Modal animation helper ─────────────────────────────────────
// push=true  → slide in/out from right (二级页面)
// push=false → slide up/down from bottom (半页 sheet)
function openModal(id) {
    const overlay = document.getElementById(id);
    const sheet = overlay.querySelector('.modal-sheet');
    const isPush = overlay.classList.contains('push');
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    if (sheet) {
        sheet.style.animation = 'none';
        sheet.offsetHeight; // force reflow
        if (isPush) {
            const DUR = 300;
            sheet.style.animation = `slideInRight ${DUR}ms cubic-bezier(.25,0,.25,1) both`;
        } else {
            const DUR = 220;
            overlay.style.opacity = '0';
            sheet.style.animation = `slideUp ${DUR}ms cubic-bezier(.4,0,.2,1) both`;
            overlay.style.transition = `opacity ${DUR}ms ease`;
            requestAnimationFrame(() => { overlay.style.opacity = '1'; });
            setTimeout(() => { overlay.style.transition = ''; overlay.style.opacity = ''; }, DUR);
        }
    }
}

function closeModal(id, callback) {
    const overlay = document.getElementById(id);
    const sheet = overlay.querySelector('.modal-sheet');
    const isPush = overlay.classList.contains('push');
    if (sheet) {
        if (isPush) {
            const DUR = 260;
            sheet.style.animation = `slideOutRight ${DUR}ms cubic-bezier(.4,0,1,1) both`;
            setTimeout(() => {
                overlay.classList.add('hidden');
                sheet.style.animation = '';
                if (!document.querySelector('.modal-overlay:not(.hidden)')) {
                    document.body.style.overflow = '';
                    document.body.style.position = '';
                    document.body.style.width = '';
                }
                if (callback) callback();
            }, DUR);
        } else {
            const DUR = 180;
            overlay.style.transition = `opacity ${DUR}ms ease`;
            overlay.style.opacity = '0';
            sheet.style.animation = `slideDown ${DUR}ms cubic-bezier(.4,0,1,1) both`;
            setTimeout(() => {
                overlay.classList.add('hidden');
                sheet.style.animation = '';
                overlay.style.transition = '';
                overlay.style.opacity = '';
                if (!document.querySelector('.modal-overlay:not(.hidden)')) {
                    document.body.style.overflow = '';
                    document.body.style.position = '';
                    document.body.style.width = '';
                }
                if (callback) callback();
            }, DUR);
        }
    } else {
        overlay.classList.add('hidden');
        if (!document.querySelector('.modal-overlay:not(.hidden)')) {
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
        }
        if (callback) callback();
    }
}

// confirm=true  → 点"完成":写入 Firebase，标记已确认
// confirm=false → 点蒙层/取消:丢弃本地修改，还原快照
function closeChipModal(confirm) {
    const idx = chipModalIdx;
    if (idx < 0 || !players[idx]) {
        closeModal('chip-modal', () => { chipModalIdx = -1; chipModalSnapshot = null; stepperSnapshot = null; directBaseTotal = 0; });
        return;
    }

    clearTimeout(writeTimers[idx]);

    if (confirm) {
        // In direct-input mode, commit the typed total into local denominations first.
        if (chipInputMode === 'direct') applyDirectInputLocal(idx);

        const p = players[idx];
        p.confirmed = true;
        const payload = {
            n10: p.n10 || 0, n20: p.n20 || 0, n50: p.n50 || 0,
            n100: p.n100 || 0, buyIns: p.buyIns || 0, confirmed: true,
        };
        gameRef.child('players/' + idx).update(payload);
    } else {
        // Discard edits — restore to the snapshot taken when the modal opened.
        if (chipModalSnapshot) {
            players[idx] = { ...chipModalSnapshot };
        }
    }

    renderPlayers();
    renderFloatBar();
    clearEditingBy(idx);
    closeModal('chip-modal', () => { chipModalIdx = -1; chipModalSnapshot = null; stepperSnapshot = null; directBaseTotal = 0; });
}

function syncChipModal(idx) {
    const p = players[idx];
    ['n100','n50','n20','n10','buyIns'].forEach(k => {
        const el = document.getElementById('mc-' + k);
        if (el && document.activeElement !== el) el.value = p[k] || 0;
    });
    // Update PnL preview
    const chipTotal = calcChipTotal(p.n10, p.n20, p.n50, p.n100);
    const invested = calcInvested(p.buyIns);
    const pnl = calcPnl(chipTotal, invested);
    const pnlClass = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : '';
    const pnlEl = document.getElementById('mc-pnl');
    if (pnlEl) pnlEl.innerHTML = `
        <span>持筹<strong>${chipTotal}</strong></span>
        <span>投入<strong>${invested}</strong></span>
        <span class="${pnlClass}">盈亏<strong>${formatPnl(pnl)}</strong></span>`;
    // Update editing tag in chip modal header
    const tag = document.getElementById('chip-modal-editing-tag');
    if (tag) tag.classList.toggle('hidden', !isEditingByOther(idx));
}

// ── Chip adjustments ───────────────────────────────────────────
function adjustChip(idx, key, delta) {
    if (!players[idx]) return;
    const current = parseInt(players[idx][key]) || 0;
    const next = Math.max(0, current + delta);
    if (next === current) return;
    players[idx][key] = next;
    const el = document.getElementById('mc-' + key);
    if (el) el.value = next;
    syncChipModal(idx);
    updateCardPnl(idx);
    renderFloatBar();
}

function setChip(idx, key, rawVal) {
    const next = Math.max(0, parseInt(rawVal) || 0);
    players[idx][key] = next;
    syncChipModal(idx);
    updateCardPnl(idx);
    renderFloatBar();
}

function updateCardPnl(idx) {
    const p = players[idx];
    const chipTotal = calcChipTotal(p.n10, p.n20, p.n50, p.n100);
    const invested = calcInvested(p.buyIns);
    const pnl = calcPnl(chipTotal, invested);
    const isConfirmed = players[idx]?.confirmed === true;
    const el = document.querySelector(`.player-card[data-idx="${idx}"] .pnl-inline`);
    if (!el) return;
    el.textContent = isConfirmed ? formatPnl(pnl) + ' 分' : '录入筹码';
    el.className = 'pnl-inline ' + (isConfirmed ? (pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral') : 'placeholder');
}

// ── Add / remove ───────────────────────────────────────────────
function addPlayer() {
    if (players.length >= 15) { showToast('最多支持15位玩家'); return; }
    const idx = players.length;
    gameRef.child('players/' + idx).set({
        name: '玩家' + (idx + 1), avatarId: idx % AVATARS.length,
        n10: 0, n20: 0, n50: 0, n100: 0, buyIns: 0, confirmed: false
    });
}
function removePlayer(idx) {
    clearTimeout(writeTimers[idx]);
    delete writeTimers[idx];
    // Shared avatars are index-independent — deleting a player needs no avatar shuffle.
    // The player's avatarRef leaves with them; the shared photo stays in the library.
    gameRef.child('players').set(players.filter((_, i) => i !== idx));
}

// ── Avatar modal ───────────────────────────────────────────────
function openAvatarModal(idx) {
    pendingAvatarIdx = idx;
    if (chipModalIdx < 0) setEditingBy(idx);
    renderAvatarGrid(idx);
    const tag = document.getElementById('avatar-modal-editing-tag');
    if (tag) tag.classList.toggle('hidden', !isEditingByOther(idx));
    openModal('avatar-modal');
}

// Build the picker grid: [+ upload] [shared photos…] [25 cats]
function renderAvatarGrid(idx) {
    const p = players[idx];
    const grid = document.getElementById('modal-avatar-grid');
    grid.innerHTML = '';

    // 1) Upload cell — always just a "+" entry, adds to the shared library
    const uploadCell = document.createElement('div');
    uploadCell.className = 'avatar-upload-cell';
    uploadCell.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><span class="upload-hint">上传照片</span>`;
    uploadCell.addEventListener('click', () => triggerFilePick('new'));
    grid.appendChild(uploadCell);

    // 2) Shared uploaded photos — anyone can pick; corner icon manages
    Object.keys(sharedAvatars).forEach(photoId => {
        const data = sharedAvatars[photoId]?.data;
        if (!data) return;
        const cell = document.createElement('div');
        cell.className = 'avatar-photo-item' + (p.avatarRef === photoId ? ' selected' : '');
        cell.innerHTML = `
            <img src="${data}" alt="">
            <button class="avatar-manage-btn" onclick="event.stopPropagation();openAvatarActionModal('${photoId}')" aria-label="管理照片">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
            </button>`;
        cell.addEventListener('click', () => {
            gameRef.child('players/' + pendingAvatarIdx + '/avatarRef').set(photoId);
            applyAvatarSelectionLocal(pendingAvatarIdx, { avatarRef: photoId });
            closeAvatarModal();
        });
        grid.appendChild(cell);
    });

    // 3) Built-in cat avatars
    AVATARS.forEach((av, i) => {
        const div = document.createElement('div');
        div.className = 'avatar-item' + (!p.avatarRef && p.avatarId === i ? ' selected' : '');
        div.innerHTML = getAvatarSvg(i);
        div.style.background = av.bg;
        div.addEventListener('click', () => {
            // Selecting a cat clears any shared-photo reference
            gameRef.child('players/' + pendingAvatarIdx).update({ avatarId: i, avatarRef: null });
            applyAvatarSelectionLocal(pendingAvatarIdx, { avatarId: i, avatarRef: null });
            closeAvatarModal();
        });
        grid.appendChild(div);
    });
}

function closeAvatarModal() {
    if (chipModalIdx < 0 && pendingAvatarIdx >= 0) clearEditingBy(pendingAvatarIdx);
    closeModal('avatar-modal');
}

// Mirror an avatar change into local state. The game listener preserves the
// locally-owned player while a chip modal is open, so a Firebase-only write
// wouldn't refresh the open chip-modal header — patch local + re-render.
function applyAvatarSelectionLocal(idx, patch) {
    if (players[idx]) Object.assign(players[idx], patch);
    if (chipModalIdx === idx) renderChipModal(idx);
}

// mode: 'new' (add to library + assign to current player) | 'replace' (overwrite pendingAvatarActionId)
function triggerFilePick(mode) {
    const fileInput = document.getElementById('avatar-upload-input');
    fileInput.dataset.mode = mode;
    fileInput.value = '';
    fileInput.click();
}

function openAvatarActionModal(photoId) {
    pendingAvatarActionId = photoId;
    openModal('avatar-action-modal');
}

// Delete a shared photo. Any player using it falls back to their cat avatar.
function deleteSharedAvatar(photoId) {
    players.forEach((p, i) => {
        if (p.avatarRef === photoId) {
            gameRef.child('players/' + i + '/avatarRef').remove();
            applyAvatarSelectionLocal(i, { avatarRef: null });
        }
    });
    db.ref('sharedAvatars/' + photoId).remove();
    showToast('已删除照片');
}

// Compress to 160×160 JPEG, then either add to library or replace an existing photo.
function processAvatarFile(file, mode) {
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 160;
            const ctx = canvas.getContext('2d');
            const size = Math.min(img.naturalWidth, img.naturalHeight);
            const sx = (img.naturalWidth - size) / 2;
            const sy = (img.naturalHeight - size) / 2;
            ctx.drawImage(img, sx, sy, size, size, 0, 0, 160, 160);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

            if (mode === 'replace' && pendingAvatarActionId) {
                db.ref('sharedAvatars/' + pendingAvatarActionId).set({ data: dataUrl });
                showToast('照片已更新');
            } else {
                const ref = db.ref('sharedAvatars').push();
                ref.set({ data: dataUrl });
                // Auto-select the freshly uploaded photo for the current player
                if (pendingAvatarIdx >= 0) {
                    gameRef.child('players/' + pendingAvatarIdx + '/avatarRef').set(ref.key);
                    applyAvatarSelectionLocal(pendingAvatarIdx, { avatarRef: ref.key });
                }
                if (chipModalIdx < 0 && pendingAvatarIdx >= 0) clearEditingBy(pendingAvatarIdx);
                closeAvatarModal();
                showToast('头像已上传');
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ── Name modal ─────────────────────────────────────────────────
function openNameModal(idx) {
    pendingNameIdx = idx;
    const inp = document.getElementById('name-modal-input');
    inp.value = players[idx].name;
    const tag = document.getElementById('name-modal-editing-tag');
    if (tag) tag.classList.toggle('hidden', !isEditingByOther(idx));
    if (chipModalIdx < 0) setEditingBy(idx);
    openModal('name-modal');
    setTimeout(() => inp.focus(), 150);
}
function closeNameModal() {
    if (chipModalIdx < 0 && pendingNameIdx >= 0) clearEditingBy(pendingNameIdx);
    closeModal('name-modal');
}
function saveName() {
    const name = document.getElementById('name-modal-input').value.trim();
    if (!name) { showToast('名字不能为空'); return; }
    gameRef.child('players/' + pendingNameIdx + '/name').set(name);
    closeNameModal();
}


// ── Reset ──────────────────────────────────────────────────────
function showResetModal() {
    openModal('reset-modal');
}
function closeResetModal() { closeModal('reset-modal'); }
function resetSoft() {
    // Use child() writes to preserve rounds/ and aggregations/ paths
    gameRef.child('status').set('waiting');
    gameRef.child('players').set(players.map(p => ({ ...p, n10: 0, n20: 0, n50: 0, n100: 0, buyIns: 0, confirmed: false })));
    closeResetModal();
    showToast('已重置筹码，可以开始新一局');
}
function resetHard() {
    gameRef.set({ status: 'waiting', players: defaultPlayers(3) });
    db.ref('sharedAvatars').remove();
    gameRef.child('rounds').remove();
    gameRef.child('aggregations').remove();
    closeResetModal();
    showToast('已完全重置');
}

// ── Utilities ──────────────────────────────────────────────────
function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Multi-round feature ────────────────────────────────────────

// Header badge
function renderHeader() {
    const badge = document.getElementById('rounds-badge');
    if (!badge) return;
    const count = Object.keys(rounds).length;
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
}

// Date/time helpers
function formatDateTime(date) {
    const M = date.getMonth() + 1;
    const D = date.getDate();
    const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
    const H = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const sec = String(date.getSeconds()).padStart(2, '0');
    return M + '月' + D + '日 ' + weekdays[date.getDay()] + ' ' + H + ':' + min + ':' + sec;
}
function formatDateWeekday(date) {
    const M = date.getMonth() + 1;
    const D = date.getDate();
    const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
    return M + '月' + D + '日 ' + weekdays[date.getDay()];
}

// ── End round ──────────────────────────────────────────────────
function openEndRoundModal() {
    renderEndRoundModal();
    openModal('end-round-modal');
}
function renderEndRoundModal() {
    const confirmed = players.filter(p => p.confirmed);
    const roundNum = Object.keys(rounds).length + 1;
    const timeStr = formatDateTime(new Date());
    const rows = confirmed.map(p => {
        const pnl = calcPnl(calcChipTotal(p.n10, p.n20, p.n50, p.n100), calcInvested(p.buyIns));
        const cls = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral';
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--n10)">' +
            '<div style="display:flex;align-items:center;gap:8px">' +
            '<div class="avatar-circle sm" style="background:' + getAvatarBgFor(p) + ';flex-shrink:0">' + getAvatarContent(p) + '</div>' +
            '<span style="font-size:15px;color:var(--ink-1)">' + escHtml(p.name) + '</span>' +
            '</div>' +
            '<span class="pnl-inline ' + cls + '">' + formatPnl(pnl) + ' 分</span>' +
            '</div>';
    }).join('');
    document.getElementById('end-round-modal-body').innerHTML =
        '<p style="font-size:13px;color:var(--ink-3);margin-bottom:12px">第 ' + roundNum + ' 局 · ' + timeStr + '</p>' +
        '<div style="margin-bottom:16px">' + rows + '</div>';
}
function confirmEndRound() {
    const confirmed = players.filter(p => p.confirmed);
    const now = Date.now();
    const results = {};
    confirmed.forEach((p, i) => {
        const pnl = calcPnl(calcChipTotal(p.n10, p.n20, p.n50, p.n100), calcInvested(p.buyIns));
        const entry = { name: p.name, pnl, avatarId: p.avatarId || 0, buyIns: p.buyIns || 0 };
        if (p.avatarRef) entry.avatarRef = p.avatarRef;
        results['p' + i] = entry;
    });
    const btn = document.getElementById('btn-confirm-archive');
    if (btn) { btn.textContent = '存档中…'; btn.disabled = true; }
    gameRef.child('rounds').push({ timestamp: now, results }, err => {
        if (btn) { btn.textContent = '确认存档'; btn.disabled = false; }
        if (err) { showToast('存档失败，请检查网络'); return; }
        closeModal('export-modal', () => {
            showToast('已存档，筹码已重置');
            gameRef.child('status').set('waiting');
            gameRef.child('players').set(
                players.map(p => ({ ...p, n10: 0, n20: 0, n50: 0, n100: 0, buyIns: 0, confirmed: false }))
            );
        });
    });
}

// ── Records page ───────────────────────────────────────────────
function openRecordsPage(pushHistory = true) {
    recordsTab = 'rounds';
    isSelectMode = false;
    selectedRoundIds = new Set();
    renderRecordsPage();
    if (pushHistory) history.pushState({ page: 'records' }, '', '/records');
    openModal('records-page');
}
function renderRecordsPageIfOpen() {
    const page = document.getElementById('records-page');
    if (!page || page.classList.contains('hidden')) return;
    renderRecordsPage();
    renderHeader();
}
function renderRecordsPage() {
    // Seg control active state
    document.getElementById('seg-rounds').classList.toggle('active', recordsTab === 'rounds');
    document.getElementById('seg-agg').classList.toggle('active', recordsTab === 'aggregations');
    // Select button only on rounds tab
    const selBtn = document.getElementById('btn-records-select');
    if (selBtn) {
        selBtn.style.visibility = recordsTab === 'rounds' ? '' : 'hidden';
        selBtn.textContent = isSelectMode ? '完成' : '选择';
    }
    if (recordsTab === 'rounds') renderRoundsTab();
    else renderAggregationsTab();
}
function switchRecordsTab(tab) {
    recordsTab = tab;
    isSelectMode = false;
    selectedRoundIds = new Set();
    renderRecordsPage();
}

function renderRoundsTab() {
    const content = document.getElementById('records-content');
    const entries = Object.entries(rounds).sort((a, b) => a[1].timestamp - b[1].timestamp);
    if (entries.length === 0) {
        content.innerHTML = '<p style="text-align:center;color:var(--ink-3);margin-top:48px;font-size:14px">暂无对局记录<br><span style="font-size:12px">结束本局后将自动保存</span></p>';
        hideActionBar();
        return;
    }
    const AV = 26, OFF = 14, AVMAX = 4; // avatar px, offset px, max shown
    const OPA = [1, 0.65, 0.42, 0.25]; // opacity per stack position

    content.innerHTML = entries.map(([id, round], i) => {
        const playerList = round.results ? Object.values(round.results) : [];
        const sorted = [...playerList].sort((a, b) => b.pnl - a.pnl);
        const timeStr = formatDateTime(new Date(round.timestamp));
        const checked = selectedRoundIds.has(id);
        const checkHtml = isSelectMode
            ? '<div class="checkbox ' + (checked ? 'checked' : '') + '" data-check="' + id + '"></div>'
            : '';

        let carouselHtml = '';
        if (sorted.length > 0) {
            const visCount = Math.min(sorted.length, AVMAX);
            const stackW = AV + (visCount - 1) * OFF;
            const activeP = sorted[0];
            const activeCls = activeP.pnl > 0 ? 'positive' : activeP.pnl < 0 ? 'negative' : 'neutral';
            // Encode player data for JS to read (name + pnl only)
            const pdata = JSON.stringify(sorted.map(p => [p.name, p.pnl]));

            const avatarItems = sorted.map((p, idx) => {
                const av = p;
                const left = Math.max(0, AVMAX - 1 - idx) * OFF; // rightmost = front
                const opa = idx < AVMAX ? OPA[idx] : 0;
                const z = sorted.length - idx;
                return '<div class="round-ava-item" style="left:' + left + 'px;opacity:' + opa + ';z-index:' + z + ';background:' + getAvatarBgFor(av) + '">' +
                    getAvatarContent(av) + '</div>';
            }).join('');

            carouselHtml =
                '<div class="round-carousel" data-pdata=\'' + pdata + '\'>' +
                '<div class="round-ava-stack" style="width:' + stackW + 'px">' + avatarItems + '</div>' +
                '<div class="round-pnl-text">' +
                '<div class="round-carousel-name">' + escHtml(activeP.name) + '</div>' +
                '<div class="round-carousel-pnl ' + activeCls + '">' + formatPnl(activeP.pnl) + '分</div>' +
                '</div></div>';
        }

        return '<div class="swipe-row record-row" data-round-id="' + id + '">' +
            '<div class="swipe-delete-btn" data-del-round="' + id + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>删除</div>' +
            '<div class="player-card" data-round-id="' + id + '" onclick="onRoundRowClick(\'' + id + '\')">' +
            '<div class="player-card-main">' +
            checkHtml +
            '<div class="player-name-col">' +
            '<div style="font-size:15px;font-weight:400;color:var(--ink-1)">第 ' + (i + 1) + ' 局</div>' +
            '<div style="font-size:12px;color:var(--ink-3);margin-top:2px">' + timeStr + ' · ' + playerList.length + '人</div>' +
            '</div>' +
            '<div class="player-pnl-col">' +
            carouselHtml +
            '<div class="card-chevron"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></div>' +
            '</div></div></div></div>';
    }).join('');
    setupRecordSwipeDelete();
    setupCarousels();
    updateActionBar();
}

function renderAggregationsTab() {
    const content = document.getElementById('records-content');
    const entries = Object.entries(aggregations).sort((a, b) => b[1].timestamp - a[1].timestamp);
    if (entries.length === 0) {
        content.innerHTML = '<p style="text-align:center;color:var(--ink-3);margin-top:48px;font-size:14px">暂无汇总记录<br><span style="font-size:12px">在对局 Tab 选择多局后进行加总</span></p>';
        return;
    }
    content.innerHTML = entries.map(([id, agg]) => {
        const pCount = agg.players ? Object.keys(agg.players).length : 0;
        return '<div class="swipe-row" data-agg-id="' + id + '">' +
            '<div class="swipe-delete-btn" data-del-agg="' + id + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>删除</div>' +
            '<div class="player-card" onclick="openAggDetailModal(\'' + id + '\')">' +
            '<div class="player-card-main">' +
            '<div class="player-name-col">' +
            '<div style="font-size:15px;font-weight:400;color:var(--ink-1)">' + escHtml(agg.label) + '</div>' +
            '<div style="font-size:12px;color:var(--ink-3);margin-top:2px">共 ' + agg.roundCount + ' 局 · ' + pCount + '人</div>' +
            '</div>' +
            '<div class="card-chevron"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></div>' +
            '</div></div></div>';
    }).join('');
    setupAggSwipeDelete();
}

// ── Multi-select ───────────────────────────────────────────────
function toggleSelectMode() {
    isSelectMode = !isSelectMode;
    if (!isSelectMode) selectedRoundIds = new Set();
    renderRecordsPage();
}
function onRoundRowClick(id) {
    if (isSelectMode) {
        if (selectedRoundIds.has(id)) selectedRoundIds.delete(id);
        else selectedRoundIds.add(id);
        // Update checkboxes without full re-render
        document.querySelectorAll('.checkbox[data-check]').forEach(el => {
            el.classList.toggle('checked', selectedRoundIds.has(el.dataset.check));
        });
        updateActionBar();
    } else {
        openRoundDetailModal(id);
    }
}
function updateActionBar() {
    const bar = document.getElementById('records-action-bar');
    const btn = document.getElementById('btn-do-aggregate');
    if (!bar || !btn) return;
    if (isSelectMode) {
        bar.classList.remove('hidden');
        const n = selectedRoundIds.size;
        btn.textContent = n >= 2 ? '加总 (' + n + '局)' : '加总';
        btn.disabled = n < 2;
    } else {
        bar.classList.add('hidden');
    }
}
function hideActionBar() {
    const bar = document.getElementById('records-action-bar');
    if (bar) bar.classList.add('hidden');
}

// ── Swipe-delete for records ───────────────────────────────────
function setupRecordSwipeDelete() {
    document.querySelectorAll('#records-content .swipe-delete-btn[data-del-round]').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); showRoundDeleteConfirm(btn.dataset.delRound); });
    });
    document.querySelectorAll('#records-content .record-row').forEach(row => {
        const card = row.querySelector('.player-card');
        if (!card) return;
        const id = card.dataset.roundId;
        let startX = 0, startY = 0, currentX = 0, tracking = false, dirLocked = false, isH = false, pressTimer = null;
        card.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX; startY = e.touches[0].clientY;
            currentX = 0; tracking = true; dirLocked = false; isH = false;
            card.style.transition = 'none';
            pressTimer = setTimeout(() => { card.classList.add('long-press-active'); showRoundDeleteConfirm(id); }, 600);
        }, { passive: true });
        card.addEventListener('touchmove', e => {
            if (!tracking) return;
            const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY;
            if (!dirLocked) { if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return; dirLocked = true; isH = Math.abs(dx) > Math.abs(dy); }
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { clearTimeout(pressTimer); pressTimer = null; }
            if (!isH) return;
            e.preventDefault();
            currentX = Math.max(-80, Math.min(0, dx));
            card.style.transform = 'translateX(' + currentX + 'px)';
        }, { passive: false });
        card.addEventListener('touchend', () => {
            if (!tracking) return; tracking = false;
            clearTimeout(pressTimer); pressTimer = null; card.classList.remove('long-press-active');
            card.style.transition = 'transform .22s cubic-bezier(.4,0,.2,1)';
            if (currentX < -40) { card.style.transform = 'translateX(-80px)'; row.classList.add('swiped'); }
            else { card.style.transform = 'translateX(0)'; row.classList.remove('swiped'); }
        });
        card.addEventListener('touchcancel', () => {
            tracking = false; clearTimeout(pressTimer); pressTimer = null; card.classList.remove('long-press-active');
        });
    });
}
function setupAggSwipeDelete() {
    document.querySelectorAll('#records-content .swipe-delete-btn[data-del-agg]').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); showAggDeleteConfirm(btn.dataset.delAgg); });
    });
    document.querySelectorAll('#records-content .swipe-row[data-agg-id]').forEach(row => {
        const card = row.querySelector('.player-card');
        if (!card) return;
        const id = row.dataset.aggId;
        let startX = 0, startY = 0, currentX = 0, tracking = false, dirLocked = false, isH = false, pressTimer = null;
        card.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX; startY = e.touches[0].clientY;
            currentX = 0; tracking = true; dirLocked = false; isH = false;
            card.style.transition = 'none';
            pressTimer = setTimeout(() => { card.classList.add('long-press-active'); showAggDeleteConfirm(id); }, 600);
        }, { passive: true });
        card.addEventListener('touchmove', e => {
            if (!tracking) return;
            const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY;
            if (!dirLocked) { if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return; dirLocked = true; isH = Math.abs(dx) > Math.abs(dy); }
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { clearTimeout(pressTimer); pressTimer = null; }
            if (!isH) return;
            e.preventDefault();
            currentX = Math.max(-80, Math.min(0, dx));
            card.style.transform = 'translateX(' + currentX + 'px)';
        }, { passive: false });
        card.addEventListener('touchend', () => {
            if (!tracking) return; tracking = false;
            clearTimeout(pressTimer); pressTimer = null; card.classList.remove('long-press-active');
            card.style.transition = 'transform .22s cubic-bezier(.4,0,.2,1)';
            if (currentX < -40) { card.style.transform = 'translateX(-80px)'; row.classList.add('swiped'); }
            else { card.style.transform = 'translateX(0)'; row.classList.remove('swiped'); }
        });
        card.addEventListener('touchcancel', () => {
            tracking = false; clearTimeout(pressTimer); pressTimer = null; card.classList.remove('long-press-active');
        });
    });
}
function setupCarousels() {
    if (window._carouselTimers) window._carouselTimers.forEach(clearInterval);
    window._carouselTimers = [];

    const AV = 26, OFF = 14, AVMAX = 4;
    const OPA = [1, 0.65, 0.42, 0.25]; // opacity per stack position
    const ANIM_MS = 360;
    const HOLD_MS = 2200;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function applyItem(item, pos, N, animate) {
        const left = Math.max(0, AVMAX - 1 - pos) * OFF; // rightmost = front (pos 0)
        const opa  = pos < AVMAX ? OPA[pos] : 0;
        const z    = N - pos;
        item.style.transition = animate
            ? 'left ' + ANIM_MS + 'ms cubic-bezier(.4,0,.2,1), opacity ' + ANIM_MS + 'ms ease'
            : 'none';
        item.style.left    = left + 'px';
        item.style.opacity = opa;
        item.style.zIndex  = z;
    }

    document.querySelectorAll('.round-carousel').forEach(carousel => {
        const stack   = carousel.querySelector('.round-ava-stack');
        const pnlText = carousel.querySelector('.round-pnl-text');
        if (!stack || !pnlText) return;

        const items = Array.from(stack.querySelectorAll('.round-ava-item'));
        const N = items.length;
        if (N <= 1) return; // static, CSS already positioned correctly

        // Player data: [[name, pnl], ...]  in same order as DOM items
        const pdata = JSON.parse(carousel.dataset.pdata || '[]');
        let top = 0;

        if (reducedMotion) return; // keep initial HTML positions, no animation

        function advance() {
            const exitIdx = top;
            top = (top + 1) % N;

            // Exit: front avatar (rightmost) slides further right, clipped by overflow:hidden
            const exitItem = items[exitIdx];
            exitItem.style.transition = 'left ' + ANIM_MS + 'ms cubic-bezier(.4,0,.2,1), opacity ' + ANIM_MS + 'ms ease';
            exitItem.style.left    = (AVMAX * OFF + AV) + 'px'; // well past right edge
            exitItem.style.opacity = '0';
            exitItem.style.zIndex  = '0';

            // All others advance one step toward the front (shift right)
            items.forEach((item, i) => {
                if (i === exitIdx) return;
                applyItem(item, (i - top + N) % N, N, true);
            });

            // Instant text swap — no animation
            const [name, pnl] = pdata[top] || ['', 0];
            const cls = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral';
            pnlText.querySelector('.round-carousel-name').textContent = name;
            const pnlEl = pnlText.querySelector('.round-carousel-pnl');
            pnlEl.textContent = formatPnl(pnl) + '分';
            pnlEl.className = 'round-carousel-pnl ' + cls;

            // After exit anim ends, silently reposition exited avatar to back of queue
            setTimeout(() => {
                const newPos = (exitIdx - top + N) % N;
                applyItem(exitItem, newPos, N, false);
            }, ANIM_MS + 20);
        }

        const timer = setInterval(advance, HOLD_MS + ANIM_MS);
        window._carouselTimers.push(timer);
    });
}
function showRoundDeleteConfirm(id) {
    pendingDeleteRoundId = id;
    pendingDeleteIdx = -1;
    pendingDeleteAggId = null;
    document.getElementById('delete-modal-text').textContent = '删除该局记录？';
    document.getElementById('delete-modal-sub').textContent = '该局的盈亏数据将永久删除';
    openModal('delete-modal');
}
function showAggDeleteConfirm(id) {
    pendingDeleteAggId = id;
    pendingDeleteIdx = -1;
    pendingDeleteRoundId = null;
    document.getElementById('delete-modal-text').textContent = '删除该汇总记录？';
    document.getElementById('delete-modal-sub').textContent = '该汇总快照将永久删除';
    openModal('delete-modal');
}

// ── Round detail ───────────────────────────────────────────────
function openRoundDetailModal(roundId) {
    const round = rounds[roundId];
    if (!round) return;
    const entries = Object.entries(rounds).sort((a, b) => a[1].timestamp - b[1].timestamp);
    const idx = entries.findIndex(([id]) => id === roundId);
    const playerList = round.results ? Object.values(round.results).sort((a, b) => b.pnl - a.pnl) : [];
    document.getElementById('round-detail-title').textContent = '第 ' + (idx + 1) + ' 局';
    document.getElementById('round-detail-time').textContent = formatDateTime(new Date(round.timestamp));
    document.getElementById('round-detail-body').innerHTML = playerList.map(p => {
        const cls = p.pnl > 0 ? 'positive' : p.pnl < 0 ? 'negative' : 'neutral';
        // Always prefer live player avatar; fall back to archived data if player left the game
        const avatarSrc = players.find(lp => lp.name === p.name) || p;
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--n10)">' +
            '<div style="display:flex;align-items:center;gap:8px">' +
            '<div class="avatar-circle sm" style="background:' + getAvatarBgFor(avatarSrc) + ';flex-shrink:0">' + getAvatarContent(avatarSrc) + '</div>' +
            '<span style="font-size:15px;color:var(--ink-1)">' + escHtml(p.name) + '</span>' +
            '</div>' +
            '<span class="pnl-inline ' + cls + '">' + formatPnl(p.pnl) + ' 分</span></div>';
    }).join('');
    openModal('round-detail-modal');
}

// ── Aggregate ──────────────────────────────────────────────────
function doAggregate() {
    if (selectedRoundIds.size < 2) return;
    const selected = Object.entries(rounds)
        .filter(([id]) => selectedRoundIds.has(id))
        .map(([, r]) => r);
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
    document.getElementById('summary-result-modal').dataset.summaryJson = JSON.stringify(summary);
    openModal('summary-result-modal');
}

function saveAggregation() {
    const modal = document.getElementById('summary-result-modal');
    const summary = JSON.parse(modal.dataset.summaryJson || 'null');
    if (!summary) return;
    const now = new Date();
    const playerData = {};
    summary.players.forEach((p, i) => {
        const live = players.find(lp => lp.name === p.name);
        const entry = { name: p.name, total: p.total, avatarId: live ? (live.avatarId || 0) : 0 };
        if (live && live.avatarRef) entry.avatarRef = live.avatarRef;
        playerData['p' + i] = entry;
    });
    gameRef.child('aggregations').push({
        timestamp: now.getTime(),
        label: formatDateWeekday(now),
        roundCount: summary.roundCount,
        players: playerData
    });
    closeModal('summary-result-modal', () => {
        isSelectMode = false;
        selectedRoundIds = new Set();
        renderRecordsPage();
        showToast('汇总已保存');
    });
}

// ── Aggregation detail ─────────────────────────────────────────
function openAggDetailModal(aggId) {
    const agg = aggregations[aggId];
    if (!agg) return;
    const playerList = agg.players ? Object.values(agg.players).sort((a, b) => b.total - a.total) : [];
    document.getElementById('agg-detail-title').textContent = agg.label;
    document.getElementById('agg-detail-subtitle').textContent = '共 ' + agg.roundCount + ' 局';
    document.getElementById('agg-detail-body').innerHTML = playerList.map(p => {
        const cls = p.total > 0 ? 'positive' : p.total < 0 ? 'negative' : 'neutral';
        const avatarSrc = (p.avatarId != null || p.avatarRef) ? p : (players.find(lp => lp.name === p.name) || p);
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--n10)">' +
            '<div style="display:flex;align-items:center;gap:8px">' +
            '<div class="avatar-circle sm" style="background:' + getAvatarBgFor(avatarSrc) + ';flex-shrink:0">' + getAvatarContent(avatarSrc) + '</div>' +
            '<span style="font-size:15px;color:var(--ink-1)">' + escHtml(p.name) + '</span>' +
            '</div>' +
            '<span class="pnl-inline ' + cls + '">' + formatPnl(p.total) + ' 分</span></div>';
    }).join('');
    openModal('agg-detail-modal');
}

// ── Event listeners ────────────────────────────────────────────
document.getElementById('btn-add-player').addEventListener('click', addPlayer);
document.getElementById('btn-reset-soft').addEventListener('click', showResetModal);
document.getElementById('btn-export').addEventListener('click', openExportModal);
document.getElementById('btn-confirm-archive').addEventListener('click', confirmEndRound);
document.getElementById('btn-cancel-export').addEventListener('click', () => closeModal('export-modal'));
document.getElementById('btn-close-export').addEventListener('click', () => closeModal('export-modal'));
document.getElementById('export-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('export-modal');
});
document.getElementById('btn-chip-done').addEventListener('click', () => closeChipModal(true));
document.getElementById('chip-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeChipModal(false); });
document.getElementById('btn-close-modal').addEventListener('click', closeAvatarModal);
document.getElementById('avatar-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeAvatarModal(); });
document.getElementById('btn-close-name-modal').addEventListener('click', closeNameModal);
document.getElementById('btn-save-name').addEventListener('click', saveName);
document.getElementById('name-modal-input').addEventListener('keydown', e => { if (e.key === 'Enter') saveName(); });
document.getElementById('name-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeNameModal(); });
document.getElementById('btn-delete-confirm').addEventListener('click', () => {
    if (pendingDeleteIdx >= 0) {
        removePlayer(pendingDeleteIdx);
        closeModal('delete-modal', () => { pendingDeleteIdx = -1; resetDeleteModalText(); });
    } else if (pendingDeleteRoundId) {
        const id = pendingDeleteRoundId;
        closeModal('delete-modal', () => {
            gameRef.child('rounds/' + id).remove();
            pendingDeleteRoundId = null;
            resetDeleteModalText();
        });
    } else if (pendingDeleteAggId) {
        const id = pendingDeleteAggId;
        closeModal('delete-modal', () => {
            gameRef.child('aggregations/' + id).remove();
            pendingDeleteAggId = null;
            resetDeleteModalText();
        });
    } else {
        closeModal('delete-modal');
    }
});
function cancelDeleteModal() {
    closeModal('delete-modal', () => {
        pendingDeleteIdx = -1;
        pendingDeleteRoundId = null;
        pendingDeleteAggId = null;
        resetDeleteModalText();
        document.querySelectorAll('.long-press-active').forEach(el => el.classList.remove('long-press-active'));
    });
}
function resetDeleteModalText() {
    const sub = document.getElementById('delete-modal-sub');
    if (sub) sub.textContent = '该玩家的筹码数据将被清除';
}
document.getElementById('btn-delete-cancel').addEventListener('click', cancelDeleteModal);
document.getElementById('delete-modal').addEventListener('click', e => { if (e.target === e.currentTarget) cancelDeleteModal(); });
document.getElementById('btn-reset-soft-confirm').addEventListener('click', resetSoft);
document.getElementById('btn-reset-hard').addEventListener('click', resetHard);
document.getElementById('btn-cancel-reset').addEventListener('click', closeResetModal);
document.getElementById('reset-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeResetModal(); });
document.getElementById('btn-avatar-reupload').addEventListener('click', () => {
    // Trigger file input synchronously within the user gesture (iOS requires this),
    // then close the action sheet. The picker stays open underneath.
    triggerFilePick('replace');
    closeModal('avatar-action-modal');
});
document.getElementById('btn-avatar-delete').addEventListener('click', () => {
    const photoId = pendingAvatarActionId;
    closeModal('avatar-action-modal', () => { deleteSharedAvatar(photoId); });
});
document.getElementById('btn-avatar-action-cancel').addEventListener('click', () => {
    // Just dismiss the action sheet — picker stays open, so don't clear the editing flag here.
    closeModal('avatar-action-modal');
});
document.getElementById('avatar-action-modal').addEventListener('click', e => {
    if (e.target !== e.currentTarget) return;
    closeModal('avatar-action-modal');
});
document.getElementById('avatar-upload-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    processAvatarFile(file, e.target.dataset.mode || 'new');
});
// iOS WKWebView may reload the page after camera use (memory pressure).
// pageshow with persisted=true means it was restored from bfcache — re-attach Firebase.
window.addEventListener('pageshow', e => {
    if (e.persisted) window.location.reload();
});

// ── Multi-round event listeners ────────────────────────────────
document.getElementById('btn-open-records').addEventListener('click', openRecordsPage);
document.getElementById('btn-close-records').addEventListener('click', () => {
    if (window._carouselTimers) { window._carouselTimers.forEach(clearInterval); window._carouselTimers = []; }
    if (location.pathname === '/records') history.back(); else closeModal('records-page');
});

window.addEventListener('popstate', () => {
    if (location.pathname !== '/records') {
        const overlay = document.getElementById('records-page');
        if (overlay && !overlay.classList.contains('hidden')) {
            if (window._carouselTimers) { window._carouselTimers.forEach(clearInterval); window._carouselTimers = []; }
            closeModal('records-page');
        }
    }
});

// Direct navigation to /records (e.g. shared link or browser refresh)
if (location.pathname === '/records') {
    history.replaceState(null, '', '/');
    history.pushState({ page: 'records' }, '', '/records');
    openRecordsPage(false);
}
document.getElementById('btn-records-select').addEventListener('click', toggleSelectMode);
document.getElementById('btn-do-aggregate').addEventListener('click', doAggregate);

document.getElementById('btn-end-round').addEventListener('click', openExportModal);

document.getElementById('btn-close-round-detail').addEventListener('click', () => closeModal('round-detail-modal'));
document.getElementById('round-detail-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('round-detail-modal'); });

document.getElementById('btn-save-aggregation').addEventListener('click', saveAggregation);
document.getElementById('btn-export-summary').addEventListener('click', () => showToast('长按截图保存到相册'));
document.getElementById('btn-close-summary-result').addEventListener('click', () => closeModal('summary-result-modal'));
document.getElementById('summary-result-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('summary-result-modal'); });

document.getElementById('btn-close-agg-detail').addEventListener('click', () => closeModal('agg-detail-modal'));
document.getElementById('agg-detail-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('agg-detail-modal'); });
