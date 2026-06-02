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

document.getElementById("room-code-display").textContent = roomCode;
document.getElementById("room-pill") && (document.getElementById("room-pill").textContent = roomCode);

// QR code pointing to join URL
const joinUrl = window.location.origin + "/index.html?join=" + roomCode;
new QRCode(document.getElementById("qrcode"), {
    text: joinUrl,
    width: 160,
    height: 160,
    colorDark: "#1B4332",
    colorLight: "#FFFFFF"
});

// Real-time player list
db.ref("rooms/" + roomCode + "/players").on("value", snap => {
    const players = snap.val() || {};
    const count = Object.keys(players).length;

    document.getElementById("player-count").textContent = count;
    document.getElementById("btn-start").disabled = count < 2;
    document.getElementById("min-hint").style.display = count >= 2 ? "none" : "block";

    const list = document.getElementById("player-list");
    list.innerHTML = "";
    Object.entries(players).forEach(([id, p]) => {
        const div = document.createElement("div");
        div.className = "player-card fade-in";
        div.innerHTML = `
            <div class="avatar-circle" style="background:${getAvatarBg(p.avatarId)}">${getAvatarSvg(p.avatarId)}</div>
            <span class="player-name">${p.name}</span>
            ${p.isHost ? '<span class="badge-host">庄家</span>' : ''}
        `;
        list.appendChild(div);
    });
});

document.getElementById("btn-start").addEventListener("click", async () => {
    await db.ref("rooms/" + roomCode + "/status").set("settling");
    window.location.href = "host.html?room=" + roomCode + "&pid=" + pid;
});
