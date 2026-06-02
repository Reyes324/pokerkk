firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.database();

let selectedAvatar = -1;

function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2500);
}

// Render avatar grid
const grid = document.getElementById("avatar-grid");
AVATARS.forEach((av, i) => {
    const div = document.createElement("div");
    div.className = "avatar-item";
    div.innerHTML = av.svg;
    div.style.background = av.bg;
    div.dataset.id = i;
    div.addEventListener("click", () => {
        document.querySelectorAll(".avatar-item").forEach(el => el.classList.remove("selected"));
        div.classList.add("selected");
        selectedAvatar = i;
    });
    grid.appendChild(div);
});

// Join section toggle
document.getElementById("btn-join-toggle").addEventListener("click", () => {
    const sec = document.getElementById("join-section");
    sec.classList.toggle("open");
});

function validate() {
    const name = document.getElementById("name-input").value.trim();
    if (!name) { showToast("请输入昵称"); return null; }
    if (selectedAvatar === -1) { showToast("请选择头像"); return null; }
    return name;
}

// Create game
document.getElementById("btn-create").addEventListener("click", async () => {
    const name = validate();
    if (!name) return;

    const code = genRoomCode();
    const pidRef = db.ref("rooms/" + code + "/players").push();
    const pid = pidRef.key;

    await db.ref("rooms/" + code).set({
        hostId: pid,
        status: "waiting",
        createdAt: Date.now()
    });
    await pidRef.set({ name, avatarId: selectedAvatar, isHost: true });

    localStorage.setItem("poker_pid_" + code, pid);
    window.location.href = "lobby.html?room=" + code + "&pid=" + pid;
});

// Join game confirm
document.getElementById("btn-join-confirm").addEventListener("click", async () => {
    const name = validate();
    if (!name) return;

    const code = document.getElementById("room-code-input").value.trim().toUpperCase();
    if (code.length !== 4) { showToast("请输入4位房间码"); return; }

    const snap = await db.ref("rooms/" + code).get();
    if (!snap.exists()) { showToast("房间不存在，请检查房间码"); return; }

    const room = snap.val();
    if (room.status === "settling" || room.status === "settled") {
        showToast("游戏已开始，无法加入"); return;
    }

    const pidRef = db.ref("rooms/" + code + "/players").push();
    const pid = pidRef.key;
    await pidRef.set({ name, avatarId: selectedAvatar, isHost: false });

    localStorage.setItem("poker_pid_" + code, pid);
    window.location.href = "player.html?room=" + code + "&pid=" + pid;
});

// Pre-fill join code from URL (scan QR)
const urlParams = new URLSearchParams(window.location.search);
const joinCode = urlParams.get("join");
if (joinCode) {
    document.getElementById("join-section").classList.add("open");
    document.getElementById("room-code-input").value = joinCode;
}
