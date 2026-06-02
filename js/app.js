firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.database();
const gameRef = db.ref('currentGame');

// ── State ──────────────────────────────────────────────────────
let players = [];
let gameStatus = 'waiting';
let chipModalIdx = -1;
let pendingAvatarIdx = -1;
let pendingNameIdx = -1;
let pendingDeleteIdx = -1;
const writeTimers = {};

// ── Defaults ───────────────────────────────────────────────────
function defaultPlayers(count) {
    return Array.from({ length: count }, (_, i) => ({
        name: '玩家' + (i + 1),
        avatarId: i % AVATARS.length,
        n10: 0, n20: 0, n50: 0, n100: 0, buyIns: 0
    }));
}

// ── Firebase ───────────────────────────────────────────────────
gameRef.on('value', snap => {
    const data = snap.val();
    if (!data || !data.players) {
        gameRef.set({ status: 'waiting', players: defaultPlayers(3) });
        return;
    }
    players = Object.keys(data.players)
        .sort((a, b) => Number(a) - Number(b))
        .map(k => data.players[k]);
    gameStatus = data.status || 'waiting';

    render();

    // Keep chip modal in sync if open
    if (chipModalIdx >= 0 && players[chipModalIdx]) {
        updateChipModalCounts(chipModalIdx);
    }
});

// ── Render ─────────────────────────────────────────────────────
function render() {
    renderPlayers();
    renderSummary();
    renderResults();
    document.getElementById('btn-confirm').style.display =
        gameStatus === 'settled' ? 'none' : 'flex';
    document.getElementById('btn-add-player').style.display =
        gameStatus === 'settled' ? 'none' : 'flex';
    document.querySelector('.hint-text').style.display =
        gameStatus === 'settled' ? 'none' : 'block';
}

function renderPlayers() {
    const list = document.getElementById('player-list');
    list.innerHTML = players.map((p, i) => {
        const chipTotal = calcChipTotal(p.n10, p.n20, p.n50, p.n100);
        const invested = calcInvested(p.buyIns);
        const pnl = calcPnl(chipTotal, invested);
        const hasData = chipTotal > 0 || p.buyIns > 0;
        const pnlClass = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral';
        const settled = gameStatus === 'settled';

        return `
        <div class="player-card ${settled ? 'settled' : ''}"
             data-idx="${i}"
             ${settled ? '' : `onclick="openChipModal(${i})"`}>
            <div class="player-card-main">
                <div class="avatar-circle ${settled ? '' : 'clickable'}"
                     style="background:${getAvatarBg(p.avatarId)}"
                     ${settled ? '' : `onclick="event.stopPropagation();openAvatarModal(${i})"`}>
                    ${getAvatarSvg(p.avatarId)}
                    ${settled ? '' : '<div class="avatar-edit-hint">换</div>'}
                </div>
                <div class="player-info">
                    <div class="player-name-row">
                        <span class="player-name">${escHtml(p.name)}</span>
                        ${settled ? '' : `
                        <button class="btn-edit-name" onclick="event.stopPropagation();openNameModal(${i})" aria-label="编辑名字">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>
                            </svg>
                            编辑
                        </button>`}
                    </div>
                    <div class="pnl-inline ${hasData ? pnlClass : 'neutral'}">
                        ${hasData ? formatPnl(pnl) + ' 分' : '点击输入筹码'}
                    </div>
                </div>
                ${settled ? '' : `
                <div class="card-chevron">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>`}
            </div>
        </div>`;
    }).join('');

    if (gameStatus !== 'settled') setupLongPress();
}

function renderSummary() {
    const bar = document.getElementById('summary-bar');
    if (players.length === 0) { bar.classList.add('hidden'); return; }
    const total = players.reduce((sum, p) =>
        sum + calcPnl(calcChipTotal(p.n10, p.n20, p.n50, p.n100), calcInvested(p.buyIns)), 0);
    const hasAnyData = players.some(p => calcChipTotal(p.n10, p.n20, p.n50, p.n100) > 0);
    if (!hasAnyData) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    document.getElementById('total-pnl').textContent = formatPnl(total) + ' 分';
    const ind = document.getElementById('balance-indicator');
    ind.className = total === 0 ? 'balance-ok' : 'balance-warn';
    ind.textContent = total === 0 ? '持平 ✓' : `差额 ${formatPnl(total)}`;
}

