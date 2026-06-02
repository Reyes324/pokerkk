firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.database();

const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get("room");
const pid = urlParams.get("pid") || localStorage.getItem("poker_pid_" + roomCode);

function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2500);
}

if (!roomCode) {
    window.location.href = "index.html";
}

document.getElementById("room-pill").textContent = roomCode;

let allPlayers = {};
let allSubmissions = {};

// Real-time listeners
db.ref("rooms/" + roomCode + "/players").on("value", snap => {
    allPlayers = snap.val() || {};
    renderPlayerCards();
    updateButtons();
    updateProgress();
});

db.ref("rooms/" + roomCode + "/submissions").on("value", snap => {
    allSubmissions = snap.val() || {};
    renderPlayerCards();
    updateButtons();
    updateProgress();
});

// Show results if already settled
db.ref("rooms/" + roomCode + "/status").once("value", snap => {
    if (snap.val() === "settled") {
        db.ref("rooms/" + roomCode + "/results").get().then(r => {
            if (r.exists()) {
                const { results, totalPnl, isBalanced } = r.val();
                showResults(results, totalPnl, isBalanced);
            }
        });
    }
});

function renderPlayerCards() {
    const grid = document.getElementById("player-cards");
    grid.innerHTML = Object.entries(allPlayers).map(([id, p]) => {
        const hasSub = !!allSubmissions[id];
        return `
            <div class="player-card ${hasSub ? 'submitted' : ''} fade-in">
                <div class="avatar-circle" style="background:${getAvatarBg(p.avatarId)}">${getAvatarSvg(p.avatarId)}</div>
                <span class="player-name">${p.name}${p.isHost ? ' <span style="font-size:11px;color:var(--gray-400)">(庄家)</span>' : ''}</span>
                <span class="badge-status">${hasSub ? '已提交 ✓' : '待提交...'}</span>
            </div>
        `;
    }).join("");
}

function updateProgress() {
    const submitted = Object.keys(allSubmissions).length;
    const total = Object.keys(allPlayers).length;
    document.getElementById("progress-text").textContent = `已提交 ${submitted} / ${total} 玩家`;
    document.getElementById("progress-fill").style.width = total ? (submitted / total * 100) + "%" : "0%";
}

function updateButtons() {
    const submittedCount = Object.keys(allSubmissions).length;
    const totalCount = Object.keys(allPlayers).length;
    const allDone = submittedCount === totalCount && totalCount >= 2;

    const btn = document.getElementById("btn-finalize");
    btn.disabled = submittedCount < 1;
    btn.textContent = allDone ? "确认结算" : `提前结算（${submittedCount}/${totalCount}）`;
    btn.className = "btn btn-gold";
    if (btn.disabled) btn.className += " ";
}

// Finalize settlement
document.getElementById("btn-finalize").addEventListener("click", async () => {
    const submittedCount = Object.keys(allSubmissions).length;
    const totalCount = Object.keys(allPlayers).length;
    if (submittedCount < totalCount) {
        const ok = confirm(`只有 ${submittedCount}/${totalCount} 位玩家提交了数据，未提交者按0分计算。确认提前结算？`);
        if (!ok) return;
    }

    const submissions = Object.entries(allPlayers).map(([id, p]) => {
        const sub = allSubmissions[id] || { n10: 0, n20: 0, n50: 0, n100: 0, buyIns: 0 };
        return {
            name: p.name,
            avatarId: p.avatarId,
            n10: sub.n10 || 0,
            n20: sub.n20 || 0,
            n50: sub.n50 || 0,
            n100: sub.n100 || 0,
            buyIns: sub.buyIns || 0
        };
    });

    const { results, totalPnl, isBalanced } = calcResults(submissions);

    await db.ref("rooms/" + roomCode + "/results").set({ results, totalPnl, isBalanced });
    await db.ref("rooms/" + roomCode + "/status").set("settled");

    showResults(results, totalPnl, isBalanced);
});

function showResults(results, totalPnl, isBalanced) {
    const sorted = [...results].sort((a, b) => b.pnl - a.pnl);
    const section = document.getElementById("results-section");
    section.classList.remove("hidden");

    const tbody = document.getElementById("results-tbody");
    tbody.innerHTML = sorted.map(r => `
        <tr class="${r.pnl > 0 ? 'win' : r.pnl < 0 ? 'lose' : ''}">
            <td><div class="avatar-circle sm" style="background:${getAvatarBg(r.avatarId)}">${getAvatarSvg(r.avatarId)}</div></td>
            <td>${r.name}</td>
            <td>${r.chipTotal}</td>
            <td>${r.invested}</td>
            <td>${formatPnl(r.pnl)}</td>
        </tr>
    `).join("");

    const badge = document.getElementById("balance-badge");
    if (isBalanced) {
        badge.className = "badge-balanced";
        badge.textContent = "验证通过 ✓  总盈亏 = 0";
    } else {
        badge.className = "badge-unbalanced";
        badge.textContent = `验证失败 ✗  总盈亏 = ${formatPnl(totalPnl)}（请检查输入）`;
    }

    section.scrollIntoView({ behavior: "smooth" });
}

// Reset game
document.getElementById("btn-reset").addEventListener("click", async () => {
    if (!confirm("确认重置？所有结算数据将被清除，玩家回到等待室。")) return;
    await db.ref("rooms/" + roomCode + "/submissions").remove();
    await db.ref("rooms/" + roomCode + "/results").remove();
    await db.ref("rooms/" + roomCode + "/status").set("waiting");
    window.location.href = "lobby.html?room=" + roomCode + "&pid=" + pid;
});
