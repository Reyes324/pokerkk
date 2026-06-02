const BASE = 1000;

function calcChipTotal(n10, n20, n50, n100) {
    return n10 * 10 + n20 * 20 + n50 * 50 + n100 * 100;
}

function calcInvested(buyIns) {
    return (1 + buyIns) * BASE;
}

function calcPnl(chipTotal, invested) {
    return chipTotal - invested;
}

function calcResults(submissions) {
    const results = submissions.map(s => {
        const chipTotal = calcChipTotal(s.n10, s.n20, s.n50, s.n100);
        const invested = calcInvested(s.buyIns);
        const pnl = calcPnl(chipTotal, invested);
        return { name: s.name, avatarId: s.avatarId, chipTotal, invested, pnl };
    });
    const totalPnl = results.reduce((sum, r) => sum + r.pnl, 0);
    return { results, totalPnl, isBalanced: totalPnl === 0 };
}

function formatPnl(pnl) {
    if (pnl > 0) return "+" + pnl;
    return String(pnl);
}

function genRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}
