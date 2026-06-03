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

// ── State ──────────────────────────────────────────────────────
let players = [];
let isLoading = true; // true until first Firebase response
let chipModalIdx = -1;
let chipInputMode = 'stepper'; // 'stepper' | 'direct'
let pendingAvatarIdx = -1;
let pendingNameIdx = -1;
let pendingDeleteIdx = -1;
const writeTimers = {};

function defaultPlayers(count) {
    return Array.from({ length: count }, (_, i) => ({
        name: '玩家' + (i + 1),
        avatarId: i % AVATARS.length,
        n10: 0, n20: 0, n50: 0, n100: 0, buyIns: 0, confirmed: false
    }));
}

// ── Firebase ───────────────────────────────────────────────────
gameRef.on('value', snap => {
    const data = snap.val();
    isLoading = false;
    if (!data || !data.players) {
        gameRef.set({ status: 'waiting', players: defaultPlayers(3) });
        return;
    }
    players = Object.keys(data.players)
        .sort((a, b) => Number(a) - Number(b))
        .map(k => data.players[k]);
    render();
    if (chipModalIdx >= 0 && players[chipModalIdx]) syncChipModal(chipModalIdx);
});

// Show skeleton immediately on load
renderPlayers();

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
        const settled = false;

        return `
        <div class="swipe-row" data-idx="${i}">
            <div class="swipe-delete-btn" data-del="${i}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                删除
            </div>
            <div class="player-card ${settled ? 'settled' : ''}" data-idx="${i}"
                 ${settled ? '' : `onclick="openChipModal(${i})"`}>
                <div class="player-card-main">
                    <div class="avatar-circle ${settled ? '' : 'clickable'}"
                         style="background:${getAvatarBg(p.avatarId)}"
                         ${settled ? '' : `onclick="event.stopPropagation();openAvatarModal(${i})"`}>
                        ${getAvatarSvg(p.avatarId)}
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
                        <span class="pnl-inline ${isConfirmed ? pnlClass : 'placeholder'}">
                            ${isConfirmed ? formatPnl(pnl) + ' 分' : '录入筹码'}
                        </span>
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
    const total = players.reduce((sum, p) =>
        sum + calcPnl(calcChipTotal(p.n10, p.n20, p.n50, p.n100), calcInvested(p.buyIns)), 0);
    const hasAnyData = players.some(p => calcChipTotal(p.n10, p.n20, p.n50, p.n100) > 0);

    const pnlEl = document.getElementById('total-pnl');
    const badge = document.getElementById('balance-indicator');

    if (!hasAnyData) {
        pnlEl.textContent = '— 分';
        pnlEl.className = 'float-bar-value neutral';
        badge.classList.add('hidden');
    } else {
        pnlEl.textContent = formatPnl(total) + ' 分';
        pnlEl.className = 'float-bar-value ' + (total === 0 ? 'positive' : 'negative');
        badge.classList.remove('hidden');
        badge.className = 'float-bar-badge ' + (total === 0 ? 'balance-ok' : 'balance-warn');
        badge.textContent = total === 0 ? '持平 ✓' : `差额 ${formatPnl(total)}`;
    }
}

// ── Export results ─────────────────────────────────────────────
function openExportModal() {
    const sorted = players.map(p => {
        const chipTotal = calcChipTotal(p.n10, p.n20, p.n50, p.n100);
        const invested = calcInvested(p.buyIns);
        return { ...p, chipTotal, invested, pnl: calcPnl(chipTotal, invested) };
    }).sort((a, b) => b.pnl - a.pnl);
    const totalPnl = sorted.reduce((s, r) => s + r.pnl, 0);
    const isBalanced = totalPnl === 0;

    // Set date
    const now = new Date();
    document.getElementById('export-date').textContent =
        `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;

    // Build table
    document.getElementById('export-table-wrap').innerHTML = `
        <table class="export-table">
            <thead><tr><th>玩家</th><th>持筹</th><th>投入</th><th>盈亏</th></tr></thead>
            <tbody>${sorted.map(r => `
                <tr class="${r.pnl > 0 ? 'win' : r.pnl < 0 ? 'lose' : ''}">
                    <td class="export-name-cell">
                        <div class="avatar-circle sm" style="background:${getAvatarBg(r.avatarId)}">${getAvatarSvg(r.avatarId)}</div>
                        ${escHtml(r.name)}
                    </td>
                    <td>${r.chipTotal}</td>
                    <td>${r.invested}</td>
                    <td>${formatPnl(r.pnl)}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;

    document.getElementById('export-badge').innerHTML = `
        <div class="${isBalanced ? 'badge-balanced' : 'badge-unbalanced'}" style="margin-top:10px">
            ${isBalanced ? '✓ 总盈亏 = 0，验证通过' : `✗ 总盈亏 = ${formatPnl(totalPnl)}，请检查`}
        </div>`;

    // Reset image state
    document.getElementById('export-image').style.display = 'none';
    document.getElementById('export-card').style.display = 'block';
    document.getElementById('btn-generate-img').style.display = 'flex';

    document.getElementById('export-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function generateImage() {
    const card = document.getElementById('export-card');
    document.getElementById('btn-generate-img').textContent = '生成中...';
    html2canvas(card, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
    }).then(canvas => {
        const img = document.getElementById('export-image');
        img.src = canvas.toDataURL('image/png');
        img.style.display = 'block';
        card.style.display = 'none';
        document.getElementById('btn-generate-img').style.display = 'none';
        showToast('长按图片保存到相册');
    }).catch(() => {
        showToast('生成图片失败，请截图保存');
        document.getElementById('btn-generate-img').textContent = '生成图片';
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
    document.getElementById('delete-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// ── Chip half-sheet ────────────────────────────────────────────
function openChipModal(idx) {
    chipModalIdx = idx;
    chipInputMode = 'stepper';
    renderChipModal(idx);
    document.getElementById('chip-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function renderChipModal(idx) {
    const p = players[idx];
    // Header — tap avatar to change, tap name to edit
    document.getElementById('chip-modal-header').innerHTML = `
        <div class="avatar-circle clickable" style="background:${getAvatarBg(p.avatarId)}"
             onclick="openAvatarModal(${idx})">
            ${getAvatarSvg(p.avatarId)}
            <div class="avatar-edit-hint">换</div>
        </div>
        <div style="flex:1;min-width:0">
            <div class="chip-modal-name" onclick="openNameModal(${idx})">
                ${escHtml(p.name)}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.4">
                    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>
                </svg>
            </div>
            <div style="font-size:12px;color:var(--text3)">1底 = 1000分</div>
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
                <div class="chip-dot" style="background:var(--gold);font-size:9px">底</div>
                <div class="stepper-label">借底次数<span>每借一底 = 额外1000分投入</span></div>
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
                    <span style="font-size:13px;color:var(--text2);flex:1">最终持筹总分</span>
                    <input class="direct-input-field" id="direct-chip-total" type="number"
                        inputmode="numeric" placeholder="0" value="${chipTotal || ''}"
                        style="width:130px;text-align:right"
                        oninput="previewDirectInput(${idx})">
                </div>
                <div class="direct-input-row" style="background:var(--gold-lt);border-color:rgba(193,154,0,.2)">
                    <span style="font-size:13px;color:var(--text2);flex:1">借底次数</span>
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
    // Save direct input before switching
    if (chipInputMode === 'direct') {
        applyDirectInput(idx);
    }
    chipInputMode = chipInputMode === 'stepper' ? 'direct' : 'stepper';
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
}

function applyDirectInput(idx) {
    const totalEl = document.getElementById('direct-chip-total');
    const buyInEl = document.getElementById('direct-buyin');
    const chipTotal = Math.max(0, parseInt(totalEl?.value) || 0);
    const newBuyIns = Math.max(0, parseInt(buyInEl?.value) || 0);
    // Decompose chipTotal into denominations (best-fit)
    let rem = chipTotal;
    const n100 = Math.floor(rem / 100); rem -= n100 * 100;
    const n50  = Math.floor(rem / 50);  rem -= n50  * 50;
    const n20  = Math.floor(rem / 20);  rem -= n20  * 20;
    const n10  = Math.floor(rem / 10);
    players[idx] = { ...players[idx], n100, n50, n20, n10, buyIns: newBuyIns };
    clearTimeout(writeTimers[idx]);
    writeTimers[idx] = setTimeout(() => {
        gameRef.child('players/' + idx).update({ n100, n50, n20, n10, buyIns: newBuyIns });
    }, 400);
}

// ── Modal animation helper ─────────────────────────────────────
function closeModal(id, callback) {
    const overlay = document.getElementById(id);
    const sheet = overlay.querySelector('.modal-sheet');
    if (sheet) {
        sheet.style.animation = 'slideDown .2s cubic-bezier(.4,0,1,1) both';
        setTimeout(() => {
            overlay.classList.add('hidden');
            sheet.style.animation = '';
            document.body.style.overflow = '';
            if (callback) callback();
        }, 200);
    } else {
        overlay.classList.add('hidden');
        document.body.style.overflow = '';
        if (callback) callback();
    }
}

function closeChipModal() {
    if (chipInputMode === 'direct') applyDirectInput(chipModalIdx);
    if (chipModalIdx >= 0) {
        gameRef.child('players/' + chipModalIdx + '/confirmed').set(true);
    }
    closeModal('chip-modal', () => { chipModalIdx = -1; });
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
    renderSummary();
    clearTimeout(writeTimers[idx]);
    writeTimers[idx] = setTimeout(() => {
        gameRef.child('players/' + idx).update({ [key]: next });
    }, 400);
}

function setChip(idx, key, rawVal) {
    const next = Math.max(0, parseInt(rawVal) || 0);
    players[idx][key] = next;
    syncChipModal(idx);
    updateCardPnl(idx);
    renderSummary();
    clearTimeout(writeTimers[idx]);
    writeTimers[idx] = setTimeout(() => {
        gameRef.child('players/' + idx).update({ [key]: next });
    }, 600);
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
    if (players.length >= 8) { showToast('最多支持8位玩家'); return; }
    const idx = players.length;
    gameRef.child('players/' + idx).set({
        name: '玩家' + (idx + 1), avatarId: idx % AVATARS.length,
        n10: 0, n20: 0, n50: 0, n100: 0, buyIns: 0
    });
}
function removePlayer(idx) {
    clearTimeout(writeTimers[idx]);
    delete writeTimers[idx];
    gameRef.child('players').set(players.filter((_, i) => i !== idx));
}

// ── Avatar modal ───────────────────────────────────────────────
function openAvatarModal(idx) {
    pendingAvatarIdx = idx;
    const grid = document.getElementById('modal-avatar-grid');
    grid.innerHTML = '';
    AVATARS.forEach((av, i) => {
        const div = document.createElement('div');
        div.className = 'avatar-item' + (players[idx].avatarId === i ? ' selected' : '');
        div.innerHTML = getAvatarSvg(i);
        div.style.background = av.bg;
        div.addEventListener('click', () => {
            gameRef.child('players/' + pendingAvatarIdx + '/avatarId').set(i);
            closeAvatarModal();
        });
        grid.appendChild(div);
    });
    document.getElementById('avatar-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function closeAvatarModal() { closeModal('avatar-modal'); }

// ── Name modal ─────────────────────────────────────────────────
function openNameModal(idx) {
    pendingNameIdx = idx;
    const inp = document.getElementById('name-modal-input');
    inp.value = players[idx].name;
    document.getElementById('name-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => inp.focus(), 150);
}
function closeNameModal() { closeModal('name-modal'); }
function saveName() {
    const name = document.getElementById('name-modal-input').value.trim();
    if (!name) { showToast('名字不能为空'); return; }
    gameRef.child('players/' + pendingNameIdx + '/name').set(name);
    closeNameModal();
}


// ── Reset ──────────────────────────────────────────────────────
function showResetModal() {
    document.getElementById('reset-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function closeResetModal() { closeModal('reset-modal'); }
function resetSoft() {
    gameRef.set({ status: 'waiting', players: players.map(p => ({ ...p, n10: 0, n20: 0, n50: 0, n100: 0, buyIns: 0, confirmed: false })) });
    closeResetModal();
    showToast('已重置筹码，可以开始新一局');
}
function resetHard() {
    gameRef.set({ status: 'waiting', players: defaultPlayers(3) });
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

// ── Event listeners ────────────────────────────────────────────
document.getElementById('btn-add-player').addEventListener('click', addPlayer);
document.getElementById('btn-reset-soft').addEventListener('click', showResetModal);
document.getElementById('btn-export').addEventListener('click', openExportModal);
document.getElementById('btn-generate-img').addEventListener('click', generateImage);
document.getElementById('btn-close-export').addEventListener('click', () => {
    document.getElementById('export-modal').classList.add('hidden');
    document.body.style.overflow = '';
});
document.getElementById('export-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
        document.getElementById('export-modal').classList.add('hidden');
        document.body.style.overflow = '';
    }
});
document.getElementById('btn-chip-done').addEventListener('click', closeChipModal);
document.getElementById('chip-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeChipModal(); });
document.getElementById('btn-close-modal').addEventListener('click', closeAvatarModal);
document.getElementById('avatar-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeAvatarModal(); });
document.getElementById('btn-close-name-modal').addEventListener('click', closeNameModal);
document.getElementById('btn-save-name').addEventListener('click', saveName);
document.getElementById('name-modal-input').addEventListener('keydown', e => { if (e.key === 'Enter') saveName(); });
document.getElementById('name-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeNameModal(); });
document.getElementById('btn-delete-confirm').addEventListener('click', () => {
    if (pendingDeleteIdx >= 0) removePlayer(pendingDeleteIdx);
    document.getElementById('delete-modal').classList.add('hidden');
    document.body.style.overflow = '';
    pendingDeleteIdx = -1;
});
document.getElementById('btn-delete-cancel').addEventListener('click', () => {
    document.getElementById('delete-modal').classList.add('hidden');
    document.body.style.overflow = '';
    pendingDeleteIdx = -1;
    document.querySelectorAll('.long-press-active').forEach(el => el.classList.remove('long-press-active'));
});
document.getElementById('btn-reset-soft-confirm').addEventListener('click', resetSoft);
document.getElementById('btn-reset-hard').addEventListener('click', resetHard);
document.getElementById('btn-cancel-reset').addEventListener('click', closeResetModal);
document.getElementById('reset-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeResetModal(); });