function renderResults() {
    const section = document.getElementById('results-section');
    if (gameStatus !== 'settled') { section.classList.add('hidden'); section.innerHTML = ''; return; }
    const sorted = players
        .map(p => {
            const chipTotal = calcChipTotal(p.n10, p.n20, p.n50, p.n100);
            const invested = calcInvested(p.buyIns);
            return { ...p, chipTotal, invested, pnl: calcPnl(chipTotal, invested) };
        })
        .sort((a, b) => b.pnl - a.pnl);
    const totalPnl = sorted.reduce((s, r) => s + r.pnl, 0);
    const isBalanced = totalPnl === 0;

    section.classList.remove('hidden');
    section.innerHTML = `
        <div class="card slide-up">
            <div class="card-title">🎉 结算结果</div>
            <table class="results-table">
                <thead><tr><th></th><th>玩家</th><th>持筹</th><th>投入</th><th>盈亏</th></tr></thead>
                <tbody>
                    ${sorted.map(r => `
                    <tr class="${r.pnl > 0 ? 'win' : r.pnl < 0 ? 'lose' : ''}">
                        <td><div class="avatar-circle sm" style="background:${getAvatarBg(r.avatarId)}">${getAvatarSvg(r.avatarId)}</div></td>
                        <td>${escHtml(r.name)}</td>
                        <td>${r.chipTotal}</td>
                        <td>${r.invested}</td>
                        <td>${formatPnl(r.pnl)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="${isBalanced ? 'badge-balanced' : 'badge-unbalanced'}">
                ${isBalanced ? '验证通过 ✓  总盈亏 = 0' : `验证失败 ✗  总盈亏 = ${formatPnl(totalPnl)}，请检查输入`}
            </div>
        </div>
        <button class="btn btn-secondary" style="margin-bottom:10px" onclick="showResetModal()">重置筹码，再来一局</button>
        <button class="btn btn-danger btn-sm" onclick="showResetModal()">完全重置</button>
    `;
}

// ── Chip half-sheet ────────────────────────────────────────────
function openChipModal(idx) {
    if (gameStatus === 'settled') return;
    chipModalIdx = idx;
    const p = players[idx];

    // Header
    const header = document.getElementById('chip-modal-header');
    header.innerHTML = `
        <div class="avatar-circle" style="background:${getAvatarBg(p.avatarId)}">${getAvatarSvg(p.avatarId)}</div>
        <div>
            <div style="font-size:16px;font-weight:700;color:var(--clr-text)">${escHtml(p.name)}</div>
            <div style="font-size:12px;color:var(--clr-text-3)">1底 = 1000分 | 默认配置：5×10, 10×20, 5×50, 5×100</div>
        </div>
    `;

    // Body
    renderChipModalBody(idx);

    document.getElementById('chip-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function renderChipModalBody(idx) {
    const p = players[idx];
    const chips = [
        { key: 'n100', label: '100 分筹码', cls: 'c100', val: p.n100 },
        { key: 'n50',  label: '50 分筹码',  cls: 'c50',  val: p.n50 },
        { key: 'n20',  label: '20 分筹码',  cls: 'c20',  val: p.n20 },
        { key: 'n10',  label: '10 分筹码',  cls: 'c10',  val: p.n10 },
    ];
    const chipRows = chips.map(c => `
        <div class="stepper-row">
            <div class="chip-dot ${c.cls}">${c.key.slice(1)}</div>
            <div class="stepper-label">${c.label}</div>
            <div class="stepper-ctrl">
                <button class="stepper-btn" onclick="adjustChip(${idx},'${c.key}',-1)">−</button>
                <div class="stepper-count" id="mc-${c.key}">${c.val}</div>
                <button class="stepper-btn" onclick="adjustChip(${idx},'${c.key}',1)">＋</button>
            </div>
        </div>`).join('');

    const buyInRow = `
        <div class="stepper-row buyin-row">
            <div class="chip-dot" style="background:var(--clr-gold);font-size:9px">底</div>
            <div class="stepper-label">借底次数<span>每借一底 = 额外 1000 分投入</span></div>
            <div class="stepper-ctrl">
                <button class="stepper-btn" onclick="adjustChip(${idx},'buyIns',-1)">−</button>
                <div class="stepper-count" id="mc-buyIns">${p.buyIns}</div>
                <button class="stepper-btn" onclick="adjustChip(${idx},'buyIns',1)">＋</button>
            </div>
        </div>`;

    const pnlPreview = `<div class="chip-modal-pnl" id="mc-pnl-wrap"></div>`;

    document.getElementById('chip-modal-body').innerHTML =
        `<div class="stepper-rows">${chipRows}${buyInRow}</div>${pnlPreview}`;

    updateChipModalPnl(idx);
}

function updateChipModalCounts(idx) {
    const p = players[idx];
    const keys = ['n100', 'n50', 'n20', 'n10', 'buyIns'];
    keys.forEach(k => {
        const el = document.getElementById('mc-' + k);
        if (el) el.textContent = p[k] || 0;
    });
    updateChipModalPnl(idx);
}

function updateChipModalPnl(idx) {
    const p = players[idx];
    const chipTotal = calcChipTotal(p.n10, p.n20, p.n50, p.n100);
    const invested = calcInvested(p.buyIns);
    const pnl = calcPnl(chipTotal, invested);
    const el = document.getElementById('mc-pnl-wrap');
    if (!el) return;
    const cls = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral';
    el.innerHTML = `
        <div class="pnl-preview-row">
            <span>持筹 <strong>${chipTotal}</strong></span>
            <span>投入 <strong>${invested}</strong></span>
            <span class="${cls}">盈亏 <strong>${formatPnl(pnl)}</strong></span>
        </div>`;
}

function closeChipModal() {
    document.getElementById('chip-modal').classList.add('hidden');
    document.body.style.overflow = '';
    chipModalIdx = -1;
}

// ── Chip adjustments ───────────────────────────────────────────
function adjustChip(idx, key, delta) {
    if (!players[idx]) return;
    const current = players[idx][key] || 0;
    const next = Math.max(0, current + delta);
    if (next === current) return;
    players[idx][key] = next;

    // Update modal display instantly
    const countEl = document.getElementById('mc-' + key);
    if (countEl) countEl.textContent = next;
    updateChipModalPnl(idx);

    // Update player card pnl
    const chipTotal = calcChipTotal(players[idx].n10, players[idx].n20, players[idx].n50, players[idx].n100);
    const invested = calcInvested(players[idx].buyIns);
    const pnl = calcPnl(chipTotal, invested);
    const pnlEl = document.querySelector(`.player-card[data-idx="${idx}"] .pnl-inline`);
    if (pnlEl) {
        const hasData = chipTotal > 0 || players[idx].buyIns > 0;
        pnlEl.textContent = hasData ? formatPnl(pnl) + ' 分' : '点击输入筹码';
        pnlEl.className = 'pnl-inline ' + (hasData ? (pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral') : 'neutral');
    }
    renderSummary();

    clearTimeout(writeTimers[idx]);
    writeTimers[idx] = setTimeout(() => {
        gameRef.child('players/' + idx).update({ [key]: next });
    }, 400);
}

// ── Long-press delete ──────────────────────────────────────────
function setupLongPress() {
    document.querySelectorAll('.player-card[data-idx]').forEach(card => {
        let timer = null;
        let startX = 0, startY = 0;

        card.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            timer = setTimeout(() => {
                const idx = parseInt(card.dataset.idx);
                if (players.length <= 2) { showToast('至少保留2位玩家'); return; }
                card.classList.add('long-press-active');
                pendingDeleteIdx = idx;
                document.getElementById('delete-modal-text').textContent =
                    `删除「${players[idx].name}」？`;
                document.getElementById('delete-modal').classList.remove('hidden');
                document.body.style.overflow = 'hidden';
            }, 600);
        }, { passive: true });

        card.addEventListener('touchmove', e => {
            const dx = Math.abs(e.touches[0].clientX - startX);
            const dy = Math.abs(e.touches[0].clientY - startY);
            if (dx > 8 || dy > 8) { clearTimeout(timer); timer = null; }
        }, { passive: true });

        card.addEventListener('touchend', () => {
            clearTimeout(timer); timer = null;
            card.classList.remove('long-press-active');
        });
        card.addEventListener('touchcancel', () => {
            clearTimeout(timer); timer = null;
            card.classList.remove('long-press-active');
        });
    });
}

function removePlayer(idx) {
    clearTimeout(writeTimers[idx]);
    delete writeTimers[idx];
    const newPlayers = players.filter((_, i) => i !== idx);
    gameRef.child('players').set(newPlayers);
}

// ── Add player ─────────────────────────────────────────────────
function addPlayer() {
    if (players.length >= 8) { showToast('最多支持8位玩家'); return; }
    const idx = players.length;
    gameRef.child('players/' + idx).set({
        name: '玩家' + (idx + 1),
        avatarId: idx % AVATARS.length,
        n10: 0, n20: 0, n50: 0, n100: 0, buyIns: 0
    });
}

// ── Avatar modal ───────────────────────────────────────────────
function openAvatarModal(idx) {
    pendingAvatarIdx = idx;
    const grid = document.getElementById('modal-avatar-grid');
    grid.innerHTML = '';
    AVATARS.forEach((av, i) => {
        const div = document.createElement('div');
        div.className = 'avatar-item' + (players[idx].avatarId === i ? ' selected' : '');
        div.innerHTML = av.svg;
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
function closeAvatarModal() {
    document.getElementById('avatar-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

// ── Name modal ─────────────────────────────────────────────────
function openNameModal(idx) {
    pendingNameIdx = idx;
    const input = document.getElementById('name-modal-input');
    input.value = players[idx].name;
    document.getElementById('name-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => input.focus(), 150);
}
function closeNameModal() {
    document.getElementById('name-modal').classList.add('hidden');
    document.body.style.overflow = '';
}
function saveName() {
    const name = document.getElementById('name-modal-input').value.trim();
    if (!name) { showToast('名字不能为空'); return; }
    gameRef.child('players/' + pendingNameIdx + '/name').set(name);
    closeNameModal();
}

// ── Confirm settlement ─────────────────────────────────────────
async function confirmSettle() {
    const hasData = players.some(p => calcChipTotal(p.n10, p.n20, p.n50, p.n100) > 0);
    if (!hasData) { showToast('请先输入筹码数量'); return; }
    await gameRef.child('status').set('settled');
}

// ── Reset ──────────────────────────────────────────────────────
function showResetModal() {
    document.getElementById('reset-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function closeResetModal() {
    document.getElementById('reset-modal').classList.add('hidden');
    document.body.style.overflow = '';
}
function resetSoft() {
    const newPlayers = players.map(p => ({ ...p, n10: 0, n20: 0, n50: 0, n100: 0, buyIns: 0 }));
    gameRef.set({ status: 'waiting', players: newPlayers });
    closeResetModal();
    showToast('已重置筹码，可以开始新一局');
}
function resetHard() {
    gameRef.set({ status: 'waiting', players: defaultPlayers(3) });
    closeResetModal();
    showToast('已完全重置');
}

// ── Utilities ──────────────────────────────────────────────────
function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Event listeners ────────────────────────────────────────────
document.getElementById('btn-add-player').addEventListener('click', addPlayer);
document.getElementById('btn-confirm').addEventListener('click', confirmSettle);
document.getElementById('btn-reset-soft').addEventListener('click', showResetModal);

document.getElementById('btn-chip-done').addEventListener('click', closeChipModal);
document.getElementById('chip-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeChipModal();
});

document.getElementById('btn-close-modal').addEventListener('click', closeAvatarModal);
document.getElementById('avatar-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAvatarModal();
});

document.getElementById('btn-close-name-modal').addEventListener('click', closeNameModal);
document.getElementById('btn-save-name').addEventListener('click', saveName);
document.getElementById('name-modal-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveName();
});
document.getElementById('name-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeNameModal();
});

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
document.getElementById('reset-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeResetModal();
});
