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

if (!roomCode || !pid) {
    window.location.href = "index.html";
}

document.getElementById("room-pill").textContent = roomCode;

// Chip counts state
const counts = { n100: 0, n50: 0, n20: 0, n10: 0, buyIns: 0 };
let submitted = false;

// Load player info (avatar + name)
db.ref("rooms/" + roomCode + "/players/" + pid).get().then(snap => {
    if (!snap.exists()) return;
    const p = snap.val();
    const avatarEl = document.getElementById("my-avatar");
    avatarEl.innerHTML = getAvatarSvg(p.avatarId);
    avatarEl.style.background = getAvatarBg(p.avatarId);
    document.getElementById("my-name").textContent = p.name;
});

// Phase switching
function showPhase(phase) {
    document.getElementById("phase-waiting").classList.toggle("hidden", phase !== "waiting");
    document.getElementById("phase-settling").classList.toggle("hidden", phase !== "settling");
    document.getElementById("phase-results").classList.toggle("hidden", phase !== "results");
}

// Listen to room status
db.ref("rooms/" + roomCode + "/status").on("value", snap => {
    const status = snap.val();
    if (status === "waiting") {
        showPhase("waiting");
    } else if (status === "settling") {
        if (!submitted) showPhase("settling");
    } else if (status === "settled") {
        loadAndShowResults();
    }
});

// Listen to player list (waiting phase)
db.ref("rooms/" + roomCode + "/players").on("value", snap => {
    const players = snap.val() || {};
    const list = document.getElementById("waiting-player-list");
    if (!list) return;
    list.innerHTML = Object.values(players).map(p => `
        <div class="player-card fade-in">
            <div class="avatar-circle" style="background:${getAvatarBg(p.avatarId)}">${getAvatarSvg(p.avatarId)}</div>
            <span class="player-name">${p.name}</span>
            ${p.isHost ? '<span class="badge-host">庄家</span>' : ''}
        </div>
    `).join("");
});

// Stepper setup
["n100", "n50", "n20", "n10", "buyIns"].forEach(key => {
    document.getElementById("btn-minus-" + key).addEventListener("click", () => {
        if (counts[key] > 0) {
            counts[key]--;
            document.getElementById("count-" + key).textContent = counts[key];
            updatePnl();
        }
    });
    document.getElementById("btn-plus-" + key).addEventListener("click", () => {
        counts[key]++;
        document.getElementById("count-" + key).textContent = counts[key];
        updatePnl();
    });
});

function updatePnl() {
    const chipTotal = calcChipTotal(counts.n10, counts.n20, counts.n50, counts.n100);
    const invested = calcInvested(counts.buyIns);
    const pnl = calcPnl(chipTotal, invested);

    document.getElementById("pnl-chip-total").textContent = chipTotal;
    document.getElementById("pnl-invested").textContent = invested;

    const pnlEl = document.getElementById("pnl-value");
    pnlEl.textContent = formatPnl(pnl);
    pnlEl.className = "pnl-amount " + (pnl > 0 ? "positive" : pnl < 0 ? "negative" : "neutral");

    document.getElementById("btn-submit").disabled = chipTotal === 0;
}

// Submit chips
document.getElementById("btn-submit").addEventListener("click", async () => {
    if (submitted) return;
    submitted = true;

    await db.ref("rooms/" + roomCode + "/submissions/" + pid).set({
        n10: counts.n10,
        n20: counts.n20,
        n50: counts.n50,
        n100: counts.n100,
        buyIns: counts.buyIns,
        submittedAt: Date.now()
    });

    document.getElementById("submit-section").innerHTML =
        '<div class="submitted-badge">✓ 已提交</div>';

    // Listen to submission progress
    db.ref("rooms/" + roomCode + "/submissions").on("value", subSnap => {
        const subCount = Object.keys(subSnap.val() || {}).length;
        db.ref("rooms/" + roomCode + "/players").get().then(ps => {
            const total = Object.keys(ps.val() || {}).length;
            document.getElementById("progress-text").textContent =
                `${subCount} / ${total} 已提交，等待庄家确认...`;
        });
    });
});

// Show results
async function loadAndShowResults() {
    const snap = await db.ref("rooms/" + roomCode + "/results").get();
    if (!snap.exists()) return;
    const { results, totalPnl, isBalanced } = snap.val();
    showPhase("results");
    renderResultsTable(results, totalPnl, isBalanced);
    document.getElementById("phase-results").scrollIntoView({ behavior: "smooth" });
}

function renderResultsTable(results, totalPnl, isBalanced) {
    const sorted = [...results].sort((a, b) => b.pnl - a.pnl);
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
}
