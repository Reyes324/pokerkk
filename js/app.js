firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.database();
const gameRef = db.ref('currentGame');

// ── State ──────────────────────────────────────────────────────
let players = [];          // array of { name, avatarId, n10, n20, n50, n100, buyIns }
let gameStatus = 'waiting';
let expandedIdx = -1;      // which player card is expanded (chip input visible)
let pendingAvatarIdx = -1; // which player slot is getting avatar change
let pendingNameIdx = -1;   // which player slot is getting name change
const writeTimers = {};    // debounce timers per player index

// ── Init ───────────────────────────────────────────────────────
function defaultPlayers(count) {
    return Array.from({ length: count }, (_, i) => ({
        name: '玩家' + (i + 1),
        avatarId: i % AVATARS.length,
        n10: 0, n20: 0, n50: 0, n100: 0, buyIns: 0
    }));
}

// ── Firebase listener ──────────────────────────────────────────
gameRef.on('value', snap => {
    const data = snap.val();
    if (!data || !data.players) {
        gameRef.set({ status: 'waiting', players: defaultPlayers(3) });
        return;
    }
    // Convert Firebase object to array
    players = Object.keys(data.players)
        .sort((a, b) => Number(a) - Number(b))
        .map(k => data.players[k]);
    gameStatus = data.status || 'waiting';
    render();
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
}

function renderPlayers() {
    const list = document.getElementById('player-list');
    const scrollPositions = {};
    list.querySelectorAll('.chip-panel').forEach((el, i) => {
        scrollPositions[i] = el.scrollTop;
    });

    list.innerHTML = players.map((p, i) => {
        const chipTotal = calcChipTotal(p.n10, p.n20, p.n50, p.n100);
        const invested = calcInvested(p.buyIns);
        const pnl = calcPnl(chipTotal, invested);
        const pnlClass = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral';
        const isExpanded = expandedIdx === i;
        const settled = gameStatus === 'settled';

        return `
        <div class="player-card ${isExpanded ? 'expanded' : ''} ${settled ? 'settled' : ''}" data-idx="${i}">
            <div class="player-card-main">
                <div class="avatar-circle ${settled ? '' : 'clickable'}" id="avatar-circle-${i}"
                     style="background:${getAvatarBg(p.avatarId)}"
                     ${settled ? '' : `onclick="openAvatarModal(${i})"`}>
                    ${getAvatarSvg(p.avatarId)}
                    ${settled ? '' : '<div class="avatar-edit-hint">换</div>'}
                </div>
                <div class="player-info">
                    <div class="player-name-row">
                        <span class="player-name">${escHtml(p.name)}</span>
                        ${settled ? '' : `<button class="btn-edit-name" onclick="openNameModal(${i})">✎</button>`}
                    </div>
                    <div class="pnl-inline ${chipTotal === 0 && p.buyIns === 0 ? 'neutral' : pnlClass}">${chipTotal === 0 && p.buyIns === 0 ? '未填写' : formatPnl(pnl) + ' 分'}</div>
                </div>
                ${settled ? '' : `
                <div class="card-right">
                    <button class="btn-expand-chip ${isExpanded ? 'open' : ''}" onclick="toggleExpand(${i})">
                        ${isExpanded ? '收起 ▲' : '筹码 ▼'}
                    </button>
                    ${players.length > 2 ? `<button class="btn-remove-player" onclick="removePlayer(${i})">×</button>` : ''}
                </div>`}
            </div>
            ${!settled ? `
            <div class="chip-panel ${isExpanded ? 'open' : ''}" id="panel-${i}">
                <div class="stepper-rows">${renderChipRows(i, p)}</div>
            </div>` : ''}
        </div>`;
    }).join('');
}

function renderChipRows(idx, p) {
    const chips = [
        { key: 'n100', label: '100 分', cls: 'c100', val: p.n100 },
        { key: 'n50',  label: '50 分',  cls: 'c50',  val: p.n50 },
        { key: 'n20',  label: '20 分',  cls: 'c20',  val: p.n20 },
        { key: 'n10',  label: '10 分',  cls: 'c10',  val: p.n10 },
    ];
    const rows = chips.map(c => `
        <div class="stepper-row">
            <div class="chip-dot ${c.cls}">${c.key.slice(1)}</div>
            <div class="stepper-label">${c.label}</div>
            <div class="stepper-ctrl">
                <button class="stepper-btn" onclick="adjustChip(${idx},'${c.key}',-1)">−</button>
                <span class="stepper-count">${c.val}</span>
                <button class="stepper-btn" onclick="adjustChip(${idx},'${c.key}',1)">＋</button>
            </div>
        </div>`).join('');
    const buyInRow = `
        <div class="stepper-row" style="background:var(--gold-light)">
            <div class="chip-dot" style="background:var(--gold);font-size:9px">底</div>
            <div class="stepper-label">借底次数<span>每借一底 +1000分投入</span></div>
            <div class="stepper-ctrl">
                <button class="stepper-btn" onclick="adjustChip(${idx},'buyIns',-1)">−</button>
                <span class="stepper-count">${p.buyIns}</span>
                <button class="stepper-btn" onclick="adjustChip(${idx},'buyIns',1)">＋</button>
            </div>
        </div>`;
    return rows + buyInRow;
}

function renderSummary() {
    const bar = document.getElementById('summary-bar');
    if (players.length === 0) { bar.classList.add('hidden'); return; }
    const total = players.reduce((sum, p) => {
        return sum + calcPnl(calcChipTotal(p.n10, p.n20, p.n50, p.n100), calcInvested(p.buyIns));
    }, 0);
    bar.classList.remove('hidden');
    document.getElementById('total-pnl').textContent = formatPnl(total) + ' 分';
    const ind = document.getElementById('balance-indicator');
    if (total === 0) {
        ind.className = 'balance-ok';
        ind.textContent = '持平 ✓';
    } else {
        ind.className = 'balance-warn';
        ind.textContent = `差额 ${formatPnl(total)}`;
    }
}

function renderResults() {
    const section = document.getElementById('results-section');
    if (gameStatus !== 'settled') {
        section.classList.add('hidden');
        section.innerHTML = '';
        return;
    }
    const sorted = [...players]
        .map((p, i) => {
            const chipTotal = calcChipTotal(p.n10, p.n20, p.n50, p.n100);
            const invested = calcInvested(p.buyIns);
            return { ...p, chipTotal, invested, pnl: calcPnl(chipTotal, invested) };
        })
        .sort((a, b) => b.pnl - a.pnl);

    const totalPnl = sorted.reduce((s, r) => s + r.pnl, 0);
    const isBalanced = totalPnl === 0;

    section.classList.remove('hidden');
    section.innerHTML = `
        <div class="card slide-up" style="margin-bottom:16px">
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
        <button class="btn btn-secondary" id="btn-new-round" style="margin-bottom:10px" onclick="showResetModal()">
            重置筹码，再来一局
        </button>
        <button class="btn btn-danger btn-sm" onclick="showResetModal()">完全重置</button>
    `;
}

// ── Chip adjustments ───────────────────────────────────────────
function adjustChip(idx, key, delta) {
    if (!players[idx]) return;
    const current = players[idx][key] || 0;
    const next = Math.max(0, current + delta);
    if (next === current) return;
    players[idx][key] = next;

    // Update DOM without full re-render
    const panel = document.getElementById('panel-' + idx);
    if (panel) {
        // Update just the count display
        const steppers = panel.querySelectorAll('.stepper-count');
        const keyOrder = ['n100', 'n50', 'n20', 'n10', 'buyIns'];
        const keyIdx = keyOrder.indexOf(key);
        if (steppers[keyIdx]) steppers[keyIdx].textContent = next;
    }
    // Update pnl inline
    updatePlayerPnlDisplay(idx);
    renderSummary();

    // Debounce write to Firebase
    clearTimeout(writeTimers[idx]);
    writeTimers[idx] = setTimeout(() => {
        gameRef.child('players/' + idx).update({ [key]: next });
    }, 400);
}

function updatePlayerPnlDisplay(idx) {
    const p = players[idx];
    const pnl = calcPnl(calcChipTotal(p.n10, p.n20, p.n50, p.n100), calcInvested(p.buyIns));
    const el = document.querySelector(`.player-card[data-idx="${idx}"] .pnl-inline`);
    if (el) {
        el.textContent = formatPnl(pnl) + ' 分';
        el.className = 'pnl-inline ' + (pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral');
    }
}

// ── Expand/collapse chip panel ─────────────────────────────────
function toggleExpand(idx) {
    expandedIdx = expandedIdx === idx ? -1 : idx;
    render();
    if (expandedIdx === idx) {
        setTimeout(() => {
            const card = document.querySelector(`.player-card[data-idx="${idx}"]`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 150);
    }
}

// ── Add / remove player ────────────────────────────────────────
function addPlayer() {
    if (players.length >= 8) { showToast('最多支持8位玩家'); return; }
    const idx = players.length;
    const newPlayer = { name: '玩家' + (idx + 1), avatarId: idx % AVATARS.length, n10: 0, n20: 0, n50: 0, n100: 0, buyIns: 0 };
    gameRef.child('players/' + idx).set(newPlayer);
}

function removePlayer(idx) {
    if (players.length <= 2) { showToast('至少保留2位玩家'); return; }
    // Cancel any pending write for this player and re-index others
    clearTimeout(writeTimers[idx]);
    delete writeTimers[idx];
    const newPlayers = players.filter((_, i) => i !== idx);
    gameRef.child('players').set(newPlayers);
    if (expandedIdx === idx) expandedIdx = -1;
    else if (expandedIdx > idx) expandedIdx--;
}

// ── Avatar modal ───────────────────────────────────────────────
function openAvatarModal(idx) {
    pendingAvatarIdx = idx;
    const modal = document.getElementById('avatar-modal');
    const grid = document.getElementById('modal-avatar-grid');
    grid.innerHTML = '';
    AVATARS.forEach((av, i) => {
        const div = document.createElement('div');
        div.className = 'avatar-item' + (players[idx].avatarId === i ? ' selected' : '');
        div.innerHTML = av.svg;
        div.style.background = av.bg;
        div.addEventListener('click', () => {
            saveAvatar(pendingAvatarIdx, i);
            closeAvatarModal();
        });
        grid.appendChild(div);
    });
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeAvatarModal() {
    document.getElementById('avatar-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

function saveAvatar(idx, avatarId) {
    gameRef.child('players/' + idx + '/avatarId').set(avatarId);
}

// ── Name modal ─────────────────────────────────────────────────
function openNameModal(idx) {
    pendingNameIdx = idx;
    const input = document.getElementById('name-modal-input');
    input.value = players[idx].name;
    document.getElementById('name-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => input.focus(), 100);
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
    expandedIdx = -1;
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
    // Zero out chips, keep names and avatars, back to waiting
    const newPlayers = players.map(p => ({ ...p, n10: 0, n20: 0, n50: 0, n100: 0, buyIns: 0 }));
    gameRef.set({ status: 'waiting', players: newPlayers });
    expandedIdx = -1;
    closeResetModal();
    showToast('已重置筹码，可以开始新一局');
}

function resetHard() {
    const fresh = defaultPlayers(3);
    gameRef.set({ status: 'waiting', players: fresh });
    expandedIdx = -1;
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

document.getElementById('btn-reset-soft-confirm').addEventListener('click', resetSoft);
document.getElementById('btn-reset-hard').addEventListener('click', resetHard);
document.getElementById('btn-cancel-reset').addEventListener('click', closeResetModal);
document.getElementById('reset-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeResetModal();
});
